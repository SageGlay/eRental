-- Read-only verification contract export for the Supabase SQL Editor.
-- This SELECT reads schema/security metadata and the bucket's configuration.
-- It does not read application rows, auth users, document names or file contents.
-- It does not change schema, permissions, users, storage or data.
-- Copy/export the verification_contract result, not project keys or .env values.

select jsonb_pretty(jsonb_build_object(
  'tables', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'schema', n.nspname, 'name', c.relname,
      'rls_enabled', c.relrowsecurity, 'rls_forced', c.relforcerowsecurity
    ) order by c.relname), '[]'::jsonb)
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('profiles', 'verification_submissions')
      and c.relkind in ('r', 'p')
  ),
  'columns', (
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
      select table_schema, table_name, column_name, data_type, udt_schema, udt_name,
        is_nullable, column_default
      from information_schema.columns
      where table_schema = 'public'
        and table_name in ('profiles', 'verification_submissions')
      order by table_name, ordinal_position
    ) x
  ),
  'constraints', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'table', t.relname, 'name', c.conname,
      'definition', pg_catalog.pg_get_constraintdef(c.oid, true)
    ) order by t.relname, c.conname), '[]'::jsonb)
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname in ('profiles', 'verification_submissions')
  ),
  'indexes', (
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
      select schemaname, tablename, indexname, indexdef
      from pg_catalog.pg_indexes
      where schemaname = 'public' and tablename = 'verification_submissions'
      order by indexname
    ) x
  ),
  'enums', (
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
      select distinct n.nspname as schema_name, t.typname as type_name,
        e.enumsortorder, e.enumlabel
      from pg_catalog.pg_enum e
      join pg_catalog.pg_type t on t.oid = e.enumtypid
      join pg_catalog.pg_namespace n on n.oid = t.typnamespace
      join pg_catalog.pg_attribute a on a.atttypid = t.oid
      join pg_catalog.pg_class c on c.oid = a.attrelid
      join pg_catalog.pg_namespace cn on cn.oid = c.relnamespace
      where cn.nspname = 'public' and c.relname in ('profiles', 'verification_submissions')
      order by schema_name, type_name, enumsortorder
    ) x
  ),
  'functions', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', p.proname,
      'arguments', pg_catalog.pg_get_function_identity_arguments(p.oid),
      'security_definer', p.prosecdef,
      'definition', pg_catalog.pg_get_functiondef(p.oid),
      'grants', p.proacl,
      'anon_can_execute', pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE'),
      'authenticated_can_execute', pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
    ) order by p.proname, p.oid), '[]'::jsonb)
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and (p.proname in ('review_verification', 'is_admin') or p.oid in (
        select d.refobjid
        from pg_catalog.pg_depend d
        join pg_catalog.pg_policy policy on policy.oid = d.objid
        join pg_catalog.pg_class c on c.oid = policy.polrelid
        join pg_catalog.pg_namespace ns on ns.oid = c.relnamespace
        where d.classid = 'pg_catalog.pg_policy'::regclass
          and d.refclassid = 'pg_catalog.pg_proc'::regclass
          and ((ns.nspname = 'public' and c.relname in ('profiles', 'verification_submissions'))
            or (ns.nspname = 'storage' and c.relname in ('objects', 'buckets')))
      ))
  ),
  'triggers', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'table', c.relname, 'name', t.tgname,
      'definition', pg_catalog.pg_get_triggerdef(t.oid, true),
      'function', pg_catalog.pg_get_functiondef(p.oid)
    ) order by c.relname, t.tgname), '[]'::jsonb)
    from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_proc p on p.oid = t.tgfoid
    where not t.tgisinternal and n.nspname = 'public'
      and c.relname in ('profiles', 'verification_submissions')
  ),
  'policies', (
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
      select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
      from pg_catalog.pg_policies
      where (schemaname = 'public' and tablename in ('profiles', 'verification_submissions'))
        or (schemaname = 'storage' and tablename in ('objects', 'buckets'))
      order by schemaname, tablename, policyname
    ) x
  ),
  'table_grants', (
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
      select table_schema, table_name, grantee, privilege_type, is_grantable
      from information_schema.table_privileges
      where grantee in ('anon', 'authenticated', 'PUBLIC')
        and ((table_schema = 'public' and table_name in ('profiles', 'verification_submissions'))
          or (table_schema = 'storage' and table_name in ('objects', 'buckets')))
      order by table_schema, table_name, grantee, privilege_type
    ) x
  ),
  'column_grants', (
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
      select table_schema, table_name, column_name, grantee, privilege_type
      from information_schema.column_privileges
      where table_schema = 'public' and table_name in ('profiles', 'verification_submissions')
        and grantee in ('anon', 'authenticated', 'PUBLIC')
      order by table_name, column_name, grantee, privilege_type
    ) x
  ),
  'verification_bucket', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', b.id, 'public', b.public,
      'file_size_limit', b.file_size_limit, 'allowed_mime_types', b.allowed_mime_types
    )), '[]'::jsonb)
    from storage.buckets b where b.id = 'verification-documents'
  )
)) as verification_contract;
