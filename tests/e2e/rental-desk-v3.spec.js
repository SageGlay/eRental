import { expect } from '@playwright/test'
import {
  calls,
  json,
  LISTING_ID,
  mockMarketplace,
  OWNER_ID,
  test,
  USER_ID,
} from './fixtures.js'

const tara = {
  id: 'tara-thread',
  renter_id: USER_ID,
  listings: { title: 'Travel camera' },
  owner: { display_name: 'Tara' },
  last_message_at: '2026-11-01T10:00:00Z',
}
const sam = {
  id: 'sam-thread',
  renter_id: OWNER_ID,
  listings: { title: 'Wide angle lens' },
  renter: { display_name: 'Sam' },
  last_message_at: '2026-11-02T10:00:00Z',
}

test('inbox filters actual unread conversations and searches the listing or participant', async ({
  page,
}) => {
  const model = await mockMarketplace(page, async (route, { url }) => {
    if (url.pathname === '/rest/v1/conversations') {
      await json(route, [sam, tara])
      return true
    }
    if (
      url.pathname === '/rest/v1/messages' &&
      url.searchParams.get('select') === 'conversation_id'
    ) {
      await json(route, [
        { conversation_id: tara.id },
        { conversation_id: tara.id },
      ])
      return true
    }
    return false
  })
  await page.goto('/messages')
  const list = page.getByRole('list', { name: 'Rental conversations' })
  await expect(list.getByRole('link')).toHaveCount(2)
  await expect(list.getByRole('link', { name: /Tara/ })).toContainText(
    '2 unread',
  )
  const unread = page
    .getByRole('group', { name: 'Mailbox' })
    .getByRole('button', { name: /Unread/ })
  await unread.click()
  await expect(unread).toHaveAttribute('aria-pressed', 'true')
  await expect(page).toHaveURL(/view=unread/)
  await expect(list.getByRole('link')).toHaveCount(1)
  const search = page.getByLabel('Search conversations')
  await search.fill('lens')
  await expect(
    page.getByRole('heading', { name: 'No matching conversations' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Clear search', exact: true }).click()
  await expect(search).toBeFocused()
  await expect(list.getByRole('link', { name: /Tara/ })).toBeVisible()
  await page.goBack()
  await search.fill(' SAM ')
  await expect(list.getByRole('link')).toHaveCount(1)
  await expect(
    list.getByRole('link', { name: /Wide angle lens/ }),
  ).toHaveAttribute('href', '/messages/sam-thread')
  await search.fill('TRAVEL')
  await expect(list.getByRole('link', { name: /Tara/ })).toBeVisible()
  expect(calls(model, '/rest/v1/conversations', 'GET')).toHaveLength(1)
})

test.describe('Calendar-only rental itinerary', () => {
  test.use({ timezoneId: 'America/Los_Angeles' })

  test('each day of the itinerary and itemized price stay consistent across time zones', async ({
    page,
  }) => {
    await mockMarketplace(page, async (route, { url }) => {
      if (url.pathname !== '/rest/v1/bookings') return false
      await json(route, [
        {
          id: 'booking-fixture',
          status: 'pending',
          start_date: '2099-01-10',
          end_date: '2099-01-11',
          price: 200,
          price_period: 'day',
          deposit: 50,
          listings: { id: LISTING_ID, title: 'Travel camera' },
          simulated_payments: [],
          reviews: [],
        },
      ])
      return true
    })
    await page.goto('/bookings')
    const card = page.locator('.booking-card')
    await expect(card.locator('.booking-card__range')).toHaveText(
      'Jan 10, 2099 – Jan 11, 2099',
    )
    await expect(card.locator('.booking-date strong')).toHaveText('10')
    await expect(card.locator('.booking-costs')).toContainText(
      'Rental estimate₱400',
    )
    await expect(card.locator('.booking-costs')).toContainText('Deposit₱50')
    await expect(card.locator('.booking-costs__total')).toHaveText(
      'Estimated total₱450',
    )
    await expect(card.getByRole('button', { name: /^Pay / })).toHaveCount(0)
  })
})
