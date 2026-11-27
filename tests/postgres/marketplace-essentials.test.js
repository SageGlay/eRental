import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { asUser, disposableDatabase, literal, read, uuid } from './helpers/disposable-database.js'
import {
  fixtureSchema, installOriginalReview, migration as hardenVerification,
} from './helpers/verification-schema.js'

const essentialsMigration = read('supabase/migrations/20261125190326_marketplace_essentials.sql')
const { query, race, start, stop } = disposableDatabase('erental_essentials_fixture')
const owner = uuid(1)
const renter = uuid(2)
const other = uuid(3)
const adminA = uuid(4)
const adminB = uuid(5)
const approvedApplicant = uuid(6)
const rejectedApplicant = uuid(7)
const listing = uuid(20)
const historicalThread = uuid(29)
const sampleNote = 'Synthetic review note'
const sampleMessage = 'Synthetic private message body'
const writeAs = (actor, sql) => query(asUser(actor, sql))
const fixtureChange = (actor, sql) => query(asUser(actor, sql, 'postgres'))
const booking = (id) => `INSERT INTO public.bookings (id, owner_id, renter_id, listing_id, status)
  VALUES ('${id}', '${owner}', '${renter}', '${listing}', 'pending')`
const bookingStatus = (id, status) => `UPDATE public.bookings SET status = ${literal(status)} WHERE id = '${id}'`
const thread = (id) => `INSERT INTO public.conversations (id, owner_id, renter_id, listing_id)
  VALUES ('${id}', '${owner}', '${renter}', '${listing}')`
const message = (id, conversationId, sender) => `INSERT INTO public.messages (id, conversation_id, sender_id, body)
  VALUES ('${id}', '${conversationId}', '${sender}', ${literal(sampleMessage)})`
const save = (user, id) => `INSERT INTO public.saved_listings (user_id, listing_id) VALUES ('${user}', '${id}')`
const markRead = (id) => `SELECT public.mark_notification_read('${id}')`
const review = (id, action) => `SELECT public.review_verification('${id}', ${literal(action)}, ${literal(sampleNote)})`
const unread = (user) => writeAs(user, 'SELECT count(*) FROM public.notifications WHERE read_at IS NULL')

async function events(id) {
  return JSON.parse(await query(`SELECT coalesce(json_agg(json_build_array(event_type, recipient_id, recipient_role)
    ORDER BY event_type, recipient_id), '[]') FROM public.notifications WHERE entity_id = '${id}'`))
}

before(async () => {
  await start()
  await query(fixtureSchema())
  await query(installOriginalReview)
  await query(hardenVerification)
  await query(read('tests/postgres/helpers/marketplace-sources.sql'))
  const users = [owner, renter, other, adminA, adminB, approvedApplicant, rejectedApplicant]
  await query(`
    INSERT INTO auth.users(id) VALUES ${users.map((id) => `('${id}')`).join(',')};
    INSERT INTO public.profiles (id, display_name) SELECT id, 'Synthetic account' FROM auth.users;
    INSERT INTO public.admin_users (user_id) VALUES ('${adminA}'), ('${adminB}');
    INSERT INTO public.listings (id, owner_id, title) VALUES ('${listing}', '${owner}', 'Synthetic rental');
    ${thread(historicalThread)};
    ${message(uuid(70), historicalThread, renter)};
  `)
  // The installation guard must leave no partially installed objects if a
  // deployment prerequisite has drifted. Exercise only this database's catalog.
  await query('GRANT INSERT(status) ON public.simulated_payments TO authenticated')
  await assert.rejects(query(essentialsMigration), /Unexpected client writes on trusted workflow data/)
  assert.equal(await query("SELECT to_regclass('public.notifications') IS NULL AND to_regclass('public.saved_listings') IS NULL"), 't')
  await query('REVOKE INSERT(status) ON public.simulated_payments FROM authenticated')
  await query(essentialsMigration)
})

after(stop)

test('saved listings are owner scoped, unique and removable through the client role', async () => {
  await writeAs(renter, save(renter, listing))
  await assert.rejects(writeAs(renter, save(renter, listing)), /duplicate key/)
  const saved = `SELECT count(*) FROM public.saved_listings WHERE listing_id = '${listing}'`
  assert.equal(await writeAs(renter, saved), '1')
  assert.equal(await writeAs(other, saved), '0')
  await assert.rejects(writeAs(other, save(renter, listing)), /row-level security/)
  await writeAs(other, `DELETE FROM public.saved_listings WHERE listing_id = '${listing}'`)
  assert.equal(await writeAs(renter, saved), '1')
  await assert.rejects(writeAs(renter, `UPDATE public.saved_listings SET user_id = '${other}'`), /permission denied/)
  await assert.rejects(query(asUser(null, saved, 'anon')), /permission denied/)
  await writeAs(renter, `DELETE FROM public.saved_listings WHERE listing_id = '${listing}'`)
  assert.equal(await writeAs(renter, saved), '0')
})

