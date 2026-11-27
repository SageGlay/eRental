import { expect } from '@playwright/test'
import { mockMarketplace, test } from './fixtures.js'

const routes = ['/saved', '/notifications', '/terms', '/privacy']

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`essentials pages and account navigation fit at ${width}px in both appearances`, async ({ page }) => {
    await page.setViewportSize({ width, height: 880 })
    await mockMarketplace(page)
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    for (const route of routes) {
      await page.goto(route)
      await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible()
      for (const theme of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
        const bell = page.getByRole('banner').getByRole('link', { name: /^Notifications/ })
        await expect(bell).toBeVisible()
        const bounds = await bell.boundingBox()
        expect(bounds.x).toBeGreaterThanOrEqual(0)
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
        expect(bounds.height).toBeGreaterThanOrEqual(44)
        const account = width >= 1200 ? page.getByLabel('My account', { exact: true }) : page.getByRole('button', { name: 'Open menu' })
        const accountBounds = await account.boundingBox()
        expect(accountBounds.x + accountBounds.width).toBeLessThanOrEqual(width)
      }
    }
    const menu = width >= 1200 ? page.getByLabel('My account', { exact: true }) : page.getByRole('button', { name: 'Open menu' })
    await menu.focus()
    await page.keyboard.press('Enter')
    const saved = page.getByRole('banner').getByRole('link', { name: 'Saved listings', exact: true })
    await saved.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/saved$/)
    const bell = page.getByRole('banner').getByRole('link', { name: /^Notifications/ })
    await bell.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/notifications$/)
  })
}
