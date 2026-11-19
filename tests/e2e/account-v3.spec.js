import { expect } from '@playwright/test'
import {
  apiError,
  calls,
  json,
  mockMarketplace,
  OWNER_ID,
  sessionFor,
  test,
  USER_ID,
} from './fixtures.js'

test('requesting recovery uses a fixed local return URL and gives the same inbox instructions', async ({
  page,
}) => {
  const model = await mockMarketplace(
    page,
    async (route, { url }) => {
      if (url.pathname !== '/auth/v1/recover') return false
      await json(route, {})
      return true
    },
    { signedIn: false },
  )
  await page.goto('/login')
  await page.getByRole('link', { name: 'Forgot password?' }).click()
  await page.getByRole('button', { name: 'Send recovery link' }).click()
  await expect(page.getByLabel('Email', { exact: true })).toBeFocused()
  await expect(page.getByRole('alert')).toContainText('valid email')
  expect(calls(model, '/auth/v1/recover', 'POST')).toHaveLength(0)
  await page.getByLabel('Email', { exact: true }).fill('  member@example.test ')
  await page.getByRole('button', { name: 'Send recovery link' }).click()
  await expect(page.getByRole('status')).toContainText(
    'If an account uses this email',
  )
  const [request] = calls(model, '/auth/v1/recover', 'POST')
  expect(request.body.email).toBe('member@example.test')
  expect(new URLSearchParams(request.search).get('redirect_to')).toBe(
    new URL('/reset-password', page.url()).href,
  )
  await page.getByRole('button', { name: 'Use another email' }).click()
  await expect(page.getByLabel('Email', { exact: true })).toBeFocused()
})

test('recovery feedback preserves the address after a rate limit and protects account existence', async ({
  page,
}) => {
  let limited = true
  await mockMarketplace(
    page,
    async (route, { url }) => {
      if (url.pathname !== '/auth/v1/recover') return false
      if (limited)
        await json(route, { error_code: 'over_email_send_rate_limit' }, 429)
      else await json(route, { error_code: 'user_not_found' }, 400)
      return true
    },
    { signedIn: false },
  )
  await page.goto('/forgot-password')
  const email = page.getByLabel('Email', { exact: true })
  const send = page.getByRole('button', { name: 'Send recovery link' })
  await email.fill('absent@example.test')
  await send.click()
  await expect(page.getByRole('alert')).toContainText('Too many requests')
  await expect(email).toHaveValue('absent@example.test')
  limited = false
  await send.click()
  await expect(page.getByRole('status')).toContainText(
    'If an account uses this email',
  )
})

test('a signed-in browser needs a valid recovery link to enable password changes', async ({
  page,
}) => {
  const model = await mockMarketplace(page, async (route, { url }) => {
    if (url.pathname !== '/auth/v1/user') return false
    await apiError(route, 'Expired session', 401, 'session_expired')
    return true
  })
  await page.goto('/reset-password')
  await expect(page.getByRole('alert')).toContainText('fresh link')
  await expect(
    page.getByRole('button', { name: 'Update password' }),
  ).toHaveCount(0)
  const session = sessionFor(OWNER_ID)
  await page.goto(
    '/RESET-PASSWORD/#' +
      new URLSearchParams({
        type: 'recovery',
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      }),
  )
  await expect(page.getByRole('alert')).toContainText('fresh link')
  expect(new URL(page.url()).hash).toBe('')
  expect(calls(model, '/auth/v1/user', 'GET')).toHaveLength(1)
  expect(calls(model, '/auth/v1/user', 'PUT')).toHaveLength(0)
})

