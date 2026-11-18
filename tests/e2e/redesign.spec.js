import { expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  test,
  apiError,
  json,
  LISTING_ID,
  OWNER_ID,
  USER_ID,
} from './fixtures.js'
import { mockVerification, sampleRequest } from './verification-fixture.js'

const CONVERSATION_ID = '66666666-6666-4666-8666-666666666666'
const WIDTHS = [320, 390, 768, 1024, 1440]
const THEMES = ['light', 'dark']

// Neutral illustrations exist only in this intercepted browser fixture. No
// fictional inventory, private documents or photos enter the application build.
function fixtureImage(index) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900"><rect width="1200" height="900" fill="${index % 2 ? '#b6b8aa' : '#e7d4bb'}"/><ellipse cx="600" cy="700" rx="340" ry="45" fill="#857861" opacity=".3"/><g transform="translate(${index % 2 ? 60 : 0} 0)"><rect x="270" y="270" width="660" height="400" rx="45" fill="#29281e"/><rect x="360" y="220" width="210" height="90" rx="15" fill="#48252f"/><rect x="770" y="315" width="95" height="45" rx="8" fill="#e7d4bb"/><circle cx="600" cy="470" r="150" fill="#101211" stroke="#857861" stroke-width="30"/><circle cx="600" cy="470" r="95" fill="#48252f"/><circle cx="565" cy="435" r="30" fill="#e7d4bb" opacity=".5"/></g></svg>`
}

async function setTheme(page, theme) {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
  await page.addInitScript((preference) => {
    if (!localStorage.getItem('redesign-theme-seeded')) {
      localStorage.setItem('erental-theme', preference)
      localStorage.setItem('redesign-theme-seeded', 'true')
    }
  }, theme)
}

async function mockRedesign(page, options = {}) {
  return mockVerification(page, {
    admin: options.admin ?? true,
    signedIn: options.signedIn ?? true,
    rows: [sampleRequest()],
    override: async (route, context) => {
      const { url, method, body, model } = context
      if (await options.override?.(route, context)) return true
      if (url.pathname === '/rest/v1/rpc/search_listings') {
        await json(
          route,
          Array.from({ length: 4 }, (_, index) => ({
            id: index ? `${LISTING_ID.slice(0, -1)}${index}` : LISTING_ID,
            title: [
              'Camera for rent',
              'Projector for a gathering',
              'Compact camera kit',
              'Camera with carrying case',
            ][index],
            price: 200 + index * 50,
            price_period: 'day',
            location_text:
              index % 2 ? 'Pala-o, Iligan City' : 'Tibanga, Iligan City',
            status: index === 2 ? 'unavailable' : 'available',
            category_slug: 'electronics-gadgets',
            category_name: 'Electronics and Gadgets',
            cover_path: `fixture/camera-${index}.svg`,
            total_count: 4,
          })),
        )
        return true
      }
      if (url.pathname.startsWith('/storage/v1/object/public/')) {
        const index = Number(url.pathname.match(/camera-(\d)/)?.[1] ?? 0)
        await route.fulfill({
          contentType: 'image/svg+xml',
          body: fixtureImage(index),
        })
        return true
      }
      if (url.pathname === '/rest/v1/listings' && method === 'GET') {
        const select = url.searchParams.get('select') ?? ''
        const isEdit =
          select.includes('removed_by_admin') && select.includes('category_id')
        const isOwnerList = url.searchParams.has('owner_id')
        await json(route, [
          {
            ...model.listing,
            owner_id: isEdit || isOwnerList ? USER_ID : OWNER_ID,
            listing_photos: [0, 1, 2].map((index) => ({
              id: `fixture-photo-${index}`,
              storage_path: `fixture/camera-${index}.svg`,
              sort_order: index,
            })),
          },
        ])
        return true
      }
      if (url.pathname === '/rest/v1/bookings') {
        await json(route, [
          {
            id: '55555555-5555-4555-8555-555555555555',
            status: 'accepted',
            start_date: '2099-01-10',
            end_date: '2099-01-11',
            price: 200,
            price_period: 'day',
            deposit: 50,
            message: 'A non-sensitive sample request.',
            owner_response: null,
            simulated_payments: [],
            reviews: [],
            listings: { id: LISTING_ID, title: 'Camera for rent' },
            renter: { display_name: 'Sample renter' },
          },
        ])
        return true
      }
      if (url.pathname === '/rest/v1/conversations') {
        await json(route, [
          {
            id: CONVERSATION_ID,
            renter_id: USER_ID,
            listings: { id: LISTING_ID, title: 'Camera for rent' },
            renter: { display_name: 'Sample renter' },
            owner: { display_name: 'Sample owner' },
            last_message_at: '2026-11-01T00:00:00Z',
          },
        ])
        return true
      }
      if (url.pathname === '/rest/v1/messages') {
        await json(
          route,
          method === 'PATCH'
            ? null
            : [
                {
                  id: 'fixture-message',
                  conversation_id: CONVERSATION_ID,
                  sender_id: OWNER_ID,
                  body: 'Yes, the camera includes its carrying case.',
                  created_at: '2026-11-01T00:00:00Z',
                  read_at: '2026-11-01T00:01:00Z',
                },
              ],
        )
        return true
      }
      if (url.pathname === '/rest/v1/listing_reports') {
        await json(route, [
          {
            id: 'fixture-report',
            reason: 'misleading',
            details: 'Non-sensitive example for layout review.',
            status: 'open',
            admin_note: null,
            created_at: '2026-11-01T00:00:00Z',
            listings: {
              id: LISTING_ID,
              title: 'Camera for rent',
              status: 'available',
              profiles: { display_name: 'Sample owner' },
            },
            reporter: { display_name: 'Sample reporter' },
          },
        ])
        return true
      }
      return false
    },
  })
}

