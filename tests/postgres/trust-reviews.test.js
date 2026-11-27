import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { asUser, disposableDatabase, literal, read, uuid } from './helpers/disposable-database.js'
import {
  fixtureSchema, installOriginalReview, migration as hardenVerification,
} from './helpers/verification-schema.js'

const essentials = read('supabase/migrations/20261125190326_marketplace_essentials.sql')
const eventsMigration = read('supabase/migrations/20261127090000_communication_trust_event_types.sql')
const trustReviews = read('supabase/migrations/20261127095520_communication_trust_reviews.sql')
const { query, race, start, stop } = disposableDatabase('erental_trust_reviews')
const owner = uuid(1)
const renter = uuid(2)
const other = uuid(3)
const adminA = uuid(4)
const adminB = uuid(5)
const listing = uuid(21)
const secondListing = uuid(22)
const privateNote = 'Synthetic policy case context'
const originalComment = 'Synthetic review comment'
const reviewId = (booking) => `(SELECT id FROM public.reviews WHERE booking_id = '${booking}')`
const writeAs = (actor, sql, role) => query(asUser(actor, sql, role))
const publicRead = (sql) => writeAs(null, sql, 'anon')
const summary = async ({ listingId, ownerId }) => JSON.parse(await publicRead(
  `SELECT public.public_review_summary(${literal(listingId ?? null)}, ${literal(ownerId ?? null)})`,
))

function booking(id, status = 'completed', rental = listing, tenant = renter) {
  return `INSERT INTO public.bookings (id, owner_id, renter_id, listing_id, status)
    VALUES ('${id}', '${owner}', '${tenant}', '${rental}', '${status}')`
}
function review(booking, rating = 5, reviewer = renter, comment = originalComment) {
  return `INSERT INTO public.reviews (booking_id, reviewer_id, rating, comment)
    VALUES ('${booking}', '${reviewer}', ${rating}, ${literal(comment)})`
}
function respond(id, text) {
  return `SELECT public.save_review_response(${id}, ${literal(text)})`
}
function dispute(id, reason = 'abuse', details = privateNote) {
  return `SELECT public.submit_review_dispute(${id}, ${literal(reason)}, ${literal(details)})`
}
function resolve(id, action, note = 'Reviewed the policy issue') {
  return `SELECT public.resolve_review_dispute('${id}', ${literal(action)}, ${literal(note)})`
}
async function deliveries(key) {
  return JSON.parse(await query(`SELECT coalesce(jsonb_agg(jsonb_build_array(
    event_type, recipient_id, entity_id) ORDER BY event_type), '[]')
    FROM public.notifications WHERE event_key LIKE '%:${key}'`))
}

before(async () => {
  await start()
  await query(fixtureSchema())
  await query(installOriginalReview)
  await query(hardenVerification)
  await query(read('tests/postgres/helpers/marketplace-sources.sql'))
  await query(read('tests/postgres/helpers/trust-review-source.sql'))
  const users = [owner, renter, other, adminA, adminB]
  await query(`
    INSERT INTO auth.users(id) VALUES ${users.map(id => `('${id}')`).join(',')};
    INSERT INTO public.profiles(id, display_name) SELECT id, 'Synthetic account' FROM auth.users;
    INSERT INTO public.admin_users(user_id) VALUES ('${adminA}'), ('${adminB}');
    INSERT INTO public.listings(id, owner_id, title) VALUES
      ('${listing}', '${owner}', 'Synthetic rental'), ('${secondListing}', '${owner}', 'Other rental');
    ${booking(uuid(91))};
    INSERT INTO public.reviews(booking_id, listing_id, reviewer_id, owner_id, rating, comment)
      VALUES ('${uuid(91)}', '${listing}', '${renter}', '${owner}', 5, 'Historical synthetic review');
  `)
  await query(essentials)
  await query(eventsMigration)
  await query(`UPDATE public.reviews SET owner_id = '${other}' WHERE booking_id = '${uuid(91)}'`)
  await assert.rejects(query(trustReviews), /Historical review attribution or eligibility differs/)
  assert.equal(await query("SELECT to_regclass('public.review_disputes') IS NULL"), 't')
  await query(`UPDATE public.reviews SET owner_id = '${owner}' WHERE booking_id = '${uuid(91)}'`)
  await query(trustReviews)
})
after(stop)

