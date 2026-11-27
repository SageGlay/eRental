import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useNotifications } from '../context/NotificationsContext.jsx'
import { notificationDisplay } from '../lib/notifications.js'
import { formatTime } from '../lib/messages.js'
import { supabase } from '../lib/supabaseClient.js'
import PageHeading from '../components/PageHeading.jsx'
import Icon from '../components/Icon.jsx'
import LoadError from '../components/LoadError.jsx'
import EmptyState from '../components/EmptyState.jsx'
import '../styles/inbox.css'
import '../styles/notifications.css'

const fields = 'id,event_type,entity_id,recipient_role,created_at,read_at'
const pageSize = 15

function dateGroup(stamp, today, yesterday) {
  const day = new Date(stamp).toDateString()
  if (day === today) return 'Today'
  if (day === yesterday) return 'Yesterday'
  return 'Earlier'
}

function NotificationCenter({ userId }) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const unreadOnly = params.get('view') === 'unread'
  const pageNumber = Number(params.get('page') ?? 1)
  const page = Number.isSafeInteger(pageNumber) && pageNumber > 0 && pageNumber <= Math.floor(Number.MAX_SAFE_INTEGER / pageSize) ? pageNumber : 1
  const viewKey = (unreadOnly ? 'unread-' : 'all-') + page
  const { unreadCount, countError, refreshCount } = useNotifications()
  const [result, setResult] = useState(null)
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [notice, setNotice] = useState('')
  const mutation = useRef(null)
  const heading = useRef(null)

  useEffect(() => {
    refreshCount()
    return () => {
      mutation.current?.abort()
      mutation.current = null
    }
  }, [refreshCount])

  useEffect(() => {
    let active = true
    let controller = null
    async function load() {
      if (controller) return
      controller = new AbortController()
      const deadline = setTimeout(() => controller.abort(), 15000)
      try {
        let query = supabase.from('notifications').select(fields, { count: 'exact' }).eq('recipient_id', userId)
        if (unreadOnly) query = query.is('read_at', null)
        const { data, count, error } = await query.order('created_at', { ascending: false })
          .order('id', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1).abortSignal(controller.signal)
        if (!active) return
        // Another tab can read the last item on the final unread page.
        if (page > 1 && (error?.code === 'PGRST103' || (!error && !data?.length))) {
          setParams(unreadOnly ? { view: 'unread' } : {}, { replace: true })
          return
        }
        if (error || !Array.isArray(data) || count === null) throw new Error('Notifications unavailable')
        setResult({ viewKey, rows: data, total: count })
      } catch {
        if (active) setResult({ viewKey, error: 'We couldn’t load your notifications. Check your connection and try again.' })
      } finally {
        clearTimeout(deadline)
        controller = null
      }
    }
    const refreshVisible = () => { if (!document.hidden) load() }
    load()
    const timer = setInterval(refreshVisible, 30000)
    window.addEventListener('focus', refreshVisible)
    document.addEventListener('visibilitychange', refreshVisible)
    return () => {
      active = false
      clearInterval(timer)
      window.removeEventListener('focus', refreshVisible)
      document.removeEventListener('visibilitychange', refreshVisible)
      controller?.abort()
    }
  }, [userId, unreadOnly, page, viewKey, revision, setParams])

  function refresh() {
    refreshCount()
    setRevision((previous) => previous + 1)
  }

  function showView(unread, pageToShow = 1) {
    setParams({ ...(unread ? { view: 'unread' } : {}), ...(pageToShow > 1 ? { page: String(pageToShow) } : {}) })
    setActionError(null)
    setNotice('')
  }

  async function markRead(id, destination = null) {
    if (mutation.current) return
    const controller = new AbortController()
    mutation.current = controller
    setBusy(id ?? 'all')
    setNotice('')
    setActionError(null)
    const deadline = setTimeout(() => controller.abort(), 15000)
    try {
      const { error } = id
        ? await supabase.rpc('mark_notification_read', { p_notification_id: id }).abortSignal(controller.signal)
        : await supabase.rpc('mark_all_notifications_read').abortSignal(controller.signal)
      if (mutation.current !== controller) return
      if (error) throw error
      refresh()
      if (destination) navigate(destination)
      else {
        setNotice(id ? 'Notification marked as read.' : 'Notifications marked as read.')
        heading.current?.focus()
      }
    } catch {
      if (mutation.current === controller) {
        setActionError('We couldn’t confirm the read status. Check the refreshed list before trying again.')
        refresh()
      }
    } finally {
      clearTimeout(deadline)
      if (mutation.current === controller) {
        mutation.current = null
        setBusy(null)
      }
    }
  }

  function openNotification(event, row, to) {
    if (row.read_at || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    markRead(row.id, to)
  }

  const current = result?.viewKey === viewKey ? result : null
  const rows = current?.rows ?? []
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const grouped = new Map()
  for (const row of rows) {
    const label = dateGroup(row.created_at, now.toDateString(), yesterday.toDateString())
    if (!grouped.has(label)) grouped.set(label, [])
    grouped.get(label).push(row)
  }

  return (
    <section className="container page notifications-page">
      <PageHeading title="Notifications" actions={
        <button type="button" className="btn" onClick={refresh}>
          <Icon name="refresh" size={18} /> Refresh
        </button>
      }>
        {unreadCount !== null ? `${unreadCount} unread` : countError ? 'Unread count unavailable.' : 'Checking unread count…'}
      </PageHeading>
      <div className="inbox-layout">
        <aside className="inbox-mailboxes" aria-label="Notification filters">
          <div role="group" aria-label="Show notifications">
            <button type="button" aria-pressed={!unreadOnly} onClick={() => showView(false)}><Icon name="bell" />All notifications</button>
            <button type="button" aria-pressed={unreadOnly} onClick={() => showView(true)}><Icon name="clock" />Unread</button>
          </div>
        </aside>
        <section className="inbox-panel" aria-labelledby="notification-activity-title">
          <div className="inbox-panel__tools">
            <h2 id="notification-activity-title" tabIndex={-1} ref={heading}>{unreadOnly ? 'Unread activity' : 'Your activity'}</h2>
            <button type="button" className="btn" disabled={Boolean(busy) || !(unreadCount > 0 || rows.some((row) => !row.read_at))}
              onClick={() => markRead(null)}>
              <Icon name="check" size={16} />{busy === 'all' ? 'Marking as read…' : 'Mark all as read'}
            </button>
          </div>
          {notice && <p role="status" className="form-success">{notice}</p>}
          {actionError && <p role="alert" className="form-error">{actionError}</p>}
          {!current && <div role="status" className="inbox-loading" aria-busy="true">
            <span className="sr-only">Loading notifications…</span>
            {[1, 2, 3].map((key) => <div key={key} className="skeleton" aria-hidden="true" />)}
          </div>}
          {current?.error && <LoadError onRetry={refresh}>{current.error}</LoadError>}
          {current && !current.error && !rows.length && <EmptyState
            icon={<Icon name={unreadOnly ? 'check' : 'bell'} size={28} />}
            title={unreadOnly ? 'You’re all caught up' : 'No notifications yet'}
            action={unreadOnly && <button type="button" className="btn" onClick={() => showView(false)}>Show all notifications</button>}
          >{unreadOnly ? 'You have no unread notifications.' : 'Updates about rentals, messages and account verification will appear here.'}</EmptyState>}
          {[...grouped].map(([label, group]) => (
            <div className="notification-group" key={label}>
              <h3>{label}</h3>
              <ul aria-label={label}>
                {group.map((row) => {
                  const { icon, title, description, to } = notificationDisplay(row)
                  return (
                    <li key={row.id} className={'notification-row' + (row.read_at ? '' : ' notification-row--unread')}>
                      <span className="notification-icon"><Icon name={icon} /></span>
                      <div className="notification-details">
                        {to ? <Link to={to} onClick={(event) => openNotification(event, row, to)}>{title}</Link> : <strong>{title}</strong>}
                        <p>{description}</p>
                        <time dateTime={row.created_at}>{formatTime(row.created_at)}</time>
                      </div>
                      <div className="notification-controls">
                        <span className="notification-state">{row.read_at ? 'Read' : 'Unread'}</span>
                        {!row.read_at && <button className="btn btn-ghost" type="button" disabled={Boolean(busy)}
                          aria-label={`Mark ${title} as read`} onClick={() => markRead(row.id)}>
                          {busy === row.id ? 'Saving…' : 'Mark as read'}
                        </button>}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
          {current?.total > pageSize && <nav className="notification-pagination" aria-label="Notification pages">
            <button className="btn" type="button" disabled={page === 1} onClick={() => showView(unreadOnly, page - 1)}>Previous</button>
            <span>Page {page} of {Math.ceil(current.total / pageSize)}</span>
            <button className="btn" type="button" disabled={page * pageSize >= current.total} onClick={() => showView(unreadOnly, page + 1)}>Next</button>
          </nav>}
        </section>
      </div>
    </section>
  )
}

export default function NotificationsPage() {
  const { user } = useAuth()
  return user && <NotificationCenter key={user.id} userId={user.id} />
}
