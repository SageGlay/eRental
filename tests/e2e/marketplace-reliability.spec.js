import { expect } from '@playwright/test'
import { test, apiError, calls, fillListing, json, LISTING_ID, mockMarketplace, png, searchRows, USER_ID } from './fixtures.js'

test('retry after a partial photo upload saves one listing and only retries the failed photo', async ({ page }) => {
  let uploads = 0
  const model = await mockMarketplace(page, async (route, { url, method }) => {
    if (url.pathname.startsWith('/storage/v1/object/') && method === 'POST' && ++uploads === 2) {
      await apiError(route); return true
    }
    return false
  })
  await page.goto('/list')
  await fillListing(page)
  await page.getByLabel('Add photos').setInputFiles([png, { ...png, name: 'lens.png' }])
  await page.getByRole('button', { name: 'Publish listing' }).click()
  await expect(page.getByRole('alert')).toContainText('1 photo change didn’t go through')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page).toHaveURL(/\/listings\//)
  expect(calls(model, '/rest/v1/listings', 'POST')).toHaveLength(1)
  expect(calls(model, '/rest/v1/listings', 'PATCH')).toHaveLength(1)
  expect(model.photos).toHaveLength(2)
  expect(uploads).toBe(3)
})

test('photo metadata failure retries that metadata without uploading the file again', async ({ page }) => {
  let rows = 0
  const model = await mockMarketplace(page, async (route, { url, method }) => {
    if (url.pathname === '/rest/v1/listing_photos' && method === 'POST' && ++rows === 1) { await apiError(route); return true }
    return false
  })
  await page.goto('/list')
  await fillListing(page)
  await page.getByLabel('Add photos').setInputFiles(png)
  await page.getByRole('button', { name: 'Publish listing' }).click()
  await expect(page.getByRole('alert')).toContainText('Your listing was saved')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page).toHaveURL(/\/listings\//)
  expect(calls(model, '/rest/v1/listing_photos', 'POST')).toHaveLength(2)
  expect(model.calls.filter((c) => c.path.startsWith('/storage/v1/object/') && c.method === 'POST')).toHaveLength(1)
  expect(model.photos).toHaveLength(1)
})

