-- Read-only. Run before installation and again after installation or a pause.
-- The result contains catalog metadata only. Keep deployment evidence private.
WITH relations AS (
  SELECT c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner) AS owner
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = ANY(ARRAY['profiles','admin_users','listings','bookings',
    'conversations','messages','simulated_payments','verification_submissions','saved_listings',
    'recently_viewed_listings','notifications'])
), clients AS (
  SELECT oid, rolname, rolsuper, rolbypassrls FROM pg_roles
  WHERE rolname IN ('anon','authenticated','service_role')
), functions AS (
  SELECT p.oid, p.proowner, p.proacl, p.prosecdef, p.proconfig, n.nspname, p.proname
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'erental_events' OR (n.nspname = 'public' AND p.proname IN
    ('review_verification','is_admin','simulate_payment','record_listing_view',
     'mark_notification_read','mark_all_notifications_read'))
), columns AS (
  SELECT r.relname, a.attname, format_type(a.atttypid,a.atttypmod) AS type, a.attnotnull
  FROM relations r JOIN pg_attribute a ON a.attrelid = r.oid WHERE a.attnum > 0 AND NOT a.attisdropped
), grants AS (
  SELECT r.relname, c.rolname, a.attname, privilege
  FROM relations r JOIN pg_attribute a ON a.attrelid = r.oid AND a.attnum > 0 AND NOT a.attisdropped
  CROSS JOIN clients c CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE')) v(privilege)
  WHERE has_column_privilege(c.oid,r.oid,a.attnum,privilege)
), table_privileges AS (
  SELECT r.relname, c.rolname, has_table_privilege(c.oid,r.oid,'DELETE') AS can_delete,
    has_table_privilege(c.oid,r.oid,'TRUNCATE') AS can_truncate,
    has_table_privilege(c.oid,r.oid,'TRIGGER') AS can_attach_triggers
  FROM relations r CROSS JOIN clients c
), triggers AS (
  SELECT r.relname, t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS definition,
    t.tgfoid::regprocedure::text AS handler,
    encode(sha256(convert_to(pg_get_functiondef(t.tgfoid),'UTF8')),'hex') AS handler_sha256
  FROM relations r JOIN pg_trigger t ON t.tgrelid = r.oid AND NOT t.tgisinternal
), policies AS (
  SELECT p.tablename, p.policyname, p.permissive, p.roles, p.cmd, p.qual, p.with_check
  FROM pg_policies p JOIN relations r ON r.relname = p.tablename WHERE p.schemaname = 'public'
), constraints AS (
  SELECT r.relname, c.conname, pg_get_constraintdef(c.oid) AS definition
  FROM relations r JOIN pg_constraint c ON c.conrelid = r.oid
), indexes AS (
  SELECT i.tablename,i.indexname,i.indexdef FROM pg_indexes i
  JOIN relations r ON r.relname = i.tablename WHERE i.schemaname = 'public'
), routines AS (
  SELECT p.oid::regprocedure::text AS signature, pg_get_userbyid(p.proowner) AS owner,
    p.prosecdef AS definer, p.proconfig AS settings,
    encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') AS definition_sha256,
    EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
           WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS public_execute,
    (SELECT jsonb_object_agg(c.rolname,has_function_privilege(c.oid,p.oid,'EXECUTE')) FROM clients c) AS effective_execute
  FROM functions p
)
SELECT jsonb_build_object(
  'postgres_version', current_setting('server_version'),
  'roles', (SELECT jsonb_agg(to_jsonb(c) - 'oid' ORDER BY rolname) FROM clients c),
  'tables', (SELECT jsonb_agg(to_jsonb(r) - 'oid' ORDER BY relname) FROM relations r),
  'columns', (SELECT jsonb_agg(to_jsonb(c) ORDER BY relname,attname) FROM columns c),
  'column_grants', (SELECT jsonb_agg(to_jsonb(g) ORDER BY relname,rolname,attname,privilege) FROM grants g),
  'table_privileges', (SELECT jsonb_agg(to_jsonb(p) ORDER BY relname,rolname) FROM table_privileges p),
  'constraints', (SELECT jsonb_agg(to_jsonb(c) ORDER BY relname,conname) FROM constraints c),
  'indexes', (SELECT jsonb_agg(to_jsonb(i) ORDER BY tablename,indexname) FROM indexes i),
  'triggers', (SELECT jsonb_agg(to_jsonb(t) ORDER BY relname,tgname) FROM triggers t),
  'policies', (SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname) FROM policies p),
  'functions', (SELECT jsonb_agg(to_jsonb(f) ORDER BY signature) FROM routines f)
) AS marketplace_essentials_contract;
