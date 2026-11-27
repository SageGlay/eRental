import { expect } from '@playwright/test'
import { apiError, calls, json, LISTING_ID, mockMarketplace, OWNER_ID, sessionFor, test, USER_ID } from './fixtures.js'

const appointmentId = '85000000-0000-4000-8000-000000000001'
const previousTime = '2035-07-21T02:00:00Z'
const alternativeTime = '2035-07-22T06:00:00Z'
const appointment = (fields = {}) => ({
  id: appointmentId, listing_id: LISTING_ID, renter_id: USER_ID, owner_id: OWNER_ID,
  status: 'pending', revision: 1, requested_start_at: previousTime,
  request_note: 'Is the standard lens included?', listings: { title: 'Camera for rent' },
  renter: { display_name: 'Test renter' }, owner: { display_name: 'Test owner' },
  ...fields,
})

async function mockViewings(page, { actor = USER_ID, items = [], lostRequest = false } = {}) {
  const rows = new Map(items.map(item => [item.id, item]))
  const history = [
    { id: '1', event_type: 'viewing_confirmed', actor_role: 'owner', scheduled_at: previousTime, created_at: '2035-07-20T02:00:00Z' },
    { id: '2', event_type: 'viewing_reschedule_proposed', actor_role: 'owner', scheduled_at: alternativeTime, created_at: '2035-07-20T03:00:00Z' },
  ]
  const state = { failRead: false, lostRequest, failUpdate: false }
  if (actor) {
    await page.addInitScript(session => {
      if (!localStorage.getItem('fixture-seeded')) {
        localStorage.setItem('fixture-seeded', 'true')
        localStorage.setItem('sb-test-project-auth-token', JSON.stringify(session))
      }
    }, sessionFor(actor))
  }
  const model = await mockMarketplace(page, async (route, { url, method, body }) => {
    if (url.pathname.endsWith('/auth/v1/token')) { await json(route, sessionFor()); return true }
    if (url.pathname.endsWith('/rpc/public_review_summary')) { await json(route, { review_count: 0, average_rating: null }); return true }
    if (url.pathname.endsWith('/viewing_appointments') && method === 'GET') {
      if (state.failRead) { await apiError(route, 'Unable to load viewings', 403); return true }
      const params = url.searchParams
      const column = params.has('owner_id') ? 'owner_id' : 'renter_id'
      expect(params.get(column)).toBe('eq.' + actor)
      const status = params.get('status')
      const records = [...rows.values()].filter(row => row[column] === actor &&
        (!status || status === 'eq.' + row.status ||
          status === 'in.(confirmed,reschedule_proposed)' && ['confirmed','reschedule_proposed'].includes(row.status)))
      await json(route, params.has('id') ? records.filter(row => params.get('id') === 'eq.' + row.id) : records)
      return true
    }
    if (url.pathname.endsWith('/viewing_appointment_events') && method === 'GET') {
      expect(url.searchParams.get('appointment_id')).toBe('eq.' + appointmentId)
      await json(route, history)
      return true
    }
    if (url.pathname.endsWith('/rpc/request_viewing')) {
      expect(body.p_listing_id).toBe(LISTING_ID)
      expect(body.p_request_id).toMatch(/^[a-f0-9-]{36}$/)
      if (!rows.has(body.p_request_id)) {
        rows.set(body.p_request_id, appointment({
          id: body.p_request_id, requested_start_at: body.p_start_at, request_note: body.p_note,
        }))
      }
      if (state.lostRequest) { state.lostRequest = false; await apiError(route); return true }
      await json(route, body.p_request_id)
      return true
    }
    if (url.pathname.endsWith('/rpc/update_viewing')) {
      if (state.failUpdate) { await apiError(route); return true }
      const current = rows.get(body.p_appointment_id)
      expect(body.p_revision).toBe(current.revision)
      expect(body.p_action).toMatch(/^(confirm|accept_proposal|cancel)$/)
      const status = body.p_action === 'cancel' ? 'cancelled' : 'confirmed'
      rows.set(current.id, { ...current, revision: current.revision + 1, status,
        ...(status === 'confirmed' ? {
          confirmed_start_at: current.proposed_start_at || current.requested_start_at,
          confirmed_end_at: '2035-07-22T06:30:00Z',
          meeting_details: body.p_note || current.proposed_details,
          proposed_start_at: null, proposed_details: null,
        } : {}),
      })
      await json(route, null)
      return true
    }
    return false
  }, { signedIn: false })
  return { rows, model, state }
}

test.use({ timezoneId: 'America/Los_Angeles' })

