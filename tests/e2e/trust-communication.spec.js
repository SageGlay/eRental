import { expect, test } from '@playwright/test'
import { apiError, calls, json, LISTING_ID, mockMarketplace, OWNER_ID, USER_ID } from './fixtures.js'

const thread = '44444444-4444-4444-8444-444444444444'
const reportId = '55555555-5555-4555-8555-555555555555'
const messageId = '66666666-6666-4666-8666-666666666666'
const sentId = '77777777-7777-4777-8777-777777777777'
const sendPath = '/rest/v1/rpc/send_conversation_message'
const createdAt = '2026-11-25T02:00:00Z'
const synthetic = (id, body, extra = {}) => ({ id, body, sender_id: OWNER_ID, created_at: createdAt, read_at: null, ...extra })
const threadRecord = {
  id: thread,
  renter_id: USER_ID,
  owner_id: OWNER_ID,
  listings: { id: LISTING_ID, title: 'Camera for rent' },
  owner: { display_name: 'Sample owner' },
  renter: { display_name: 'Sample renter' },
}

async function communicationFixture(page, options = {}) {
  const data = { messages: [], blocked: false, blockedByOther: false, reports: [], ...options.data }
  const model = await mockMarketplace(page, async (route, request) => {
    const { url, method, body } = request
    if (method === 'OPTIONS') return false
    if (await options.override?.(route, request)) return true
    if (url.pathname === '/rest/v1/rpc/is_admin') { await json(route, Boolean(options.admin)); return true }
    if (url.pathname === '/rest/v1/conversations') {
      await json(route, [threadRecord]); return true
    }
    if (url.pathname === '/rest/v1/messages' && method === 'HEAD') {
      const count = data.messages.filter((row) => row.sender_id !== USER_ID && !row.read_at).length
      await route.fulfill({ status: 200, headers: { 'content-range': '*/' + count, 'access-control-expose-headers': 'content-range' } })
      return true
    }
    if (url.pathname === '/rest/v1/messages' && method === 'GET') {
      const rows = url.searchParams.has('conversation_id')
        ? [...data.messages]
        : data.messages.filter((row) => row.sender_id !== USER_ID && !row.read_at).map(() => ({ conversation_id: thread }))
      await json(route, rows)
      return true
    }
    if (url.pathname === '/rest/v1/messages' && method === 'PATCH') {
      const ids = url.searchParams.get('id') ?? ''
      data.messages.forEach((row) => {
        if (ids.includes(row.id) && row.sender_id !== USER_ID) row.read_at ??= body.read_at
      })
      await json(route, null)
      return true
    }
    if (url.pathname.endsWith('/conversation_contact_status')) {
      await json(route, { contact_allowed: !data.blocked && !data.blockedByOther, blocked_by_me: data.blocked, counterpart_id: OWNER_ID })
      return true
    }
    if (url.pathname.endsWith('/set_user_block')) {
      data.blocked = body.p_blocked
      await json(route, null)
      return true
    }
    if (url.pathname === '/rest/v1/user_blocks') {
      await json(route, data.blocked ? [{ blocked_id: OWNER_ID, profiles: { display_name: 'Sample owner' } }] : [])
      return true
    }
    if (url.pathname === sendPath) {
      if (!data.messages.some((row) => row.id === body.p_operation_id)) {
        data.messages.push(synthetic(body.p_operation_id, body.p_body, { sender_id: USER_ID, created_at: '2026-11-25T02:01:00Z' }))
      }
      await json(route, body.p_operation_id)
      return true
    }
    if (url.pathname === '/rest/v1/conversation_reports') {
      let rows = data.reports
      if (url.searchParams.get('status')) rows = rows.filter((row) => 'eq.' + row.status === url.searchParams.get('status'))
      await json(route, rows)
      return true
    }
    if (url.pathname.endsWith('/report_conversation')) {
      data.reports.push({ id: reportId, reason: body.p_reason, status: 'pending', created_at: createdAt })
      await json(route, reportId)
      return true
    }
    return false
  }, { realtime: Boolean(options.realtime) })
  return { model, data }
}

const openActions = (page) => page.getByLabel('Conversation actions', { exact: true }).click()

test('quick responses fill an editable draft and use the authorized send once', async ({ page }) => {
  const { model } = await communicationFixture(page)
  await page.goto('/messages/' + thread)
  await page.getByText('Quick responses', { exact: true }).click()
  await page.getByRole('button', { name: 'Is this still available?' }).click()
  expect(calls(model, sendPath, 'POST')).toHaveLength(0)
  const draft = page.getByLabel('Your message')
  await expect(draft).toBeFocused()
  await expect(draft).toHaveValue('Is this still available?')
  await draft.fill('Is this still available tomorrow?')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByText('Is this still available tomorrow?', { exact: true })).toBeVisible()
  expect(calls(model, sendPath, 'POST').map(({ body }) => body)).toEqual([{
    p_conversation_id: thread, p_body: 'Is this still available tomorrow?',
    p_operation_id: expect.stringMatching(/^[a-f0-9-]{36}$/),
  }])
})