test('bookmarks cannot reveal removed inventory and follow hard deletion of listings and accounts', async () => {
  const removed = uuid(21)
  const departing = uuid(8)
  await query(`INSERT INTO public.listings (id, owner_id, title) VALUES ('${removed}', '${owner}', 'Private fixture');
    INSERT INTO auth.users (id) VALUES ('${departing}');
    INSERT INTO public.profiles (id, display_name) VALUES ('${departing}', 'Temporary account')`)
  await writeAs(renter, save(renter, removed))
  await writeAs(departing, save(departing, listing))
  await query(`UPDATE public.listings SET status = 'removed', removed_by_admin = true WHERE id = '${removed}'`)
  await assert.rejects(writeAs(other, save(other, removed)), /row-level security/)
  assert.equal(await writeAs(renter, `SELECT count(*) FROM public.saved_listings s
    JOIN public.listings l ON l.id = s.listing_id WHERE l.id = '${removed}'`), '0')
  await query(`DELETE FROM public.listings WHERE id = '${removed}';
    DELETE FROM auth.users WHERE id = '${departing}'`)
  assert.equal(await query(`SELECT count(*) FROM public.saved_listings
    WHERE listing_id = '${removed}' OR user_id = '${departing}'`), '0')
})

test('confirmed requests, accepts, declines, cancellations and completion notify the other participant', async () => {
  for (const [index, status, actor, eventType, recipient, role] of [
    [0, 'accepted', owner, 'booking_accepted', renter, 'renter'],
    [1, 'rejected', owner, 'booking_rejected', renter, 'renter'],
    [2, 'cancelled', renter, 'booking_cancelled', owner, 'owner'],
    [3, 'cancelled', owner, 'booking_cancelled', renter, 'renter'],
    [4, 'completed', owner, 'rental_completed', renter, 'renter'],
  ]) {
    const id = uuid(30 + index)
    await fixtureChange(renter, booking(id))
    const expected = [['booking_requested', owner, 'owner']]
    assert.deepEqual(await events(id), expected)
    if (status === 'completed' || (status === 'cancelled' && actor === owner)) {
      await fixtureChange(owner, bookingStatus(id, 'accepted'))
      expected.push(['booking_accepted', renter, 'renter'])
    }
    await fixtureChange(actor, bookingStatus(id, status))
    await fixtureChange(actor, bookingStatus(id, status))
    expected.push([eventType, recipient, role])
    expected.sort(([a], [b]) => a.localeCompare(b))
    assert.deepEqual(await events(id), expected)
  }
})

test('a rolled-back booking transaction leaves neither a request nor a notification', async () => {
  const id = uuid(36)
  await fixtureChange(renter, `BEGIN; ${booking(id)}; ROLLBACK`)
  assert.deepEqual(await events(id), [])
  assert.equal(await query(`SELECT count(*) FROM public.bookings WHERE id = '${id}'`), '0')
})

test('inquiries start at the first persisted message while replies notify only the counterpart', async () => {
  const id = uuid(40)
  await fixtureChange(renter, thread(id))
  assert.deepEqual(await events(id), [])
  await fixtureChange(renter, `BEGIN; ${message(uuid(71), id, renter)}; ROLLBACK`)
  assert.deepEqual(await events(id), [])
  await fixtureChange(renter, message(uuid(71), id, renter))
  await fixtureChange(owner, message(uuid(72), id, owner))
  await fixtureChange(renter, message(uuid(73), id, renter))
  assert.deepEqual(await events(id), [
    ['inquiry_received', owner, 'owner'],
    ['message_received', owner, 'owner'],
    ['message_received', renter, 'renter'],
  ])
  const inquiryId = await writeAs(owner, `SELECT id FROM public.notifications WHERE entity_id = '${id}' AND event_type = 'inquiry_received'`)
  await writeAs(owner, markRead(inquiryId))
  assert.equal(await query(`SELECT read_at IS NULL FROM public.messages WHERE id = '${uuid(71)}'`), 't')
  await fixtureChange(owner, `UPDATE public.messages SET read_at = now() WHERE id = '${uuid(73)}'`)
  assert.equal(await writeAs(owner, `SELECT count(*) FROM public.notifications WHERE entity_id = '${id}' AND read_at IS NULL`), '1')
  assert.deepEqual(await events(historicalThread), [])
  await fixtureChange(owner, message(uuid(74), historicalThread, owner))
  assert.deepEqual(await events(historicalThread), [['message_received', renter, 'renter']])
})

