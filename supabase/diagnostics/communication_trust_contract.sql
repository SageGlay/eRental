-- Read-only schema and privilege evidence for the designated staging project.
-- Save output privately. The query reads catalog metadata and no case records.
WITH relations AS (
  SELECT c.oid, c.relname, n.nspname, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'r' AND (
    n.nspname = 'erental_events' OR
    (n.nspname = 'public' AND c.relname IN (
      'profiles','listings','bookings','conversations','messages','reviews','notifications',
      'user_blocks','conversation_reports','viewing_appointments','viewing_appointment_events',
      'review_responses','review_disputes'
    ))
  )
), routines AS (
  SELECT p.oid, p.proname, n.nspname, p.prosecdef, p.proconfig, p.proowner, p.proacl
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'erental_events' OR (
    n.nspname = 'public' AND p.proname IN (
      'is_admin','review_verification','send_conversation_message','set_user_block',
      'conversation_contact_status','report_conversation','get_conversation_report_evidence',
      'resolve_conversation_report','request_viewing','update_viewing','public_review_summary',
      'save_review_response','remove_review_response','submit_review_dispute',
      'get_review_dispute_evidence','resolve_review_dispute','mark_notification_read',
      'mark_all_notifications_read'
    )
  )
), roles AS (
  SELECT oid, rolname FROM pg_catalog.pg_roles
  WHERE rolname IN ('anon','authenticated','service_role')
)
SELECT pg_catalog.jsonb_build_object(
  'relations', (SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) - 'oid' ORDER BY nspname, relname) FROM relations r),
  'policies', (SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p) ORDER BY schemaname, tablename, policyname)
    FROM pg_catalog.pg_policies p JOIN relations r ON r.nspname = p.schemaname AND r.relname = p.tablename),
  'constraints', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'relation', r.oid::regclass::text, 'name', c.conname, 'definition', pg_catalog.pg_get_constraintdef(c.oid)
  ) ORDER BY r.nspname, r.relname, c.conname) FROM pg_catalog.pg_constraint c JOIN relations r ON r.oid = c.conrelid),
  'client_column_grants', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'relation', r.oid::regclass::text, 'column', a.attname, 'role', l.rolname, 'action', grants.action
  ) ORDER BY r.nspname, r.relname, a.attname, l.rolname, grants.action)
    FROM relations r JOIN pg_catalog.pg_attribute a ON a.attrelid = r.oid AND a.attnum > 0 AND NOT a.attisdropped
    CROSS JOIN roles l CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE')) AS grants(action)
    WHERE pg_catalog.has_column_privilege(l.oid, r.oid, a.attnum, grants.action)),
  'functions', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'signature', p.oid::regprocedure::text, 'owner', pg_catalog.pg_get_userbyid(p.proowner),
    'definer', p.prosecdef, 'settings', p.proconfig,
    'definition_sha256', encode(sha256(convert_to(pg_catalog.pg_get_functiondef(p.oid), 'UTF8')), 'hex'),
    'effective_execute', (SELECT pg_catalog.jsonb_object_agg(l.rolname, pg_catalog.has_function_privilege(l.oid, p.oid, 'EXECUTE')) FROM roles l),
    'public_execute', EXISTS (SELECT FROM pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f',p.proowner))) a
      WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')
  ) ORDER BY p.nspname, p.proname) FROM routines p),
  'triggers', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'relation', r.oid::regclass::text, 'enabled', t.tgenabled, 'definition', pg_catalog.pg_get_triggerdef(t.oid)
  ) ORDER BY r.nspname, r.relname, t.tgname) FROM relations r JOIN pg_catalog.pg_trigger t ON r.oid = t.tgrelid WHERE NOT t.tgisinternal),
  'realtime', (SELECT pg_catalog.jsonb_build_object(
    'all_tables', p.puballtables, 'insert', p.pubinsert, 'update', p.pubupdate,
    'delete', p.pubdelete, 'truncate', p.pubtruncate,
    'tables', (SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) ORDER BY t.schemaname, t.tablename)
      FROM pg_catalog.pg_publication_tables t WHERE t.pubname = p.pubname)
  ) FROM pg_catalog.pg_publication p WHERE p.pubname = 'supabase_realtime')
) AS communication_trust_contract;