test('a lost listing-insert response reuses the same UUID and reconciles the existing listing', async ({ page }) => {
  let first = true
  const model = await mockMarketplace(page, async (route, { url, method, body, model }) => {
    if (url.pathname === '/rest/v1/listings' && method === 'POST' && first) {
      first = false; model.listings.set(body.id, body)
      await apiError(route); return true
    }
    return false
  })
  await page.goto('/list')
  await fillListing(page)
  await page.getByRole('button', { name: 'Publish listing' }).click()
  await expect(page.getByRole('alert')).toContainText('couldn’t confirm')
  await page.getByRole('button', { name: 'Publish listing' }).click()
  await expect(page).toHaveURL(/\/listings\//)
  const inserts = calls(model, '/rest/v1/listings', 'POST')
  expect(inserts).toHaveLength(2)
  expect(inserts[0].body.id).toBe(inserts[1].body.id)
  expect(model.listings.size).toBe(1)
  expect(calls(model, '/rest/v1/listings', 'PATCH')[0].search).toContain(`owner_id=eq.${USER_ID}`)
})

test('a lost tenth-photo response is reconciled before the database photo-limit trigger can reject retry', async ({ page }) => {
  let lost = false
  const model = await mockMarketplace(page, async (route, { url, method, body, model }) => {
    if (url.pathname !== '/rest/v1/listing_photos' || method !== 'POST') return false
    if (model.photos.length >= 10) {
      await apiError(route, 'A listing can have at most 10 photos', 400, 'P0001'); return true
    }
    if (model.photos.length === 9 && !lost) {
      model.photos.push(body); lost = true
      await apiError(route); return true
    }
    return false
  })
  await page.goto('/list')
  await fillListing(page)
  await page.getByLabel('Add photos').setInputFiles(Array.from({ length: 10 }, (_, i) => ({ ...png, name: `photo-${i}.png` })))
  await page.getByRole('button', { name: 'Publish listing' }).click()
  await expect(page.getByRole('alert')).toContainText('1 photo change didn’t go through')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page).toHaveURL(/\/listings\//)
  expect(model.photos).toHaveLength(10)
  expect(calls(model, '/rest/v1/listing_photos', 'POST')).toHaveLength(10)
})

test('storage cleanup failure stays pending and retries without repeating a successful photo-row delete', async ({ page }) => {
  let removes = 0
  const model = await mockMarketplace(page, async (route, { url, method }) => {
    if (url.pathname.startsWith('/storage/v1/object/') && method === 'DELETE' && ++removes === 1) { await apiError(route); return true }
    return false
  })
  model.listing.owner_id = USER_ID
  model.photos = [{ id: '44444444-4444-4444-8444-444444444444', storage_path: `${USER_ID}/${LISTING_ID}/photo.png`, sort_order: 0 }]
  await page.goto(`/listings/${LISTING_ID}/edit`)
  await page.getByRole('button', { name: 'Remove current photo 1' }).click()
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('photo change didn’t go through')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/listings/${LISTING_ID}$`))
  expect(calls(model, '/rest/v1/listing_photos', 'DELETE')).toHaveLength(1)
  expect(removes).toBe(2)
})

test('failed availability disables booking, retry recovers without losing entered dates', async ({ page }) => {
  let failing = true
  const model = await mockMarketplace(page, async (route, { url }) => {
    if (url.pathname.endsWith('/listing_booked_ranges') && failing) { await apiError(route); return true }
    return false
  })
  await page.goto(`/listings/${LISTING_ID}`)
  const form = page.locator('.request-form')
  await expect(form.getByRole('alert')).toContainText('couldn’t check')
  await form.getByLabel('From', { exact: true }).fill('2099-01-10')
  await form.getByLabel('Until (inclusive)').fill('2099-01-11')
  await expect(form.getByRole('button', { name: 'Send request' })).toBeDisabled()
  expect(calls(model, '/rest/v1/bookings', 'POST')).toHaveLength(0)
  failing = false
  await form.getByRole('button', { name: 'Try again' }).click()
  await expect(form.getByRole('button', { name: 'Send request' })).toBeEnabled()
  await expect(form.getByLabel('From', { exact: true })).toHaveValue('2099-01-10')
  await form.evaluate((node) => { node.requestSubmit(); node.requestSubmit() })
  await expect(page.getByRole('status').filter({ hasText: 'Request sent!' })).toBeVisible()
  expect(calls(model, '/rest/v1/bookings', 'POST')).toHaveLength(1)
})

test('a new booking found by the submit-time recheck blocks an overlapping request', async ({ page }) => {
  let booked = false
  const model = await mockMarketplace(page, async (route, { url }) => {
    if (url.pathname.endsWith('/listing_booked_ranges')) {
      await json(route, booked ? [{ start_date: '2099-01-10', end_date: '2099-01-12' }] : []); return true
    }
    return false
  })
  await page.goto(`/listings/${LISTING_ID}`)
  const form = page.locator('.request-form')
  await expect(form.getByRole('button', { name: 'Send request' })).toBeEnabled()
  await form.getByLabel('From', { exact: true }).fill('2099-01-11')
  await form.getByLabel('Until (inclusive)').fill('2099-01-13')
  booked = true
  await form.getByRole('button', { name: 'Send request' }).click()
  await expect(form.getByRole('alert')).toContainText('overlap')
  expect(calls(model, '/rest/v1/bookings', 'POST')).toHaveLength(0)
})

test('availability failure during submission never falls through to booking insert', async ({ page }) => {
  let failing = false
  const model = await mockMarketplace(page, async (route, { url }) => {
    if (url.pathname.endsWith('/listing_booked_ranges') && failing) { await apiError(route); return true }
    return false
  })
  await page.goto(`/listings/${LISTING_ID}`)
  const form = page.locator('.request-form')
  await expect(form.getByRole('button', { name: 'Send request' })).toBeEnabled()
  await form.getByLabel('From', { exact: true }).fill('2099-01-11')
  await form.getByLabel('Until (inclusive)').fill('2099-01-13')
  failing = true
  await form.getByRole('button', { name: 'Send request' }).click()
  await expect(form.getByRole('alert')).toContainText('couldn’t check')
  expect(calls(model, '/rest/v1/bookings', 'POST')).toHaveLength(0)
})

test('a delayed Load more response from old filters never appears in new results', async ({ page }) => {
  let release
  let started
  const pending = new Promise((resolve) => { release = resolve })
  const requested = new Promise((resolve) => { started = resolve })
  await mockMarketplace(page, async (route, { url, body }) => {
    if (!url.pathname.endsWith('/search_listings')) return false
    if (body.p_query === 'new') { await json(route, searchRows('new', 1)); return true }
    if (body.p_offset > 0) { started(); await pending; await json(route, searchRows('old-next', 1, 13)); return true }
    await json(route, searchRows('old', 12, 13)); return true
  })
  await page.goto('/listings')
  await page.getByRole('button', { name: 'Load more', exact: true }).click()
  await requested
  await page.getByRole('searchbox', { name: 'Search', exact: true }).fill('new')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'new result 0' })).toBeVisible()
  release()
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await expect(page.locator('.listing-card')).toHaveCount(1)
  await expect(page.getByText('old-next result 0')).toHaveCount(0)
})

test('Load more failure preserves results/count and retry uses the same offset', async ({ page }) => {
  let failing = true
  const model = await mockMarketplace(page, async (route, { url, body }) => {
    if (!url.pathname.endsWith('/search_listings')) return false
    if (!body.p_offset) { await json(route, searchRows('first', 12, 13)); return true }
    if (failing) await apiError(route)
    else await json(route, searchRows('last', 1, 13))
    return true
  })
  await page.goto('/listings')
  await page.getByRole('button', { name: 'Load more', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('current results are still here')
  await expect(page.locator('.listing-card')).toHaveCount(12)
  await expect(page.locator('.results__count')).toHaveText('13 listings found')
  failing = false
  await page.getByRole('button', { name: 'Try loading more again' }).click()
  await expect(page.locator('.listing-card')).toHaveCount(13)
  expect(calls(model, '/rest/v1/rpc/search_listings', 'POST').filter((c) => c.body.p_offset > 0).map((c) => c.body.p_offset)).toEqual([12, 12])
})

test('initial search failure can be retried without changing filters', async ({ page }) => {
  let failing = true
  await mockMarketplace(page, async (route, { url }) => {
    if (!url.pathname.endsWith('/search_listings')) return false
    if (failing) await apiError(route)
    else await json(route, searchRows('recovered', 1))
    return true
  })
  await page.goto('/listings?q=camera')
  await expect(page.getByRole('alert')).toContainText('couldn’t load listings')
  failing = false
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'recovered result 0' })).toBeVisible()
  await expect(page).toHaveURL(/q=camera/)
})

test('overlapping successful search pages advance by fetched rows instead of repeating the same offset', async ({ page }) => {
  const model = await mockMarketplace(page, async (route, { url, body }) => {
    if (!url.pathname.endsWith('/search_listings')) return false
    await json(route, body.p_offset < 24 ? searchRows('overlap', 12, 26) : searchRows('last', 2, 26))
    return true
  })
  await page.goto('/listings')
  await page.getByRole('button', { name: 'Load more', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Load more', exact: true })).toBeEnabled()
  await expect(page.locator('.listing-card')).toHaveCount(12)
  await page.getByRole('button', { name: 'Load more', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'last result 1' })).toBeVisible()
  await expect(page.locator('.listing-card')).toHaveCount(14)
  expect(calls(model, '/rest/v1/rpc/search_listings', 'POST').map((c) => c.body.p_offset)).toEqual([0, 12, 24])
  await expect(page.getByRole('button', { name: 'Load more', exact: true })).toHaveCount(0)
})

test('an empty next page stops loading more when the catalog shrinks', async ({ page }) => {
  await mockMarketplace(page, async (route, { url, body }) => {
    if (!url.pathname.endsWith('/search_listings')) return false
    await json(route, body.p_offset ? [] : searchRows('first', 12, 13))
    return true
  })
  await page.goto('/listings')
  await page.getByRole('button', { name: 'Load more', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Load more', exact: true })).toHaveCount(0)
  await expect(page.locator('.listing-card')).toHaveCount(12)
})
