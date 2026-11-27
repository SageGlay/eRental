import { expect } from '@playwright/test'
import { apiError, calls, json, mockMarketplace, OWNER_ID, sessionFor, test, USER_ID } from './fixtures.js'

const entityId = '51000000-0000-4000-8000-000000000001'
const row = (i, type, fields = {}) => ({
  id: '71000000-0000-4000-8000-' + String(i).padStart(12, '0'),
  recipient_id: USER_ID,
  event_type: type,
  recipient_role: 'renter',
  entity_id: entityId,
  created_at: new Date(Date.UTC(2026, 0, i)).toISOString(),
  read_at: null,
  ...fields,
})

test('viewing and moderation notices use the existing recipient center and known internal destinations', async ({ page }) => {
  await fixture(page, [
    row(1, 'viewing_requested', { recipient_role: 'owner' }),
    row(2, 'viewing_reschedule_proposed'),
    row(3, 'conversation_report_resolved', { recipient_role: 'reporter' }),
    row(4, 'review_dispute_resolved', { recipient_role: 'owner' }),
    row(5, 'review_response_published'),
    row(6, 'review_published', { recipient_role: 'owner', entity_id: 'https://example.test/' }),
    row(7, 'viewing_completed', { recipient_id: OWNER_ID }),
  ])
  await page.goto('/notifications')
  await expect(page.getByRole('link', { name: 'New viewing request' })).toHaveAttribute('href', '/viewings?tab=incoming#viewing-' + entityId)
  await expect(page.getByRole('link', { name: 'New viewing time proposed' })).toHaveAttribute('href', '/viewings#viewing-' + entityId)
  await expect(page.getByRole('link', { name: 'Conversation report resolved' })).toHaveAttribute('href', '/messages/' + entityId + '#conversation-reports')
  await expect(page.getByRole('link', { name: 'Review dispute resolved' })).toHaveAttribute('href', '/review-disputes#dispute-' + entityId)
  await expect(page.getByRole('link', { name: 'Owner responded to your review' })).toHaveAttribute('href', '/listings/' + entityId + '#rental-reviews')
  await expect(page.getByRole('link', { name: 'New rental review' })).toHaveCount(0)
  await expect(page.getByText('Viewing completed', { exact: true })).toHaveCount(0)
})

async function fixture(page, rows, options) {
  const state = { rows, failWrite: false, failList: false, failCount: false }
  const model = await mockMarketplace(page, async (route, { url, method, body }) => {
    if (method === 'OPTIONS') return false
    if (url.pathname === '/auth/v1/token') {
      await json(route, sessionFor(OWNER_ID))
      return true
    }
    const token = route.request().headers().authorization?.split('.')[1]
    const actor = token ? JSON.parse(Buffer.from(token, 'base64').toString()).sub : null
    const own = rows.filter((item) => item.recipient_id === actor)
    if (url.pathname === '/rest/v1/notifications') {
      if ((method === 'GET' && state.failList) || (method === 'HEAD' && state.failCount)) {
        await apiError(route, 'Read unavailable', 403)
        return true
      }
      expect(url.searchParams.get('recipient_id')).toBe('eq.' + actor)
      let filtered = url.searchParams.has('read_at') ? own.filter((item) => !item.read_at) : own
      const count = filtered.length
      const offset = Number(url.searchParams.get('offset') ?? 0)
      if (method === 'GET') {
        expect(url.searchParams.get('order')).toBe('created_at.desc,id.desc')
        filtered = [...filtered].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
        filtered = filtered.slice(offset, offset + Number(url.searchParams.get('limit')))
      }
      await route.fulfill({
        status: 200, contentType: 'application/json',
        headers: {
          'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range',
          'content-range': (filtered.length ? `${offset}-${offset + filtered.length - 1}` : '*') + '/' + count,
        },
        ...(method === 'HEAD' ? {} : { body: JSON.stringify(filtered) }),
      })
      return true
    }
    if (url.pathname.startsWith('/rest/v1/rpc/mark_') && url.pathname.endsWith('_read')) {
      if (state.failWrite) {
        await apiError(route)
        return true
      }
      const targets = url.pathname.endsWith('/mark_all_notifications_read') ? own : own.filter((n) => n.id === body.p_notification_id)
      for (const item of targets) item.read_at ??= new Date().toISOString()
      await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } })
      return true
    }
    return false
  }, options)
  return { state, model }
}

