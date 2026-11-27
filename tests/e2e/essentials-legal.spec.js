import { expect } from '@playwright/test'
import { test, mockMarketplace } from './fixtures.js'
import { mockVerification } from './verification-fixture.js'

test('public footer opens both legal drafts and preserves their direct routes', async ({ page }) => {
  await mockMarketplace(page, undefined, { signedIn: false })
  await page.goto('/login')
  const footer = page.getByRole('contentinfo')
  await footer.getByRole('link', { name: 'Terms and conditions' }).click()
  await expect(page).toHaveURL(/\/terms$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Terms and conditions')
  await expect(page.getByText(/Draft for project-owner/)).toBeVisible()
  const payments = page.getByRole('navigation', { name: 'On this page' }).getByRole('link', { name: 'Simulated payments' })
  await payments.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/terms#payments$/)
  await expect(page.getByText(/A simulated payment records a test transaction/)).toBeVisible()
  await footer.getByRole('link', { name: 'Privacy notice' }).click()
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy notice')
  await expect(page.getByRole('heading', { name: 'Saved listings and viewing history' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Account notifications' })).toBeVisible()
  await expect(page.getByText(/up to 12 recently viewed listing IDs/)).toBeVisible()
})

test('registration links are available without adding a consent step', async ({ page }) => {
  await mockMarketplace(page, undefined, { signedIn: false })
  await page.goto('/register')
  const main = page.getByRole('main')
  await expect(main.getByRole('checkbox')).toHaveCount(0)
  await expect(main.getByRole('button', { name: 'Create account' })).toBeEnabled()
  await expect(main.getByRole('link', { name: 'Terms and conditions' })).toHaveAttribute('href', '/terms')
  await main.getByRole('link', { name: 'Privacy notice' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy notice')
})

test('account settings and verification link to relevant legal information', async ({ page }) => {
  await mockVerification(page)
  await page.goto('/profile')
  const settings = page.getByRole('region', { name: 'Account settings' })
  await expect(settings.getByRole('link', { name: 'Terms and conditions' })).toHaveAttribute('href', '/terms')
  await settings.getByRole('link', { name: 'Privacy notice' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy notice')
  await page.goto('/verification')
  await page.getByRole('main').getByRole('link', { name: 'Read the privacy notice for verification documents' }).click()
  await expect(page).toHaveURL(/\/privacy#verification-documents$/)
  await expect(page.getByRole('heading', { name: 'Verification documents', exact: true })).toBeFocused()
})

for (const theme of ['light', 'dark']) {
  test(`legal reading layouts fit five widths in ${theme} system appearance`, async ({ page }) => {
    await mockMarketplace(page, undefined, { signedIn: false })
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    for (const [path, title] of [['/terms', 'Terms and conditions'], ['/privacy', 'Privacy notice']]) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 820 })
        const fits = await page.evaluate(() => {
          const root = document.documentElement
          const paragraphs = [...document.querySelectorAll('.legal-text p')]
          return root.scrollWidth <= innerWidth + 1 && paragraphs.every((paragraph) => {
            const rect = paragraph.getBoundingClientRect()
            return rect.width > 0 && rect.left >= 0 && rect.right <= innerWidth + 1
          })
        })
        expect(fits, `${path} at ${width}px`).toBe(true)
      }
    }
  })
}
