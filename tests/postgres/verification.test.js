import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'

// This harness can address only its own temporary container's Unix socket.
// It has no inputs for hosted project URLs, connection strings or API keys.
const docker = (args, options) =>
  promisify(execFile)('docker', args, {
    timeout: 30_000,
    ...options,
  })
const read = (path) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const snapshot = JSON.parse(read('supabase/contracts/verification.json'))
const proposal = read(
  'supabase/proposals/20261118_serialize_verification_reviews.sql',
)
const rollback = read(
  'supabase/proposals/20261118_serialize_verification_reviews.rollback.sql',
)
const original = snapshot.functions.find(
  ({ name }) => name === 'review_verification',
)
const database = 'erental_verification_fixture'
const psql = [
  'psql',
  '-X',
  '-qAt',
  '-v',
  'ON_ERROR_STOP=1',
  '-h',
  '/var/run/postgresql',
  '-U',
  'postgres',
  '-d',
  database,
]
const fixtureRoles = ['anon', 'authenticated', 'service_role']
const quote = (value) => '"' + value.replaceAll('"', '""') + '"'
const literal = (value) =>
  value === null ? 'null' : "'" + value.replaceAll("'", "''") + "'"
const table = (schema, name) => `${quote(schema)}.${quote(name)}`
const uuid = (number) =>
  `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
const adminA = uuid(1)
const adminB = uuid(2)
const stranger = uuid(3)
const applicant = (number) => uuid(10 + number)
const submission = (number) => uuid(20 + number)
let container
let originalAttributes

async function query(sql) {
  const { stdout } = await docker(['exec', container, ...psql, '-c', sql], {
    timeout: 20_000,
  })
  return stdout.trim()
}

async function until(check, description, milliseconds = 8000) {
  const deadline = Date.now() + milliseconds
  while (Date.now() < deadline) {
    if (await check()) return
    await delay(50)
  }
  assert.fail(description)
}

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

const asUser = (id, sql, role = 'authenticated') =>
  `SET ROLE ${role}; SET request.jwt.claim.sub = ${literal(id || '')}; ${sql};`
const review = (number, action, note = null) =>
  `SELECT public.review_verification('${submission(number)}', ${literal(action)}, ${literal(note)})`
const profileEdit = (number, changes) =>
  `UPDATE public.profiles SET ${changes} WHERE id = '${applicant(number)}'`
const rpcAttributes = () =>
  query(`
  SELECT json_build_array(oid, proowner, proacl, prosecdef, proconfig, prorettype,
                          proargnames, pronargdefaults)
  FROM pg_proc WHERE oid = 'public.review_verification(uuid,text,text)'::regprocedure`)

async function state(number) {
  return JSON.parse(
    await query(`
    SELECT json_build_object('status', s.status, 'note', s.admin_note,
      'reviewer', s.reviewed_by, 'reviewed', s.reviewed_at IS NOT NULL,
      'badge', p.verified_kind, 'verified', p.verified_at IS NOT NULL)
    FROM public.verification_submissions s JOIN public.profiles p ON p.id = s.user_id
    WHERE s.id = '${submission(number)}'`),
  )
}

async function race(firstSql, secondSql) {
  const first = spawn('docker', ['exec', '-i', container, ...psql], {
    stdio: 'pipe',
  })
  let output = ''
  let errors = ''
  const exit = new Promise((resolve, reject) => {
    first.once('error', reject)
    first.once('close', resolve)
  })
  first.stdout.on('data', (chunk) => {
    output += chunk.toString()
  })
  first.stderr.on('data', (chunk) => {
    errors += chunk.toString()
  })
  first.stdin.on('error', () => {}) // A terminated child closes the input pipe.
  first.stdin.write(
    `SET application_name = 'erental_first'; BEGIN; ${firstSql}\n\\echo first-ready\n`,
  )
  try {
    await until(
      () => output.includes('first-ready'),
      'First transaction did not reach its held lock',
    )
    const second = query(
      `SET application_name = 'erental_second'; SET lock_timeout = '12s'; ${secondSql}`,
    ).then(
      () => null,
      (error) => error,
    )
    await until(
      async () =>
        (await query(`
      SELECT EXISTS (
        SELECT FROM pg_stat_activity contender
        JOIN pg_stat_activity holder ON holder.pid = ANY(pg_blocking_pids(contender.pid))
        WHERE contender.application_name = 'erental_second'
          AND holder.application_name = 'erental_first'
      )`)) === 't',
      'Second transaction did not wait on the first transaction',
    )
    first.stdin.end('COMMIT;\n')
    assert.equal(await exit, 0, errors)
    return await second
  } finally {
    if (!first.stdin.destroyed && !first.stdin.writableEnded)
      first.stdin.end('ROLLBACK;\n')
    await exit
  }
}

before(async () => {
  const name = `erental-verification-${randomUUID()}`
  const result = await docker(
    [
      'run',
      '--detach',
      '--rm',
      '--name',
      name,
      '--network',
      'none',
      '--tmpfs',
      '/var/lib/postgresql/data',
      '--env',
      `POSTGRES_DB=${database}`,
      '--env',
      'POSTGRES_PASSWORD=erental-fixture-only',
      'postgres:17-bookworm',
      '-c',
      'listen_addresses=',
    ],
    { timeout: 120_000 },
  )
  container = result.stdout.trim()

  await until(
    async () => {
      try {
        // The image starts a short-lived setup server before its final process.
        const { stdout } = await docker([
          'exec',
          container,
          'cat',
          '/proc/1/comm',
        ])
        return stdout.trim() === 'postgres' && (await query('SELECT 1')) === '1'
      } catch {
        return false
      }
    },
    'Disposable PostgreSQL did not start',
    20_000,
  )
  console.log('Database fixture:', await query('SHOW server_version'))
  await query(fixtureSchema())
  await assert.rejects(query(proposal), /Expected verification RPC is missing/)
  await query(`
    ${original.definition};
    REVOKE EXECUTE ON FUNCTION public.review_verification(uuid, text, text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.review_verification(uuid, text, text) TO authenticated, service_role;
  `)
  originalAttributes = await rpcAttributes()
  await query(proposal)

  const numbers = [1, 2, 3, 4, 5, 6, 7]
  const users = [adminA, adminB, stranger, ...numbers.map(applicant)]
  await query(`
    INSERT INTO auth.users (id) VALUES ${users.map((id) => `('${id}')`).join(',')};
    INSERT INTO public.profiles (id, display_name) SELECT id, 'Sample account' FROM auth.users;
    INSERT INTO public.admin_users (user_id) VALUES ('${adminA}'), ('${adminB}');
    UPDATE public.profiles SET account_type = 'business', business_name = 'Sample rental business'
      WHERE id IN ('${applicant(4)}', '${applicant(6)}');
    INSERT INTO public.verification_submissions (id, user_id, kind, document_type, document_path)
      VALUES ${numbers
        .map(
          (number) => `('${submission(number)}', '${applicant(number)}',
        '${[4, 6].includes(number) ? 'business' : 'identity'}', 'other', '${applicant(number)}/sample.pdf')`,
        )
        .join(',')};
    INSERT INTO storage.buckets VALUES ('verification-documents', false, 5242880, ARRAY['application/pdf']);
    INSERT INTO storage.objects VALUES ('verification-documents', '${applicant(7)}/sample.pdf');
  `)
})

after(async () => {
  if (container) await docker(['rm', '-f', container])
})

test('replacement preserves signature, grants, ownership and restricted review', async () => {
  assert.equal(await rpcAttributes(), originalAttributes)
  await assert.rejects(
    query(asUser(stranger, review(7, 'approve'))),
    /Admins only/,
  )
  await assert.rejects(
    query(asUser(null, review(7, 'approve'), 'anon')),
    /permission denied for function/,
  )
  assert.equal((await state(7)).status, 'pending')
})

test('the first approval survives a competing rejection', async () => {
  const error = await race(
    asUser(adminA, review(1, 'approve', '  First decision  ')),
    asUser(adminB, review(1, 'reject', 'Second decision')),
  )
  assert.match(error?.message ?? '', /already been reviewed/)
  assert.deepEqual(await state(1), {
    status: 'approved',
    note: 'First decision',
    reviewer: adminA,
    reviewed: true,
    badge: 'identity',
    verified: true,
  })
})

test('the first rejection survives a competing approval', async () => {
  const error = await race(
    asUser(adminA, review(2, 'reject', 'First decision')),
    asUser(adminB, review(2, 'approve')),
  )
  assert.match(error?.message ?? '', /already been reviewed/)
  assert.deepEqual(await state(2), {
    status: 'rejected',
    note: 'First decision',
    reviewer: adminA,
    reviewed: true,
    badge: null,
    verified: false,
  })
})

test('approval rechecks a committed account-type edit after waiting for its row', async () => {
  const error = await race(
    asUser(
      applicant(3),
      profileEdit(
        3,
        "account_type = 'business', business_name = 'Sample business'",
      ),
    ),
    asUser(adminA, review(3, 'approve')),
  )
  assert.match(error?.message ?? '', /account type changed/)
  assert.equal((await state(3)).status, 'pending')
  assert.equal((await state(3)).badge, null)
})

test('business approval requires a nonblank business name', async () => {
  await query(asUser(applicant(4), profileEdit(4, "business_name = E'  \\t'")))
  await assert.rejects(
    query(asUser(adminA, review(4, 'approve'))),
    /add their business name/,
  )
  assert.equal((await state(4)).status, 'pending')
  assert.equal((await state(4)).badge, null)
})

test('a profile identity edit following approval clears the badge under the existing trigger', async () => {
  const error = await race(
    asUser(adminA, review(5, 'approve')),
    asUser(
      applicant(5),
      profileEdit(5, "display_name = 'Edited sample account'"),
    ),
  )
  assert.equal(error, null)
  assert.deepEqual(await state(5), {
    status: 'approved',
    note: null,
    reviewer: adminA,
    reviewed: true,
    badge: null,
    verified: false,
  })
})

test('review actions, rejection notes and valid business approval preserve the contract', async () => {
  await assert.rejects(
    query(asUser(adminB, review(6, 'reject', '   '))),
    /give a reason/,
  )
  await assert.rejects(
    query(asUser(adminB, review(6, 'reject', 'x'.repeat(501)))),
    /admin_note_check/,
  )
  await assert.rejects(
    query(asUser(adminB, review(6, 'unexpected'))),
    /Unknown action/,
  )
  assert.equal((await state(6)).status, 'pending')
  await query(asUser(adminB, review(6, 'approve')))
  assert.equal((await state(6)).badge, 'business')
  assert.equal((await state(6)).reviewer, adminB)
})

test('exported policies separate submissions and document metadata by owner or admin', async () => {
  const reads = `SELECT count(*) FROM public.verification_submissions WHERE id = '${submission(7)}';
    SELECT count(*) FROM storage.objects WHERE bucket_id = 'verification-documents'`
  assert.equal(await query(asUser(stranger, reads)), '0\n0')
  assert.equal(await query(asUser(applicant(7), reads)), '1\n1')
  assert.equal(await query(asUser(adminA, reads)), '1\n1')
  await assert.rejects(
    query(
      asUser(
        applicant(7),
        profileEdit(7, "verified_kind = 'identity', verified_at = now()"),
      ),
    ),
    /permission denied/,
  )
  assert.equal(await query(asUser(adminA, 'SELECT public.is_admin()')), 't')
  await assert.rejects(
    query(asUser(adminA, 'SELECT count(*) FROM public.admin_users')),
    /permission denied/,
  )
})

test('read-only metadata diagnostic and rollback work against the recorded fixture', async () => {
  const metadata = JSON.parse(
    await query(read('supabase/diagnostics/milestone_3_security_contract.sql')),
  )
  const rpc = metadata.functions.find(
    ({ name }) => name === 'review_verification',
  )
  assert.equal(rpc.security_definer, true)
  assert.deepEqual(rpc.effective_execute, {
    anon: false,
    authenticated: true,
    service_role: true,
  })
  await query(rollback)
  assert.equal(await rpcAttributes(), originalAttributes)
  const restored = await query(
    "SELECT pg_get_functiondef('public.review_verification(uuid,text,text)'::regprocedure)",
  )
  assert.equal(restored, original.definition.trim())
  await query(proposal)
})
