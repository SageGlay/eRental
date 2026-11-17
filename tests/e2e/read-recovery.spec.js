import { expect } from '@playwright/test'
import { test, apiError, calls, json, LISTING_ID, mockMarketplace, searchRows, USER_ID } from './fixtures.js'

for (const edit of [false, true]) {
  test(`${edit ? 'edit' : 'detail'} query failure offers retry instead of a false missing/denied record`, async ({ page }) => {
    let failing = true
    const model = await mockMarketplace(page, async (route, { url, method }) => {
      if (url.pathname === '/rest/v1/listings' && method === 'GET' && failing) { await apiError(route, 'Denied', 403); return true }
      return false
    })
    model.listing.owner_id = USER_ID
    await page.goto(`/listings/${LISTING_ID}${edit ? '/edit' : ''}`)
    await expect(page.getByRole('alert')).toContainText('couldn’t load this listing')
    await expect(page.getByText('Listing not found', { exact: true })).toHaveCount(0)
    await expect(page.getByText('You can’t edit this listing', { exact: true })).toHaveCount(0)
    failing = false
    await page.getByRole('button', { name: 'Try again', exact: true }).click()
    if (edit) await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Camera for rent')
    else await expect(page.getByRole('heading', { name: 'Camera for rent', exact: true })).toBeVisible()
  })
}

test('a genuinely missing listing still shows the existing missing-record state', async ({ page }) => {
  await mockMarketplace(page, async (route, { url, method }) => {
    if (url.pathname === '/rest/v1/listings' && method === 'GET') { await json(route, []); return true }
    return false
  })
  await page.goto(`/listings/${LISTING_ID}`)
  await expect(page.getByRole('heading', { name: 'Listing not found' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('owner checks still reject editing another owner’s listing', async ({ page }) => {
  await mockMarketplace(page)
  await page.goto(`/listings/${LISTING_ID}/edit`)
  await expect(page.getByRole('heading', { name: 'You can’t edit this listing' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0)
})

test('a category failure never submits an unknown category or claims no results', async ({ page }) => {
  let failing = true
  const model = await mockMarketplace(page, async (route, { url }) => {
    if (url.pathname === '/rest/v1/categories' && failing) { await apiError(route, 'Denied', 403); return true }
    if (url.pathname.endsWith('/search_listings')) { await json(route, searchRows('category', 1)); return true }
    return false
  })
  await page.goto('/listings?category=electronics-gadgets&q=camera')
  await expect(page.getByRole('alert')).toContainText('couldn’t load the categories')
  await expect(page.getByRole('heading', { name: 'No listings match your search' })).toHaveCount(0)
  expect(calls(model, '/rest/v1/rpc/search_listings', 'POST')).toHaveLength(0)
  failing = false
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'category result 0' })).toBeVisible()
  expect(calls(model, '/rest/v1/rpc/search_listings', 'POST').every((c) => c.body.p_category === 1)).toBe(true)
  await expect(page).toHaveURL(/category=electronics-gadgets&q=camera/)
})

test('category recovery in the create form retains draft fields and re-enables saving', async ({ page }) => {
  let failing = true
  await mockMarketplace(page, async (route, { url }) => {
    if (url.pathname === '/rest/v1/categories' && failing) { await apiError(route, 'Denied', 403); return true }
    return false
  })
  await page.goto('/list')
  await expect(page.getByRole('alert')).toContainText('couldn’t load the categories')
  await page.getByLabel('Title', { exact: true }).fill('Preserved draft')
  await expect(page.getByRole('button', { name: 'Publish listing' })).toBeDisabled()
  failing = false
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Publish listing' })).toBeEnabled()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Preserved draft')
})

test('availability timeout leaves a recoverable blocked state, not false free dates', async ({ page }) => {
  let release
  let started
  const pending = new Promise((resolve) => { release = resolve })
  const received = new Promise((resolve) => { started = resolve })
  await page.clock.install()
  const model = await mockMarketplace(page, async (route, { url }) => {
    if (url.pathname.endsWith('/listing_booked_ranges')) { started(); await pending; await json(route, []); return true }
    return false
  })
  await page.goto(`/listings/${LISTING_ID}`)
  await received
  await page.clock.fastForward(16000)
  await expect(page.locator('.request-form').getByRole('alert')).toContainText('couldn’t check')
  await expect(page.getByRole('button', { name: 'Send request' })).toBeDisabled()
  expect(calls(model, '/rest/v1/bookings', 'POST')).toHaveLength(0)
  release()
})

test('malformed availability data cannot crash the form or be interpreted as free dates', async ({ page }) => {
  const model = await mockMarketplace(page, async (route, { url }) => {
    if (url.pathname.endsWith('/listing_booked_ranges')) { await json(route, [{ start_date: 'invalid', end_date: '2099-01-13' }]); return true }
    return false
  })
  await page.goto(`/listings/${LISTING_ID}`)
  await expect(page.locator('.request-form').getByRole('alert')).toContainText('couldn’t check')
  await expect(page.getByRole('button', { name: 'Send request' })).toBeDisabled()
  expect(calls(model, '/rest/v1/bookings', 'POST')).toHaveLength(0)
})
