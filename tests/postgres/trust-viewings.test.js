import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { asUser, disposableDatabase, literal, read, uuid } from './helpers/disposable-database.js'
import { fixtureSchema, installOriginalReview, migration } from './helpers/verification-schema.js'

const { query, start, stop, race } = disposableDatabase('erental_viewings')
const renter = uuid(1)
const owner = uuid(2)
const other = uuid(3)
const listing = uuid(10)
const extraListing = uuid(11)
const inactiveListing = uuid(12)
const moderatedListing = uuid(13)
const apply = name => query(read('supabase/migrations/' + name + '.sql'))
const sqlTime = day => "date_trunc('day', now()) + interval '" + day + " days 2 hours'"
const request = (id, target, time, note = null) =>
  `SELECT public.request_viewing('${id}', '${target}', ${time}, ${literal(note)})`
const transition = (id, revision, action, time = 'NULL', note = null) =>
  `SELECT public.update_viewing('${id}', ${revision}, ${literal(action)}, ${time}, ${literal(note)})`
const ownerEvent = id => `SELECT event_type FROM public.notifications WHERE entity_id = '${id}' ORDER BY created_at, id`
const workflow = id => `SELECT status, revision FROM public.viewing_appointments WHERE id = '${id}'`

before(async () => {
  await start()
  await query(fixtureSchema())
  await query(installOriginalReview)
  await query(migration)
  for (const name of ['marketplace-sources', 'trust-communication-source'])
    await query(read('tests/postgres/helpers/' + name + '.sql'))
  for (const name of ['20261125190326_marketplace_essentials', '20261127090000_communication_trust_event_types',
    '20261127090001_communication_safety', '20261127095438_trust_viewing_appointments']) await apply(name)
  await query(`
    INSERT INTO auth.users(id) VALUES ('${renter}'), ('${owner}'), ('${other}');
    INSERT INTO public.profiles (id, display_name) SELECT id, 'Synthetic account' FROM auth.users;
    INSERT INTO public.listings (id, owner_id, title, status, removed_by_admin) VALUES
      ('${listing}', '${owner}', 'Camera fixture', 'available', false),
      ('${extraListing}', '${owner}', 'Lighting fixture', 'available', false),
      ('${inactiveListing}', '${owner}', 'Unavailable fixture', 'unavailable', false),
      ('${moderatedListing}', '${owner}', 'Moderated fixture', 'available', true)
  `)
})
after(stop)

test('a viewing request derives owner, deduplicates retries, and keeps data participant-private', async () => {
  const id = uuid(20)
  const initial = request(id, listing, sqlTime(2), 'Synthetic private note')
  assert.equal(await query(asUser(renter, initial)), id)
  assert.equal(await query(asUser(renter, initial)), id)
  assert.equal(await query(asUser(renter, workflow(id))), 'pending|1')
  assert.equal(await query(asUser(owner, workflow(id))), 'pending|1')
  assert.equal(await query(asUser(other, workflow(id))), '')
  const history = `SELECT count(*) FROM public.viewing_appointment_events WHERE appointment_id = '${id}'`
  assert.equal(await query(asUser(owner, history)), '1')
  assert.equal(await query(asUser(other, history)), '0')
  assert.equal(await query(asUser(owner, ownerEvent(id))), 'viewing_requested')
  assert.equal(await query(asUser(renter, ownerEvent(id))), '')
  await assert.rejects(query(asUser(renter, request(uuid(21), listing, sqlTime(3)))), /duplicate key/)
  await assert.rejects(query(asUser(null, workflow(id), 'anon')), /permission denied/)
  await assert.rejects(query(asUser(null, initial, 'anon')), /permission denied/)
  await assert.rejects(query(asUser(other, transition(id, 1, 'confirm'))), /Viewing unavailable/)
  await assert.rejects(query(asUser(owner, "UPDATE public.viewing_appointments SET meeting_details = 'untrusted'")), /permission denied/)
  await assert.rejects(query(asUser(renter, transition(id, 1, 'confirm'))), /action is unavailable/)
  await query(asUser(owner, transition(id, 1, 'confirm', 'NULL', 'Synthetic meeting location')))
  assert.equal(await query(asUser(renter, ownerEvent(id))), 'viewing_confirmed')
  assert.equal(await query(asUser(renter, `SELECT meeting_details FROM public.viewing_appointments WHERE id = '${id}'`)), 'Synthetic meeting location')
  assert.equal(await query(asUser(other, `SELECT meeting_details FROM public.viewing_appointments WHERE id = '${id}'`)), '')
  await query(asUser(renter, transition(id, 2, 'cancel')))
  assert.equal(await query(asUser(owner, workflow(id))), 'cancelled|3')
})

test('invalid schedules, unavailable rentals and own listing requests leave no new appointments or events', async () => {
  const id = uuid(22)
  for (const value of ['NULL', "'infinity'::timestamptz", 'now() - interval \'1 hour\'']) {
    await assert.rejects(query(asUser(renter, request(id, listing, value))), /future viewing time/)
  }
  await assert.rejects(query(asUser(renter, request(id, listing, sqlTime(2), 'x'.repeat(501)))), /up to 500 characters/)
  for (const target of [inactiveListing, moderatedListing]) {
    await assert.rejects(query(asUser(renter, request(id, target, sqlTime(2)))), /unavailable for viewings/)
  }
  await assert.rejects(query(asUser(owner, request(id, listing, sqlTime(2)))), /own rental/)
  assert.equal(await query(workflow(id)), '')
  assert.equal(await query(asUser(owner, ownerEvent(id))), '')
})

