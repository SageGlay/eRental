import { expect } from '@playwright/test'
import {
  apiError,
  calls,
  json,
  LISTING_ID,
  mockMarketplace,
  OWNER_ID,
  sessionFor,
  test,
  USER_ID,
} from './fixtures.js'

const firstConversation = '61616161-6161-4161-8161-616161616161'
const secondConversation = '62626262-6262-4262-8262-626262626262'
const bookingId = '55555555-5555-4555-8555-555555555555'
const conversation = (id, owner = 'Sample owner') => ({
  id,
  renter_id: USER_ID,
  owner: { display_name: owner },
  renter: { display_name: 'Sample renter' },
  listings: { id: LISTING_ID, title: 'Camera for rent' },
})
const message = (id, body, sender = OWNER_ID) => ({
  id,
  body,
  sender_id: sender,
  created_at: '2026-11-01T00:00:00Z',
  read_at: '2026-11-01T00:01:00Z',
})
const booking = (status) => ({
  id: bookingId,
  status,
  start_date: '2099-01-10',
  end_date: '2099-01-10',
  price: 200,
  price_period: 'day',
  deposit: 50,
  simulated_payments: [],
  reviews: [],
  listings: { id: LISTING_ID, title: 'Camera for rent' },
  renter: { display_name: 'Sample renter' },
})
function gate() {
  let release
  const pending = new Promise((resolve) => {
    release = resolve
  })
  return { pending, release }
}

test('conversation and message reads distinguish a failure from an empty result', async ({
  page,
}) => {
  const recovery = gate()
  let conversationAvailable = false
  let messagesAvailable = false
  const model = await mockMarketplace(page, async (route, { url }) => {
    if (url.pathname === '/rest/v1/conversations') {
      if (conversationAvailable)
        await json(route, [conversation(firstConversation)])
      else await apiError(route, 'Fixture conversation failure', 500)
      return true
    }
    if (
      url.pathname === '/rest/v1/messages' &&
      url.searchParams.has('conversation_id')
    ) {
      if (messagesAvailable) {
        await recovery.pending
        await json(route, [])
      } else await apiError(route, 'Fixture message failure', 500)
      return true
    }
    return false
  })
  await page.goto(`/messages/${firstConversation}`)
  await expect(page.getByRole('alert')).toContainText(
    'We couldn’t load this conversation',
  )
  await expect(page.getByText('Conversation not found')).toHaveCount(0)
  expect(
    calls(model, '/rest/v1/messages', 'GET').filter(({ search }) =>
      search.includes('conversation_id'),
    ),
  ).toHaveLength(0)
  conversationAvailable = true
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(
    page.getByRole('heading', { name: 'Sample owner' }),
  ).toBeFocused()
  await expect(page.getByRole('alert')).toContainText(
    'We couldn’t load your messages',
  )
  await expect(page.getByText('Start with a hello')).toHaveCount(0)
  messagesAvailable = true
  try {
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(
      page.getByRole('button', { name: 'Refreshing messages…' }),
    ).toBeDisabled()
  } finally {
    recovery.release()
  }
  await expect(
    page.getByRole('heading', { name: 'Start with a hello' }),
  ).toBeVisible()
})

test('changing conversation URLs and going Back keeps messages and drafts scoped to the open thread', async ({
  page,
}) => {
  await mockMarketplace(page, async (route, { url }) => {
    if (url.pathname === '/rest/v1/conversations') {
      const second = url.searchParams.get('id') === `eq.${secondConversation}`
      await json(route, [
        second
          ? conversation(secondConversation, 'Second sample owner')
          : conversation(firstConversation),
      ])
      return true
    }
    if (
      url.pathname === '/rest/v1/messages' &&
      url.searchParams.has('conversation_id')
    ) {
      const second =
        url.searchParams.get('conversation_id') === `eq.${secondConversation}`
      await json(route, [
        second
          ? message('second-message', 'Second thread sample')
          : message('first-message', 'First thread sample'),
      ])
      return true
    }
    return false
  })
  await page.goto(`/messages/${firstConversation}`)
  await expect(page.getByText('First thread sample')).toBeVisible()
  await page.getByLabel('Your message').fill('Draft for the first thread')
  // Navigate between parameters without a full document load.
  await page.evaluate((id) => {
    const state = {
      idx: history.state.idx + 1,
      key: 'fixture-second-conversation',
    }
    history.pushState(state, '', `/messages/${id}`)
    dispatchEvent(new PopStateEvent('popstate', { state }))
  }, secondConversation)
  await expect(
    page.getByRole('heading', { name: 'Second sample owner' }),
  ).toBeVisible()
  await expect(page.getByText('Second thread sample')).toBeVisible()
  await expect(page.getByText('First thread sample')).toHaveCount(0)
  await expect(page.getByLabel('Your message')).toHaveValue('')
  await page.goBack()
  await expect(page.getByText('First thread sample')).toBeVisible()
  await expect(page.getByText('Second thread sample')).toHaveCount(0)
})

