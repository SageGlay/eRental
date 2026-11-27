import { expect } from '@playwright/test'
import { apiError, calls, json, listing, LISTING_ID, mockMarketplace, test, USER_ID } from './fixtures.js'

const reviewId = '93000000-0000-4000-8000-000000000001'
const caseId = '93000000-0000-4000-8000-000000000002'
const date = '2026-11-20T05:00:00Z'
const review = {
  id: reviewId, owner_id: USER_ID, rating: 4, comment: 'Clean equipment and a smooth handover.',
  created_at: date, reviewer: { display_name: 'Local renter' }, is_published: true,
}
const rental = {
  ...listing, owner_id: USER_ID, profiles: { ...listing.profiles, display_name: 'Local camera hire' },
}
const owner = {
  id: USER_ID, display_name: 'Local camera hire', account_type: 'business',
  business_name: 'Local Camera Hire', verified_kind: 'business', verified_at: date,
  email: 'private@example.invalid',
}

async function mockReviews(page, { signedIn = true, admin = false, seedCase = false } = {}) {
  const state = {
    reply: null, hidden: false, failDecision: false,
    dispute: seedCase
      ? { id: caseId, review_id: reviewId, reason: 'unrelated', details: 'Please check whether the comment is about this rental.', status: 'pending', created_at: date }
      : null,
  }
  const model = await mockMarketplace(page, async (route, { url, method, body }) => {
    const path = url.pathname
    if (path === '/rest/v1/rpc/is_admin') await json(route, admin)
    else if (path === '/rest/v1/rpc/public_review_summary') {
      const count = state.hidden ? 0 : body.p_owner_id ? 80 : 67
      await json(route, { average: count ? (body.p_owner_id ? 4.15 : 4.57) : null, count })
    } else if (path === '/rest/v1/reviews' && method === 'GET') {
      expect(url.searchParams.get('is_published')).toBe('eq.true')
      await json(route, state.hidden ? [] : [{ ...review, review_responses: state.reply && { response_text: state.reply } }])
    } else if (path === '/rest/v1/listings' && method === 'GET') {
      await json(route, [rental])
    } else if (path === '/rest/v1/profiles' && url.searchParams.get('select')?.includes('verified_kind,verified_at')) {
      await json(route, [owner])
    } else if (path === '/rest/v1/rpc/save_review_response') {
      state.reply = body.p_response
      await json(route, null)
    } else if (path === '/rest/v1/rpc/remove_review_response') {
      state.reply = null
      await json(route, null)
    } else if (path === '/rest/v1/rpc/submit_review_dispute') {
      state.dispute = { id: caseId, review_id: reviewId, reason: body.p_reason, details: body.p_details, status: 'pending', created_at: date }
      await json(route, caseId)
    } else if (path === '/rest/v1/review_disputes') {
      const status = url.searchParams.get('status')
      await json(route, state.dispute && (!status || status === 'eq.' + state.dispute.status) ? [state.dispute] : [])
    } else if (path === '/rest/v1/rpc/get_review_dispute_evidence') {
      await json(route, {
        rating: review.rating, comment: review.comment, created_at: date,
        listing_title: rental.title, booking_completed: true, is_published: !state.hidden,
      })
    } else if (path === '/rest/v1/rpc/resolve_review_dispute') {
      state.dispute.status = body.p_action === 'uphold' ? 'upheld' : 'dismissed'
      state.dispute.admin_note = body.p_note
      state.dispute.reviewed_at = date
      state.hidden = body.p_action === 'uphold'
      if (state.failDecision) await apiError(route, 'This dispute is already resolved.', 400, '55000')
      else await json(route, null)
    } else return false
    return true
  }, { signedIn })
  return { state, model }
}

test('public listing and owner ratings use complete aggregates and authorized public data', async ({ page }) => {
  const { model } = await mockReviews(page, { signedIn: false })
  await page.goto('/listings/' + LISTING_ID)
  const reviewSection = page.getByRole('region', { name: 'Listing reviews' })
  await expect(reviewSection.getByRole('img', { name: '4.6 out of 5 stars' })).toBeVisible()
  await expect(reviewSection.getByText('67 reviews')).toBeVisible()
  await expect(reviewSection.getByText(review.comment)).toBeVisible()
  await expect(reviewSection.getByRole('button', { name: 'Dispute review' })).toHaveCount(0)
  await page.getByRole('link', { name: 'View owner profile' }).click()
  await expect(page).toHaveURL(new RegExp('/owners/' + USER_ID))
  await expect(page.getByRole('heading', { name: 'Local Camera Hire' })).toBeVisible()
  await expect(page.getByText('Business verified').first()).toBeVisible()
  await expect(page.getByText('80 reviews')).toBeVisible()
  await expect(page.getByRole('link', { name: new RegExp(rental.title) })).toBeVisible()
  await expect(page.getByText(owner.email)).toHaveCount(0)
  expect(calls(model, '/rest/v1/bookings', 'GET')).toHaveLength(0)
  expect(calls(model, '/rest/v1/review_disputes', 'GET')).toHaveLength(0)
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 800 })
    for (const colorScheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
      await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    }
  }
})