test('simulated rental and deposit rows produce one booking-level payment and refund per recipient', async () => {
  const id = uuid(45)
  await fixtureChange(renter, booking(id))
  await fixtureChange(owner, bookingStatus(id, 'accepted'))
  await fixtureChange(renter, `INSERT INTO public.simulated_payments (id, booking_id, kind, status) VALUES
    ('${uuid(80)}','${id}','rental','simulated_paid'), ('${uuid(81)}','${id}','deposit','simulated_paid')`)
  await fixtureChange(owner, `UPDATE public.simulated_payments SET status = 'simulated_refunded'
    WHERE booking_id = '${id}'`)
  assert.deepEqual(await events(id), [
    ['booking_accepted', renter, 'renter'], ['booking_requested', owner, 'owner'],
    ['simulated_payment_recorded', owner, 'owner'], ['simulated_refund_recorded', renter, 'renter'],
  ])
})

test('only recipients see notifications and read RPCs preserve trusted content, other users and prior timestamps', async () => {
  const id = uuid(50)
  await fixtureChange(renter, booking(id))
  await fixtureChange(owner, bookingStatus(id, 'accepted'))
  const getId = (user) => writeAs(user, `SELECT id FROM public.notifications WHERE entity_id = '${id}'`)
  const ownerId = await getId(owner)
  const renterId = await getId(renter)
  assert.ok(ownerId && renterId && ownerId !== renterId)
  assert.equal(await getId(other), '')
  const preserved = () => query(`SELECT read_at FROM public.notifications WHERE id = '${ownerId}'`)
  await assert.rejects(writeAs(other, markRead(ownerId)), /Notification unavailable/)
  assert.equal(await preserved(), '')
  const renterUnread = await unread(renter)
  await writeAs(owner, markRead(ownerId))
  const time = await preserved()
  assert.ok(time)
  await writeAs(owner, markRead(ownerId))
  assert.equal(await preserved(), time)
  await writeAs(owner, 'SELECT public.mark_all_notifications_read()')
  assert.equal(await unread(owner), '0')
  assert.equal(await unread(renter), renterUnread)
  assert.equal(await preserved(), time)
  await assert.rejects(writeAs(owner, `UPDATE public.notifications SET recipient_id = '${renter}' WHERE id = '${ownerId}'`), /permission denied/)
  await assert.rejects(writeAs(owner, `UPDATE public.notifications SET event_type = 'verification_approved' WHERE id = '${ownerId}'`), /permission denied/)
  await assert.rejects(writeAs(owner, `INSERT INTO public.notifications (recipient_id, event_type, entity_id)
    VALUES ('${renter}', 'verification_approved', '${id}')`), /permission denied/)
  await assert.rejects(writeAs(owner, 'SELECT event_key FROM public.notifications'), /permission denied/)
  await assert.rejects(writeAs(owner, `DELETE FROM public.notifications WHERE id = '${ownerId}'`), /permission denied/)
  for (const sql of ['SELECT count(*) FROM public.notifications', markRead(renterId), 'SELECT public.mark_all_notifications_read()']) {
    await assert.rejects(query(asUser(null, sql, 'anon')), /permission denied/)
  }
})

test('the hardened verification RPC emits only the committed decision for its applicant under contention', async () => {
  for (const [index, applicant, action] of [[0, approvedApplicant, 'approve'], [1, rejectedApplicant, 'reject']]) {
    const id = uuid(60 + index)
    await query(`INSERT INTO public.verification_submissions (id, user_id, kind, document_type, document_path)
      VALUES ('${id}', '${applicant}', 'identity', 'other', '${applicant}/synthetic.pdf')`)
    await assert.rejects(writeAs(other, review(id, action)), /Admins only/)
    await fixtureChange(adminA, `BEGIN; ${review(id, action)}; ROLLBACK`)
    assert.deepEqual(await events(id), [])
    const competing = action === 'approve' ? 'reject' : 'approve'
    const second = await race(asUser(adminA, review(id, action)), asUser(adminB, review(id, competing)))
    assert.match(second?.message || '', /already been reviewed/)
    await assert.rejects(writeAs(adminA, review(id, action)), /already been reviewed/)
    const status = action === 'approve' ? 'approved' : 'rejected'
    assert.deepEqual(await events(id), [[`verification_${status}`, applicant, 'applicant']])
    assert.equal(await query(`SELECT status FROM public.verification_submissions WHERE id = '${id}'`), status)
    assert.equal(await query(`SELECT verified_kind FROM public.profiles WHERE id = '${applicant}'`),
      action === 'approve' ? 'identity' : '')
    const notice = await writeAs(applicant, `SELECT to_jsonb(n) FROM (SELECT id, entity_id, recipient_id, event_type,
      recipient_role, created_at, read_at FROM public.notifications WHERE entity_id = '${id}') n`)
    assert.ok(notice)
    assert.equal(notice.includes(sampleNote) || notice.includes('synthetic.pdf'), false)
  }
})

