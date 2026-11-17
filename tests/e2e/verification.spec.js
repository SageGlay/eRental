import { expect } from '@playwright/test'
import { test, apiError, calls, json, png, USER_ID } from './fixtures.js'
import {
  mockVerification,
  sampleRequest,
  REQUEST_ID,
} from './verification-fixture.js'

const submit = (page) =>
  page.getByRole('button', { name: 'Submit verification request', exact: true })

for (const path of ['/verification', '/admin/verification']) {
  test(`signed-out access to ${path} requires login`, async ({ page }) => {
    const { model } = await mockVerification(page, { signedIn: false })
    await page.goto(path)
    await expect(page).toHaveURL(/\/login$/)
    expect(
      calls(model, '/rest/v1/verification_submissions', 'GET'),
    ).toHaveLength(0)
  })
}

test('identity submission uses own private folder and only INSERT-granted columns', async ({
  page,
}) => {
  const { model, state } = await mockVerification(page)
  await page.goto('/verification')
  await expect(page.getByText('Not verified', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('option', { name: 'Business registration' }),
  ).toHaveCount(0)
  await page.getByLabel('Document', { exact: true }).setInputFiles(png)
  await page
    .getByLabel('Details (optional)')
    .fill('Non-sensitive sample identity document.')
  await submit(page).click()
  await expect(page.getByText('Pending', { exact: true })).toBeVisible()
  await expect(submit(page)).toHaveCount(0)
  const request = calls(model, '/rest/v1/verification_submissions', 'POST')[0]
    .body
  expect(Object.keys(request).sort()).toEqual([
    'details',
    'document_path',
    'document_type',
    'kind',
    'user_id',
  ])
  expect(request).toMatchObject({
    user_id: USER_ID,
    kind: 'identity',
    document_type: 'government_id',
  })
  expect(request.document_path).toMatch(
    new RegExp(`^${USER_ID}/[0-9a-f-]+\\.png$`),
  )
  expect(state.uploads).toHaveLength(1)
  await page.reload()
  await expect(page.getByText('Pending', { exact: true })).toBeVisible()
  await expect(page.locator('.verified-badge')).toHaveCount(0)
})

test('business account uses business document types and submits business verification', async ({
  page,
}) => {
  const { model } = await mockVerification(page, {
    profile: { account_type: 'business', business_name: 'Sample rentals' },
  })
  await page.goto('/verification')
  await expect(page.getByLabel('Document type')).toHaveValue(
    'business_registration',
  )
  await expect(page.getByRole('option', { name: 'Government ID' })).toHaveCount(
    0,
  )
  await page.getByLabel('Document', { exact: true }).setInputFiles(png)
  await submit(page).click()
  await expect(page.getByText('Pending', { exact: true })).toBeVisible()
  expect(
    calls(model, '/rest/v1/verification_submissions', 'POST')[0].body,
  ).toMatchObject({ kind: 'business', document_type: 'business_registration' })
})

test('invalid, empty, oversized and falsely labelled documents never upload', async ({
  page,
}) => {
  const { state } = await mockVerification(page)
  await page.goto('/verification')
  for (const [file, message] of [
    [
      {
        name: 'sample.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('sample'),
      },
      'Use a JPEG',
    ],
    [{ ...png, buffer: Buffer.alloc(0) }, 'document is empty'],
    [{ ...png, buffer: Buffer.alloc(5 * 1024 * 1024 + 1) }, '5 MB or smaller'],
    [
      {
        name: 'fake.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('<html>sample</html>'),
      },
      'contents do not match',
    ],
  ]) {
    await page.getByLabel('Document', { exact: true }).setInputFiles(file)
    await submit(page).click()
    await expect(page.getByRole('alert')).toContainText(message)
    await expect(page.getByLabel('Document', { exact: true })).toBeFocused()
  }
  expect(state.uploads).toHaveLength(0)
})

test('failed submission insert retries the same private upload without DELETE or upsert', async ({
  page,
}) => {
  let failing = true
  const { model, state } = await mockVerification(page, {
    override: async (route, { url, method }) => {
      if (
        url.pathname === '/rest/v1/verification_submissions' &&
        method === 'POST' &&
        failing
      ) {
        await apiError(route)
        return true
      }
      return false
    },
  })
  await page.goto('/verification')
  await page.getByLabel('Document', { exact: true }).setInputFiles(png)
  await submit(page).click()
  await expect(page.getByRole('alert')).toContainText('document stays private')
  failing = false
  await page.getByRole('button', { name: 'Retry submission' }).click()
  await expect(page.getByText('Pending', { exact: true })).toBeVisible()
  expect(state.uploads).toHaveLength(1)
  expect(
    calls(model, '/rest/v1/verification_submissions', 'POST'),
  ).toHaveLength(2)
  expect(
    model.calls.some(
      (c) => c.path.includes('verification-documents') && c.method === 'DELETE',
    ),
  ).toBe(false)
})

test('uncertain insert response is reconciled by own document path instead of creating a duplicate', async ({
  page,
}) => {
  let first = true
  const { model, state } = await mockVerification(page, {
    override: async (route, { url, method, body, state }) => {
      if (
        url.pathname === '/rest/v1/verification_submissions' &&
        method === 'POST' &&
        first
      ) {
        first = false
        state.rows.push(sampleRequest(body))
        await apiError(route)
        return true
      }
      return false
    },
  })
  await page.goto('/verification')
  await page.getByLabel('Document', { exact: true }).setInputFiles(png)
  await submit(page).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button', { name: 'Retry submission' }).click()
  await expect(page.getByText('Pending', { exact: true })).toBeVisible()
  expect(state.rows).toHaveLength(1)
  expect(
    calls(model, '/rest/v1/verification_submissions', 'POST'),
  ).toHaveLength(1)
})

test('a lost upload response is recovered by private metadata lookup without overwriting', async ({
  page,
}) => {
  let first = true
  const { state } = await mockVerification(page, {
    override: async (route, { url, method, state }) => {
      if (
        url.pathname.startsWith('/storage/v1/object/verification-documents/') &&
        method === 'POST' &&
        first
      ) {
        first = false
        const path = decodeURIComponent(
          url.pathname.split('/verification-documents/')[1],
        )
        state.objects.set(path, { name: path.split('/').at(-1) })
        state.uploads.push(path)
        await apiError(route)
        return true
      }
      return false
    },
  })
  await page.goto('/verification')
  await page.getByLabel('Document', { exact: true }).setInputFiles(png)
  await submit(page).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button', { name: 'Retry submission' }).click()
  await expect(page.getByText('Pending', { exact: true })).toBeVisible()
  expect(state.uploads).toHaveLength(1)
})

test('authoritative verified profile shows the badge; an old approved submission alone cannot grant it', async ({
  page,
}) => {
  const { state } = await mockVerification(page, {
    profile: { verified_kind: 'identity', verified_at: '2026-11-12T00:00:00Z' },
    rows: [sampleRequest({ status: 'approved' })],
  })
  await page.goto('/verification')
  await expect(page.locator('.verified-badge')).toHaveText('Identity verified')
  await expect(submit(page)).toHaveCount(0)
  state.profile.verified_kind = null
  state.profile.verified_at = null
  await page.getByRole('button', { name: 'Refresh status' }).click()
  await expect(page.getByText('Not verified', { exact: true })).toBeVisible()
  await expect(page.locator('.verified-badge')).toHaveCount(0)
  await expect(submit(page)).toBeEnabled()
})

test('rejected request shows the permitted review note and allows resubmission without a badge', async ({
  page,
}) => {
  await mockVerification(page, {
    rows: [
      sampleRequest({
        status: 'rejected',
        admin_note: 'Please provide a clearer sample.',
        reviewed_at: '2026-11-13T00:00:00Z',
      }),
    ],
  })
  await page.goto('/verification')
  await expect(page.getByText('Rejected', { exact: true })).toBeVisible()
  await expect(
    page.getByText(/Reason: Please provide a clearer sample/),
  ).toBeVisible()
  await expect(page.locator('.verified-badge')).toHaveCount(0)
  await page.getByLabel('Document', { exact: true }).setInputFiles(png)
  await submit(page).click()
  await expect(page.getByText('Pending', { exact: true })).toBeVisible()
})

test('ordinary user cannot enter the administrator verification UI', async ({
  page,
}) => {
  const { model } = await mockVerification(page)
  await page.goto('/admin/verification')
  await expect(page.getByRole('heading', { name: 'Admins only' })).toBeVisible()
  expect(calls(model, '/rest/v1/verification_submissions', 'GET')).toHaveLength(
    0,
  )
})

test('admin privately views and approves through the real RPC contract, then user status reflects profile fields', async ({
  page,
}) => {
  const { state, model } = await mockVerification(page, {
    admin: true,
    rows: [sampleRequest()],
  })
  await page.goto('/admin/verification')
  await page
    .getByRole('button', { name: 'Review request from Test renter' })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Review verification' })
  await dialog.getByRole('button', { name: 'View private document' }).click()
  await expect(
    dialog.getByRole('img', {
      name: 'Privately submitted verification document',
    }),
  ).toHaveAttribute('src', /^blob:/)
  expect(
    model.calls.some((c) =>
      c.path.includes('/object/public/verification-documents'),
    ),
  ).toBe(false)
  await dialog.getByRole('button', { name: 'Approve', exact: true }).click()
  await dialog.getByRole('button', { name: 'Confirm approval' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Verification approved.' }),
  ).toBeVisible()
  expect(state.reviews).toEqual([
    { p_submission_id: REQUEST_ID, p_action: 'approve', p_note: null },
  ])
  expect(
    calls(model, '/rest/v1/verification_submissions', 'PATCH'),
  ).toHaveLength(0)
  await page.goto('/verification')
  await expect(page.locator('.verified-badge')).toHaveText('Identity verified')
})

test('rejection requires a reason and the user sees the persisted note without a badge', async ({
  page,
}) => {
  const { state } = await mockVerification(page, {
    admin: true,
    rows: [sampleRequest()],
  })
  await page.goto('/admin/verification')
  await page
    .getByRole('button', { name: 'Review request from Test renter' })
    .click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Reject', exact: true }).click()
  await expect(dialog.getByRole('alert')).toHaveText(
    'Give a reason for rejecting this request.',
  )
  await expect(
    dialog.getByLabel('Review note (required for rejection)'),
  ).toBeFocused()
  await dialog
    .getByLabel('Review note (required for rejection)')
    .fill('Please provide a clearer sample.')
  await dialog.getByRole('button', { name: 'Reject', exact: true }).click()
  await dialog.getByRole('button', { name: 'Confirm rejection' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Verification rejected.' }),
  ).toBeVisible()
  expect(state.reviews[0]).toEqual({
    p_submission_id: REQUEST_ID,
    p_action: 'reject',
    p_note: 'Please provide a clearer sample.',
  })
  await page.goto('/verification')
  await expect(page.getByText('Rejected', { exact: true })).toBeVisible()
  await expect(page.locator('.verified-badge')).toHaveCount(0)
})

test('RPC authorization failure is not reported as a completed review and preserves the note', async ({
  page,
}) => {
  await mockVerification(page, {
    admin: true,
    rows: [sampleRequest()],
    override: async (route, { url }) => {
      if (url.pathname.endsWith('/review_verification')) {
        await apiError(route, 'Admins only.', 403)
        return true
      }
      return false
    },
  })
  await page.goto('/admin/verification')
  await page
    .getByRole('button', { name: 'Review request from Test renter' })
    .click()
  const dialog = page.getByRole('dialog')
  await dialog
    .getByLabel('Review note (required for rejection)')
    .fill('Sample note.')
  await dialog.getByRole('button', { name: 'Approve', exact: true }).click()
  await dialog.getByRole('button', { name: 'Confirm approval' }).click()
  await expect(dialog.getByRole('alert')).toContainText(
    'couldn’t confirm this review',
  )
  await expect(
    dialog.getByLabel('Review note (required for rejection)'),
  ).toHaveValue('Sample note.')
  await expect(
    page.getByText('Verification approved.', { exact: true }),
  ).toHaveCount(0)
})

test('private document access denial has no public URL fallback', async ({
  page,
}) => {
  await mockVerification(page, {
    admin: true,
    rows: [sampleRequest()],
    override: async (route, { url }) => {
      if (
        (url.pathname.startsWith(
          '/storage/v1/object/authenticated/verification-documents/',
        ) ||
          url.pathname.startsWith(
            '/storage/v1/object/verification-documents/',
          )) &&
        route.request().method() === 'GET'
      ) {
        await apiError(route, 'Access denied', 403)
        return true
      }
      return false
    },
  })
  await page.goto('/admin/verification')
  await page
    .getByRole('button', { name: 'Review request from Test renter' })
    .click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'View private document' }).click()
  await expect(dialog.getByRole('alert')).toContainText(
    'couldn’t open this private document',
  )
  await expect(
    dialog.getByRole('link', { name: 'Open document in new tab' }),
  ).toHaveCount(0)
})

test('admin filters, sorting and ten-record pagination persist in the URL', async ({
  page,
}) => {
  const rows = Array.from({ length: 11 }, (_, i) =>
    sampleRequest({
      id: `request-${i}`,
      created_at: `2026-11-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
    }),
  )
  rows.push(
    sampleRequest({
      id: 'approved-one',
      status: 'approved',
      reviewed_at: '2026-11-12T00:00:00Z',
    }),
  )
  await mockVerification(page, { admin: true, rows })
  await page.goto('/admin/verification')
  await expect(page.locator('.verification-table tbody tr')).toHaveCount(10)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page).toHaveURL(/page=2/)
  await expect(page.locator('.verification-table tbody tr')).toHaveCount(1)
  await page.getByLabel('Sort by').selectOption('oldest')
  await expect(page).toHaveURL(/sort=oldest.*page=1/)
  await page.getByLabel('Status', { exact: true }).selectOption('approved')
  await expect(page.locator('.verification-table tbody tr')).toHaveCount(1)
  await expect(page).toHaveURL(/status=approved/)
  await page.goBack()
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue(
    'pending',
  )
})

test('mobile review is keyboard accessible and restores focus after Escape', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockVerification(page, { admin: true, rows: [sampleRequest()] })
  await page.goto('/admin/verification')
  const review = page.getByRole('button', {
    name: 'Review request from Test renter',
  })
  await review.focus()
  await page.keyboard.press('Enter')
  await expect(
    page
      .getByRole('dialog')
      .getByRole('button', { name: 'Close', exact: true }),
  ).toBeFocused()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: testInfo.outputPath('mobile-review.png'),
    fullPage: true,
  })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(review).toBeFocused()
})

test('encoded traversal is rejected before any private download or approval', async ({
  page,
}) => {
  const { model } = await mockVerification(page, {
    admin: true,
    rows: [
      sampleRequest({
        document_path: `${USER_ID}/%2e%2e/22222222-2222-4222-8222-222222222222/known.png`,
      }),
    ],
  })
  await page.goto('/admin/verification')
  await page
    .getByRole('button', { name: 'Review request from Test renter' })
    .click()
  const dialog = page.getByRole('dialog')
  await expect(
    dialog.getByRole('button', { name: 'Approve', exact: true }),
  ).toBeDisabled()
  await dialog.getByRole('button', { name: 'View private document' }).click()
  await expect(dialog.getByRole('alert')).toContainText(
    'couldn’t open this private document',
  )
  expect(
    model.calls.filter(
      (c) => c.path.includes('/object/') && c.method === 'GET',
    ),
  ).toHaveLength(0)
})

test('profile/account mismatch disables approval while retaining rejection', async ({
  page,
}) => {
  await mockVerification(page, {
    admin: true,
    profile: { account_type: 'business', business_name: 'Sample business' },
    rows: [sampleRequest({ kind: 'identity' })],
  })
  await page.goto('/admin/verification')
  await page
    .getByRole('button', { name: 'Review request from Test renter' })
    .click()
  const dialog = page.getByRole('dialog')
  await expect(
    dialog.getByRole('button', { name: 'Approve', exact: true }),
  ).toBeDisabled()
  await expect(
    dialog.getByRole('button', { name: 'Reject', exact: true }),
  ).toBeEnabled()
  await expect(
    dialog.getByText(/current account details do not match/),
  ).toBeVisible()
})

test('review confirmation and completion keep keyboard focus in a meaningful place', async ({
  page,
}) => {
  await mockVerification(page, { admin: true, rows: [sampleRequest()] })
  await page.goto('/admin/verification')
  await page
    .getByRole('button', { name: 'Review request from Test renter' })
    .click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Go back' })).toBeFocused()
  await dialog.getByRole('button', { name: 'Go back' }).click()
  await expect(
    dialog.getByRole('button', { name: 'Approve', exact: true }),
  ).toBeFocused()
  await dialog.getByRole('button', { name: 'Approve', exact: true }).click()
  await dialog.getByRole('button', { name: 'Confirm approval' }).click()
  await expect(
    page.getByRole('heading', { name: 'Verification requests', exact: true }),
  ).toBeFocused()
})

test('private object URLs are revoked when the review closes', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.objectUrls = { made: [], revoked: [] }
    const create = URL.createObjectURL.bind(URL)
    const revoke = URL.revokeObjectURL.bind(URL)
    URL.createObjectURL = (blob) => {
      const url = create(blob)
      window.objectUrls.made.push(url)
      return url
    }
    URL.revokeObjectURL = (url) => {
      window.objectUrls.revoked.push(url)
      return revoke(url)
    }
  })
  await mockVerification(page, { admin: true, rows: [sampleRequest()] })
  await page.goto('/admin/verification')
  await page
    .getByRole('button', { name: 'Review request from Test renter' })
    .click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'View private document' }).click()
  await expect(dialog.getByRole('img')).toBeVisible()
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  const result = await page.evaluate(() => window.objectUrls)
  expect(result.made).toHaveLength(1)
  expect(result.revoked).toEqual(result.made)
})

test('reviewing the last request on page two recovers from PostgREST PGRST103', async ({
  page,
}) => {
  const rows = Array.from({ length: 11 }, (_, i) =>
    sampleRequest({
      id: `request-${i}`,
      created_at: `2026-11-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
    }),
  )
  const { model } = await mockVerification(page, {
    admin: true,
    rows,
    override: async (route, { url, state, method }) => {
      if (
        url.pathname === '/rest/v1/verification_submissions' &&
        method === 'GET' &&
        Number(url.searchParams.get('offset')) >=
          state.rows.filter((r) => r.status === 'pending').length
      ) {
        await apiError(
          route,
          'Requested range not satisfiable',
          416,
          'PGRST103',
        )
        return true
      }
      return false
    },
  })
  await page.goto('/admin/verification?status=pending&page=2&sort=newest')
  await page
    .getByRole('button', { name: 'Review request from Test renter' })
    .click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Approve', exact: true }).click()
  await dialog.getByRole('button', { name: 'Confirm approval' }).click()
  await expect(page).toHaveURL(/status=pending.*page=1/)
  await expect(page.locator('.verification-table tbody tr')).toHaveCount(10)
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(
    calls(model, '/rest/v1/verification_submissions', 'GET').some((c) =>
      c.search.includes('offset=10'),
    ),
  ).toBe(true)
})

test('business verified badges use authoritative public fields in profile and listing owner displays', async ({
  page,
}) => {
  const { model, state } = await mockVerification(page, {
    profile: {
      account_type: 'business',
      business_name: 'Sample business',
      verified_kind: 'business',
      verified_at: '2026-11-12T00:00:00Z',
    },
  })
  model.listing.profiles = state.profile
  await page.goto('/profile')
  await expect(page.locator('.verified-badge')).toHaveText('Business verified')
  await page.getByLabel('Display name').fill('Updated sample name')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.locator('.verified-badge')).toHaveCount(0)
  state.profile.verified_kind = 'business'
  state.profile.verified_at = '2026-11-12T00:00:00Z'
  await page.goto('/listings/33333333-3333-4333-8333-333333333333')
  await expect(page.locator('.owner-card .verified-badge')).toHaveText(
    'Business verified',
  )
})

