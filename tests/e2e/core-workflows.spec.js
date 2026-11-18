import { expect } from '@playwright/test'
import {
  test,
  apiError,
  calls,
  json,
  LISTING_ID,
  mockMarketplace,
  OWNER_ID,
  sessionFor,
  USER_ID,
} from './fixtures.js'

const BOOKING_ID = '55555555-5555-4555-8555-555555555555'
const CONVERSATION_ID = '66666666-6666-4666-8666-666666666666'
const booking = (status) => ({
  id: BOOKING_ID,
  status,
  start_date: '2099-01-10',
  end_date: '2099-01-11',
  price: 200,
  price_period: 'day',
  deposit: 50,
  message: 'A non-sensitive sample booking.',
  owner_response: null,
  simulated_payments: [],
  reviews: [],
  listings: { id: LISTING_ID, title: 'Camera for rent' },
  renter: { display_name: 'Sample renter' },
})

test('login rejects wrong credentials and recovers with the existing sign-in flow', async ({
  page,
}) => {
  let valid = false
  const model = await mockMarketplace(
    page,
    async (route, { url }) => {
      if (url.pathname !== '/auth/v1/token') return false
      if (valid) await json(route, sessionFor())
      else
        await apiError(
          route,
          'Invalid login credentials',
          400,
          'invalid_credentials',
        )
      return true
    },
    { signedIn: false },
  )
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill('sample@example.test')
  await page.getByLabel('Password', { exact: true }).fill('sample-password')
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Wrong email or password.')
  valid = true
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(
    page.getByRole('heading', {
      name: 'Rent almost anything, all in one place.',
    }),
  ).toBeVisible()
  expect(calls(model, '/auth/v1/token', 'POST')).toHaveLength(2)
})

test('registration preserves the email-confirmation notice without claiming an active session', async ({
  page,
}) => {
  const model = await mockMarketplace(
    page,
    async (route, { url }) => {
      if (url.pathname !== '/auth/v1/signup') return false
      await json(route, { user: sessionFor().user, session: null })
      return true
    },
    { signedIn: false },
  )
  await page.goto('/register')
  await page.getByLabel('Full name').fill('Sample account')
  await page.getByLabel('Email', { exact: true }).fill('sample@example.test')
  await page.getByLabel('Password', { exact: true }).fill('sample-password')
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click()
  await expect(page.getByRole('status')).toContainText(
    'Check your email to confirm',
  )
  await expect(page).toHaveURL(/\/register$/)
  expect(calls(model, '/auth/v1/signup', 'POST')[0].body.data.full_name).toBe(
    'Sample account',
  )
})

for (const [label, target] of [
  ['Accept', 'accepted'],
  ['Decline', 'rejected'],
]) {
  test(`owner ${label.toLowerCase()} uses the existing booking status update`, async ({
    page,
  }) => {
    const row = booking('pending')
    const model = await mockMarketplace(
      page,
      async (route, { url, method, body }) => {
        if (url.pathname !== '/rest/v1/bookings') return false
        if (method === 'PATCH') {
          row.status = body.status
          await json(route, [{ id: BOOKING_ID }])
          return true
        }
        await json(route, [row])
        return true
      },
    )
    await page.goto('/bookings?tab=incoming')
    await page.getByRole('button', { name: label, exact: true }).click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: label, exact: true })
      .click()
    await expect(page.locator(`.status--${target}`)).toHaveText(
      target === 'accepted' ? 'Confirmed' : 'Declined',
    )
    await expect(page.getByRole('heading', { name: 'Your incoming requests' })).toBeFocused()
    await expect(page.getByText(`Booking updated: ${target === 'accepted' ? 'Confirmed' : 'Declined'}.`)).toBeVisible()
    const update = calls(model, '/rest/v1/bookings', 'PATCH')[0]
    expect(update.body).toEqual({ status: target })
    expect(update.search).toContain(`id=eq.${BOOKING_ID}`)
  })
}

test('simulated payment uses the existing RPC and refreshes paid records', async ({
  page,
}) => {
  const row = booking('accepted')
  const model = await mockMarketplace(page, async (route, { url }) => {
    if (url.pathname === '/rest/v1/bookings') {
      await json(route, [row])
      return true
    }
    if (url.pathname.endsWith('/simulate_payment')) {
      row.simulated_payments = [
        { kind: 'rental', amount: 400, status: 'simulated_paid' },
        { kind: 'deposit', amount: 50, status: 'simulated_paid' },
      ]
      await json(route, null)
      return true
    }
    return false
  })
  await page.goto('/bookings')
  await page.getByRole('button', { name: /^Pay .*\(simulated\)$/ }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Simulate payment', exact: true })
    .click()
  await expect(
    page.getByText('Paid (simulated) · ₱450', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: /^Pay .*\(simulated\)$/ }),
  ).toHaveCount(0)
  expect(calls(model, '/rest/v1/rpc/simulate_payment', 'POST')[0].body).toEqual(
    { p_booking_id: BOOKING_ID },
  )
})

