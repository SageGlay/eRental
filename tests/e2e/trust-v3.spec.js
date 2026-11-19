import { expect } from '@playwright/test'
import {
  apiError,
  calls,
  json,
  listing,
  LISTING_ID,
  mockMarketplace,
  test,
} from './fixtures.js'

test('report dialog keeps its draft and focuses the required field through a failed submission', async ({
  page,
}) => {
  let attempts = 0
  const model = await mockMarketplace(page, async (route, { url, method }) => {
    if (url.pathname !== '/rest/v1/listing_reports' || method !== 'POST')
      return false
    attempts++
    if (attempts === 1) await apiError(route)
    else await json(route, null, 201)
    return true
  })
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto(`/listings/${LISTING_ID}`)
  const opener = page.getByRole('button', { name: 'Report this listing' })
  await opener.click()
  const dialog = page.getByRole('dialog', { name: 'Report this listing' })
  const send = dialog.getByRole('button', { name: 'Send report' })
  await send.click()
  await expect(dialog.getByRole('combobox')).toBeFocused()
  await dialog.getByRole('combobox').selectOption('other')
  await send.click()
  const details = dialog.getByLabel('Details', { exact: true })
  await expect(details).toBeFocused()
  await details.fill('Please review the description.')
  await page.keyboard.press('Escape')
  await expect(opener).toBeFocused()
  await opener.click()
  await expect(details).toHaveValue('Please review the description.')
  await send.click()
  await expect(dialog.getByRole('alert')).toContainText(
    'couldn’t confirm your report',
  )
  await expect(details).toHaveValue('Please review the description.')
  await send.click()
  const notice = page.getByRole('status').filter({ hasText: 'Report sent.' })
  await expect(notice).toBeFocused()
  expect(calls(model, '/rest/v1/listing_reports', 'POST')).toHaveLength(2)
})

test('uncertain moderation decisions require reading the queue again before another action', async ({
  page,
}) => {
  let finish, started
  const pending = new Promise((resolve) => {
    finish = resolve
  })
  const received = new Promise((resolve) => {
    started = resolve
  })
  const report = {
    id: 'fixture-report',
    reason: 'misleading',
    details: 'Check the listed condition.',
    status: 'open',
    admin_note: null,
    created_at: '2026-11-18T00:00:00Z',
    listings: listing,
    reporter: { display_name: 'Test reporter' },
  }
  await page.clock.install()
  const model = await mockMarketplace(page, async (route, { url }) => {
    if (url.pathname.endsWith('/is_admin')) await json(route, true)
    else if (url.pathname === '/rest/v1/listing_reports') {
      const matching =
        (url.searchParams.get('status') === 'eq.open') ===
        (report.status === 'open')
      await json(route, matching ? [report] : [])
    } else if (url.pathname.endsWith('/resolve_report')) {
      report.status = 'actioned'
      started()
      await pending
      await json(route, null)
    } else return false
    return true
  })
  await page.goto('/admin')
  await page.getByRole('button', { name: 'Remove listing' }).click()
  await page.getByRole('button', { name: 'Yes, remove' }).click()
  await received
  await page.clock.fastForward(16000)
  await expect(page.getByRole('alert')).toContainText(
    'couldn’t confirm this decision',
  )
  const check = page.getByRole('button', { name: 'Check report status' })
  await expect(check).toBeFocused()
  await expect(
    page.getByRole('button', { name: 'Remove listing' }),
  ).toBeDisabled()
  await expect(
    page.getByRole('button', { name: 'Dismiss report' }),
  ).toBeDisabled()
  finish()
  await check.click()
  await expect(
    page.getByRole('heading', { name: 'No open reports' }),
  ).toBeVisible()
  await page.getByRole('tab', { name: 'Resolved' }).click()
  await expect(page).toHaveURL(/view=resolved/)
  await page.reload()
  await expect(page.getByRole('tab', { name: 'Resolved' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByRole('heading', { name: listing.title })).toBeVisible()
  expect(calls(model, '/rest/v1/rpc/resolve_report', 'POST')).toHaveLength(1)
})
