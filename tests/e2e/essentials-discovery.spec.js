import { expect } from '@playwright/test'
import { json, listing, mockMarketplace, OWNER_ID, sessionFor, test, USER_ID } from './fixtures.js'

const id = n => 'aaaaaaaa-aaaa-4aaa-8aaa-' + String(n).padStart(12, '0')
function rental(n, title, category, overrides = {}) {
  return {
    ...listing, id: id(n), title, category_id: category,
    categories: { id: category, name: 'Category ' + category, slug: 'category-' + category },
    created_at: '2026-11-' + String(21 - n).padStart(2, '0') + 'T00:00:00Z',
    ...overrides,
  }
}

const stock = [
  rental(1, 'Cordless drill', 1, {
    profiles: { display_name: 'Mika', account_type: 'business', business_name: 'Mika Tools', verified_kind: 'business', verified_at: '2026-11-01T00:00:00Z' },
    listing_photos: [{ storage_path: 'fixtures/drill.png', sort_order: 0 }],
  }),
  rental(2, 'Ladder', 1), rental(3, 'Work light', 1), rental(4, 'Paddle', 2),
  rental(5, 'Kayak', 2), rental(6, 'Removed rental', 1, { status: 'removed' }),
  rental(7, 'Unavailable rental', 2, { status: 'unavailable' }),
  rental(8, 'Moderated rental', 1, { removed_by_admin: true }),
]

async function installInventory(page, signedIn, { failHistoryClear = false } = {}) {
  const histories = new Map()
  const bookmarks = new Map()
  const model = await mockMarketplace(page, async (route, { url, method, body }) => {
    const path = url.pathname
    const params = url.searchParams
    const actor = route.request().headers().authorization?.split(' ')[1]
    let user
    if (actor?.includes('.')) user = JSON.parse(Buffer.from(actor.split('.')[1], 'base64url')).sub
    if (path === '/rest/v1/rpc/record_listing_view') {
      histories.set(user, [body.p_listing_id, ...(histories.get(user) || []).filter(value => value !== body.p_listing_id)])
      await json(route, null)
      return true
    }
    if (path === '/rest/v1/recently_viewed_listings') {
      expect(params.get('user_id')).toBe('eq.' + user)
      if (method === 'DELETE') {
        if (failHistoryClear) { await json(route, { message: 'Unavailable' }, 403); return true }
        histories.set(user, [])
      }
      await json(route, (histories.get(user) || []).map(listingId => ({ listing_id: listingId, listings: stock.find(l => l.id === listingId) })))
      return true
    }
    if (path === '/rest/v1/saved_listings') {
      if (method === 'POST') bookmarks.set(user, [...new Set([...(bookmarks.get(user) || []), body.listing_id])])
      const rows = (bookmarks.get(user) || []).map(listingId => ({ listing_id: listingId, created_at: '2026-11-20T00:00:00Z', listings: stock.find(l => l.id === listingId) }))
      await json(route, method === 'POST' ? null : rows, method === 'POST' ? 201 : 200)
      return true
    }
    if (path !== '/rest/v1/listings') return false
    const listingFilter = params.get('id')
    if (listingFilter?.startsWith('eq.')) {
      const row = stock.find(item => item.id === listingFilter.slice(3))
      await json(route, row ? [row] : [])
      return true
    }
    let rows = stock.filter(item => item.status !== 'removed' && !item.removed_by_admin)
    if (listingFilter?.startsWith('in.')) rows = rows.filter(item => listingFilter.includes(item.id))
    if (params.has('category_id')) {
      expect(params.get('status')).toBe('eq.available')
      rows = rows.filter(item => item.category_id === Number(params.get('category_id').slice(3)) && item.status === 'available')
    }
    expect(params.get('removed_by_admin')).toBe('eq.false')
    await json(route, rows)
    return true
  }, { signedIn })
  return { model, histories, bookmarks }
}

