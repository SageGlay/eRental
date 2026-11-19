import { expect } from '@playwright/test'
import { json, listing, LISTING_ID, mockMarketplace, searchRows, test } from './fixtures.js'

test('removing one applied filter keeps the other constraints, restores focus, and supports Back', async ({ page }) => {
  const model = await mockMarketplace(page, async (route, { url }) => {
    if (!url.pathname.endsWith('/search_listings')) return false
    await json(route, searchRows('local', 1))
    return true
  })
  await page.goto('/listings?q=camera&category=electronics-gadgets&location=Tibanga&min=0&per=day&sort=price_desc')
  const filters = page.getByRole('list', { name: 'Active filters' })
  const minimum = filters.getByRole('button', { name: 'Remove From ₱0' })
  await filters.getByRole('button', { name: 'Remove Area · Tibanga' }).click()
  await expect(minimum).toBeFocused()
  await expect.poll(() => model.calls.filter(call => call.path.endsWith('/search_listings')).at(-1)?.body).toMatchObject({
    p_category: 1, p_location: null, p_query: 'camera', p_min_price: 0, p_period: 'day', p_sort: 'price_desc',
  })
  await page.goBack()
  await expect(filters.getByRole('button', { name: 'Remove Area · Tibanga' })).toBeVisible()
  await expect(page.getByLabel('Location', { exact: true })).toHaveValue('Tibanga')
})

test('the last removed filter leaves keyboard focus at the results and preserves sorting', async ({ page }) => {
  await mockMarketplace(page)
  await page.goto('/listings?location=Tibanga&sort=price_asc')
  await page.getByRole('button', { name: 'Remove Area · Tibanga' }).click()
  await expect(page.getByRole('heading', { name: 'All rentals', exact: true })).toBeFocused()
  await expect(page).toHaveURL(/listings\?sort=price_asc$/)
})

test('the listing index links to rates, the owner and reviews on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockMarketplace(page)
  await page.goto('/listings/' + LISTING_ID)
  const index = page.getByRole('navigation', { name: 'On this listing' })
  await index.getByRole('link', { name: 'Rental rate & dates' }).click()
  await expect(page.getByRole('complementary', { name: 'Rental rate and booking' })).toBeFocused()
  await index.getByRole('link', { name: 'Owner', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Listed by' })).toBeFocused()
  await expect(page.getByRole('button', { name: 'Message the owner' })).toBeVisible()
  await index.getByRole('link', { name: 'Reviews', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Listing reviews' })).toBeFocused()
})

test('latest listings recover in place and only confirm an empty feed after a successful read', async ({ page }) => {
  // PostgREST retries temporary server failures before the feed's 15s deadline.
  test.setTimeout(35000)
  let fail = true
  await mockMarketplace(page, async (route, { url }) => {
    if (url.pathname !== '/rest/v1/listings') return false
    await json(route, fail ? { message: 'Temporarily unavailable' } : [], fail ? 503 : 200)
    return true
  })
  await page.goto('/')
  const latest = page.getByRole('region', { name: 'Latest listings' })
  await expect(latest.getByRole('alert')).toContainText('couldn’t load the latest listings', { timeout: 20000 })
  await expect(latest.getByRole('heading', { name: 'No listings yet' })).toHaveCount(0)
  fail = false
  await latest.getByRole('button', { name: 'Try again' }).click()
  await expect(latest.getByRole('heading', { name: 'No listings yet' })).toBeVisible()
  await expect(latest.getByRole('link', { name: 'List an item' })).toBeVisible()
})

test('a listing card shows an owner badge only when the public profile confirms its kind and date', async ({ page }) => {
  await mockMarketplace(page, async (route, { url }) => {
    if (url.pathname !== '/rest/v1/listings') return false
    expect(url.searchParams.get('select')).toContain('profiles(verified_kind,verified_at)')
    await json(route, [
      { ...listing, profiles: { verified_kind: 'identity', verified_at: '2026-01-01T00:00:00Z' } },
      { ...listing, id: 'unverified', title: 'Tripod', profiles: { verified_kind: 'identity', verified_at: null } },
    ])
    return true
  }, { signedIn: false })
  await page.goto('/')
  const latest = page.getByRole('region', { name: 'Latest listings' })
  await expect(latest.getByText('Identity verified', { exact: true })).toHaveCount(1)
  await expect(latest.getByRole('link').filter({ hasText: 'Tripod' })).not.toContainText('verified')
})