test('a stalled review recovers within its deadline and requires queue reconciliation', async ({
  page,
}) => {
  let release, started
  const pending = new Promise((resolve) => {
    release = resolve
  })
  const received = new Promise((resolve) => {
    started = resolve
  })
  await page.clock.install()
  await mockVerification(page, {
    admin: true,
    rows: [sampleRequest()],
    override: async (route, { url }) => {
      if (url.pathname.endsWith('/review_verification')) {
        started()
        await pending
        await json(route, null)
        return true
      }
      return false
    },
  })
  await page.goto('/admin/verification')
  await page
    .getByRole('button', { name: 'Review request from Test renter' })
    .click()
  const dialog = page.getByRole('dialog')
  await dialog
    .getByLabel('Review note (required for rejection)')
    .fill('Retained sample note.')
  await dialog.getByRole('button', { name: 'Approve', exact: true }).click()
  await dialog.getByRole('button', { name: 'Confirm approval' }).click()
  await received
  await page.clock.fastForward(16000)
  await expect(dialog.getByRole('alert')).toContainText('couldn’t confirm')
  await expect(
    dialog.getByRole('button', { name: 'Close', exact: true }),
  ).toBeEnabled()
  await expect(
    dialog.getByRole('button', { name: 'Refresh queue' }),
  ).toBeFocused()
  await expect(
    dialog.getByRole('button', { name: 'Approve', exact: true }),
  ).toBeDisabled()
  await expect(
    dialog.getByLabel('Review note (required for rejection)'),
  ).toHaveValue('Retained sample note.')
  release()
  await dialog.getByRole('button', { name: 'Refresh queue' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('a privately committed upload with no response times out and retries without another upload', async ({
  page,
}) => {
  let release, started
  let first = true
  const pending = new Promise((resolve) => {
    release = resolve
  })
  const received = new Promise((resolve) => {
    started = resolve
  })
  await page.clock.install()
  const { state } = await mockVerification(page, {
    override: async (route, { url, method, state }) => {
      if (
        url.pathname.startsWith('/storage/v1/object/verification-documents/') &&
        method === 'POST' &&
        first
      ) {
        first = false
        const path = decodeURIComponent(
          url.pathname.split('/verification-documents/')[1],
        )
        state.objects.set(path, { name: path.split('/').at(-1) })
        state.uploads.push(path)
        started()
        await pending
        await json(route, { Key: path }, 201)
        return true
      }
      return false
    },
  })
  await page.goto('/verification')
  await page.getByLabel('Document', { exact: true }).setInputFiles(png)
  await submit(page).click()
  await received
  await page.clock.fastForward(31000)
  await expect(page.getByRole('alert')).toContainText('document stays private')
  await page.getByRole('button', { name: 'Retry submission' }).click()
  await expect(page.getByText('Pending', { exact: true })).toBeVisible()
  expect(state.uploads).toHaveLength(1)
  expect(state.rows).toHaveLength(1)
  release()
})

test('safe legacy document names with spaces are encoded without changing their owner folder', async ({
  page,
}) => {
  const { model } = await mockVerification(page, {
    admin: true,
    rows: [sampleRequest({ document_path: `${USER_ID}/old school ID.png` })],
  })
  await page.goto('/admin/verification')
  await page
    .getByRole('button', { name: 'Review request from Test renter' })
    .click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'View private document' }).click()
  await expect(dialog.getByRole('img')).toBeVisible()
  expect(
    model.calls.some((c) =>
      c.path.endsWith(`/${USER_ID}/old%20school%20ID.png`),
    ),
  ).toBe(true)
})
