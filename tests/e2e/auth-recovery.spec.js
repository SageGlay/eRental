import { expect } from '@playwright/test'
import {
  test,
  apiError,
  calls,
  json,
  mockMarketplace,
  OWNER_ID,
  profile,
  sessionFor,
} from './fixtures.js'

test('failed profile lookup has recovery instead of an indefinite spinner', async ({
  page,
}) => {
  let failing = true
  await mockMarketplace(page, async (route, { url }) => {
    if (url.pathname === '/rest/v1/profiles' && failing) {
      await apiError(route)
      return true
    }
    return false
  })
  await page.goto('/profile')
  // PostgREST retries transient read failures before returning the error.
  await expect(page.getByRole('alert')).toContainText(
    'couldn’t load your profile',
    { timeout: 12000 },
  )
  await expect(page.getByText('Loading your profile…')).toHaveCount(0)
  failing = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByLabel('Display name')).toHaveValue(
    profile.display_name,
  )
})

test('missing profile is reported honestly and does not create a profile or claim to load forever', async ({
  page,
}) => {
  const model = await mockMarketplace(page, async (route, { url }) => {
    if (url.pathname === '/rest/v1/profiles') {
      await json(route, [])
      return true
    }
    return false
  })
  await page.goto('/profile')
  await expect(page.getByRole('alert')).toContainText('profile isn’t available')
  await expect(page.getByText('Loading your profile…')).toHaveCount(0)
  expect(calls(model, '/rest/v1/profiles', 'POST')).toHaveLength(0)
})

test('a failed admin lookup stays closed, retries, and distinguishes a real denial', async ({
  page,
}) => {
  let failing = true
  const model = await mockMarketplace(page, async (route, { url }) => {
    if (url.pathname.endsWith('/is_admin') && failing) {
      await apiError(route)
      return true
    }
    return false
  })
  await page.goto('/admin')
  await expect(page.getByRole('alert')).toContainText(
    'couldn’t verify your administrator access',
  )
  expect(calls(model, '/rest/v1/listing_reports', 'GET')).toHaveLength(0)
  failing = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { name: 'Admins only' })).toBeVisible()
  expect(calls(model, '/rest/v1/listing_reports', 'GET')).toHaveLength(0)
})

test('non-boolean permission response never grants admin access', async ({
  page,
}) => {
  const model = await mockMarketplace(page, async (route, { url }) => {
    if (url.pathname.endsWith('/is_admin')) {
      await json(route, 'true')
      return true
    }
    return false
  })
  await page.goto('/admin')
  await expect(page.getByRole('alert')).toContainText('couldn’t verify')
  expect(calls(model, '/rest/v1/listing_reports', 'GET')).toHaveLength(0)
})

test('signing in as another account does not retain the previous admin link or profile', async ({
  page,
}) => {
  let firstAccount = true
  let release
  let started
  const waiting = new Promise((resolve) => {
    release = resolve
  })
  const lookup = new Promise((resolve) => {
    started = resolve
  })
  await mockMarketplace(page, async (route, { url }) => {
    if (url.pathname.endsWith('/is_admin')) {
      if (!firstAccount) {
        started()
        await waiting
      }
      await json(route, firstAccount)
      return true
    }
    if (url.pathname === '/auth/v1/token') {
      await json(route, sessionFor(OWNER_ID))
      return true
    }
    if (url.pathname === '/rest/v1/profiles' && !firstAccount) {
      await json(route, [
        { ...profile, id: OWNER_ID, display_name: 'Second account' },
      ])
      return true
    }
    return false
  })
  await page.goto('/profile')
  await expect(
    page
      .getByRole('navigation', { name: 'Main', exact: true })
      .getByRole('link', { name: 'Admin', exact: true }),
  ).toBeVisible()
  await page.getByLabel('My account', { exact: true }).click()
  await page.getByRole('button', { name: 'Log out', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  firstAccount = false
  await page.getByLabel('Email', { exact: true }).fill('second@example.test')
  await page.getByLabel('Password', { exact: true }).fill('password123')
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await lookup
  await expect(
    page.getByRole('link', { name: 'Admin', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('link', { name: profile.display_name, exact: true }),
  ).toHaveCount(0)
  release()
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Admins only' })).toBeVisible()
})

test('a zero-row profile update is not reported as a successful save, and entered values remain', async ({
  page,
}) => {
  await mockMarketplace(page, async (route, { url, method }) => {
    if (url.pathname === '/rest/v1/profiles' && method === 'PATCH') {
      await apiError(route, 'No matching row', 406, 'PGRST116')
      return true
    }
    return false
  })
  await page.goto('/profile')
  await page.getByLabel('Display name').fill('Changed name')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('alert')).toContainText(
    'couldn’t save your profile',
  )
  await expect(page.getByLabel('Display name')).toHaveValue('Changed name')
  await expect(page.getByText('Profile saved.')).toHaveCount(0)
})
