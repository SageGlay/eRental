import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { asUser, disposableDatabase, literal, read, uuid } from './helpers/disposable-database.js'
import {
  fixtureSchema, installOriginalReview, migration, original, rollback, snapshot,
} from './helpers/verification-schema.js'

const { query, race, start, stop, withHeldTransaction } = disposableDatabase('erental_verification_fixture')
const adminA = uuid(1)
const adminB = uuid(2)
const stranger = uuid(3)
const applicant = (number) => uuid(10 + number)
const submission = (number) => uuid(20 + number)
let originalAttributes

const review = (number, action, note = null) =>
  `SELECT public.review_verification('${submission(number)}', ${literal(action)}, ${literal(note)})`
const profileEdit = (number, changes) =>
  `UPDATE public.profiles SET ${changes} WHERE id = '${applicant(number)}'`
const rpcAttributes = () =>
  query(`
  SELECT json_build_array(oid, proowner, proacl, prosecdef, proconfig, prorettype,
                          proargnames, pronargdefaults)
  FROM pg_proc WHERE oid = 'public.review_verification(uuid,text,text)'::regprocedure`)

const rpcSignature = 'public.review_verification(uuid,text,text)'
const currentReview = () => query(`SELECT pg_get_functiondef('${rpcSignature}'::regprocedure)`)

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

before(async () => {
  await start()
  await query(fixtureSchema())
  await assert.rejects(query(migration), /Expected verification RPC is missing/)
  await query(installOriginalReview)
  originalAttributes = await rpcAttributes()
  await query(migration)

  const numbers = Array.from({ length: 15 }, (_, index) => index + 1)
  const [bucket] = snapshot.verification_bucket
  const users = [adminA, adminB, stranger, ...numbers.map(applicant)]
  await query(`
    INSERT INTO auth.users (id) VALUES ${users.map((id) => `('${id}')`).join(',')};
    INSERT INTO public.profiles (id, display_name) SELECT id, 'Sample account' FROM auth.users;
    INSERT INTO public.admin_users (user_id) VALUES ('${adminA}'), ('${adminB}');
    UPDATE public.profiles SET account_type = 'business', business_name = 'Sample rental business'
      WHERE id IN ('${applicant(4)}', '${applicant(6)}', '${applicant(13)}', '${applicant(14)}');
    INSERT INTO public.verification_submissions (id, user_id, kind, document_type, document_path)
      VALUES ${numbers
        .map(
          (number) => `('${submission(number)}', '${applicant(number)}',
        '${[4, 6, 13, 14].includes(number) ? 'business' : 'identity'}', 'other', '${applicant(number)}/sample.pdf')`,
        )
        .join(',')};
    INSERT INTO storage.buckets VALUES (${literal(bucket.id)}, ${bucket.public}, ${bucket.file_size_limit},
      ARRAY[${bucket.allowed_mime_types.map(literal).join(',')}]);
    INSERT INTO storage.objects VALUES ('verification-documents', '${applicant(7)}/sample.pdf');
  `)
})

after(stop)

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

test('two administrators approving the same request commit one reviewer and one badge', async () => {
  const error = await race(
    asUser(adminA, review(8, 'approve', 'First approval')),
    asUser(adminB, review(8, 'approve', 'Second approval')),
  )
  assert.match(error?.message ?? '', /already been reviewed/)
  assert.deepEqual(await state(8), {
    status: 'approved', note: 'First approval', reviewer: adminA, reviewed: true,
    badge: 'identity', verified: true,
  })
})

test('a decision released by rollback leaves the waiting administrator free to decide', async () => {
  const error = await race(
    asUser(adminA, review(9, 'approve')),
    asUser(adminB, review(9, 'reject', 'Second decision')),
    { commitFirst: false },
  )
  assert.equal(error, null)
  assert.deepEqual(await state(9), {
    status: 'rejected', note: 'Second decision', reviewer: adminB, reviewed: true,
    badge: null, verified: false,
  })
})

test('re-review after either terminal state preserves the original record and timestamps', async () => {
  const record = (n) => query(`
    SELECT to_jsonb(s), p.verified_kind, p.verified_at FROM public.verification_submissions s
    JOIN public.profiles p ON p.id = s.user_id WHERE s.id = '${submission(n)}'`)
  for (const [n, action] of [[10, 'approve'], [11, 'reject']]) {
    await query(asUser(adminA, review(n, action, 'Settled')))
    const saved = await record(n)
    for (const retry of ['approve', 'reject']) {
      await assert.rejects(query(asUser(adminB, review(n, retry, 'Another decision'))), /already been reviewed/)
      assert.equal(await record(n), saved)
    }
  }
})

