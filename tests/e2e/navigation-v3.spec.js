import { expect } from '@playwright/test'
import { test, mockMarketplace } from './fixtures.js'

test('browser Back lets an owner keep or discard a listing draft', async ({ page }) => {
  await mockMarketplace(page)
  await page.goto('/my-listings')
  await page.getByRole('main').getByRole('link', { name: 'List an item', exact: true }).first().click()
  await expect(page).toHaveURL(/\/list$/)
  const title = page.getByLabel('Title', { exact: true })
  await title.fill('Draft handover')
  await page.evaluate(() => window.history.back())
  const dialog = page.getByRole('dialog', { name: 'Leave without saving?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Keep editing' }).click()
  await expect(title).toHaveValue('Draft handover')
  await page.evaluate(() => window.history.back())
  await dialog.getByRole('button', { name: 'Leave page', exact: true }).click()
  await expect(page).toHaveURL(/\/my-listings$/)
  await expect(page.getByRole('heading', { level: 1, name: 'My listings' })).toBeVisible()
})

test('desktop search focuses the keyword and offline feedback clears when connectivity returns', async ({ page, context }) => {
  await mockMarketplace(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.getByRole('banner').getByRole('link', { name: 'Search rentals' }).click()
  await expect(page.getByRole('searchbox')).toBeFocused()
  await context.setOffline(true)
  await expect(page.getByRole('status').filter({ hasText: 'You’re offline.' })).toBeVisible()
  await context.setOffline(false)
  await expect(page.getByText('You’re offline.', { exact: false })).toHaveCount(0)
})