test('requests use Philippine time and retry the same operation after an uncertain response', async ({ page }) => {
  const { rows, model } = await mockViewings(page, { lostRequest: true })
  await page.goto('/listings/' + LISTING_ID)
  await page.getByRole('button', { name: 'Request a viewing' }).click()
  const dialog = page.getByRole('dialog', { name: 'Request a viewing' })
  await dialog.getByLabel('Preferred date and time').fill('2000-07-22T14:00')
  await dialog.getByRole('button', { name: 'Review details' }).click()
  await expect(dialog.getByRole('alert')).toContainText('future date and time')
  await dialog.getByLabel('Preferred date and time').fill('2035-07-22T14:00')
  await dialog.getByLabel('Note for the owner (optional)').fill('Check the rental at the agreed location')
  await dialog.getByRole('button', { name: 'Review details' }).click()
  await expect(dialog.getByText('Philippine time · 30 minutes')).toBeVisible()
  await dialog.getByRole('button', { name: 'Edit details' }).click()
  await expect(dialog.getByLabel('Preferred date and time')).toBeFocused()
  await dialog.getByRole('button', { name: 'Review details' }).click()
  const send = dialog.getByRole('button', { name: 'Send viewing request' })
  await send.click()
  await expect(dialog.getByRole('alert')).toContainText('Retry these same details')
  await expect(dialog.getByRole('button', { name: 'Edit details' })).toBeDisabled()
  await send.click()
  const track = page.getByRole('link', { name: 'Track your viewing' })
  await expect(track).toBeFocused()
  const attempts = calls(model, '/rest/v1/rpc/request_viewing', 'POST')
  expect(attempts).toHaveLength(2)
  expect(attempts[1].body).toEqual(attempts[0].body)
  expect(attempts[0].body.p_start_at).toBe('2035-07-22T06:00:00.000Z')
  expect(rows.size).toBe(1)
  expect(calls(model, '/rest/v1/bookings', 'POST')).toHaveLength(0)
  await track.click()
  await expect(page.getByRole('list', { name: 'My viewings' }).getByRole('listitem')).toBeFocused()
})

test('incoming requests recover from read errors and preserve confirmation details', async ({ page }) => {
  const { state, model } = await mockViewings(page, { actor: OWNER_ID, items: [appointment()] })
  state.failRead = true
  await page.goto('/viewings?tab=incoming#viewing-' + appointmentId)
  await expect(page.getByRole('alert')).toContainText('load your viewings')
  state.failRead = false
  await page.getByRole('button', { name: 'Try again' }).click()
  const card = page.getByRole('list', { name: 'Incoming viewings' }).getByRole('listitem')
  await expect(card).toBeFocused()
  await card.getByRole('button', { name: 'Confirm viewing' }).click()
  const dialog = page.getByRole('dialog', { name: 'Confirm viewing' })
  await dialog.getByLabel('Private meeting details (optional)').fill('Meet at the public counter')
  await dialog.getByRole('button', { name: 'Review details' }).click()
  await dialog.getByRole('button', { name: 'Confirm viewing' }).click()
  await expect(card.getByText('Meet at the public counter')).toBeVisible()
  await expect(card.getByText('Confirmed', { exact: true })).toBeVisible()
  expect(calls(model, '/rest/v1/rpc/update_viewing', 'POST')[0].body).toMatchObject({
    p_appointment_id: appointmentId, p_revision: 1, p_action: 'confirm',
  })
})

test('renter accepts a proposal, can inspect the previous booking-free slot and cancel', async ({ page }) => {
  const { model } = await mockViewings(page, { items: [appointment({
    status: 'reschedule_proposed', revision: 3, confirmed_start_at: previousTime,
    confirmed_end_at: '2035-07-21T02:30:00Z', proposed_start_at: alternativeTime,
    proposed_details: 'Meet at the counter for the new time',
  })] })
  await page.goto('/viewings')
  await expect(page.locator('.viewing-status')).toHaveText('New time proposed')
  await page.getByRole('combobox', { name: 'Status' }).selectOption('upcoming')
  await expect(page.getByText('Confirmed slot')).toBeVisible()
  await page.getByRole('button', { name: 'Accept new time' }).click()
  const accept = page.getByRole('dialog', { name: 'Accept new time' })
  await accept.getByRole('button', { name: 'Review details' }).click()
  await accept.getByRole('button', { name: 'Accept new time' }).click()
  await expect(page.getByText('Meet at the counter for the new time')).toBeVisible()
  await page.getByText('Viewing history', { exact: true }).click()
  const prior = page.getByText('Viewing confirmed', { exact: true })
  await expect(prior).toBeVisible()
  await expect(prior.locator('..').locator('time').last()).toHaveAttribute('datetime', previousTime)
  await page.getByRole('button', { name: 'Cancel viewing' }).click()
  const cancel = page.getByRole('dialog', { name: 'Cancel viewing' })
  await cancel.getByRole('button', { name: 'Review details' }).click()
  await cancel.getByRole('button', { name: 'Cancel viewing' }).click()
  await expect(page.getByText('No viewings here')).toBeVisible()
  await page.getByRole('combobox', { name: 'Status' }).selectOption('cancelled')
  await expect(page.locator('.viewing-status')).toHaveText('Cancelled')
  await page.getByRole('combobox', { name: 'Status' }).selectOption('confirmed')
  await expect(page.getByText('No viewings here')).toBeVisible()
  expect(calls(model, '/rest/v1/rpc/update_viewing', 'POST').map(call => call.body.p_revision)).toEqual([3, 4])
})

test('viewing request login returns to the rental and honors unavailable listings', async ({ page }) => {
  const { model } = await mockViewings(page, { actor: null })
  await page.goto('/listings/' + LISTING_ID)
  await page.getByRole('link', { name: 'Log in to request a viewing' }).click()
  await page.getByLabel('Email', { exact: true }).fill('renter@example.test')
  await page.getByLabel('Password', { exact: true }).fill('fixture-password')
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Request a viewing' })).toBeVisible()
  await expect(page).toHaveURL('/listings/' + LISTING_ID)
  model.listing.status = 'unavailable'
  await page.reload()
  await expect(page.getByText('Currently unavailable', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Request a viewing' })).toHaveCount(0)
  expect(calls(model, '/rest/v1/rpc/request_viewing', 'POST')).toHaveLength(0)
})
