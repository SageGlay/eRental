-- Read-only metadata for the existing project's SQL Editor. No application rows.
-- Review function definitions for private literals before sharing the output.
WITH relations AS (
  SELECT c.oid, n.nspname AS schema_name, c.relname AS table_name,
         c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
         pg_get_userbyid(c.relowner) AS owner
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p')
    AND ((n.nspname = 'public' AND c.relname IN (
      'admin_users', 'profiles', 'categories', 'listings', 'listing_photos',
      'bookings', 'simulated_payments', 'conversations', 'messages',
      'reviews', 'listing_reports', 'verification_submissions'
    )) OR (n.nspname = 'storage' AND c.relname IN ('buckets', 'objects')))
),
api_roles AS (
  SELECT oid, rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')
),
functions AS (
  SELECT p.oid, p.proname AS name, pg_get_function_identity_arguments(p.oid) AS arguments,
         pg_get_userbyid(p.proowner) AS owner, p.prosecdef AS security_definer,
         p.proconfig AS configuration, pg_get_functiondef(p.oid) AS definition,
         ARRAY(SELECT acl::text FROM unnest(coalesce(p.proacl, acldefault('f', p.proowner))) acl) AS acl,
         (SELECT jsonb_object_agg(rolname, has_function_privilege(api_roles.oid, p.oid, 'EXECUTE'))
          FROM api_roles) AS effective_execute
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
    AND (p.prosecdef OR p.proname IN (
      'is_admin', 'listing_booked_ranges', 'search_listings', 'simulate_payment',
      'resolve_report', 'review_verification'
    ))
)
SELECT jsonb_build_object(
  'server_version', current_setting('server_version'),
  'tables', (SELECT coalesce(jsonb_agg(to_jsonb(r) - 'oid' ORDER BY schema_name, table_name), '[]'::jsonb) FROM relations r),
  'effective_table_grants', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'schema', r.schema_name, 'table', r.table_name, 'role', a.rolname, 'privilege', v.privilege
    ) ORDER BY r.schema_name, r.table_name, a.rolname, v.privilege), '[]'::jsonb)
    FROM relations r CROSS JOIN api_roles a
    CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) v(privilege)
    WHERE has_table_privilege(a.oid, r.oid, v.privilege)
  ),
  'column_grants', (
    SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY g.table_schema, g.table_name, g.column_name, g.grantee, g.privilege_type), '[]'::jsonb)
    FROM information_schema.column_privileges g
    JOIN relations r ON r.schema_name = g.table_schema AND r.table_name = g.table_name
    WHERE g.grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
  ),
  'policies', (
    SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY schemaname, tablename, policyname), '[]'::jsonb)
    FROM pg_policies p JOIN relations r ON r.schema_name = p.schemaname AND r.table_name = p.tablename
  ),
  'constraints', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'schema', r.schema_name, 'table', r.table_name, 'name', c.conname, 'definition', pg_get_constraintdef(c.oid)
    ) ORDER BY r.schema_name, r.table_name, c.conname), '[]'::jsonb)
    FROM pg_constraint c JOIN relations r ON r.oid = c.conrelid
  ),
  'indexes', (
    SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY schemaname, tablename, indexname), '[]'::jsonb)
    FROM pg_indexes i JOIN relations r ON r.schema_name = i.schemaname AND r.table_name = i.tablename
  ),
  'triggers', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'schema', r.schema_name, 'table', r.table_name, 'name', t.tgname,
      'definition', pg_get_triggerdef(t.oid), 'function', pg_get_functiondef(t.tgfoid)
    ) ORDER BY r.schema_name, r.table_name, t.tgname), '[]'::jsonb)
    FROM pg_trigger t JOIN relations r ON r.oid = t.tgrelid
    WHERE NOT t.tgisinternal
  ),
  'functions', (SELECT coalesce(jsonb_agg(to_jsonb(f) - 'oid' ORDER BY name, arguments), '[]'::jsonb) FROM functions f),
  'buckets', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'public', public, 'size_limit', file_size_limit, 'mime_types', allowed_mime_types
    ) ORDER BY id), '[]'::jsonb)
    FROM storage.buckets
    WHERE id IN ('listing-photos', 'verification-documents')
  )
) AS milestone_3_security_contract;