test('a stalled send checks the refreshed thread for an already stored message', async ({
  page,
}) => {
  await page.clock.install()
  const response = gate()
  const text = 'A sample message with a lost response'
  const rows = [message('earlier', 'Earlier sample')]
  const model = await mockMarketplace(page, async (route, { url, method, body }) => {
    if (url.pathname === '/rest/v1/conversations') {
      await json(route, [conversation(firstConversation)])
      return true
    }
    if (url.pathname === '/rest/v1/rpc/send_conversation_message' && method === 'POST') {
      rows.push(message(body.p_operation_id, body.p_body, USER_ID))
      await response.pending
      await json(route, body.p_operation_id)
      return true
    }
    if (url.pathname !== '/rest/v1/messages') return false
    await json(route, rows)
    return true
  })
  try {
    await page.goto(`/messages/${firstConversation}`)
    await expect(page.getByText('Earlier sample')).toBeVisible()
    await page.getByLabel('Your message').fill(text)
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect
      .poll(() => calls(model, '/rest/v1/rpc/send_conversation_message', 'POST').length)
      .toBe(1)
    await page.clock.fastForward(15_100)
    await expect(page.getByRole('alert')).toContainText(
      'couldn’t confirm your message',
    )
    await expect(
      page.getByRole('button', { name: 'Send', exact: true }),
    ).toBeDisabled()
    await expect(page.getByLabel('Your message')).toHaveValue(text)
    const refresh = page.getByRole('button', { name: 'Refresh messages' })
    await expect(refresh).toBeFocused()
    await expect(
      page
        .getByRole('list', { name: 'Conversation messages' })
        .getByText(text, { exact: true }),
    ).toBeVisible()
    await refresh.click()
    await expect(page.getByRole('status')).toContainText(
      'A matching message is already in this conversation.',
    )
    await expect(page.getByLabel('Your message')).toHaveValue('')
    expect(calls(model, '/rest/v1/rpc/send_conversation_message', 'POST')).toHaveLength(1)
  } finally {
    response.release()
  }
})

test('an unconfirmed payment times out and requires fresh booking data before a retry', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.clock.install()
  const response = gate()
  const row = booking('accepted')
  const model = await mockMarketplace(page, async (route, { url }) => {
    if (url.pathname === '/rest/v1/bookings') {
      await json(route, [row])
      return true
    }
    if (url.pathname.endsWith('/simulate_payment')) {
      row.simulated_payments = [
        { kind: 'rental', amount: 200, status: 'simulated_paid' },
        { kind: 'deposit', amount: 50, status: 'simulated_paid' },
      ]
      await response.pending
      await json(route, null)
      return true
    }
    return false
  })
  try {
    await page.goto('/bookings')
    const pay = page.getByRole('button', { name: /^Pay / })
    await pay.click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Simulate payment' }).click()
    await expect
      .poll(() => calls(model, '/rest/v1/rpc/simulate_payment', 'POST').length)
      .toBe(1)
    await page.clock.fastForward(15_100)
    await expect(dialog.getByRole('alert')).toContainText(
      'couldn’t confirm the payment simulation',
    )
    await expect(
      dialog.getByRole('button', { name: 'Refresh bookings' }),
    ).toBeFocused()
    await expect(
      page.getByText('Payment simulation completed.', { exact: false }),
    ).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(pay).toBeDisabled()
    const refresh = page.getByRole('button', { name: 'Refresh bookings' })
    await expect(refresh).toBeFocused()
    await refresh.click()
    await expect(
      page.getByText('Paid (simulated) · ₱250', { exact: true }),
    ).toBeVisible()
    await expect(pay).toHaveCount(0)
    expect(calls(model, '/rest/v1/rpc/simulate_payment', 'POST')).toHaveLength(
      1,
    )
  } finally {
    response.release()
  }
})

test('expired browser sessions fail closed before a protected route reads bookings', async ({
  page,
}) => {
  const session = {
    ...sessionFor(),
    expires_at: Math.floor(Date.now() / 1000) - 120,
  }
  await page.addInitScript((fixture) => {
    if (sessionStorage.getItem('expired-fixture')) return
    sessionStorage.setItem('expired-fixture', 'true')
    localStorage.setItem('sb-test-project-auth-token', JSON.stringify(fixture))
  }, session)
  const model = await mockMarketplace(
    page,
    async (route, { url }) => {
      if (
        url.pathname === '/auth/v1/token' &&
        url.searchParams.get('grant_type') === 'refresh_token'
      ) {
        await json(
          route,
          { code: 'refresh_token_not_found', msg: 'Expired fixture session' },
          400,
        )
        return true
      }
      return false
    },
    { signedIn: false },
  )
  await page.goto('/bookings')
  await expect(
    page.getByRole('heading', { name: 'Welcome back' }),
  ).toBeVisible()
  expect(calls(model, '/auth/v1/token', 'POST').length).toBeGreaterThan(0)
  expect(calls(model, '/rest/v1/bookings', 'GET')).toHaveLength(0)
})

test('browse Back and Forward restore the committed search in the mobile form', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 780 })
  await mockMarketplace(page, undefined, { signedIn: false })
  await page.goto('/listings?q=camera')
  const keyword = page.getByRole('searchbox', { name: 'Search', exact: true })
  await expect(keyword).toHaveValue('camera')
  await keyword.fill('tripod')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page).toHaveURL(/q=tripod/)
  await page.goBack()
  await expect(keyword).toHaveValue('camera')
  await page.goForward()
  await expect(keyword).toHaveValue('tripod')
})
