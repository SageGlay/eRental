import {
  apiError,
  json,
  mockMarketplace,
  png,
  profile as baseProfile,
  USER_ID,
} from './fixtures.js'

export const REQUEST_ID = '77777777-7777-4777-8777-777777777777'
export const sampleRequest = (overrides = {}) => ({
  id: REQUEST_ID,
  user_id: USER_ID,
  kind: 'identity',
  document_type: 'government_id',
  document_path: `${USER_ID}/sample.png`,
  details: null,
  status: 'pending',
  admin_note: null,
  reviewed_by: null,
  reviewed_at: null,
  created_at: '2026-11-12T00:00:00Z',
  ...overrides,
})

export async function mockVerification(page, options = {}) {
  const state = {
    profile: {
      ...baseProfile,
      verified_kind: null,
      verified_at: null,
      ...options.profile,
    },
    rows: structuredClone(options.rows ?? []),
    objects: new Map(),
    admin: options.admin ?? false,
    uploads: [],
    reviews: [],
  }
  for (const row of state.rows)
    state.objects.set(row.document_path, {
      name: row.document_path.split('/').at(-1),
    })
  const model = await mockMarketplace(
    page,
    async (route, ctx) => {
      const { url, method, body } = ctx
      if (await options.override?.(route, { ...ctx, state })) return true
      if (url.pathname.endsWith('/is_admin')) {
        await json(route, state.admin)
        return true
      }
      if (url.pathname === '/rest/v1/profiles') {
        if (method === 'PATCH') {
          if (
            Object.keys(body).some((key) => state.profile[key] !== body[key])
          ) {
            state.profile.verified_kind = null
            state.profile.verified_at = null
          }
          Object.assign(state.profile, body)
          await json(route, { id: USER_ID })
          return true
        }
        await json(route, [state.profile])
        return true
      }
      if (url.pathname === '/rest/v1/verification_submissions') {
        if (method === 'POST') {
          if (
            state.rows.some(
              (r) => r.user_id === body.user_id && r.status === 'pending',
            )
          ) {
            await apiError(
              route,
              'verification_one_pending_per_user',
              409,
              '23505',
            )
            return true
          }
          const row = sampleRequest({
            ...body,
            id: state.rows.length
              ? '88888888-8888-4888-8888-888888888888'
              : REQUEST_ID,
            status: 'pending',
            created_at: '2026-11-18T00:00:00Z',
          })
          state.rows.unshift(row)
          await json(route, row, 201)
          return true
        }
        const matches = state.rows
          .filter((r) =>
            ['user_id', 'document_path', 'status'].every(
              (key) =>
                !url.searchParams.has(key) ||
                `eq.${r[key]}` === url.searchParams.get(key),
            ),
          )
          .sort(
            (a, b) =>
              (a.created_at.localeCompare(b.created_at) ||
                a.id.localeCompare(b.id)) *
              (url.searchParams.get('order')?.startsWith('created_at.asc')
                ? 1
                : -1),
          )
        const offset = Number(url.searchParams.get('offset') ?? 0)
        const limit = Number(url.searchParams.get('limit') ?? matches.length)
        const rows = matches
          .slice(offset, offset + limit)
          .map((r) => ({ ...r, applicant: { ...state.profile } }))
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify(rows),
          headers: {
            'content-range': `${offset}-${offset + rows.length - 1}/${matches.length}`,
            'access-control-expose-headers': 'content-range',
          },
        })
        return true
      }
      if (
        url.pathname.startsWith(
          '/storage/v1/object/list/verification-documents',
        )
      ) {
        const rows = [...state.objects.entries()]
          .filter(
            ([path]) =>
              path.startsWith(body.prefix + '/') &&
              path.split('/').at(-1) === body.search,
          )
          .map(([, value]) => value)
        await json(route, rows)
        return true
      }
      if (
        url.pathname.startsWith(
          '/storage/v1/object/authenticated/verification-documents/',
        )
      ) {
        if (!state.admin) {
          await apiError(route, 'Access denied', 403)
          return true
        }
        await route.fulfill({ body: png.buffer, contentType: 'image/png' })
        return true
      }
      if (
        url.pathname.startsWith('/storage/v1/object/verification-documents/')
      ) {
        if (method === 'GET') {
          if (!state.admin) {
            await apiError(route, 'Access denied', 403)
            return true
          }
          await route.fulfill({ body: png.buffer, contentType: 'image/png' })
          return true
        }
        if (method !== 'POST')
          throw Error(
            'Verification documents must not be updated or deleted by this frontend',
          )
        const path = decodeURIComponent(
          url.pathname.split('/verification-documents/')[1],
        )
        state.uploads.push(path)
        if (state.objects.has(path)) {
          await apiError(route, 'Duplicate object', 409, 'Duplicate')
          return true
        }
        state.objects.set(path, { name: path.split('/').at(-1) })
        await json(route, { Key: path }, 201)
        return true
      }
      if (url.pathname.endsWith('/review_verification')) {
        state.reviews.push(body)
        if (!state.admin) {
          await apiError(route, 'Admins only.', 403)
          return true
        }
        const row = state.rows.find((r) => r.id === body.p_submission_id)
        if (row?.status !== 'pending') {
          await apiError(route, 'Already reviewed', 400)
          return true
        }
        row.status = body.p_action === 'approve' ? 'approved' : 'rejected'
        row.admin_note = body.p_note
        row.reviewed_at = '2026-11-18T01:00:00Z'
        row.reviewed_by = USER_ID
        if (body.p_action === 'approve') {
          state.profile.verified_kind = row.kind
          state.profile.verified_at = row.reviewed_at
        }
        await json(route, null)
        return true
      }
      return false
    },
    { signedIn: options.signedIn ?? true },
  )
  return { model, state }
}
