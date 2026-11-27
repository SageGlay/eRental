import { read } from './disposable-database.js'

const snapshot = JSON.parse(read('supabase/contracts/verification.json'))
const migrationFile = '20261119184647_harden_verification_review.sql'
const migration = read(`supabase/migrations/${migrationFile}`)
const rollback = read(`supabase/rollbacks/${migrationFile}`)
const original = snapshot.functions.find(
  ({ name }) => name === 'review_verification',
)
const fixtureRoles = ['anon', 'authenticated', 'service_role']
const quote = (value) => '"' + value.replaceAll('"', '""') + '"'
const table = (schema, name) => `${quote(schema)}.${quote(name)}`

function fixtureSchema() {
  // Read the application schema and role rules from the recorded export.
  // auth.uid() and storage.foldername() are local fixture adapters.
  const columnsFor = ({ schema, name }) =>
    snapshot.columns
      .filter(
        (column) =>
          column.table_schema === schema && column.table_name === name,
      )
      .map(({ column_name, data_type, column_default, is_nullable }) =>
        [
          quote(column_name),
          data_type,
          column_default && `DEFAULT ${column_default}`,
          is_nullable === 'NO' && 'NOT NULL',
        ]
          .filter(Boolean)
          .join(' '),
      )

  return [
    ...fixtureRoles.map((role) => `CREATE ROLE ${role} NOLOGIN`),
    'CREATE SCHEMA auth',
    'CREATE SCHEMA storage',
    'GRANT USAGE ON SCHEMA auth, storage TO anon, authenticated, service_role',
    'CREATE TABLE auth.users (id uuid PRIMARY KEY)',
    "CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$",
    'CREATE TABLE public.admin_users (user_id uuid PRIMARY KEY REFERENCES auth.users(id))',
    'ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY',
    'CREATE TABLE storage.objects (bucket_id text NOT NULL, name text NOT NULL)',
    'CREATE TABLE storage.buckets (id text PRIMARY KEY, public boolean, file_size_limit bigint, allowed_mime_types text[])',
    "CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array(name, '/'))[1:cardinality(string_to_array(name, '/')) - 1] $$",
    'ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY',
    'ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY',
    ...snapshot.tables.map(
      (relation) =>
        `CREATE TABLE ${table(relation.schema, relation.name)} (${columnsFor(relation).join(', ')})`,
    ),
    ...snapshot.constraints.map(
      ({ name, table: relation, definition }) =>
        `ALTER TABLE ${table('public', relation)} ADD CONSTRAINT ${quote(name)} ${definition}`,
    ),
    ...snapshot.tables
      .filter(({ rls_enabled }) => rls_enabled)
      .map(
        ({ schema, name }) =>
          `ALTER TABLE ${table(schema, name)} ENABLE ROW LEVEL SECURITY`,
      ),
    ...snapshot.indexes
      .filter(
        ({ indexname }) =>
          !snapshot.constraints.some(({ name }) => name === indexname),
      )
      .map(({ indexdef }) => indexdef),
    ...snapshot.functions
      .filter(({ name }) => name !== original.name)
      .map(({ definition }) => definition),
    'REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC',
    'GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role',
    ...snapshot.triggers.map(({ function: definition }) => definition),
    ...snapshot.triggers.map(({ definition }) => definition),
    ...snapshot.table_grants
      .filter(({ grantee }) => fixtureRoles.includes(grantee))
      .map(
        ({ table_schema, table_name, grantee, privilege_type }) =>
          `GRANT ${privilege_type} ON ${table(table_schema, table_name)} TO ${quote(grantee)}`,
      ),
    ...snapshot.column_grants
      .filter(
        ({ grantee, privilege_type, table_schema }) =>
          fixtureRoles.includes(grantee) &&
          privilege_type !== 'SELECT' &&
          table_schema === 'public',
      )
      .map(
        ({ table_schema, table_name, grantee, privilege_type, column_name }) =>
          `GRANT ${privilege_type} (${quote(column_name)}) ON ${table(table_schema, table_name)} TO ${quote(grantee)}`,
      ),
    ...snapshot.policies.map(
      ({ policyname, schemaname, tablename, cmd, roles, qual, with_check }) =>
        `CREATE POLICY ${quote(policyname)} ON ${table(schemaname, tablename)} FOR ${cmd} TO ${roles.map(quote).join(', ')}${qual ? ` USING (${qual})` : ''}${with_check ? ` WITH CHECK (${with_check})` : ''}`,
    ),
  ].join(';\n')
}

export const installOriginalReview = `
  ${original.definition};
  REVOKE EXECUTE ON FUNCTION public.review_verification(uuid, text, text) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.review_verification(uuid, text, text) TO authenticated, service_role;
`

export { fixtureSchema, migration, original, rollback, snapshot }