async function expectNoPageOverflow(page, name) {
  const dimensions = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }))
  expect(
    dimensions.document,
    `${name}: document width ${JSON.stringify(dimensions)}`,
  ).toBeLessThanOrEqual(dimensions.viewport + 1)
  expect(
    dimensions.body,
    `${name}: body width ${JSON.stringify(dimensions)}`,
  ).toBeLessThanOrEqual(dimensions.viewport + 1)
}

async function capture(page, testInfo, name) {
  const external =
    process.env.ERENTAL_SCREENSHOT_DIR ||
    (existsSync('/workspace/reports/erental-redesign')
      ? '/workspace/reports/erental-redesign/screenshots'
      : null)
  const directory = external || testInfo.outputPath('screenshots')
  await mkdir(directory, { recursive: true })
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({
    path: join(directory, `${name}.png`),
    fullPage: true,
    animations: 'disabled',
  })
}

const routes = [
  ['home', '/', /Rent almost anything/],
  ['browse', '/listings', 'Browse rentals'],
  ['detail', `/listings/${LISTING_ID}`, 'Camera for rent'],
  ['create', '/list', 'List an item'],
  ['edit', `/listings/${LISTING_ID}/edit`, 'Edit listing'],
  ['profile', '/profile', 'My profile'],
  ['my-listings', '/my-listings', 'My listings'],
  ['bookings', '/bookings', 'Bookings'],
  ['inbox', '/messages', 'Messages'],
  ['conversation', `/messages/${CONVERSATION_ID}`, 'Sample owner'],
  ['verification', '/verification', 'Account verification'],
  ['admin-reports', '/admin', 'Admin'],
  ['admin-verification', '/admin/verification', 'Verification requests'],
]

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    test(`${theme} marketplace and account routes fit a ${width}px viewport`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(90000)
      await page.setViewportSize({ width, height: 900 })
      await setTheme(page, theme)
      await mockRedesign(page)
      for (const [name, path, heading] of routes) {
        await page.goto(path)
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
        await expect(
          page.getByRole('heading', {
            level: 1,
            name: heading,
            exact: typeof heading === 'string',
          }),
        ).toBeVisible()
        await expectNoPageOverflow(page, `${theme}/${width}/${name}`)
        if (name === 'home' && width >= 768) {
          const keyword = await page
            .getByLabel('What do you want to rent?', { exact: true })
            .boundingBox()
          const location = await page
            .getByLabel('Location', { exact: true })
            .boundingBox()
          expect(
            location.x,
            'desktop search fields appear side by side',
          ).toBeGreaterThan(keyword.x + keyword.width)
        }
        if (name === 'browse' && width < 900) {
          await page.getByRole('button', { name: /Filters & sort/ }).click()
          await expect(
            page.getByLabel('Category', { exact: true }),
          ).toBeVisible()
          await expect(
            page.getByLabel('Sort by', { exact: true }),
          ).toBeVisible()
          await expectNoPageOverflow(page, `${theme}/${width}/expanded-filters`)
          await page.getByRole('button', { name: /Filters & sort/ }).click()
        }
        const keyPage =
          ['home', 'browse', 'detail'].includes(name) &&
          [390, 1440].includes(width)
        if (keyPage || (name === 'admin-verification' && width === 390)) {
          await capture(page, testInfo, `${theme}-${width}-${name}`)
        }
      }
    })

    test(`${theme} login and registration fit a ${width}px viewport`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await setTheme(page, theme)
      await mockRedesign(page, { signedIn: false, admin: false })
      for (const [path, heading] of [
        ['/login', 'Welcome back'],
        ['/register', 'Create your account'],
      ]) {
        await page.goto(path)
        await expect(
          page.getByRole('heading', { level: 1, name: heading }),
        ).toBeVisible()
        await expect(
          page.getByLabel('Password', { exact: true }),
        ).toHaveAttribute('type', 'password')
        await expect(
          page.getByRole('button', { name: 'Show password' }),
        ).toBeVisible()
        await expectNoPageOverflow(page, `${theme}/${width}/${path}`)
      }
    })
  }
}