test('completed rental review posts the existing booking/reviewer fields and refreshes its display', async ({
  page,
}) => {
  const row = booking('completed')
  const model = await mockMarketplace(
    page,
    async (route, { url, method, body }) => {
      if (url.pathname === '/rest/v1/bookings') {
        await json(route, [row])
        return true
      }
      if (url.pathname === '/rest/v1/reviews' && method === 'POST') {
        row.reviews = [{ rating: body.rating, comment: body.comment }]
        await json(route, null, 201)
        return true
      }
      return false
    },
  )
  await page.goto('/bookings')
  await page.getByRole('button', { name: 'Leave a review' }).click()
  await page.getByRole('radio', { name: '5 stars', exact: true }).check()
  await page
    .getByLabel('Comment (optional)')
    .fill('Clear listing and helpful owner.')
  await page.getByRole('button', { name: 'Submit review' }).click()
  await expect(
    page.getByText('Your review: “Clear listing and helpful owner.”'),
  ).toBeVisible()
  expect(calls(model, '/rest/v1/reviews', 'POST')[0].body).toMatchObject({
    booking_id: BOOKING_ID,
    reviewer_id: USER_ID,
    rating: 5,
  })
})

test('existing conversation loads, sends text and marks received messages read', async ({
  page,
}) => {
  const rows = [
    {
      id: 'sample-message',
      sender_id: OWNER_ID,
      body: 'The sample camera is available.',
      created_at: '2026-11-01T00:00:00Z',
      read_at: null,
    },
  ]
  const model = await mockMarketplace(
    page,
    async (route, { url, method, body }) => {
      if (url.pathname === '/rest/v1/conversations') {
        await json(route, [
          {
            id: CONVERSATION_ID,
            renter_id: USER_ID,
            listings: { id: LISTING_ID, title: 'Camera for rent' },
            renter: { display_name: 'Sample renter' },
            owner: { display_name: 'Sample owner' },
          },
        ])
        return true
      }
      if (url.pathname === '/rest/v1/messages') {
        if (method === 'POST') {
          rows.push({
            id: 'sample-reply',
            ...body,
            created_at: '2026-11-01T01:00:00Z',
            read_at: null,
          })
          await json(route, null, 201)
          return true
        }
        if (method === 'PATCH') {
          rows[0].read_at = body.read_at
          await json(route, null)
          return true
        }
        if (url.searchParams.has('conversation_id')) {
          await json(route, rows)
          return true
        }
      }
      return false
    },
  )
  await page.goto(`/messages/${CONVERSATION_ID}`)
  await expect(
    page.getByText('The sample camera is available.', { exact: false }),
  ).toBeVisible()
  await page
    .getByLabel('Your message')
    .fill('Thank you. I will send a request.')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(
    page.getByText('Thank you. I will send a request.', { exact: false }),
  ).toBeVisible()
  expect(calls(model, '/rest/v1/messages', 'POST')[0].body).toMatchObject({
    conversation_id: CONVERSATION_ID,
    sender_id: USER_ID,
  })
  expect(calls(model, '/rest/v1/messages', 'PATCH').length).toBeGreaterThan(0)
})

test('listing report uses the signed-in reporter and displays submission confirmation', async ({
  page,
}) => {
  const model = await mockMarketplace(page, async (route, { url, method }) => {
    if (url.pathname === '/rest/v1/listing_reports' && method === 'POST') {
      await json(route, null, 201)
      return true
    }
    return false
  })
  await page.goto(`/listings/${LISTING_ID}`)
  await page.getByRole('button', { name: 'Report this listing' }).click()
  await page
    .getByLabel('Why are you reporting this listing?')
    .selectOption('misleading')
  await page
    .getByLabel('Details', { exact: true })
    .fill('Non-sensitive sample report.')
  await page.getByRole('button', { name: 'Send report' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'administrator will review' }),
  ).toBeVisible()
  expect(
    calls(model, '/rest/v1/listing_reports', 'POST')[0].body,
  ).toMatchObject({
    listing_id: LISTING_ID,
    reporter_id: USER_ID,
    reason: 'misleading',
  })
})

test('existing admin report resolution uses its RPC and retains resolved history', async ({
  page,
}) => {
  const report = {
    id: 'sample-report',
    reason: 'misleading',
    details: 'Non-sensitive sample report.',
    status: 'open',
    admin_note: null,
    created_at: '2026-11-01T00:00:00Z',
    listings: {
      id: LISTING_ID,
      title: 'Camera for rent',
      status: 'available',
      profiles: { display_name: 'Sample owner' },
    },
    reporter: { display_name: 'Sample reporter' },
  }
  const model = await mockMarketplace(page, async (route, { url, body }) => {
    if (url.pathname.endsWith('/is_admin')) {
      await json(route, true)
      return true
    }
    if (url.pathname === '/rest/v1/listing_reports') {
      await json(
        route,
        (url.searchParams.get('status') === 'eq.open') ===
          (report.status === 'open')
          ? [report]
          : [],
      )
      return true
    }
    if (url.pathname.endsWith('/resolve_report')) {
      report.status = 'dismissed'
      report.admin_note = body.p_note
      await json(route, null)
      return true
    }
    return false
  })
  await page.goto('/admin')
  await page
    .getByLabel('Note (optional)', { exact: true })
    .fill('Sample review completed.')
  await page.getByRole('button', { name: 'Dismiss report' }).click()
  await expect(
    page.getByRole('heading', { name: 'No open reports' }),
  ).toBeVisible()
  await page.getByRole('tab', { name: 'Resolved' }).click()
  await expect(
    page.getByText('Dismissed · Sample review completed.', { exact: true }),
  ).toBeVisible()
  expect(calls(model, '/rest/v1/rpc/resolve_report', 'POST')[0].body).toEqual({
    p_report_id: 'sample-report',
    p_action: 'dismiss',
    p_note: 'Sample review completed.',
  })
})
