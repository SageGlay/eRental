-- Read-only companion to verification_contract.sql. Save the result privately
-- before deployment, after deployment and after a staging rollback rehearsal.
-- No user IDs, object names, claims, application records or documents are read.
WITH client_roles AS (
  SELECT oid, rolname, rolsuper, rolbypassrls
  FROM pg_catalog.pg_roles WHERE rolname IN ('anon', 'authenticated')
), routines AS (
  SELECT p.*, pg_catalog.pg_get_functiondef(p.oid) AS definition
  FROM pg_catalog.pg_proc p
  WHERE p.oid IN (
    pg_catalog.to_regprocedure('public.review_verification(uuid,text,text)'),
    pg_catalog.to_regprocedure('public.is_admin()')
  )
), effective_writes AS (
  SELECT r.rolname AS role, t.relname AS relation, a.attname AS column_name,
         v.privilege
  FROM client_roles r
  CROSS JOIN pg_catalog.pg_attribute a
  JOIN pg_catalog.pg_class t ON t.oid = a.attrelid
  CROSS JOIN (VALUES ('INSERT'), ('UPDATE')) v(privilege)
  WHERE a.attnum > 0 AND NOT a.attisdropped
    AND t.oid IN ('public.profiles'::regclass, 'public.verification_submissions'::regclass)
    AND pg_catalog.has_column_privilege(r.oid, t.oid, a.attnum, v.privilege)
), membership AS (
  SELECT r.rolname AS role, r.rolsuper AS superuser, r.rolbypassrls AS bypass_rls,
         pg_catalog.has_any_column_privilege(r.oid, t.oid, 'SELECT') AS can_read,
         pg_catalog.has_any_column_privilege(r.oid, t.oid, 'INSERT') AS can_insert,
         pg_catalog.has_any_column_privilege(r.oid, t.oid, 'UPDATE') AS can_update,
         pg_catalog.has_table_privilege(r.oid, t.oid, 'DELETE') AS can_delete,
         pg_catalog.has_table_privilege(r.oid, t.oid, 'TRUNCATE') AS can_truncate,
         t.relrowsecurity AS rls_enabled,
         (SELECT count(*) FROM pg_catalog.pg_policy p WHERE p.polrelid = t.oid) AS policy_count
  FROM client_roles r CROSS JOIN pg_catalog.pg_class t
  WHERE t.oid = 'public.admin_users'::regclass
), trigger_states AS (
  SELECT t.tgname AS name, c.relname AS relation, t.tgenabled AS enabled,
         pg_catalog.pg_get_triggerdef(t.oid) AS definition,
         encode(sha256(convert_to(pg_catalog.pg_get_functiondef(t.tgfoid), 'UTF8')), 'hex') AS function_sha256
  FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
  WHERE NOT t.tgisinternal
    AND c.oid IN ('public.profiles'::regclass, 'public.verification_submissions'::regclass)
)
SELECT jsonb_build_object(
  'functions', (SELECT jsonb_object_agg(proname, jsonb_build_object(
    'oid', oid,
    'owner', pg_catalog.pg_get_userbyid(proowner),
    'security_definer', prosecdef,
    'settings', proconfig,
    'definition_sha256', encode(sha256(convert_to(definition, 'UTF8')), 'hex'),
    'acl', coalesce(proacl, pg_catalog.acldefault('f', proowner)),
    'public_execute', EXISTS (SELECT FROM pg_catalog.aclexplode(coalesce(proacl, pg_catalog.acldefault('f', proowner))) a
                              WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'),
    'anon_execute', pg_catalog.has_function_privilege('anon', oid, 'EXECUTE'),
    'authenticated_execute', pg_catalog.has_function_privilege('authenticated', oid, 'EXECUTE'),
    'service_role_execute', pg_catalog.has_function_privilege('service_role', oid, 'EXECUTE')
  )) FROM routines),
  'effective_client_column_writes', (SELECT coalesce(jsonb_agg(to_jsonb(w) ORDER BY role, relation, column_name, privilege), '[]') FROM effective_writes w),
  'membership_access', (SELECT jsonb_agg(to_jsonb(m) ORDER BY role) FROM membership m),
  'triggers', (SELECT jsonb_agg(to_jsonb(t) ORDER BY relation, name) FROM trigger_states t)
) AS verification_release_check;