test('theme control follows system changes, persists overrides and remains operable on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await mockRedesign(page, { admin: false })
  await page.goto('/')
  const control = page.getByLabel('Color theme', { exact: true })
  await expect(control).toHaveValue('system')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  // Exercise the platform-owned popup with the keyboard, not a custom listbox.
  await control.click()
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(control).toHaveValue('light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await control.selectOption('dark')
  await page.reload()
  await expect(control).toHaveValue('dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await page.evaluate(() => localStorage.getItem('erental-theme'))).toBe(
    'dark',
  )
  await control.selectOption('system')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expectNoPageOverflow(page, 'mobile theme control')
})

test('mobile navigation closes with Escape, restores focus and hides admin destinations for ordinary accounts', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await mockRedesign(page, { admin: false })
  await page.goto('/')
  const toggle = page.getByRole('button', { name: 'Open menu', exact: true })
  await toggle.focus()
  await page.keyboard.press('Enter')
  const menu = page.getByRole('navigation', { name: 'Mobile', exact: true })
  await expect(menu).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Close menu', exact: true }),
  ).toHaveAttribute('aria-expanded', 'true')
  await expect(
    menu.getByRole('link', { name: 'My profile', exact: true }),
  ).toBeVisible()
  await expect(
    menu.getByRole('link', { name: 'Account verification', exact: true }),
  ).toBeVisible()
  await expect(menu.getByRole('link', { name: /^Admin/ })).toHaveCount(0)
  await expectNoPageOverflow(page, 'expanded mobile navigation')
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(toggle).toBeFocused()
  await toggle.click()
  await menu.getByRole('link', { name: 'My profile', exact: true }).click()
  await expect(page).toHaveURL(/\/profile$/)
  await expect(menu).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'My profile', exact: true }),
  ).toBeVisible()
})