test('view history is bounded and private, refreshes repeats and survives across sessions', async () => {
  const ids = Array.from({ length: 14 }, (_, i) => uuid(100 + i))
  const record = (id) => `SELECT public.record_listing_view('${id}')`
  const viewed = (user) => writeAs(user, `SELECT listing_id FROM public.recently_viewed_listings
    ORDER BY viewed_at DESC, listing_id`)
  await query(`INSERT INTO public.listings (id, owner_id, title) VALUES
    ${ids.map((id) => `('${id}', '${owner}', 'View fixture')`).join(',')}`)
  await writeAs(other, record(ids[0]))
  for (const id of ids) await writeAs(renter, record(id))
  assert.deepEqual((await viewed(renter)).split('\n'), ids.slice(2).reverse())
  assert.equal(await viewed(other), ids[0])
  const hidden = uuid(114)
  await query(`INSERT INTO public.listings (id, owner_id, title, status, removed_by_admin)
    VALUES ('${hidden}', '${owner}', 'Removed fixture', 'removed', true)`)
  await assert.rejects(writeAs(other, `INSERT INTO public.recently_viewed_listings (listing_id)
    VALUES ('${hidden}')`), /row-level security/)
  assert.equal(await viewed(other), ids[0])
  await writeAs(renter, record(ids[2]))
  const repeated = (await viewed(renter)).split('\n')
  assert.equal(repeated.length, 12)
  assert.equal(repeated[0], ids[2])
  await assert.rejects(writeAs(other, `INSERT INTO public.recently_viewed_listings (user_id, listing_id)
    VALUES ('${renter}', '${ids[0]}')`), /permission denied/)
  await assert.rejects(writeAs(other, `UPDATE public.recently_viewed_listings SET viewed_at = now()`), /permission denied/)
  await assert.rejects(query(asUser(null, record(ids[0]), 'anon')), /permission denied/)
  await assert.rejects(query(asUser(null, 'SELECT count(*) FROM public.recently_viewed_listings', 'anon')), /permission denied/)
  await writeAs(other, 'DELETE FROM public.recently_viewed_listings')
  assert.equal(await viewed(other), '')
  assert.deepEqual((await viewed(renter)).split('\n'), repeated)
})

test('parallel views of different listings obey the private per-account history cap', async () => {
  const ids = [uuid(115), uuid(116)]
  await query(`INSERT INTO public.listings (id, owner_id, title)
    VALUES ${ids.map((id) => `('${id}', '${owner}', 'Fresh view')`).join(',')}`)
  const record = (id) => asUser(renter, `SELECT public.record_listing_view('${id}')`)
  assert.equal(await race(record(ids[0]), record(ids[1])), null)
  const results = await writeAs(renter,
    'SELECT listing_id FROM public.recently_viewed_listings ORDER BY viewed_at DESC, listing_id')
  assert.equal(results.split('\n').length, 12)
  assert.deepEqual(results.split('\n').slice(0, 2), ids.slice().reverse())
  await assert.rejects(writeAs(renter, 'SELECT slot FROM public.recently_viewed_listings'), /permission denied/)
})

test('batched first messages and delivery retries leave exactly one inquiry', async () => {
  const id = uuid(42)
  await fixtureChange(renter, thread(id))
  const lines = [uuid(77),uuid(78)].map((messageId) => `('${messageId}','${id}','${renter}',${literal(sampleMessage)})`)
  const batch = `INSERT INTO public.messages(id,conversation_id,sender_id,body) VALUES ${lines.join(',')} ON CONFLICT (id) DO NOTHING`
  await fixtureChange(renter, batch)
  await fixtureChange(renter, batch)
  assert.deepEqual(await events(id), [['inquiry_received', owner, 'owner'], ['message_received', owner, 'owner']])
})

