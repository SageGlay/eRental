import { expect } from '@playwright/test'
import { apiError, json, listing, mockMarketplace, OWNER_ID, sessionFor, test, USER_ID } from './fixtures.js'

const second = { ...listing, id: '33333333-3333-4333-8333-333333333334', title: 'Rental tripod', status: 'unavailable' }
const removed = { ...listing, id: '33333333-3333-4333-8333-333333333335', title: 'Removed private item', status: 'removed' }

async function savedFixture(page, { signedIn = true, initial = [], inventory = [listing, second, removed] } = {}) {
  const state = { rows: new Map([[USER_ID, new Set(initial)], [OWNER_ID, new Set()]]), writes: [], failRead: false, failWrite: false, uncertain: false }
  await mockMarketplace(page, async (route, { url, method, body }) => {
    if (url.pathname.endsWith('/auth/v1/token')) {
      await json(route, sessionFor(body.email === 'owner@example.test' ? OWNER_ID : USER_ID))
      return true
    }
    if (url.pathname === '/rest/v1/listings' && url.searchParams.get('id')?.startsWith('in.')) {
      const ids = url.searchParams.get('id').slice(4, -1).replaceAll('"', '').split(',')
      await json(route, inventory.filter(item => ids.includes(item.id) && item.status !== 'removed' && !item.removed_by_admin))
      return true
    }
    if (url.pathname !== '/rest/v1/saved_listings' || method === 'OPTIONS') return false
    const token = route.request().headers().authorization?.split('.')[1]
    const userId = token && JSON.parse(Buffer.from(token, 'base64').toString()).sub
    const collection = state.rows.get(userId)
    if (!collection) { await apiError(route, 'Sign in', 401); return true }
    if (method === 'GET') {
      expect(url.searchParams.get('user_id')).toBe('eq.' + userId)
      if (state.failRead) { await apiError(route, 'Cannot load', 403); return true }
      const data = inventory.filter(item => collection.has(item.id))
      await json(route, data.map(item => ({
        listing_id: item.id, created_at: '2026-11-20T00:00:00Z',
        listings: item.status === 'removed' || item.removed_by_admin ? null : { category_id: item.category_id, status: item.status, removed_by_admin: item.removed_by_admin },
      })))
      return true
    }
    state.writes.push(method)
    if (state.failWrite) { await apiError(route, 'Denied', 403); return true }
    if (method === 'POST') {
      expect(body).toEqual({ user_id: userId, listing_id: expect.any(String) })
      if (collection.has(body.listing_id)) { await apiError(route, 'Already saved', 409, '23505'); return true }
      collection.add(body.listing_id)
    } else if (method === 'DELETE') {
      expect(url.searchParams.get('user_id')).toBe('eq.' + userId)
      collection.delete(url.searchParams.get('listing_id').slice(3))
    }
    if (state.uncertain) await apiError(route, 'Response lost after commit', 400)
    else await route.fulfill({ status: method === 'POST' ? 201 : 204 })
    return true
  }, { signedIn })
  return state
}

async function login(page, email) {
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill('fixture-only-password')
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
}

test('bookmark controls stay separate from listing navigation and reflect the persisted collection', async ({ page }) => {
  const state = await savedFixture(page)
  await page.goto('/')
  const card = page.getByRole('region', { name: 'Latest listings' }).locator('.bookmark-card').first()
  const save = card.getByRole('button', { name: 'Save listing: Camera for rent' })
  await expect(save).toBeEnabled()
  await save.evaluate(button => { button.click(); button.click() })
  await expect(page).toHaveURL(/\/$/)
  await expect(card.getByRole('button', { name: 'Remove from saved: Camera for rent' })).toHaveAttribute('aria-pressed', 'true')
  expect(state.writes).toEqual(['POST'])
  await card.getByRole('link').click()
  await expect(page.getByRole('button', { name: 'Remove from saved: Camera for rent' })).toBeVisible()
  await page.goto('/saved')
  await expect(page.getByRole('heading', { name: listing.title })).toBeVisible()
  await page.reload()
  await expect(page.getByText('Tibanga, Iligan City')).toBeVisible()
  await page.getByRole('button', { name: 'Remove from saved: Camera for rent' }).click()
  await expect(page.getByRole('heading', { name: 'No saved listings yet' })).toBeVisible()
  expect(state.writes).toEqual(['POST', 'DELETE'])
})

test('guest bookmark returns to the rental after login and waits for an explicit save', async ({ page }) => {
  const state = await savedFixture(page, { signedIn: false })
  await page.goto('/')
  await page.getByRole('region', { name: 'Latest listings' }).getByRole('button', { name: 'Log in to save Camera for rent' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await login(page, 'renter@example.test')
  await expect(page).toHaveURL(new RegExp('/listings/' + listing.id + '$'))
  await expect(page.getByRole('button', { name: 'Save listing: Camera for rent' })).toBeEnabled()
  expect(state.writes).toEqual([])
})

test('saved listings recover from read failures, show unavailable rentals and omit removed items', async ({ page }) => {
  const state = await savedFixture(page, { initial: [second.id, removed.id] })
  state.failRead = true
  await page.goto('/saved')
  await expect(page.getByRole('alert')).toContainText('couldn’t load your saved listings')
  await expect(page.getByRole('heading', { name: 'No saved listings yet' })).toHaveCount(0)
  state.failRead = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { name: second.title })).toBeVisible()
  await expect(page.getByText('Currently unavailable')).toBeVisible()
  await expect(page.getByText(removed.title)).toHaveCount(0)
  await expect(page.locator('a[href*="' + removed.id + '"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Remove from saved', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Listing no longer visible' })).toHaveCount(0)
  expect(state.rows.get(USER_ID).has(removed.id)).toBe(false)

  state.failWrite = true
  await page.getByRole('button', { name: 'Remove from saved: Rental tripod' }).click()
  await expect(page.getByRole('alert')).toContainText('couldn’t confirm that change')
  await expect(page.getByRole('button', { name: 'Remove from saved: Rental tripod' })).toBeEnabled()
  expect(state.rows.get(USER_ID).has(second.id)).toBe(true)
})

test('an uncertain save response reconciles with the server before offering another change', async ({ page }) => {
  const state = await savedFixture(page)
  state.uncertain = true
  await page.goto('/listings/' + listing.id)
  await page.getByRole('button', { name: 'Save listing: Camera for rent' }).click()
  await expect(page.getByRole('alert')).toContainText('couldn’t confirm that change')
  await expect(page.getByRole('button', { name: 'Remove from saved: Camera for rent' })).toBeEnabled()
  expect(state.writes).toEqual(['POST'])
  await page.goto('/saved')
  await expect(page.getByRole('heading', { name: listing.title })).toBeVisible()
})

test('saved rentals are cleared on logout and remain private when another account signs in', async ({ page }) => {
  const state = await savedFixture(page, { initial: [second.id] })
  await page.goto('/saved')
  await expect(page.getByRole('heading', { name: second.title })).toBeVisible()
  await page.getByLabel('My account', { exact: true }).click()
  await page.getByRole('button', { name: 'Log out', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await login(page, 'owner@example.test')
  await page.goto('/saved')
  await expect(page.getByRole('heading', { name: 'No saved listings yet' })).toBeVisible()
  await expect(page.getByRole('heading', { name: second.title })).toHaveCount(0)
  expect(state.rows.get(USER_ID).has(second.id)).toBe(true)
})