test('notification links use confirmed events and read changes persist across filters and refresh', async ({ page }) => {
  const rows = [
    row(1, 'simulated_payment_recorded'), row(2, 'verification_approved', { recipient_role: 'applicant' }),
    row(3, 'booking_requested', { recipient_role: 'owner', read_at: '2026-03-03T12:00:00Z' }),
    row(4, 'message_received', { recipient_id: OWNER_ID }),
  ]
  const { model } = await fixture(page, rows)
  await page.goto('/notifications')
  await expect(page.getByRole('heading', { name: 'Notifications', exact: true })).toBeVisible()
  const bell = page.getByRole('link', { name: 'Notifications, 2 unread' })
  await expect(bell).toBeVisible()
  await expect(page.getByRole('link', { name: 'New booking request' })).toHaveAttribute('href', '/bookings?tab=incoming#booking-' + entityId)
  await expect(page.getByRole('link', { name: 'Simulated payment recorded' })).toHaveAttribute('href', '/bookings#booking-' + entityId)
  await expect(page.getByText('No money changed hands.', { exact: false })).toBeVisible()
  await expect(page.getByRole('link', { name: 'New rental message' })).toHaveCount(0)
  const markApproved = page.getByRole('button', { name: 'Mark Account verification approved as read' })
  await markApproved.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Your activity' })).toBeFocused()
  await expect(markApproved).toHaveCount(0)
  await page.getByRole('button', { name: 'Unread', exact: true }).click()
  await expect(page).toHaveURL(/view=unread/)
  await expect(page.getByRole('link', { name: 'New booking request' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Notifications, 1 unread' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Account verification approved' })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('link', { name: 'Notifications, 1 unread' })).toBeVisible()
  await page.getByRole('button', { name: 'Mark all as read' }).click()
  await expect(page.getByRole('heading', { name: 'You’re all caught up' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Notifications, 0 unread' })).toBeVisible()
  await page.getByRole('button', { name: 'Show all notifications' }).click()
  await expect(page.locator('.notification-row')).toHaveCount(3)
  expect(rows[3].read_at).toBeNull()
  expect(calls(model, '/rest/v1/rpc/mark_all_notifications_read', 'POST')).toHaveLength(1)
  expect(calls(model, '/rest/v1/messages', 'PATCH')).toHaveLength(0)
})

test('a failed notification read stays actionable and opening a confirmed update navigates to its private page', async ({ page }) => {
  const { state, model } = await fixture(page, [row(1, 'verification_rejected', { recipient_role: 'applicant' })])
  state.failList = true
  state.failCount = true
  await page.goto('/notifications')
  await expect(page.getByRole('alert')).toContainText('load your notifications')
  await expect(page.getByText('Unread count unavailable.')).toBeVisible()
  state.failList = false
  state.failCount = false
  await page.getByRole('button', { name: 'Try again' }).click()
  state.failWrite = true
  const decision = page.getByRole('link', { name: 'Verification request declined' })
  await expect(decision).toHaveAttribute('href', '/verification')
  await decision.click()
  await expect(page.getByRole('alert')).toContainText('couldn’t confirm the read status')
  await expect(page).toHaveURL(/\/notifications$/)
  await expect(page.getByRole('link', { name: 'Notifications, 1 unread' })).toBeVisible()
  expect(state.rows[0].read_at).toBeNull()
  state.failWrite = false
  await page.route('**/rest/v1/verification_submissions?**', (route) => json(route, []))
  await decision.click()
  await expect(page).toHaveURL(/\/verification$/)
  await expect(page.getByRole('link', { name: 'Notifications, 0 unread' })).toBeVisible()
  expect(calls(model, '/rest/v1/rpc/mark_notification_read', 'POST')).toHaveLength(2)
  expect(calls(model, '/rest/v1/rpc/review_verification', 'POST')).toHaveLength(0)
})

test('notification paging uses stable order and only recognized internal destinations', async ({ page }) => {
  const rows = Array.from({ length: 15 }, (_, i) => row(i + 1, 'message_received'))
  rows.push(row(16, 'not_a_known_type', { entity_id: 'https://invalid.example' }))
  rows.push(row(17, 'message_received', { entity_id: '../outside?return=elsewhere' }))
  rows.push(row(18, 'booking_accepted', { recipient_role: 'unexpected' }))
  await fixture(page, rows)
  await page.goto('/notifications')
  const items = page.locator('.notification-row')
  await expect(items).toHaveCount(15)
  await expect(items.nth(0)).toContainText('Booking accepted')
  await expect(items.nth(2)).toContainText('Account update')
  for (const index of [0, 1, 2]) await expect(items.nth(index).getByRole('link')).toHaveCount(0)
  await expect(items.nth(3).getByRole('link')).toHaveAttribute('href', '/messages/' + entityId)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(items).toHaveCount(3)
  await expect(page.getByText('Page 2 of 2')).toBeVisible()
  await page.goBack()
  await expect(items).toHaveCount(15)
})

test('logout and subsequent login replace notification content and badges with the new account’s records', async ({ page }) => {
  await fixture(page, [
    row(1, 'inquiry_received'),
    row(2, 'simulated_refund_recorded', { recipient_id: OWNER_ID, read_at: '2026-03-03T12:00:00Z' }),
  ])
  await page.goto('/notifications')
  await expect(page.getByRole('link', { name: 'New rental inquiry' })).toBeVisible()
  await page.getByLabel('My account', { exact: true }).click()
  await page.getByRole('button', { name: 'Log out', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.locator('.notification-bell')).toHaveCount(0)
  await page.getByLabel('Email', { exact: true }).fill('owner@example.test')
  await page.getByLabel('Password', { exact: true }).fill('fixture-password')
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await page.getByRole('link', { name: 'Notifications, 0 unread' }).click()
  await expect(page.getByRole('link', { name: 'Simulated refund recorded' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'New rental inquiry' })).toHaveCount(0)
})

test('guest notification entry requires authentication and has no personal data requests', async ({ page }) => {
  const { model } = await fixture(page, [], { signedIn: false })
  await page.goto('/notifications')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.locator('.notification-bell')).toHaveCount(0)
  expect(model.calls.filter(({ path }) => path === '/rest/v1/notifications')).toHaveLength(0)
})