test('simultaneous first messages persist one inquiry and one ordinary message', async () => {
  const id = uuid(41)
  await fixtureChange(renter, thread(id))
  const second = await race(asUser(renter, message(uuid(75), id, renter), 'postgres'),
    asUser(owner, message(uuid(76), id, owner), 'postgres'))
  assert.equal(second, null)
  assert.deepEqual(await events(id), [
    ['inquiry_received', owner, 'owner'], ['message_received', renter, 'renter'],
  ])
})

test('private trigger routines and sensitive event fields are inaccessible to ordinary clients', async () => {
  const functions = await query(`
    SELECT DISTINCT p.oid::regprocedure::text
    FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid IN ('public.bookings'::regclass, 'public.messages'::regclass,
      'public.simulated_payments'::regclass, 'public.verification_submissions'::regclass,
      'public.recently_viewed_listings'::regclass)
    AND NOT t.tgisinternal AND t.tgname <> 'verification_prepare' ORDER BY 1`)
  assert.ok(functions)
  for (const fn of functions.split('\n')) {
    assert.equal(await query(`SELECT has_function_privilege('anon', ${literal(fn)}, 'EXECUTE'),
      has_function_privilege('authenticated', ${literal(fn)}, 'EXECUTE')`), 'f|f', fn)
  }
  for (const table of ['saved_listings', 'recently_viewed_listings', 'notifications']) {
    assert.equal(await query(`SELECT relrowsecurity FROM pg_class WHERE oid='public.${table}'::regclass`), 't')
  }
  const fields = await query(`SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications'`)
  for (const sensitive of ['body','message','admin_note','document_path','document_url','href','url']) {
    assert.equal(fields.split('\n').includes(sensitive), false, sensitive)
  }
})

test('catalog diagnosis and operational rollback preserve data and stop only marketplace delivery and client writes', async () => {
  const diagnose = async () => JSON.parse(await query(read('supabase/diagnostics/marketplace_essentials_contract.sql')))
  const reviewDigest = (metadata) => metadata.functions.find(({ signature }) => signature.startsWith('review_verification(')).definition_sha256
  const eventTriggers = (metadata) => metadata.triggers.filter(({ tgname }) => tgname.startsWith('erental_'))
  const beforePause = await diagnose()
  assert.deepEqual(eventTriggers(beforePause).map(({ tgenabled }) => tgenabled), ['O', 'O', 'O', 'O'])
  const privileged = beforePause.functions.filter(({ signature }) => signature.startsWith('erental_events.'))
  assert.ok(privileged.length >= 5)
  for (const fn of privileged) {
    assert.equal(fn.public_execute, false, fn.signature)
    assert.equal(fn.effective_execute.anon || fn.effective_execute.authenticated, false, fn.signature)
  }
  const id = uuid(90)
  await writeAs(owner, save(owner, listing))
  await writeAs(owner, `SELECT public.record_listing_view('${listing}')`)
  await fixtureChange(renter, booking(id))
  const snapshot = () => query(`SELECT jsonb_build_array(
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY user_id, listing_id) FROM public.saved_listings s),
    (SELECT jsonb_agg(to_jsonb(v) ORDER BY user_id, listing_id) FROM public.recently_viewed_listings v),
    (SELECT jsonb_agg(to_jsonb(n) ORDER BY id) FROM public.notifications n))`)
  const previousRows = await snapshot()
  await query(read('supabase/rollbacks/20261125190326_marketplace_essentials.sql'))
  const paused = await diagnose()
  assert.deepEqual(eventTriggers(paused).map(({ tgenabled }) => tgenabled), ['D', 'D', 'D', 'D'])
  assert.equal(reviewDigest(paused), reviewDigest(beforePause))
  assert.deepEqual(paused.tables, beforePause.tables)
  assert.equal(await snapshot(), previousRows)
  assert.equal(await writeAs(owner, 'SELECT count(*) FROM public.saved_listings'), '1')
  assert.equal(await writeAs(owner, `SELECT count(*) FROM public.notifications WHERE entity_id = '${id}'`), '1')
  for (const sql of [save(owner, listing), 'DELETE FROM public.saved_listings', 'DELETE FROM public.recently_viewed_listings',
    `SELECT public.record_listing_view('${listing}')`, markRead(uuid(900)), 'SELECT public.mark_all_notifications_read()']) {
    await assert.rejects(writeAs(owner, sql), /permission denied/)
  }
  await fixtureChange(owner, bookingStatus(id, 'accepted'))
  assert.equal(await query(`SELECT status FROM public.bookings WHERE id = '${id}'`), 'accepted')
  assert.deepEqual(await events(id), [['booking_requested', owner, 'owner']])
})
