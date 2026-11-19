import { expect } from '@playwright/test'
import {
  test,
  calls,
  fillListing,
  json,
  listing,
  mockMarketplace,
  png,
  LISTING_ID,
  USER_ID,
} from './fixtures.js'

test('an owner can inspect public terms and choose the cover before the first write', async ({
  page,
}) => {
  const model = await mockMarketplace(page)
  await page.goto('/list')
  await fillListing(page)
  await page.getByLabel('Deposit (₱, optional)').fill('500')
  await page
    .getByLabel('Terms, rules and requirements (optional)')
    .fill('Return the lens with its cap.')
  await page
    .getByLabel('Add photos')
    .setInputFiles([png, { ...png, name: 'front.png' }])
  await page.getByRole('button', { name: 'Make cover for front.png' }).click()
  const photos = page.getByRole('list', {
    name: 'Listing photos in display order',
  })
  await expect(photos.getByRole('listitem').first()).toContainText('front.png')
  await page.getByRole('link', { name: /Review listing/ }).click()
  const review = page.getByRole('region', { name: 'Review listing' })
  await expect(review.getByRole('heading', { level: 3 })).toHaveText(
    'Camera for rent',
  )
  for (const term of [
    '₱200 / day',
    '₱500',
    'Tibanga, Iligan City',
    'Available',
    'Return the lens with its cap.',
  ]) {
    await expect(review).toContainText(term)
  }
  expect(calls(model, '/rest/v1/listings', 'POST')).toHaveLength(0)
  await review.getByRole('button', { name: 'Publish listing' }).click()
  await expect(page).toHaveURL(/\/listings\//)
  expect(model.photos.map((photo) => photo.sort_order)).toEqual([0, 1])
  expect(calls(model, '/rest/v1/listings', 'POST')).toHaveLength(1)
})

test('edit restores an existing photo before save without deleting or uploading anything', async ({
  page,
}) => {
  const model = await mockMarketplace(page)
  model.listing.owner_id = USER_ID
  model.listing.status = 'unavailable'
  model.photos = [
    {
      id: 'current-photo',
      storage_path: `${USER_ID}/${LISTING_ID}/photo.png`,
      sort_order: 0,
    },
  ]
  await page.goto(`/listings/${LISTING_ID}/edit`)
  const review = page.getByRole('region', { name: 'Review listing' })
  await expect(review).toContainText('Unavailable')
  await page.getByRole('button', { name: 'Remove current photo 1' }).click()
  await expect(
    review.getByRole('img', { name: 'Listing cover preview' }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo removal' }).click()
  await expect(
    review.getByRole('img', { name: 'Listing cover preview' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page).toHaveURL(new RegExp(`/listings/${LISTING_ID}$`))
  expect(calls(model, '/rest/v1/listing_photos', 'DELETE')).toHaveLength(0)
  expect(calls(model, '/rest/v1/listings', 'PATCH')[0].body).not.toHaveProperty(
    'status',
  )
})

test('owner inventory filters persist and incoming requests open the owner booking view', async ({
  page,
}) => {
  await mockMarketplace(page, async (route, { url, method }) => {
    if (method !== 'GET' || url.pathname !== '/rest/v1/listings') return false
    expect(url.searchParams.get('owner_id')).toBe(`eq.${USER_ID}`)
    await json(route, [
      listing,
      {
        ...listing,
        id: 'second',
        title: 'Tripod',
        location_text: 'Pala-o',
        status: 'unavailable',
      },
    ])
    return true
  })
  await page.goto('/my-listings')
  const rentals = page.getByRole('list', { name: 'Your listings' })
  await expect(rentals.getByRole('listitem')).toHaveCount(2)
  await page.getByRole('button', { name: /^Unavailable/ }).click()
  await page
    .getByRole('searchbox', { name: 'Find a listing by title or location' })
    .fill('Pala-o')
  await expect(page).toHaveURL(/status=unavailable&q=Pala-o/)
  await page.reload()
  await expect(rentals.getByRole('listitem')).toHaveCount(1)
  await expect(rentals).toContainText('Tripod')
  await page.getByRole('link', { name: 'Incoming requests' }).click()
  await expect(page).toHaveURL(/\/bookings\?tab=incoming$/)
})

test('a lost owner status response refreshes inventory before another availability change', async ({
  page,
}) => {
  let status = 'available'
  let updates = 0
  await mockMarketplace(page, async (route, { url, method, body }) => {
    if (url.pathname !== '/rest/v1/listings') return false
    if (method === 'PATCH') {
      expect(url.searchParams.get('owner_id')).toBe(`eq.${USER_ID}`)
      expect(url.searchParams.get('status')).toBe('eq.available')
      status = body.status
      updates++
      await route.abort('failed')
    } else {
      await json(route, [{ ...listing, owner_id: USER_ID, status }])
    }
    return true
  })
  await page.goto('/my-listings')
  await page.getByRole('button', { name: 'Mark unavailable' }).click()
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('couldn’t confirm')
  await expect(alert).toBeFocused()
  await expect(
    page.getByRole('button', { name: 'Mark available' }),
  ).toBeVisible()
  expect(updates).toBe(1)
})

test('editor validation identifies the first missing field next to the focused control', async ({
  page,
}) => {
  await mockMarketplace(page)
  await page.goto('/list')
  await page.getByRole('button', { name: 'Publish listing' }).click()
  const category = page.getByLabel('Category', { exact: true })
  await expect(category).toBeFocused()
  await expect(category).toHaveAccessibleDescription(
    'Please choose a category.',
  )
  await category.selectOption('1')
  await expect(page.getByRole('alert')).toHaveCount(0)
})