test('original reviews stay published and newly eligible rentals snapshot the completed booking owner', async () => {
  assert.deepEqual(await summary({ listingId: listing }), { average: 5, count: 1 })
  const rental = uuid(101)
  await query(booking(rental))
  // A future ownership transfer must not move an older completed rental.
  await query(`UPDATE public.listings SET owner_id = '${other}' WHERE id = '${listing}'`)
  try {
    await writeAs(renter, review(rental))
    assert.equal(await query(`SELECT owner_id FROM public.reviews WHERE booking_id = '${rental}'`), owner)
    const id = await query(`SELECT ${reviewId(rental)}`)
    assert.deepEqual(await deliveries(id), [['review_published', owner, listing]])
  } finally {
    await query(`UPDATE public.listings SET owner_id = '${owner}' WHERE id = '${listing}'`)
  }
})

test('review writes are limited to the renter and completed booking with a valid rating and one review', async () => {
  const incomplete = uuid(102)
  const completed = uuid(103)
  await query(`${booking(incomplete, 'accepted')}; ${booking(completed)}`)
  await assert.rejects(writeAs(renter, review(incomplete)), /Only the renter can review a completed rental/)
  await assert.rejects(writeAs(other, review(completed)), /Only the renter can review a completed rental/)
  await assert.rejects(writeAs(other, review(completed, 5, other)), /Only the renter can review a completed rental/)
  await assert.rejects(writeAs(renter, review(completed, 6)), /Provide a rating/)
  await assert.rejects(writeAs(renter, review(completed, 5, renter, 'a'.repeat(1001))), /Provide a rating/)
  await assert.rejects(publicRead(review(completed)), /permission denied/)
  await writeAs(renter, review(completed))
  await assert.rejects(writeAs(renter, review(completed)), /duplicate key/)
  await assert.rejects(writeAs(renter, `UPDATE public.reviews SET rating = 1 WHERE booking_id = '${completed}'`), /permission denied/)
  await assert.rejects(writeAs(owner, `UPDATE public.reviews SET is_published = false WHERE booking_id = '${completed}'`), /permission denied/)
  await assert.rejects(writeAs(owner, `DELETE FROM public.reviews WHERE booking_id = '${completed}'`), /permission denied/)
})

test('public owner and listing averages count individual published reviews and handle empty listings', async () => {
  const higher = uuid(104)
  const lower = uuid(105)
  await query(`${booking(higher)}; ${booking(lower, 'completed', secondListing)}`)
  assert.deepEqual(await summary({ listingId: secondListing }), { average: null, count: 0 })
  await writeAs(renter, review(higher, 5))
  await writeAs(renter, review(lower, 1))
  assert.deepEqual(await summary({ listingId: listing }), { average: 5, count: 4 })
  assert.deepEqual(await summary({ listingId: secondListing }), { average: 1, count: 1 })
  assert.deepEqual(await summary({ ownerId: owner }), { average: 4.2, count: 5 })
  assert.deepEqual(await summary({ ownerId: other }), { average: null, count: 0 })
})

test('the actual owner can publish and edit a response without touching rating or duplicating notices', async () => {
  const id = await query(`SELECT ${reviewId(uuid(103))}`)
  await assert.rejects(writeAs(other, respond(literal(id), 'Unrelated response')), /Published review unavailable/)
  await assert.rejects(writeAs(owner, respond(literal(id), '\t\n')), /Provide a response/)
  await assert.rejects(writeAs(owner, respond(literal(id), 'a'.repeat(1001))), /Provide a response/)
  await assert.rejects(publicRead(respond(literal(id), 'Anonymous response')), /permission denied/)
  await writeAs(owner, respond(literal(id), '  Thanks for the feedback.  '))
  const getText = `SELECT response_text FROM public.review_responses WHERE review_id = '${id}'`
  assert.equal(await publicRead(getText), 'Thanks for the feedback.')
  await writeAs(owner, respond(literal(id), 'Updated owner reply.'))
  assert.equal(await publicRead(getText), 'Updated owner reply.')
  const remove = `SELECT public.remove_review_response('${id}')`
  await assert.rejects(writeAs(other, remove), /Review unavailable/)
  await writeAs(owner, remove)
  assert.equal(await publicRead(getText), '')
  await writeAs(owner, respond(literal(id), 'Reposted owner reply.'))
  assert.equal(await publicRead(getText), 'Reposted owner reply.')
  assert.equal(await query(`SELECT rating FROM public.reviews WHERE id = '${id}'`), '5')
  assert.deepEqual(await deliveries(id), [
    ['review_published', owner, listing],
    ['review_response_published', renter, listing],
  ])
})

