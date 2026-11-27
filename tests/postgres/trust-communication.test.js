import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { asUser, disposableDatabase, literal, read, uuid } from './helpers/disposable-database.js'
import { fixtureSchema, installOriginalReview, migration as hardenVerification } from './helpers/verification-schema.js'

const { query, race, start, stop } = disposableDatabase('erental_trust_communication')
const owner = uuid(1)
const renter = uuid(2)
const other = uuid(3)
const adminA = uuid(4)
const adminB = uuid(5)
const listing = uuid(10)
const secondListing = uuid(11)
const otherListing = uuid(12)
const thread = uuid(20)
const otherThread = uuid(21)
const oldMessage = uuid(30)
const foreignMessage = uuid(31)
const subject = 'Synthetic message for the communication fixture.'

const writeAs = (actor, sql) => query(asUser(actor, sql))
const openThread = (id, target, actor) =>
  `INSERT INTO public.conversations (id, listing_id, renter_id) VALUES ('${id}', '${target}', '${actor}')`
const insertMessage = (id, conversation, sender, body = subject) =>
  `INSERT INTO public.messages (id, conversation_id, sender_id, body)
    VALUES ('${id}', '${conversation}', '${sender}', ${literal(body)})`
const send = (id, body = subject, conversation = thread) =>
  `SELECT public.send_conversation_message('${conversation}', '${id}', ${literal(body)})`
const block = (user, active) => `SELECT public.set_user_block('${user}', ${active})`
const contactStatus = (actor, conversation = thread) => writeAs(actor, `SELECT public.conversation_contact_status('${conversation}')`)
const report = (ids = [], conversation = thread, reason = 'spam') =>
  `SELECT public.report_conversation('${conversation}', ${literal(reason)}, 'Synthetic report', ARRAY[${ids.map(literal)}]::uuid[])`
const resolveReport = (id, action, note = 'Synthetic resolution reason') =>
  `SELECT public.resolve_conversation_report('${id}', ${literal(action)}, ${literal(note)})`
const evidence = (id) => `SELECT public.get_conversation_report_evidence('${id}')`
const noticeCount = (kind) => query(`SELECT count(*) FROM public.notifications WHERE entity_id = '${thread}' AND event_type = ${literal(kind)}`)

before(async () => {
  await start()
  await query(fixtureSchema())
  await query(installOriginalReview)
  await query(hardenVerification)
  await query(read('tests/postgres/helpers/marketplace-sources.sql'))
  await query(read('tests/postgres/helpers/trust-communication-source.sql'))
  await query(read('supabase/migrations/20261125190326_marketplace_essentials.sql'))
  await query(read('supabase/migrations/20261127090000_communication_trust_event_types.sql'))

  const users = [owner, renter, other, adminA, adminB]
  await query(`
    INSERT INTO auth.users(id) VALUES ${users.map(id => `('${id}')`).join(',')};
    INSERT INTO public.profiles(id, display_name) SELECT id, 'Synthetic account' FROM auth.users;
    INSERT INTO public.admin_users(user_id) VALUES ('${adminA}'), ('${adminB}');
    INSERT INTO public.listings(id, owner_id, title) VALUES
      ('${listing}', '${owner}', 'Synthetic projector'), ('${secondListing}', '${owner}', 'Synthetic tent'),
      ('${otherListing}', '${other}', 'Synthetic bicycle');
    INSERT INTO public.conversations(id, listing_id, owner_id, renter_id) VALUES
      ('${thread}', '${listing}', '${owner}', '${renter}'),
      ('${otherThread}', '${otherListing}', '${other}', '${owner}');
    ${insertMessage(oldMessage, thread, renter)};
    ${insertMessage(foreignMessage, otherThread, owner)};
  `)
  const migration = read('supabase/migrations/20261127090001_communication_safety.sql')
  await query('ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings')
  await assert.rejects(query(migration), /Reconcile existing publication/)
  assert.equal(await query("SELECT to_regclass('public.user_blocks') IS NULL"), 't')
  await query('ALTER PUBLICATION supabase_realtime DROP TABLE public.bookings')
  await query(migration)
})

after(stop)

test('migration backfills the counterpart and publishes only authorized insert and update sources', async () => {
  assert.equal(await query(`SELECT recipient_id FROM public.messages WHERE id = '${oldMessage}'`), owner)
  assert.equal(await query(`SELECT recipient_id FROM public.messages WHERE id = '${foreignMessage}'`), other)
  assert.equal(await query(`SELECT pubinsert AND pubupdate AND NOT pubdelete AND NOT pubtruncate AND NOT puballtables
    FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime'`), 't')
  assert.equal(await query(`SELECT schemaname || '.' || tablename FROM pg_catalog.pg_publication_tables
    WHERE pubname = 'supabase_realtime'`), 'public.messages')
})

