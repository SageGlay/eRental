import { expect } from '@playwright/test'
import { test, apiError, fillListing, LISTING_ID, mockMarketplace, png } from './fixtures.js'

test('mobile availability recovery is keyboard operable without overflowing the page', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  let failing = true
  await mockMarketplace(page, async (route, { url }) => {
    if (url.pathname.endsWith('/listing_booked_ranges') && failing) { await apiError(route, 'Denied', 403); return true }
    return false
  })
  await page.goto(`/listings/${LISTING_ID}`)
  const form = page.locator('.request-form')
  await expect(form.getByRole('alert')).toContainText('couldn’t check')
  await expect(form.getByRole('button', { name: 'Send request' })).toBeDisabled()
  const retry = form.getByRole('button', { name: 'Try again' })
  await retry.focus()
  await expect(retry).toBeFocused()
  failing = false
  await page.keyboard.press('Enter')
  await expect(form.getByRole('button', { name: 'Send request' })).toBeEnabled()
  await expect(form.getByLabel('From', { exact: true })).toBeVisible()
  const overflow = await page.evaluate(() => [...document.querySelectorAll('main *')]
    .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
    .map((el) => ({ tag: el.tagName, className: el.className, width: el.getBoundingClientRect().width })))
  expect(overflow).toEqual([])
  await page.screenshot({ path: testInfo.outputPath('mobile-request.png'), fullPage: true })
})

test('mobile partial-photo recovery retains a usable form and stable submit width', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockMarketplace(page, async (route, { url, method }) => {
    if (url.pathname.startsWith('/storage/v1/object/') && method === 'POST') { await apiError(route); return true }
    return false
  })
  await page.goto('/list')
  await fillListing(page)
  await page.getByLabel('Add photos').setInputFiles({ ...png, name: 'a-long-but-valid-photo-file-name-for-mobile-recovery.png' })
  const initial = await page.getByRole('button', { name: 'Publish listing' }).boundingBox()
  await page.getByRole('button', { name: 'Publish listing' }).click()
  await expect(page.getByRole('alert')).toContainText('Your listing was saved')
  const retry = page.getByRole('button', { name: 'Save changes', exact: true })
  await expect(retry).toBeVisible()
  expect((await retry.boundingBox()).width).toBe(initial.width)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('mobile-photo-error.png'), fullPage: true })
})