test('desktop account disclosure supports keyboard open, Escape and focus return', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockRedesign(page, { admin: false })
  await page.goto('/')
  const summary = page.locator('summary[aria-label="My account"]')
  await summary.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.account-menu')).toHaveAttribute('open', '')
  await expect(
    page
      .locator('.account-menu__panel')
      .getByRole('link', { name: 'Account verification' }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.account-menu')).not.toHaveAttribute('open', '')
  await expect(summary).toBeFocused()
})

test('home search and browse clear controls preserve focus and committed filter behavior', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockRedesign(page)
  await page.goto('/')
  const keyword = page.getByLabel('What do you want to rent?', { exact: true })
  await keyword.fill('Camera')
  await page
    .getByRole('button', { name: 'Clear rental search', exact: true })
    .click()
  await expect(keyword).toHaveValue('')
  await expect(keyword).toBeFocused()
  const location = page.getByLabel('Location', { exact: true })
  await location.fill('Tibanga')
  await page
    .getByRole('button', { name: 'Clear location', exact: true })
    .click()
  await expect(location).toHaveValue('')
  await expect(location).toBeFocused()
  await keyword.fill('Camera')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page).toHaveURL(/\/listings\?q=Camera/)
  await page.getByRole('button', { name: /Filters & sort/ }).click()
  await page
    .getByLabel('Category', { exact: true })
    .selectOption('electronics-gadgets')
  await page.getByLabel('Min price (₱)', { exact: true }).fill('100')
  await page.getByLabel('Sort by', { exact: true }).selectOption('price_asc')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect
    .poll(() => new URL(page.url()).searchParams.get('category'))
    .toBe('electronics-gadgets')
  await page.getByRole('button', { name: 'Clear search', exact: true }).click()
  await expect(page.getByLabel('Search', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Search', { exact: true })).toBeFocused()
  expect(new URL(page.url()).searchParams.get('q')).toBeNull()
  expect(new URL(page.url()).searchParams.get('category')).toBe(
    'electronics-gadgets',
  )
  expect(new URL(page.url()).searchParams.get('min')).toBe('100')
  expect(new URL(page.url()).searchParams.get('sort')).toBe('price_asc')
})

test('password reveal is keyboard accessible, starts masked and preserves app validation', async ({
  page,
}) => {
  await mockRedesign(page, { signedIn: false, admin: false })
  await page.goto('/login')
  const password = page.getByLabel('Password', { exact: true })
  await password.fill('non-sensitive-sample')
  const show = page.getByRole('button', { name: 'Show password', exact: true })
  await show.focus()
  await page.keyboard.press('Enter')
  await expect(password).toHaveAttribute('type', 'text')
  await expect(
    page.getByRole('button', { name: 'Hide password', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Enter')
  await expect(password).toHaveAttribute('type', 'password')
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page.getByLabel('Email', { exact: true })).toBeFocused()
  await expect(page.getByLabel('Email', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  )
  await expect(page.getByRole('alert')).toHaveText(
    'Please enter a valid email address.',
  )
  await expect(password).toHaveValue('non-sensitive-sample')
})

test('unsaved listing navigation uses an accessible app dialog and keeps the draft when canceled', async ({
  page,
}) => {
  await mockRedesign(page)
  await page.goto('/list')
  const title = page.getByLabel('Title', { exact: true })
  await title.fill('A draft worth keeping')
  await page
    .getByRole('banner')
    .getByRole('link', { name: 'eRental home', exact: true })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Leave without saving?' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(title).toHaveValue('A draft worth keeping')
  await expect(page).toHaveURL(/\/list$/)
  await page
    .getByRole('banner')
    .getByRole('link', { name: 'eRental home', exact: true })
    .click()
  await dialog.getByRole('button', { name: 'Leave page', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
})

function contrastRatio(foreground, background) {
  const luminance = (color) => {
    const parts = color
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map(Number)
    const linear = parts.map((value) => {
      const channel = value / 255
      return channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4
    })
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
  }
  const values = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  )
  return (values[0] + 0.05) / (values[1] + 0.05)
}

for (const theme of THEMES) {
  test(`${theme} semantic text roles meet AA contrast and reduced motion stops skeleton animation`, async ({
    page,
  }) => {
    await setTheme(page, theme)
    await mockRedesign(page)
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    const pairs = await page.evaluate(() => {
      const roles = [
        ['body', '--text', '--bg'],
        ['secondary text', '--muted', '--bg'],
        ['card text', '--text', '--surface-elevated'],
        ['secondary card labels', '--muted', '--surface-elevated'],
        ['field text', '--text', '--input-bg'],
        ['primary action', '--on-primary', '--primary'],
        ['success', '--success-text', '--success-bg'],
        ['warning', '--warning-text', '--warning-bg'],
        ['error', '--danger-text', '--danger-bg'],
        ['information', '--info-text', '--info-bg'],
        ['footer', '--footer-text', '--footer-bg'],
        ['footer secondary', '--footer-muted', '--footer-bg'],
      ]
      const probe = document.createElement('span')
      document.body.append(probe)
      const result = roles.map(([name, foreground, background]) => {
        probe.style.color = `var(${foreground})`
        probe.style.backgroundColor = `var(${background})`
        const style = getComputedStyle(probe)
        return {
          name,
          foreground: style.color,
          background: style.backgroundColor,
        }
      })
      probe.className = 'skeleton'
      const animation = getComputedStyle(probe).animationName
      probe.remove()
      return { result, animation }
    })
    for (const pair of pairs.result) {
      expect(
        contrastRatio(pair.foreground, pair.background),
        `${theme}: ${pair.name} (${pair.foreground} on ${pair.background})`,
      ).toBeGreaterThanOrEqual(4.5)
    }
    expect(pairs.animation).toBe('none')
  })
}

test('browse skeleton, error and empty states remain honest and recoverable after redesign', async ({
  page,
}) => {
  let stage = 'loading'
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  await mockRedesign(page, {
    override: async (route, { url }) => {
      if (!url.pathname.endsWith('/search_listings')) return false
      if (stage === 'loading') await gate
      if (stage === 'error') await apiError(route)
      else if (stage === 'empty') await json(route, [])
      else return false
      return true
    },
  })
  await page.goto('/listings')
  await expect(page.locator('.listing-skeleton').first()).toBeVisible()
  stage = 'error'
  release()
  await expect(page.getByRole('alert')).toContainText('couldn’t load listings')
  stage = 'empty'
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'No listings match your search' }),
  ).toBeVisible()
  await expect(page.locator('.listing-card')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('responsive navigation moves focus to the visible account control when its menu disappears', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockRedesign(page, { admin: false })
  await page.goto('/')
  await page.getByRole('button', { name: 'Open menu', exact: true }).click()
  const mobile = page.getByRole('navigation', { name: 'Mobile', exact: true })
  await mobile
    .getByRole('link', { name: 'Account verification', exact: true })
    .focus()
  await page.setViewportSize({ width: 1440, height: 900 })
  const desktop = page.locator('summary[aria-label="My account"]')
  await expect(desktop).toBeVisible()
  await expect(desktop).toBeFocused()
  await expect(mobile).toHaveCount(0)

  await page.keyboard.press('Enter')
  await page
    .locator('.account-menu__panel')
    .getByRole('link', { name: 'My profile', exact: true })
    .focus()
  await page.setViewportSize({ width: 390, height: 844 })
  const toggle = page.getByRole('button', { name: 'Open menu', exact: true })
  await expect(toggle).toBeVisible()
  await expect(toggle).toBeFocused()
  await expect(page.locator('.account-menu')).not.toHaveAttribute('open', '')
})

test('admin removal confirms its existing RPC and restores focus after the report card disappears', async ({
  page,
}) => {
  let resolved = false
  let decision = null
  await mockRedesign(page, {
    override: async (route, { url, body }) => {
      if (url.pathname === '/rest/v1/listing_reports' && resolved) {
        await json(route, [])
        return true
      }
      if (url.pathname === '/rest/v1/rpc/resolve_report') {
        decision = body
        resolved = true
        await json(route, null)
        return true
      }
      return false
    },
  })
  await page.goto('/admin')
  await page
    .getByLabel('Note (optional)', { exact: true })
    .fill('Sample removal reason.')
  await page
    .getByRole('button', { name: 'Remove listing', exact: true })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Remove this listing?' })
  await expect(dialog).toBeVisible()
  expect(decision).toBeNull()
  await dialog.getByRole('button', { name: 'Yes, remove', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'No open reports', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', {
      level: 2,
      name: 'Reports to review',
      exact: true,
    }),
  ).toBeFocused()
  await expect(
    page.getByRole('status').filter({ hasText: 'Camera for rent' }),
  ).toContainText('removed')
  expect(decision).toEqual({
    p_report_id: 'fixture-report',
    p_action: 'remove_listing',
    p_note: 'Sample removal reason.',
  })
})

test('Escape closes the unsaved-profile dialog without removing its mobile navigation opener', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockRedesign(page, { admin: false })
  await page.goto('/profile')
  const name = page.getByLabel('Display name', { exact: true })
  await name.fill('A profile draft worth keeping')
  await page.getByRole('button', { name: 'Open menu', exact: true }).click()
  const menu = page.getByRole('navigation', { name: 'Mobile', exact: true })
  const opener = menu.getByRole('link', {
    name: 'Account verification',
    exact: true,
  })
  await opener.click()
  const dialog = page.getByRole('dialog', { name: 'Leave without saving?' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(menu).toBeVisible()
  await expect(opener).toBeFocused()
  await expect(name).toHaveValue('A profile draft worth keeping')
  await expect(page).toHaveURL(/\/profile$/)
})
