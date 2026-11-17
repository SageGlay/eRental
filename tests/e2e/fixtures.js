export const USER_ID = '11111111-1111-4111-8111-111111111111'
export const OWNER_ID = '22222222-2222-4222-8222-222222222222'
export const LISTING_ID = '33333333-3333-4333-8333-333333333333'
export const categories = [{ id: 1, slug: 'electronics-gadgets', name: 'Electronics and Gadgets' }]
export const profile = { id: USER_ID, display_name: 'Test renter', account_type: 'individual', business_name: null }
export const listing = {
  id: LISTING_ID, owner_id: OWNER_ID, category_id: 1, title: 'Camera for rent', description: 'A camera with a lens and carrying case.',
  price: 200, price_period: 'day', deposit: 0, location_text: 'Tibanga, Iligan City', terms: '', details: {},
  status: 'available', removed_by_admin: false, created_at: '2026-01-01T00:00:00Z',
  categories: categories[0], profiles: { display_name: 'Test owner', account_type: 'individual', created_at: '2026-01-01T00:00:00Z' }, listing_photos: [],
}
export const png = { name: 'camera.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64') }
export const json = (route, data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data), headers: { 'access-control-allow-origin': '*' } })
export const apiError = (route, message = 'Temporarily unavailable', status = 503, code = 'TEST_FAILURE') => json(route, { message, code }, status)
export function sessionFor(userId = USER_ID) {
  const exp = Math.floor(Date.now() / 1000) + 3600
  const user = { id: userId, email: 'renter@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} }
  const token = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })) + '.' + btoa(JSON.stringify({ sub: userId, exp })) + '.fixture'
  return { access_token: token, refresh_token: 'fixture-refresh', expires_at: exp, expires_in: 3600, token_type: 'bearer', user }
}

export async function mockMarketplace(page, override = async () => false, { signedIn = true } = {}) {
  const model = { listing: structuredClone(listing), listings: new Map(), photos: [], calls: [] }
  if (signedIn) {
    await page.addInitScript(({ session }) => {
      if (localStorage.getItem('fixture-seeded')) return
      localStorage.setItem('fixture-seeded', 'true')
      localStorage.setItem('sb-test-project-auth-token', JSON.stringify(session))
    }, { session: sessionFor() })
  }
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ body: '', contentType: 'text/css' }))
  await page.route('https://test-project.supabase.co/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()
    const body = request.headers()['content-type']?.includes('application/json') ? request.postDataJSON() : null
    const call = { path: url.pathname, method, body, search: url.search }
    model.calls.push(call)
    if (await override(route, { url, method, body, model })) return
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
    if (url.pathname === '/auth/v1/logout') return json(route, {})
    if (url.pathname === '/rest/v1/rpc/is_admin') return json(route, false)
    if (url.pathname === '/rest/v1/rpc/listing_booked_ranges') return json(route, [])
    if (url.pathname === '/rest/v1/rpc/search_listings') return json(route, [])
    if (url.pathname === '/rest/v1/profiles') return json(route, request.headers().accept?.includes('vnd.pgrst.object') ? profile : [profile])
    if (url.pathname === '/rest/v1/categories') return json(route, categories)
    if (url.pathname === '/rest/v1/messages') return json(route, [])
    if (url.pathname === '/rest/v1/reviews') return json(route, [])
    if (url.pathname === '/rest/v1/listings') {
      if (method === 'POST') {
        if (model.listings.has(body.id)) return apiError(route, 'Duplicate ID', 409, '23505')
        model.listings.set(body.id, { ...body })
        return json(route, { id: body.id }, 201)
      }
      if (method === 'PATCH') {
        const id = url.searchParams.get('id').slice(3)
        model.listings.set(id, { ...model.listings.get(id), ...body })
        return json(route, { id })
      }
      return json(route, [{ ...model.listing, listing_photos: model.photos }])
    }
    if (url.pathname === '/rest/v1/listing_photos') {
      if (method === 'POST') {
        if (model.photos.some((p) => p.id === body.id)) return apiError(route, 'Duplicate ID', 409, '23505')
        model.photos.push(body)
        return json(route, null, 201)
      }
      if (method === 'DELETE') {
        const id = url.searchParams.get('id').slice(3)
        model.photos = model.photos.filter((p) => p.id !== id)
        return json(route, null)
      }
      return json(route, model.photos.filter((p) => !url.searchParams.has('id') || 'eq.' + p.id === url.searchParams.get('id')))
    }
    if (url.pathname.startsWith('/storage/v1/object')) {
      if (method === 'GET') return route.fulfill({ contentType: 'image/png', body: png.buffer })
      return json(route, { Key: url.pathname }, method === 'POST' ? 201 : 200)
    }
    if (url.pathname === '/rest/v1/bookings') return json(route, [], method === 'POST' ? 201 : 200)
    throw new Error(`Unhandled fixture request: ${method} ${url.pathname}`)
  })
  return model
}

export async function fillListing(page) {
  await page.getByLabel('Category', { exact: true }).selectOption('1')
  await page.getByLabel('Title', { exact: true }).fill('Camera for rent')
  await page.getByLabel('Description', { exact: true }).fill('A camera with a lens and carrying case.')
  await page.getByLabel('Rental price (₱)').fill('200')
  await page.getByLabel('Where is it?').fill('Tibanga, Iligan City')
}

export const calls = (model, path, method) => model.calls.filter((c) => c.path === path && c.method === method)

export function searchRows(prefix, count, total = count) {
  return Array.from({ length: count }, (_, i) => ({ id: `${prefix}-${i}`, title: `${prefix} result ${i}`, price: 200, price_period: 'day', location_text: 'Tibanga', status: 'available', category_slug: 'electronics-gadgets', category_name: 'Electronics and Gadgets', total_count: total }))
}
import { test as base, expect } from '@playwright/test'

export const test = base.extend({
  pageErrors: [async ({ page }, use) => {
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await use()
    expect(errors, 'uncaught browser exceptions').toEqual([])
  }, { auto: true }],
})