test('discovery features a photographed available rental, real public owner and badge, with recent inventory as the fallback', async ({ page }) => {
  await installInventory(page, false)
  await page.goto('/')
  const featured = page.getByRole('region', { name: 'Featured listings' })
  await expect(featured.getByRole('link', { name: /Cordless drill/ })).toHaveAttribute('href', '/listings/' + id(1))
  await expect(featured.getByText('Listed by Mika Tools')).toBeVisible()
  await expect(featured.getByText('Business verified')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Latest listings' }).getByRole('heading', { name: 'Ladder' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'From your categories' })).toHaveCount(0)
  await expect(page.getByText('Removed rental', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Moderated rental', { exact: true })).toHaveCount(0)
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 880 })
    const overflows = await featured.locator('li').evaluateAll(cards => cards.some(card => {
      const caption = card.querySelector('.discovery-owner')
      return caption.getBoundingClientRect().bottom > card.getBoundingClientRect().bottom + 1
    }))
    expect(overflows, `featured owner caption at ${width}px`).toBe(false)
  }
})

test('only a successful visible guest detail records a view, recommends its category and clears it on request', async ({ page }) => {
  const { model } = await installInventory(page, false)
  for (const n of [6, 8, 10]) {
    await page.goto('/listings/' + id(n))
    await expect(page.getByRole('heading', { name: n === 10 ? 'Listing not found' : stock.find(l => l.id === id(n)).title })).toBeVisible()
  }
  await page.goto('/listings/' + id(4))
  await expect(page.getByRole('heading', { name: 'Paddle', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Paddle', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Home', exact: true }).click()
  const recent = page.getByRole('region', { name: 'Recently viewed' })
  await expect(recent.getByRole('heading', { level: 3 })).toHaveCount(1)
  await expect(recent.getByRole('heading', { name: 'Paddle', exact: true })).toBeVisible()
  const matches = page.getByRole('region', { name: 'From your categories' })
  await expect(matches.getByRole('heading', { name: 'Kayak' })).toBeVisible()
  await expect(matches.getByRole('heading', { name: 'Unavailable rental' })).toHaveCount(0)
  await recent.getByRole('button', { name: 'Clear history' }).click()
  await expect(recent).toHaveCount(0)
  await expect(matches).toHaveCount(0)
  expect(model.calls.some(call => call.path.includes('record_listing_view'))).toBeFalsy()
})

test('member recommendations combine viewed and saved categories and switch to the next account’s own history', async ({ page }) => {
  const { histories, bookmarks } = await installInventory(page, true)
  await page.goto('/')
  await page.getByRole('button', { name: 'Save listing: Ladder' }).click()
  await expect(page.getByRole('button', { name: 'Remove from saved: Ladder' })).toBeVisible()
  await page.goto('/listings/' + id(4))
  await expect.poll(() => histories.get(USER_ID)).toEqual([id(4)])
  await page.getByRole('link', { name: 'Home', exact: true }).click()
  const matches = page.getByRole('region', { name: 'From your categories' })
  await expect(matches.getByRole('heading', { name: 'Work light' })).toBeVisible()
  await expect(matches.getByRole('heading', { name: 'Kayak' })).toBeVisible()
  const ids = await matches.getByRole('link').evaluateAll(links => links.map(link => link.pathname))
  expect(ids).toEqual([...new Set(ids)])
  expect(bookmarks.get(USER_ID)).toEqual([id(2)])
  await page.evaluate(session => localStorage.setItem('sb-test-project-auth-token', JSON.stringify(session)), sessionFor(OWNER_ID))
  await page.reload()
  await expect(page.getByRole('region', { name: 'Latest listings' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save listing: Ladder' })).toBeEnabled()
  await expect(page.getByRole('region', { name: 'Recently viewed' })).toHaveCount(0)
  await expect(matches).toHaveCount(0)
})

test('a failed private history clear retains the member’s confirmed recently viewed rental', async ({ page }) => {
  const { histories } = await installInventory(page, true, { failHistoryClear: true })
  histories.set(USER_ID, [id(5)])
  await page.goto('/')
  const recent = page.getByRole('region', { name: 'Recently viewed' })
  await recent.getByRole('button', { name: 'Clear history' }).click()
  await expect(recent.getByRole('alert')).toContainText('couldn’t clear')
  await expect(recent.getByRole('heading', { name: 'Kayak' })).toBeVisible()
  expect(histories.get(USER_ID)).toEqual([id(5)])
})
