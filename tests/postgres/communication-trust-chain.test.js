import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { asUser, disposableDatabase, read, uuid } from './helpers/disposable-database.js'
import { fixtureSchema, installOriginalReview, migration } from './helpers/verification-schema.js'

const { query, start, stop } = disposableDatabase('erental_trust_chain')
const renter = uuid(1)
const owner = uuid(2)
const other = uuid(3)
const thread = uuid(4)
const listing = uuid(5)
const appointment = uuid(6)
const message = uuid(7)
const apply = (name) => query(read('supabase/migrations/' + name + '.sql'))
const featureMigrations = [
  '20261127090000_communication_trust_event_types',
  '20261127090001_communication_safety',
  '20261127095438_trust_viewing_appointments',
  '20261127095520_communication_trust_reviews',
]

before(async () => {
  await start()
  await query(fixtureSchema())
  await query(installOriginalReview)
  await query(migration)
  for (const fixture of ['marketplace-sources', 'trust-communication-source', 'trust-review-source'])
    await query(read('tests/postgres/helpers/' + fixture + '.sql'))
  await apply('20261125190326_marketplace_essentials')
  for (const version of featureMigrations) await apply(version)
  await query(`
    INSERT INTO auth.users(id) VALUES ('${renter}'), ('${owner}'), ('${other}');
    INSERT INTO public.profiles (id, display_name) SELECT id, 'Synthetic account' FROM auth.users;
    INSERT INTO public.listings (id, owner_id, title) VALUES ('${listing}', '${owner}', 'Synthetic rental');
  `)
})
after(stop)

test('the complete migration chain preserves the reviewed RPC and recipient-only notification delivery', async () => {
  const catalog = JSON.parse(await query(read('supabase/diagnostics/communication_trust_contract.sql')))
  assert.equal(catalog.realtime.insert, true)
  assert.equal(catalog.realtime.update, true)
  assert.equal(catalog.realtime.delete || catalog.realtime.truncate, false)
  assert.ok(catalog.realtime.tables.some((table) => table.schemaname === 'public' && table.tablename === 'messages'))
  const review = catalog.functions.find((routine) => routine.signature === 'review_verification(uuid,text,text)')
  assert.equal(review.definition_sha256, 'cbd3cea69935bea9aad11a5873b839c88329f71482e9aa82fa41d395e1b76fa7')
  assert.equal(review.effective_execute.anon || review.public_execute, false)

  await query(asUser(renter, `INSERT INTO public.conversations(id, listing_id, renter_id, owner_id)
    VALUES ('${thread}', '${listing}', '${renter}', '${owner}')`))
  await query(asUser(renter, `SELECT public.send_conversation_message('${thread}', '${message}', 'Synthetic question')`))
  await query(asUser(renter, `SELECT public.send_conversation_message('${thread}', '${message}', 'Synthetic question')`))
  await query(asUser(renter, `SELECT public.request_viewing(
    '${appointment}', '${listing}', date_trunc('day', now()) + interval '2 days 5 hours', NULL
  )`))
  const readEvents = 'SELECT event_type FROM public.notifications ORDER BY event_type'
  assert.equal(await query(asUser(owner, readEvents)), 'inquiry_received\nviewing_requested')
  assert.equal(await query(asUser(renter, readEvents)), '')
  assert.equal(await query(asUser(other, readEvents)), '')
  await query(asUser(owner, 'SELECT public.mark_all_notifications_read()'))
  assert.equal(await query(asUser(owner, 'SELECT count(*) FROM public.notifications WHERE read_at IS NULL')), '0')
})