test('participant isolation holds even in the presence of broader legacy read policies', async () => {
  const rows = `SELECT count(*) FROM public.messages WHERE conversation_id = '${thread}'`
  const threads = `SELECT count(*) FROM public.conversations WHERE id = '${thread}'`
  await query(`CREATE POLICY fixture_legacy_message_read ON public.messages FOR SELECT TO authenticated USING (true);
    CREATE POLICY fixture_legacy_conversation_read ON public.conversations FOR SELECT TO authenticated USING (true)`)
  try {
    for (const actor of [other, adminA]) {
      assert.equal(await writeAs(actor, rows), '0')
      assert.equal(await writeAs(actor, threads), '0')
      await assert.rejects(writeAs(actor, send(uuid(40))), /Conversation unavailable/)
      await assert.rejects(contactStatus(actor), /Conversation unavailable/)
    }
    assert.equal(await writeAs(owner, rows), '1')
    assert.equal(await writeAs(renter, rows), '1')
  } finally {
    await query(`DROP POLICY fixture_legacy_message_read ON public.messages;
      DROP POLICY fixture_legacy_conversation_read ON public.conversations`)
  }
})

test('message integrity rejects impersonation and permits only a recipient read marker', async () => {
  await assert.rejects(writeAs(owner, insertMessage(uuid(42), thread, renter)), /Conversation unavailable/)
  await assert.rejects(writeAs(other, insertMessage(uuid(42), thread, other)), /Conversation unavailable/)
  await assert.rejects(writeAs(renter, insertMessage(uuid(42), thread, renter, ' \n\t ')), /1 to 2,000 characters/)
  await assert.rejects(writeAs(owner, `UPDATE public.messages SET body = 'Changed' WHERE id = '${oldMessage}'`), /permission denied/)
  const readAt = `SELECT read_at FROM public.messages WHERE id = '${oldMessage}'`
  const mark = `UPDATE public.messages SET read_at = '2001-01-01' WHERE id = '${oldMessage}'`
  await writeAs(renter, mark)
  assert.equal(await writeAs(owner, readAt), '')
  await writeAs(owner, mark)
  const confirmed = await writeAs(owner, readAt)
  assert.ok(Date.parse(confirmed) > Date.parse('2001-01-01'))
  await writeAs(owner, mark)
  assert.equal(await writeAs(owner, readAt), confirmed)
})

test('concurrent retries of the same send persist a single message and notification', async () => {
  const operation = uuid(45)
  const first = asUser(renter, send(operation))
  assert.equal(await race(first, first), null)
  assert.equal(await writeAs(renter, send(operation)), operation)
  assert.equal(await query(`SELECT count(*) FROM public.messages WHERE id = '${operation}'`), '1')
  assert.equal(await noticeCount('message_received'), '1')
  await assert.rejects(writeAs(renter, send(operation, 'Changed draft')), /Message unavailable/)
  assert.equal(await noticeCount('message_received'), '1')
})

test('a committed block waits against a message and then denies both directions without emitting an event', async () => {
  const operation = uuid(46)
  const blocked = await race(asUser(owner, block(renter, true)), asUser(renter, send(operation)))
  assert.match(String(blocked), /Contact is unavailable/)
  await assert.rejects(writeAs(owner, send(operation)), /Contact is unavailable/)
  await assert.rejects(writeAs(renter, insertMessage(operation, thread, renter)), /Contact is unavailable/)
  assert.equal(await query(`SELECT count(*) FROM public.messages WHERE id = '${operation}'`), '0')
  assert.equal(await noticeCount('message_received'), '1')
  assert.equal(await writeAs(owner, 'SELECT count(*) FROM public.user_blocks'), '1')
  assert.equal(await writeAs(renter, 'SELECT count(*) FROM public.user_blocks'), '0')
  assert.equal(await writeAs(renter, `SELECT count(*) FROM public.messages WHERE conversation_id = '${thread}'`), '2')
  assert.deepEqual(JSON.parse(await contactStatus(renter)), { counterpart_id: owner, contact_allowed: false, blocked_by_me: false })
  assert.deepEqual(JSON.parse(await contactStatus(owner)), { counterpart_id: renter, contact_allowed: false, blocked_by_me: true })
  await assert.rejects(writeAs(renter, `DELETE FROM public.user_blocks WHERE blocker_id = '${owner}'`), /permission denied/)

  await writeAs(renter, block(owner, true))
  await writeAs(owner, block(renter, false))
  await assert.rejects(writeAs(owner, send(operation)), /Contact is unavailable/)
  await writeAs(renter, block(owner, false))
  assert.equal(JSON.parse(await contactStatus(renter)).contact_allowed, true)
})