test('confirmed time survives proposal rejection and each later proposal produces its own notification', async () => {
  const id = uuid(23)
  await query(asUser(renter, request(id, listing, sqlTime(3))))
  await query(asUser(owner, transition(id, 1, 'confirm')))
  await query(asUser(owner, transition(id, 2, 'propose', sqlTime(4), 'First alternative')))
  await assert.rejects(query(asUser(owner, transition(id, 3, 'accept_proposal'))), /action is unavailable/)
  await query(asUser(renter, transition(id, 3, 'decline_proposal')))
  assert.equal(await query(asUser(renter, `SELECT confirmed_start_at = ${sqlTime(3)}
    FROM public.viewing_appointments WHERE id = '${id}' AND status = 'confirmed'`)), 't')
  await query(asUser(owner, transition(id, 4, 'propose', sqlTime(5), 'Second alternative')))
  await query(asUser(renter, transition(id, 5, 'accept_proposal')))
  assert.equal(await query(asUser(owner, `SELECT confirmed_start_at = ${sqlTime(5)} AND meeting_details = 'Second alternative'
    FROM public.viewing_appointments WHERE id = '${id}' AND status = 'confirmed'`)), 't')
  await assert.rejects(query(asUser(renter, transition(id, 5, 'accept_proposal'))), /viewing has changed/)
  assert.equal(await query(asUser(owner, `SELECT count(*) FROM public.viewing_appointment_events
    WHERE appointment_id = '${id}' AND event_type = 'viewing_confirmed' AND scheduled_at = ${sqlTime(3)}`)), '1')
  assert.equal(await query(asUser(renter, `SELECT count(*) FROM public.notifications
    WHERE entity_id = '${id}' AND event_type = 'viewing_reschedule_proposed'`)), '2')
  await query(asUser(renter, transition(id, 6, 'cancel')))
})

test('decline requires reason, elapsed confirmed viewings complete, and neither workflow creates a rental or payment', async () => {
  const id = uuid(24)
  await query(asUser(renter, request(id, listing, sqlTime(2))))
  await assert.rejects(query(asUser(owner, transition(id, 1, 'decline'))), /reason for declining/)
  await assert.rejects(query(asUser(owner, transition(id, 1, 'decline', 'NULL', ' \t\n'))), /reason for declining/)
  await query(asUser(owner, transition(id, 1, 'decline', 'NULL', 'Synthetic reason')))
  assert.equal(await query(asUser(renter, workflow(id))), 'declined|2')
  assert.equal(await query(asUser(renter, ownerEvent(id))), 'viewing_declined')
  await assert.rejects(query(asUser(renter, transition(id, 2, 'cancel'))), /action is unavailable/)

  const elapsed = uuid(25)
  await query(asUser(renter, request(elapsed, extraListing, sqlTime(2))))
  await query(asUser(owner, transition(elapsed, 1, 'confirm')))
  await assert.rejects(query(asUser(owner, transition(elapsed, 2, 'complete'))), /action is unavailable/)
  await query(`UPDATE public.viewing_appointments SET confirmed_start_at = now() - interval '90 minutes',
    confirmed_end_at = now() - interval '60 minutes' WHERE id = '${elapsed}'`)
  await query(asUser(owner, transition(elapsed, 2, 'complete')))
  assert.equal(await query(asUser(renter, workflow(elapsed))), 'completed|3')
  assert.equal(await query(asUser(renter, `SELECT count(*) FROM public.notifications
    WHERE entity_id = '${elapsed}' AND event_type = 'viewing_completed'`)), '1')
  assert.equal(await query('SELECT (SELECT count(*) FROM public.bookings), (SELECT count(*) FROM public.simulated_payments)'), '0|0')
})

test('concurrent confirmations serialize across separate listings of the same owner', async () => {
  const first = uuid(26)
  const second = uuid(27)
  await query(asUser(renter, request(first, listing, sqlTime(4))))
  await query(asUser(other, request(second, extraListing, sqlTime(4))))
  const failure = await race(asUser(owner, transition(first, 1, 'confirm')), asUser(owner, transition(second, 1, 'confirm')))
  assert.match(failure?.stderr || '', /viewing_owner_schedule/)
  assert.equal(await query(asUser(owner, workflow(first))), 'confirmed|2')
  assert.equal(await query(asUser(owner, workflow(second))), 'pending|1')
  assert.equal(await query(asUser(other, ownerEvent(second))), '')
  await query(asUser(renter, transition(first, 2, 'cancel')))
  await query(asUser(other, transition(second, 1, 'cancel')))
})

test('a concurrent permitted block prevents new viewing creation and preserves an existing cancellation', async () => {
  const open = uuid(28)
  const blocked = uuid(29)
  await query(asUser(renter, request(open, listing, sqlTime(6))))
  const failure = await race(asUser(owner, `SELECT public.set_user_block('${renter}', true)`),
    asUser(renter, request(blocked, extraListing, sqlTime(6))))
  assert.ok(failure)
  assert.equal(await query(workflow(blocked)), '')
  assert.equal(await query(asUser(owner, ownerEvent(blocked))), '')
  await assert.rejects(query(asUser(owner, transition(open, 1, 'confirm'))))
  assert.equal(await query(asUser(renter, workflow(open))), 'pending|1')
  await query(asUser(renter, transition(open, 1, 'cancel')))
  assert.equal(await query(asUser(owner, workflow(open))), 'cancelled|2')
  await query(asUser(owner, `SELECT public.set_user_block('${renter}', false)`))
})
