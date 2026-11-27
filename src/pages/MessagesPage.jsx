import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import { formatTime } from '../lib/messages.js'
import { listenForMessageActivity } from '../hooks/useMessageRealtime.js'
import EmptyState from '../components/EmptyState.jsx'
import LoadError from '../components/LoadError.jsx'
import PageHeading from '../components/PageHeading.jsx'
import Icon from '../components/Icon.jsx'
import '../styles/inbox.css'

const SELECT =
  'id, last_message_at, renter_id, listings(title), renter:profiles!conversations_renter_id_fkey(display_name), owner:profiles!conversations_owner_id_fkey(display_name)'

function correspondent(conversation, userId) {
  const person =
    conversation.renter_id === userId ? conversation.owner : conversation.renter
  return person?.display_name?.trim() || 'Marketplace member'
}

function Inbox({ userId }) {
  const [revision, setRevision] = useState(0)
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const searchRef = useRef(null)
  const [state, setState] = useState({
    rows: [],
    unread: {},
    loading: true,
    error: null,
  })
  const unreadOnly = params.get('view') === 'unread'

  useEffect(() => {
    let cancelled = false
    let active = null
    let refreshQueued = false
    setState((previous) => ({ ...previous, loading: true, error: null }))
    const load = async () => {
      if (active) {
        refreshQueued = true
        return
      }
      active = new AbortController()
      const timeout = setTimeout(() => active?.abort(), 15_000)
      try {
        const [convs, unread] = await Promise.all([
          supabase
            .from('conversations')
            .select(SELECT)
            .order('last_message_at', { ascending: false })
            .abortSignal(active.signal),
          supabase
            .from('messages')
            .select('conversation_id')
            .is('read_at', null)
            .neq('sender_id', userId)
            .abortSignal(active.signal),
        ])
        if (cancelled) return
        if (convs.error || unread.error) throw convs.error || unread.error
        const counts = {}
        for (const m of unread.data ?? [])
          counts[m.conversation_id] = (counts[m.conversation_id] ?? 0) + 1
        setState({
          rows: convs.data ?? [],
          unread: counts,
          loading: false,
          error: null,
        })
      } catch {
        if (!cancelled)
          setState((previous) => ({
            ...previous,
            loading: false,
            error:
              'We couldn’t load your messages. Check your connection and try again.',
          }))
      } finally {
        clearTimeout(timeout)
        active = null
        if (!cancelled && refreshQueued) {
          refreshQueued = false
          void load()
        }
      }
    }
    load()
    const visible = () => { if (!document.hidden) void load() }
    const unlisten = listenForMessageActivity(visible)
    const timer = setInterval(visible, 15_000)
    window.addEventListener('focus', visible)
    document.addEventListener('visibilitychange', visible)
    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener('focus', visible)
      document.removeEventListener('visibilitychange', visible)
      unlisten()
      active?.abort()
    }
  }, [userId, revision])

  const { rows, unread, loading, error } = state
  const retry = () => setRevision((value) => value + 1)
  const normalized = query.trim().toLocaleLowerCase('en-PH')
  const visible = rows.filter((row) => {
    if (unreadOnly && !unread[row.id]) return false
    const name = correspondent(row, userId)
    return [name, row.listings?.title].some((value) =>
      value?.toLocaleLowerCase('en-PH').includes(normalized),
    )
  })
  const unreadThreads = rows.filter((row) => unread[row.id]).length
  function selectView(unreadOnly) {
    const next = new URLSearchParams(params)
    if (unreadOnly) next.set('view', 'unread')
    else next.delete('view')
    setParams(next)
  }
  function clearSearch() {
    setQuery('')
    searchRef.current?.focus()
  }

  return (
    <section className="container page inbox-page">
      <PageHeading
        title="Messages"
        actions={
          <button
            type="button"
            className="btn"
            disabled={loading}
            onClick={retry}
          >
            <Icon name="refresh" size={18} />
            {loading ? 'Refreshing…' : 'Refresh inbox'}
          </button>
        }
      />
      <div className="inbox-layout">
        <aside className="inbox-mailboxes" aria-label="Conversation filters">
          <div role="group" aria-label="Mailbox">
            <button
              type="button"
              aria-pressed={!unreadOnly}
              onClick={() => selectView(false)}
            >
              <Icon name="message" size={20} />
              All conversations
              {!loading && !error && <span>{rows.length}</span>}
            </button>
            <button
              type="button"
              aria-pressed={unreadOnly}
              onClick={() => selectView(true)}
            >
              <Icon name="clock" size={20} />
              Unread
              {!loading && !error && <span>{unreadThreads}</span>}
            </button>
          </div>
          <Link to="/bookings" className="inbox-bookings">
            <Icon name="calendar" size={18} />
            View your bookings
          </Link>
        </aside>
        <section className="inbox-panel" aria-labelledby="inbox-list-title">
          <div className="inbox-panel__tools">
            <div>
              <h2 id="inbox-list-title">
                {unreadOnly ? 'Unread conversations' : 'Your conversations'}
              </h2>
              <p>Checks for new messages every 15 seconds.</p>
            </div>
            {rows.length > 0 && (
              <div className="inbox-search">
                <label className="sr-only" htmlFor="conversation-search">
                  Search conversations
                </label>
                <Icon name="search" size={18} />
                <input
                  id="conversation-search"
                  ref={searchRef}
                  type="search"
                  placeholder="Search names or listings"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query && (
                  <button
                    type="button"
                    aria-label="Clear conversation search"
                    onClick={clearSearch}
                  >
                    <Icon name="x" size={16} />
                  </button>
                )}
              </div>
            )}
          </div>
          {loading && (
            <div className="inbox-loading" role="status" aria-busy="true">
              <span className="sr-only">Loading your conversations…</span>
              {[0, 1, 2].map((index) => (
                <div className="skeleton" key={index} aria-hidden="true" />
              ))}
            </div>
          )}
          {error && <LoadError onRetry={retry}>{error}</LoadError>}
          {!loading && !error && rows.length === 0 && (
            <EmptyState
              icon={<Icon name="message" size={32} />}
              title="No conversations yet"
              action={
                <Link className="btn btn-primary" to="/listings">
                  Browse rentals <Icon name="arrowRight" size={18} />
                </Link>
              }
            >
              Open a listing and choose “Message the owner” to ask about dates,
              pickup or access.
            </EmptyState>
          )}
          {!loading && !error && rows.length > 0 && visible.length === 0 && (
            <EmptyState
              icon={<Icon name={normalized ? 'search' : 'check'} size={28} />}
              title={
                normalized
                  ? 'No matching conversations'
                  : 'You’re all caught up'
              }
              action={
                normalized ? (
                  <button type="button" className="btn" onClick={clearSearch}>
                    Clear search
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => selectView(false)}
                  >
                    Show all conversations
                  </button>
                )
              }
            >
              {normalized
                ? 'Try another name or listing title.'
                : 'You have no unread conversations.'}
            </EmptyState>
          )}
          {!loading && !error && visible.length > 0 && (
            <ul className="inbox-list" aria-label="Rental conversations">
              {visible.map((row) => {
                const name = correspondent(row, userId)
                const count = unread[row.id] ?? 0
                return (
                  <li key={row.id}>
                    <Link
                      className={`inbox-row${count ? ' inbox-row--unread' : ''}`}
                      to={`/messages/${row.id}`}
                    >
                      <span className="inbox-avatar" aria-hidden="true">
                        {name.charAt(0).toUpperCase()}
                      </span>
                      <span className="inbox-row__main">
                        <strong>{name}</strong>
                        <span>
                          {row.listings?.title || 'Listing unavailable'}
                        </span>
                      </span>
                      <span className="inbox-row__trailing">
                        {count > 0 && (
                          <span className="inbox-unread">{count} unread</span>
                        )}
                        {row.last_message_at ? (
                          <time dateTime={row.last_message_at}>
                            {formatTime(row.last_message_at)}
                          </time>
                        ) : (
                          'No messages yet'
                        )}
                      </span>
                      <Icon name="chevronRight" size={18} />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
          {query && !loading && !error && (
            <p className="sr-only" role="status">
              {visible.length} matching conversations
            </p>
          )}
        </section>
      </div>
    </section>
  )
}

export default function MessagesPage() {
  const { user } = useAuth()
  return <Inbox key={user.id} userId={user.id} />
}