test('an uncertain uncommitted message retries the same persisted operation identity', async ({ page }) => {
  let first = true
  const { model } = await communicationFixture(page, {
    async override(route, { url }) {
      if (url.pathname !== sendPath || !first) return false
      first = false
      await apiError(route)
      return true
    },
  })
  await page.goto('/messages/' + thread)
  await page.getByLabel('Your message').fill('Check our schedule.')
  const submit = page.getByRole('button', { name: 'Send', exact: true })
  await submit.click()
  await expect(page.getByRole('alert')).toContainText('couldn’t confirm your message')
  await expect(submit).toBeDisabled()
  await page.getByRole('button', { name: 'Refresh messages', exact: true }).click()
  await submit.click()
  await expect(page.getByText('Check our schedule.', { exact: true })).toBeVisible()
  const operations = calls(model, sendPath, 'POST')
  expect(operations).toHaveLength(2)
  expect(operations[1].body).toEqual(operations[0].body)
})

test('block disables new sends, keeps history, and can be removed from account settings', async ({ page }) => {
  const { model, data } = await communicationFixture(page, {
    data: { messages: [synthetic(messageId, 'Existing rental conversation')] },
  })
  await page.goto('/messages/' + thread)
  await openActions(page)
  await page.getByRole('button', { name: 'Block account', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Your conversation history', { exact: false })).toBeVisible()
  await dialog.getByRole('button', { name: 'Block account', exact: true }).click()
  await expect(page.getByText('Account blocked.', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Your message')).toBeDisabled()
  await expect(page.getByText('Quick responses', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Existing rental conversation')).toBeVisible()
  data.blockedByOther = true
  await page.goto('/profile#blocked-accounts')
  const blocked = page.getByRole('region', { name: 'Blocked accounts' })
  await expect(blocked.getByText('Sample owner')).toBeVisible()
  await blocked.getByRole('button', { name: 'Unblock', exact: true }).click()
  await expect(blocked.getByText('Your block was removed.')).toBeVisible()
  await expect(blocked.getByText('You haven’t blocked any accounts.')).toBeVisible()
  await page.goto('/messages/' + thread)
  await expect(page.getByText('Messaging is restricted', { exact: false })).toBeVisible()
  expect(calls(model, sendPath, 'POST')).toHaveLength(0)
})

test('conversation reporting validates the reason and sends only selected evidence after review', async ({ page }) => {
  const { model } = await communicationFixture(page, {
    data: { messages: [synthetic(messageId, 'A synthetic report example'), synthetic(sentId, 'Unselected example')] },
  })
  await page.goto('/messages/' + thread)
  await expect(page.getByText('A synthetic report example')).toBeVisible()
  await openActions(page)
  const path = '/rest/v1/rpc/report_conversation'
  await page.getByRole('button', { name: 'Report conversation', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Review report', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Choose a report reason')
  await dialog.getByLabel('Report reason').selectOption('harassment')
  await dialog.getByLabel('Supporting details').fill('Synthetic report for acceptance.')
  await dialog.getByRole('checkbox', { name: /A synthetic report example/ }).check()
  await dialog.getByRole('button', { name: 'Review report', exact: true }).click()
  await expect(dialog.getByRole('heading', { name: 'Review your report' })).toBeFocused()
  expect(calls(model, path, 'POST')).toHaveLength(0)
  await dialog.getByRole('button', { name: 'Submit report', exact: true }).click()
  await expect(page.getByText('Conversation reported.', { exact: false })).toBeVisible()
  expect(calls(model, path, 'POST')[0].body).toEqual({
    p_conversation_id: thread, p_reason: 'harassment',
    p_details: 'Synthetic report for acceptance.', p_message_ids: [messageId],
  })
  await expect(page.getByRole('region', { name: 'Your conversation reports' })).toContainText('Pending review')
  expect(calls(model, '/rest/v1/rpc/set_user_block', 'POST')).toHaveLength(0)
})

test('administrator loads only selected report evidence and records a reasoned resolution', async ({ page }) => {
  const report = { id: reportId, reason: 'spam', status: 'pending', created_at: createdAt, details: 'Synthetic report' }
  const { model } = await communicationFixture(page, {
    admin: true, data: { reports: [report] },
    async override(route, { url, body }) {
      if (url.pathname.endsWith('/get_conversation_report_evidence')) {
        expect(body).toEqual({ p_report_id: reportId })
        await json(route, [{ body: 'Selected synthetic evidence', message_id: messageId, sender_role: 'counterpart', created_at: createdAt }])
        return true
      }
      if (url.pathname.endsWith('/resolve_conversation_report')) {
        report.status = body.p_action
        report.admin_note = body.p_note
        await json(route, null)
        return true
      }
      return false
    },
  })
  await page.goto('/admin/conversation-reports')
  await page.getByRole('button', { name: 'Review report', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Selected synthetic evidence')).toBeVisible()
  await dialog.getByLabel('Decision').selectOption('dismissed')
  await expect(dialog.getByRole('button', { name: 'Save decision' })).toBeDisabled()
  await dialog.getByLabel('Reason shared with the reporter').fill('Synthetic evidence was insufficient.')
  await dialog.getByRole('button', { name: 'Save decision' }).click()
  await expect(page.getByText('Report resolution saved.')).toBeVisible()
  await page.getByLabel('Status', { exact: true }).selectOption('dismissed')
  await expect(page.getByRole('button', { name: 'Review report', exact: true })).toBeVisible()
  expect(calls(model, '/rest/v1/rpc/resolve_conversation_report', 'POST')[0].body).toEqual({
    p_report_id: reportId, p_action: 'dismissed', p_note: 'Synthetic evidence was insufficient.',
  })
  expect(calls(model, '/rest/v1/conversations', 'GET')).toHaveLength(0)
  expect(calls(model, '/rest/v1/messages', 'GET')).toHaveLength(0)
})

test('scoped live changes recover ordered persisted messages and read markers after reconnect', async ({ page }) => {
  const joins = []
  await page.routeWebSocket('wss://test-project.supabase.co/**', (socket) => {
    socket.onMessage((frame) => {
      if (typeof frame !== 'string') return
      const [joinRef, ref, topic, event, payload] = JSON.parse(frame)
      const reply = (response) => socket.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response }]))
      if (event === 'phx_join') {
        const bindings = payload.config.postgres_changes.map((binding, index) => ({ ...binding, id: index + 1 }))
        joins.push({ socket, joinRef, topic, bindings })
        reply({ postgres_changes: bindings })
      } else if (event === 'heartbeat' || event === 'phx_leave') reply({})
    })
  })
  const { data, model } = await communicationFixture(page, {
    realtime: true,
    data: { messages: [synthetic(sentId, 'Sent before connection', { sender_id: USER_ID })] },
  })
  const scoped = () => joins.filter(({ bindings }) =>
    bindings.some((binding) => binding.filter === 'conversation_id=eq.' + thread))
  const emit = (subscription, type) => {
    const binding = subscription.bindings.find((entry) => entry.event === type)
    subscription.socket.send(JSON.stringify([subscription.joinRef, null, subscription.topic, 'postgres_changes', {
      ids: [binding.id], data: {
        type, schema: 'public', table: 'messages', commit_timestamp: createdAt,
        columns: [{ name: 'body', type: 'text' }], record: { body: 'Unconfirmed transport data' },
      },
    }]))
  }
  await page.goto('/messages/' + thread)
  await expect(page.getByText('Live updates connected', { exact: true })).toBeVisible()
  await expect(page.getByText('Sent before connection').locator('..')).toContainText('Sent')
  expect(joins.flatMap(({ bindings }) => bindings.map(({ filter }) => filter))).toContain('recipient_id=eq.' + USER_ID)
  const scope = scoped().at(-1)
  expect(scope.bindings).toEqual(['INSERT', 'UPDATE'].map((event, index) => ({
    schema: 'public', table: 'messages', event, filter: 'conversation_id=eq.' + thread, id: index + 1,
  })))

  data.messages.unshift(synthetic(messageId, 'Persisted after connection', { created_at: '2026-11-25T02:05:00Z' }))
  data.messages.find(({ id }) => id === sentId).read_at = '2026-11-25T02:04:01Z'
  emit(scope, 'INSERT')
  emit(scope, 'INSERT')
  emit(scope, 'UPDATE')
  const history = page.getByRole('list', { name: 'Conversation messages' })
  await expect(history.getByText('Persisted after connection', { exact: true })).toHaveCount(1)
  await expect(history.getByText('Sent before connection').locator('..')).toContainText('Read')
  await expect(history.getByText('Unconfirmed transport data')).toHaveCount(0)
  await expect(history.locator('.conversation-bubble p')).toHaveText(['Sent before connection', 'Persisted after connection'])
  await expect.poll(() => calls(model, '/rest/v1/messages', 'PATCH').some(({ search }) => search.includes(messageId))).toBe(true)

  const joinCount = scoped().length
  scope.socket.close({ code: 1011 })
  data.messages.push(synthetic('88888888-8888-4888-8888-888888888888', 'Missed while disconnected', { created_at: '2026-11-25T02:10:00Z' }))
  await expect.poll(() => scoped().length).toBeGreaterThan(joinCount)
  await expect(page.getByText('Live updates connected', { exact: true })).toBeVisible()
  await expect(history.getByText('Missed while disconnected', { exact: true })).toBeVisible()
})