test('the rental owner can publish, edit and remove a response without editing the renter review', async ({ page }) => {
  const { model } = await mockReviews(page)
  await page.goto('/listings/' + LISTING_ID)
  const reviewSection = page.getByRole('region', { name: 'Listing reviews' })
  await reviewSection.getByRole('button', { name: 'Write a response' }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Publish response' }).click()
  await expect(dialog.getByLabel('Public response')).toBeFocused()
  await dialog.getByLabel('Public response').fill('Thank you for returning the camera on time.')
  await dialog.getByRole('button', { name: 'Publish response' }).click()
  await expect(reviewSection.getByText('Thank you for returning the camera on time.')).toBeVisible()
  await expect(reviewSection.getByRole('heading', { name: 'Reviews' })).toBeFocused()
  await reviewSection.getByRole('button', { name: 'Edit response' }).click()
  dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('Public response')).toHaveValue('Thank you for returning the camera on time.')
  await dialog.getByLabel('Public response').fill('Thanks for renting from us.')
  await dialog.getByRole('button', { name: 'Publish response' }).click()
  await expect(reviewSection.getByText('Thanks for renting from us.')).toBeVisible()
  await reviewSection.getByRole('button', { name: 'Remove response' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Remove response' }).click()
  await expect(reviewSection.getByRole('button', { name: 'Write a response' })).toBeVisible()
  await expect(reviewSection.getByText(review.comment)).toBeVisible()
  expect(calls(model, '/rest/v1/rpc/save_review_response', 'POST').map(call => call.body)).toEqual([
    { p_review_id: reviewId, p_response: 'Thank you for returning the camera on time.' },
    { p_review_id: reviewId, p_response: 'Thanks for renting from us.' },
  ])
  expect(calls(model, '/rest/v1/reviews', 'PATCH')).toHaveLength(0)
})

test('owners submit a reason and privately track a dispute without changing the published review', async ({ page }) => {
  const { model } = await mockReviews(page)
  await page.goto('/listings/' + LISTING_ID)
  await page.getByRole('button', { name: 'Dispute review' }).click()
  const dialog = page.getByRole('dialog', { name: 'Dispute review' })
  await dialog.getByRole('button', { name: 'Submit dispute' }).click()
  await expect(dialog.getByLabel('Reason')).toBeFocused()
  await dialog.getByLabel('Reason').selectOption('unrelated')
  await dialog.getByRole('button', { name: 'Submit dispute' }).click()
  await expect(dialog.getByLabel('Supporting details')).toBeFocused()
  const details = 'The comment describes another rental listing.'
  await dialog.getByLabel('Supporting details').fill(details)
  await dialog.getByRole('button', { name: 'Submit dispute' }).click()
  await expect(page.getByText('Your dispute was submitted.')).toBeVisible()
  await expect(page.getByText(review.comment)).toBeVisible()
  await page.goto('/review-disputes#dispute-' + caseId)
  await expect(page.getByText(details)).toBeVisible()
  await expect(page.locator('#dispute-' + caseId)).toBeFocused()
  expect(calls(model, '/rest/v1/review_disputes', 'GET').map(call => new URLSearchParams(call.search).get('submitted_by'))).toEqual(['eq.' + USER_ID])
  expect(calls(model, '/rest/v1/rpc/submit_review_dispute', 'POST')[0].body).toEqual({
    p_review_id: reviewId, p_reason: 'unrelated', p_details: details,
  })
})

test('moderation shows scoped evidence and refreshes an uncertain decision before displaying its finalized outcome', async ({ page }) => {
  const { model, state } = await mockReviews(page, { admin: true, seedCase: true })
  await page.goto('/admin/review-disputes')
  await expect(page.getByRole('heading', { name: 'Review disputes', exact: true })).toBeVisible()
  expect(calls(model, '/rest/v1/rpc/get_review_dispute_evidence', 'POST')).toHaveLength(0)
  await page.getByRole('button', { name: 'Review dispute', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText(review.comment)).toBeVisible()
  await expect(dialog.getByText('Please check whether the comment is about this rental.')).toBeVisible()
  await dialog.getByLabel('Decision', { exact: true }).selectOption('uphold')
  await dialog.getByRole('button', { name: 'Record decision' }).click()
  await expect(dialog.getByLabel('Decision reason')).toBeFocused()
  await dialog.getByLabel('Decision reason').fill('The comment contains material unrelated to the rental.')
  state.failDecision = true
  await dialog.getByRole('button', { name: 'Record decision' }).click()
  const check = dialog.getByRole('button', { name: 'Check dispute status' })
  await expect(check).toBeFocused()
  await check.click()
  await expect(page.getByRole('heading', { name: 'No disputes found' })).toBeVisible()
  await page.getByLabel('Status', { exact: true }).selectOption('upheld')
  await expect(page.getByText('The comment contains material unrelated to the rental.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Review dispute' })).toHaveCount(0)
  expect(calls(model, '/rest/v1/rpc/resolve_review_dispute', 'POST')).toHaveLength(1)
  await page.goto('/listings/' + LISTING_ID)
  const reviewSection = page.getByRole('region', { name: 'Listing reviews' })
  await expect(reviewSection.getByText('No reviews yet')).toBeVisible()
  await expect(reviewSection.getByText(review.comment)).toHaveCount(0)
})

test('ordinary users cannot enter the administrator dispute queue', async ({ page }) => {
  const { model } = await mockReviews(page, { seedCase: true })
  await page.goto('/admin/review-disputes')
  await expect(page.getByRole('heading', { name: 'Admins only' })).toBeVisible()
  expect(calls(model, '/rest/v1/review_disputes', 'GET')).toHaveLength(0)
})