test('a pending dispute is private, one at a time, and has no effect on published reviews', async () => {
  const id = await query(`SELECT ${reviewId(uuid(103))}`)
  const original = await summary({ ownerId: owner })
  await assert.rejects(writeAs(other, dispute(literal(id))), /Published review unavailable/)
  await assert.rejects(writeAs(owner, dispute(literal(id), 'negative_rating')), /Choose a valid reason/)
  await assert.rejects(writeAs(owner, dispute(literal(id), 'other', '  \t  ')), /Choose a valid reason/)
  const caseId = await writeAs(owner, dispute(literal(id)))
  await assert.rejects(writeAs(owner, dispute(literal(id))), /duplicate key/)
  assert.deepEqual(await summary({ ownerId: owner }), original)
  const details = `SELECT details FROM public.review_disputes WHERE id = '${caseId}'`
  assert.equal(await writeAs(owner, details), privateNote)
  assert.equal(await writeAs(renter, details), '')
  await assert.rejects(publicRead(details), /permission denied/)
  await assert.rejects(writeAs(owner, `UPDATE public.review_disputes SET status='upheld' WHERE id='${caseId}'`), /permission denied/)
  const evidence = `SELECT public.get_review_dispute_evidence('${caseId}')`
  await assert.rejects(writeAs(owner, evidence), /Admins only/)
  const authorized = JSON.parse(await writeAs(adminA, evidence))
  assert.deepEqual(Object.keys(authorized).sort(), [
    'booking_completed', 'comment', 'created_at', 'is_published', 'listing_title', 'rating',
  ])
  assert.equal(authorized.comment, originalComment)
  assert.equal(authorized.booking_completed, true)
  await assert.rejects(writeAs(owner, resolve(caseId, 'uphold')), /Admins only/)
  await assert.rejects(writeAs(adminA, resolve(caseId, 'dismiss', ' \t ')), /Choose a decision/)
  await writeAs(adminA, resolve(caseId, 'dismiss'))
  assert.equal(await query(`SELECT status FROM public.review_disputes WHERE id = '${caseId}'`), 'dismissed')
  assert.deepEqual(await summary({ ownerId: owner }), original)
  assert.deepEqual(await deliveries(caseId), [['review_dispute_resolved', owner, caseId]])
})

test('competing dispute resolutions preserve the first outcome, original text, and updated public aggregates', async () => {
  const id = await query(`SELECT ${reviewId(uuid(103))}`)
  const caseId = await writeAs(owner, dispute(literal(id), 'personal_information'))
  const loser = await race(
    asUser(adminA, resolve(caseId, 'uphold', 'Policy issue confirmed')),
    asUser(adminB, resolve(caseId, 'dismiss', 'Unrelated competing decision')),
  )
  assert.match(loser?.message ?? '', /already has a decision/)
  const final = JSON.parse(await query(`SELECT jsonb_build_array(status, reviewed_by, admin_note)
    FROM public.review_disputes WHERE id = '${caseId}'`))
  assert.deepEqual(final, ['upheld', adminA, 'Policy issue confirmed'])
  assert.equal(await publicRead(`SELECT comment FROM public.reviews WHERE id = '${id}'`), '')
  assert.equal(await writeAs(other, `SELECT comment FROM public.reviews WHERE id = '${id}'`), '')
  assert.equal(await writeAs(renter, `SELECT comment FROM public.reviews WHERE id = '${id}'`), originalComment)
  assert.equal(await publicRead(`SELECT response_text FROM public.review_responses WHERE review_id = '${id}'`), '')
  assert.equal(await query(`SELECT response_text FROM public.review_responses WHERE review_id = '${id}'`), 'Reposted owner reply.')
  assert.deepEqual(await summary({ ownerId: owner }), { average: 4, count: 4 })
  assert.deepEqual(await summary({ listingId: listing }), { average: 5, count: 3 })
  assert.deepEqual(await deliveries(caseId), [
    ['review_dispute_resolved', owner, caseId],
    ['review_visibility_updated', renter, listing],
  ])
  assert.equal(await writeAs(other, `SELECT count(*) FROM public.notifications WHERE entity_id IN ('${listing}', '${caseId}')`), '0')
})

test('a rolled-back resolution preserves pending status, publication, and the lack of notices', async () => {
  const id = await query(`SELECT ${reviewId(uuid(105))}`)
  const caseId = await writeAs(owner, dispute(literal(id)))
  await query(`BEGIN; ${asUser(adminA, resolve(caseId, 'uphold'))} ROLLBACK;`)
  assert.equal(await query(`SELECT status FROM public.review_disputes WHERE id = '${caseId}'`), 'pending')
  assert.equal(await publicRead(`SELECT is_published FROM public.reviews WHERE id = '${id}'`), 't')
  assert.deepEqual(await deliveries(caseId), [])
})