test('a send that commits before a block remains visible and the next send is denied', async () => {
  const operation = uuid(47)
  assert.equal(await race(asUser(owner, send(operation)), asUser(renter, block(owner, true))), null)
  assert.equal(await writeAs(renter, `SELECT body FROM public.messages WHERE id = '${operation}'`), subject)
  assert.equal(await writeAs(owner, send(operation)), operation)
  await assert.rejects(writeAs(owner, send(uuid(48))), /Contact is unavailable/)
  await writeAs(renter, block(owner, false))
})

test('direct new conversations share the mutual contact guard across different listings', async () => {
  const id = uuid(49)
  const blocked = await race(asUser(owner, block(renter, true)), asUser(renter, openThread(id, secondListing, renter)))
  assert.match(String(blocked), /Contact is unavailable/)
  assert.equal(await query(`SELECT count(*) FROM public.conversations WHERE id = '${id}'`), '0')
  await writeAs(owner, block(renter, false))
  await writeAs(renter, openThread(id, secondListing, renter))
  assert.equal(await writeAs(renter, `SELECT owner_id FROM public.conversations WHERE id = '${id}'`), owner)
  await assert.rejects(writeAs(renter, openThread(uuid(50), listing, other)), /Conversation unavailable/)
})

test('report submission limits evidence to selected messages and private administrative scope', async () => {
  await assert.rejects(writeAs(other, report([oldMessage])), /Conversation unavailable/)
  await assert.rejects(writeAs(renter, report([foreignMessage])), /distinct messages/)
  await assert.rejects(writeAs(renter, report([oldMessage, oldMessage])), /distinct messages/)
  await assert.rejects(writeAs(renter, report([], thread, 'other unavailable reason')), /Choose a reason/)
  const id = await writeAs(renter, report([oldMessage]))
  assert.equal(await writeAs(renter, `SELECT reported_user_id FROM public.conversation_reports WHERE id = '${id}'`), owner)
  assert.equal(await writeAs(owner, `SELECT count(*) FROM public.conversation_reports WHERE id = '${id}'`), '0')
  await assert.rejects(writeAs(renter, report()), /duplicate key/)
  await assert.rejects(writeAs(renter, evidence(id)), /Admins only/)
  await assert.rejects(writeAs(renter, resolveReport(id, 'upheld')), /Admins only/)
  await assert.rejects(writeAs(renter, `UPDATE public.conversation_reports SET status = 'upheld' WHERE id = '${id}'`), /permission denied/)
  await assert.rejects(writeAs(renter, `DELETE FROM public.conversations WHERE id = '${thread}'`), /permission denied/)
  const excerpts = JSON.parse(await writeAs(adminA, evidence(id)))
  assert.equal(excerpts.length, 1)
  assert.equal(excerpts[0].message_id, oldMessage)
  assert.equal(excerpts[0].body, subject)
  assert.equal(excerpts[0].sender_role, 'reporter')
  assert.equal(await writeAs(adminA, 'SELECT count(*) FROM public.messages'), '0')
  assert.equal(await writeAs(adminA, 'SELECT count(*) FROM public.conversations'), '0')
  assert.equal(JSON.parse(await contactStatus(renter)).contact_allowed, true)
})

test('a later report resolution is single-writer, persistent and confidential to the reporter', async () => {
  const id = await writeAs(renter, 'SELECT id FROM public.conversation_reports')
  await assert.rejects(writeAs(adminA, resolveReport(id, 'upheld', ' ')), /enter a reason/)
  const loser = await race(asUser(adminA, resolveReport(id, 'dismissed')), asUser(adminB, resolveReport(id, 'upheld')))
  assert.match(String(loser), /no longer pending/)
  const result = JSON.parse(await writeAs(renter, `SELECT json_build_object('status',status,'by',reviewed_by,'note',admin_note)
    FROM public.conversation_reports WHERE id = '${id}'`))
  assert.deepEqual(result, { status: 'dismissed', by: adminA, note: 'Synthetic resolution reason' })
  const notices = JSON.parse(await query(`SELECT json_agg(json_build_array(recipient_id, recipient_role, entity_id))
    FROM public.notifications WHERE event_type = 'conversation_report_resolved'`))
  assert.deepEqual(notices, [[renter, 'reporter', thread]])
  const next = await writeAs(renter, report())
  assert.notEqual(next, id)
  assert.equal(await writeAs(renter, 'SELECT count(*) FROM public.conversation_reports'), '2')
})

test('new API privileges deny anonymous and internal function use', async () => {
  await assert.rejects(query(asUser(null, send(uuid(63)), 'anon')), /permission denied/)
  await assert.rejects(query(asUser(null, 'SELECT count(*) FROM public.user_blocks', 'anon')), /permission denied/)
  await assert.rejects(writeAs(renter, `SELECT erental_events.contact_is_blocked('${owner}', '${renter}')`), /permission denied/)
  await assert.rejects(writeAs(renter, 'SELECT count(*) FROM erental_events.conversation_report_evidence'), /permission denied/)
  await assert.rejects(writeAs(renter, block(renter, true)), /account is unavailable/)
})