test('a profile write failure rolls back both sides of an approval', async () => {
  const before = await state(12)
  // Deterministically fail the second write in this one synthetic review.
  // This fixture-only constraint is never part of the migration.
  await query(`ALTER TABLE public.profiles ADD CONSTRAINT fixture_badge_write
    CHECK (id <> '${applicant(12)}' OR verified_at IS NULL)`)
  try {
    await assert.rejects(query(asUser(adminA, review(12, 'approve'))), /fixture_badge_write/)
    assert.deepEqual(await state(12), before)
  } finally {
    await query('ALTER TABLE public.profiles DROP CONSTRAINT fixture_badge_write')
  }
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
  for (const name of [null, '', '   ', '\t\n', '\u00a0', '\u2009', '\ufeff']) {
    await query(asUser(applicant(4), profileEdit(4, `business_name = ${literal(name)}`)))
    await assert.rejects(
      query(asUser(adminA, review(4, 'approve'))),
      /add their business name/,
    )
  }
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

test('approval remains compatible with a foreign-key reader of the applicant profile', async () => {
  // Foreign keys to profiles, including reviewed_by, take a KEY SHARE lock.
  await withHeldTransaction(
    `SELECT id FROM public.profiles WHERE id = '${applicant(15)}' FOR KEY SHARE;`,
    async (release) => {
      await query(`SET lock_timeout = '3s'; ${asUser(adminA, review(15, 'approve'))}`)
      assert.equal((await state(15)).status, 'approved')
      await release()
    },
  )
})

test('business approval rechecks the individual profile after an account-type edit commits', async () => {
  const error = await race(
    asUser(applicant(13), profileEdit(13, "account_type = 'individual', business_name = NULL")),
    asUser(adminA, review(13, 'approve')),
  )
  assert.match(error?.message ?? '', /account type changed/)
  assert.equal((await state(13)).status, 'pending')
  assert.equal((await state(13)).badge, null)
})

test('changing a verified business name clears the active badge and retains review history', async () => {
  await query(asUser(adminB, review(14, 'approve')))
  assert.equal((await state(14)).badge, 'business')
  await query(asUser(applicant(14), profileEdit(14, "business_name = 'New sample name'")))
  assert.deepEqual(await state(14), {
    status: 'approved', note: null, reviewer: adminB, reviewed: true,
    badge: null, verified: false,
  })
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

test('administrator authority and protected review columns remain server-owned', async () => {
  assert.equal(await query(asUser(stranger, 'SELECT public.is_admin()')), 'f')
  const pending = await state(7)
  await assert.rejects(query(asUser(stranger,
    `INSERT INTO public.admin_users (user_id) VALUES ('${stranger}')`)), /permission denied/)
  for (const decision of ['approve', 'reject']) {
    await assert.rejects(query(asUser(stranger, review(7, decision, 'Fixture'))), /Admins only/)
    await assert.rejects(query(asUser(null, review(7, decision, 'Fixture'), 'anon')), /permission denied/)
  }
  // Check each column under effective privileges, including any grants inherited by the role.
  const effective = `SELECT bool_or(has_column_privilege(current_user, 'public.verification_submissions', col, 'UPDATE')
    OR has_column_privilege(current_user, 'public.verification_submissions', col, 'INSERT'))
    FROM unnest(ARRAY['status','admin_note','reviewed_by','reviewed_at']) AS fields(col)`
  assert.equal(await query(asUser(applicant(7), effective)), 'f')
  await assert.rejects(query(asUser(applicant(7), `UPDATE public.verification_submissions
    SET status = 'approved' WHERE id = '${submission(7)}'`)), /permission denied/)
  assert.equal(await query(asUser(stranger, 'SELECT public.is_admin()')), 'f')
  assert.deepEqual(await state(7), pending)
})

test('private bucket metadata permits owned inserts and reads while existing documents remain immutable', async () => {
  const owner = applicant(7)
  const name = `${owner}/synthetic-proof.pdf`
  const insert = (path) => `INSERT INTO storage.objects (bucket_id, name) VALUES ('verification-documents', ${literal(path)})`
  const object = `bucket_id = 'verification-documents' AND name = ${literal(name)}`
  const exists = `SELECT count(*) FROM storage.objects WHERE ${object}`
  assert.equal(await query("SELECT public FROM storage.buckets WHERE id = 'verification-documents'"), 'f')
  await query(asUser(owner, insert(name)))
  assert.equal(await query(asUser(owner, exists)), '1')
  assert.equal(await query(asUser(adminA, exists)), '1')
  assert.equal(await query(asUser(stranger, exists)), '0')
  assert.equal(await query(asUser(null, exists, 'anon')), '0')
  await assert.rejects(query(asUser(stranger, insert(`${owner}/sample-two.pdf`))), /row-level security/)
  await assert.rejects(query(asUser(owner, insert('unowned.pdf'))), /row-level security/)
  await assert.rejects(query(asUser(null, insert(name), 'anon')), /row-level security/)
  for (const id of [owner, adminA]) {
    const update = `UPDATE storage.objects SET name = ${literal(name)} WHERE ${object} RETURNING name`
    const remove = `DELETE FROM storage.objects WHERE ${object} RETURNING name`
    assert.equal(await query(asUser(id, update)), '')
    assert.equal(await query(asUser(id, remove)), '')
  }
  assert.equal(await query(asUser(owner, exists)), '1')
  await assert.rejects(query(asUser(null, `SELECT id FROM public.verification_submissions
    WHERE id = '${submission(7)}'`, 'anon')), /permission denied/)
})

test('rollback refuses to replace a function modified since the migration', async () => {
  const hardened = await currentReview()
  const changed = hardened.replace('AS $function$', 'AS $function$\n-- Fixture-only drift')
  assert.notEqual(changed, hardened)
  await query(changed)
  try {
    await assert.rejects(query(rollback), /definition differs/i)
    assert.equal(await currentReview(), changed)
  } finally {
    await query(hardened)
  }
})

test('read-only catalog diagnostics and rollback work against the recorded fixture', async () => {
  const contract = JSON.parse(await query(read('supabase/diagnostics/verification_contract.sql')))
  assert.deepEqual(contract.verification_bucket, snapshot.verification_bucket)
  assert.deepEqual(contract.column_grants, snapshot.column_grants)
  assert.deepEqual(contract.tables, snapshot.tables)
  const definition = contract.functions.find(({ name }) => name === 'review_verification')
  assert.equal(definition.definition.trim(), await currentReview())
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
  const readProbe = async () => JSON.parse(await query(read('supabase/diagnostics/verification_release_check.sql')))
  const probe = await readProbe()
  const releaseRpc = probe.functions.review_verification
  assert.equal(releaseRpc.owner, 'postgres')
  assert.equal(releaseRpc.public_execute, false)
  assert.equal(releaseRpc.anon_execute, false)
  assert.equal(releaseRpc.authenticated_execute, true)
  assert.equal(releaseRpc.service_role_execute, true)
  assert.deepEqual(probe.membership_access.map(({ role }) => role), ['anon', 'authenticated'])
  for (const role of probe.membership_access) {
    assert.equal(role.can_insert || role.can_update || role.can_delete || role.can_truncate, false)
    assert.equal(role.policy_count, 0)
    assert.equal(role.rls_enabled, true)
  }
  const protectedColumns = ['verified_at', 'verified_kind', 'status', 'admin_note', 'reviewed_at', 'reviewed_by']
  assert.deepEqual(probe.effective_client_column_writes.filter((grant) => protectedColumns.includes(grant.column_name)), [])
  assert.equal(probe.triggers.find((item) => item.name === 'profiles_clear_verification').enabled, 'O')

  await query(rollback)
  const restoredProbe = await readProbe()
  console.log('Review definition SHA-256 before migration:', restoredProbe.functions.review_verification.definition_sha256)
  console.log('Review definition SHA-256 after migration:', releaseRpc.definition_sha256)
  assert.notEqual(releaseRpc.definition_sha256, restoredProbe.functions.review_verification.definition_sha256)
  assert.equal(await rpcAttributes(), originalAttributes)
  assert.equal(await currentReview(), original.definition.trim())
  await query(migration)
})

test('forward migration refuses changed source or an unexpected effective client grant', async () => {
  const hardened = await currentReview()
  await query(rollback)
  const baseline = await currentReview()
  const changed = baseline.replace('AS $function$', 'AS $function$\n-- Simulated independent maintenance')
  try {
    await query(changed)
    await assert.rejects(query(migration), /definition differs/i)
    assert.equal(await currentReview(), changed)
    await query(baseline)

    // Simulate deployment drift in the network-isolated catalog. No caller runs
    // the RPC with this ACL. The forward file must leave both ACL and code alone.
    await query(`GRANT EXECUTE ON FUNCTION ${rpcSignature} TO PUBLIC`)
    await assert.rejects(query(migration), /privileges differ/i)
    assert.equal(await currentReview(), baseline)
    assert.equal(await query(`SELECT has_function_privilege('anon','${rpcSignature}','EXECUTE')`), 't')
  } finally {
    await query(`REVOKE EXECUTE ON FUNCTION ${rpcSignature} FROM PUBLIC`)
    await query(baseline)
    await query(migration)
  }
  assert.equal(await currentReview(), hardened)
  assert.equal(await rpcAttributes(), originalAttributes)
})