test('an emailed link changes only its verified account and preserves the regular account on this browser', async ({
  page,
}) => {
  const recovered = sessionFor(OWNER_ID)
  recovered.user.email = 'other-member@example.test'
  let permitChange = false
  const model = await mockMarketplace(page, async (route, { url, method }) => {
    if (url.pathname !== '/auth/v1/user') return false
    expect(route.request().headers().authorization).toBe(
      `Bearer ${recovered.access_token}`,
    )
    if (method === 'PUT' && !permitChange)
      await json(
        route,
        { msg: 'Same password', error_code: 'same_password' },
        422,
      )
    else await json(route, recovered.user)
    return true
  })
  await page.goto(
    '/reset-password#' +
      new URLSearchParams({
        type: 'recovery',
        access_token: recovered.access_token,
        refresh_token: recovered.refresh_token,
        expires_in: '3600',
        token_type: 'bearer',
      }),
  )
  await expect(
    page.getByText(/Change the eRental password for other-member/),
  ).toBeVisible()
  expect(new URL(page.url()).hash).toBe('')
  const field = page.getByLabel('New password', { exact: true })
  const update = page.getByRole('button', { name: 'Update password' })
  await field.fill('short')
  await update.click()
  await expect(field).toBeFocused()
  expect(calls(model, '/auth/v1/user', 'PUT')).toHaveLength(0)
  await field.fill('sample-replacement')
  await update.click()
  await expect(page.getByRole('alert')).toContainText('different password')
  permitChange = true
  await field.fill('revised-fixture-password')
  await update.click()
  await expect(page.getByRole('status')).toContainText('Password updated')
  await expect(field).toHaveCount(0)
  expect(calls(model, '/auth/v1/user', 'PUT').at(-1).body.password).toBe(
    'revised-fixture-password',
  )
  const persistedUser = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('sb-test-project-auth-token')).user.id,
  )
  expect(persistedUser).toBe(USER_ID)
  expect(
    await page.evaluate(() => localStorage.getItem('erental-recovery')),
  ).toBe(null)
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('fresh link')
})

test('a recovery link at the configured site root stays separate from the signed-in account', async ({ page }) => {
  const recovered = sessionFor(OWNER_ID)
  recovered.user.email = 'recovery-member@example.test'
  await mockMarketplace(page, async (route, { url, method }) => {
    if (url.pathname !== '/auth/v1/user' || method !== 'GET') return false
    await json(route, recovered.user)
    return true
  })
  await page.goto('/#' + new URLSearchParams({
    type: 'recovery',
    access_token: recovered.access_token,
    refresh_token: recovered.refresh_token,
  }))
  await expect(page).toHaveURL(/\/reset-password$/)
  await expect(page.getByText('Change the eRental password for recovery-member@example.test.')).toBeVisible()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sb-test-project-auth-token')).user.id)).toBe(USER_ID)
})

test('settings persist the shared browser theme without modifying public identity', async ({
  page,
}) => {
  const model = await mockMarketplace(page)
  await page.goto('/profile#account-settings')
  const settings = page.getByRole('region', { name: 'Account settings' })
  await settings.getByLabel('Color theme').selectOption('dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await expect(settings.getByLabel('Color theme')).toHaveValue('dark')
  await expect(
    settings.getByRole('link', { name: 'Reset password' }),
  ).toHaveAttribute('href', '/forgot-password')
  expect(calls(model, '/rest/v1/profiles', 'PATCH')).toHaveLength(0)
})

test('protected entry returns to its original destination across login and registration links', async ({
  page,
}) => {
  await mockMarketplace(
    page,
    async (route, { url }) => {
      if (url.pathname !== '/auth/v1/token') return false
      await json(route, sessionFor())
      return true
    },
    { signedIn: false },
  )
  await page.goto('/profile?from=owner#account-settings')
  await expect(page).toHaveURL(/\/login$/)
  const modes = page.getByRole('navigation', { name: 'Account access' })
  await modes.getByRole('link', { name: 'Create account' }).click()
  await modes.getByRole('link', { name: 'Log in' }).click()
  await page.getByLabel('Email', { exact: true }).fill('member@example.test')
  await page.getByLabel('Password', { exact: true }).fill('example-password')
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page).toHaveURL(/\/profile\?from=owner#account-settings$/)
})

test('sign-in return destinations reject other origins and auth paths', async ({
  page,
}) => {
  await mockMarketplace(page)
  for (const destination of [
    '//other.example.test/profile',
    '/reset-password',
    '/\\other.example.test/profile',
  ]) {
    await page.goto('/')
    await page.evaluate((returnTo) => {
      history.pushState({ usr: { returnTo }, key: 'fixture' }, '', '/login')
      window.dispatchEvent(new PopStateEvent('popstate'))
    }, destination)
    await expect(page).toHaveURL(new URL('/', page.url()).href)
  }
})
