import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import { formatTime } from '../lib/messages.js'
import EmptyState from '../components/EmptyState.jsx'
import LoadError from '../components/LoadError.jsx'
import PageHeading from '../components/PageHeading.jsx'
import Icon from '../components/Icon.jsx'
import '../styles/inbox.css'

const SELECT =
  'id, last_message_at, renter_id, listings(title), renter:profiles!conversations_renter_id_fkey(display_name), owner:profiles!conversations_owner_id_fkey(display_name)'

export default function MessagesPage() {
  const { user } = useAuth()
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState({
    rows: [],
    unread: {},
    loading: true,
    error: null,
  })

  useEffect(() => {
    let cancelled = false
    let inFlight = false
    setState((previous) => ({ ...previous, loading: true, error: null }))
    const load = async () => {
      if (inFlight) return
      inFlight = true
      try {
        const [convs, unread] = await Promise.all([
          supabase
            .from('conversations')
            .select(SELECT)
            .order('last_message_at', { ascending: false }),
          supabase
            .from('messages')
            .select('conversation_id')
            .is('read_at', null)
            .neq('sender_id', user.id),
        ])
        if (cancelled) return
        const counts = {}
        for (const m of unread.data ?? [])
          counts[m.conversation_id] = (counts[m.conversation_id] ?? 0) + 1
        setState({
          rows: convs.data ?? [],
          unread: counts,
          loading: false,
          error: (convs.error ?? unread.error)?.message ?? null,
        })
      } catch (error) {
        if (!cancelled)
          setState((previous) => ({
            ...previous,
            loading: false,
            error: error.message || 'Check your connection and try again.',
          }))
      } finally {
        inFlight = false
      }
    }
    load()
    const timer = setInterval(load, 15000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [user.id, revision])

  const { rows, unread, loading, error } = state
  const retry = () => setRevision((value) => value + 1)

  return (
    <section className="container page inbox-page">
      <PageHeading
        eyebrow="Your marketplace"
        title="Messages"
        actions={
          <button
            type="button"
            className="btn btn-ghost"
            disabled={loading}
            onClick={retry}
          >
            <Icon name="message" size={18} />
            Refresh inbox
          </button>
        }
      >
        <p>
          Ask questions, confirm the details, and keep your rental plans
          together.
        </p>
      </PageHeading>

      <div className="inbox-layout">
        <div className="inbox-panel">
          <div className="inbox-panel__heading">
            <h2>Your conversations</h2>
            {!loading && !error && (
              <span className="inbox-panel__count">
                {rows.length} conversation{rows.length === 1 ? '' : 's'}
              </span>
            )}
          </div>

          {loading && (
            <div className="inbox-loading">
              <p role="status" aria-busy="true">
                Loading your conversations…
              </p>
              <div className="inbox-loading__rows" aria-hidden="true">
                {[0, 1, 2].map((index) => (
                  <div className="inbox-loading__row" key={index}>
                    <span className="skeleton inbox-loading__avatar" />
                    <span className="skeleton inbox-loading__line" />
                  </div>
                ))}
              </div>
            </div>
          )}
          {error && (
            <div className="inbox-feedback">
              <LoadError onRetry={retry}>
                We couldn’t load your messages ({error}).
              </LoadError>
            </div>
          )}
          {!loading && !error && rows.length === 0 && (
            <div className="inbox-feedback">
              <EmptyState
                icon={<Icon name="message" size={32} />}
                title="No conversations yet"
                action={
                  <Link className="btn btn-primary" to="/listings">
                    Browse rentals
                    <Icon name="arrowRight" size={18} />
                  </Link>
                }
              >
                Open a listing and choose “Message the owner” to start a
                conversation. Owners can reply here once someone writes to them.
              </EmptyState>
            </div>
          )}

          {!loading && rows.length > 0 && (
            <ul className="inbox inbox-list" aria-label="Rental conversations">
              {rows.map((c) => {
                const other =
                  c.renter_id === user.id
                    ? c.owner?.display_name
                    : c.renter?.display_name
                const name = other?.trim() || 'Someone'
                const count = unread[c.id] ?? 0
                return (
                  <li key={c.id}>
                    <Link
                      className={`inbox-row${count > 0 ? ' inbox-row--unread' : ''}`}
                      to={`/messages/${c.id}`}
                    >
                      <span className="inbox-avatar" aria-hidden="true">
                        {other?.trim() ? (
                          name.charAt(0).toUpperCase()
                        ) : (
                          <Icon name="user" size={24} />
                        )}
                      </span>
                      <span className="inbox__main">
                        <strong>{name}</strong>
                        <span className="inbox-row__listing">
                          About: {c.listings?.title ?? 'a listing'}
                        </span>
                        <span className="inbox-row__time">
                          {c.last_message_at ? (
                            <>
                              Last message{' '}
                              <time dateTime={c.last_message_at}>
                                {formatTime(c.last_message_at)}
                              </time>
                            </>
                          ) : (
                            'No messages yet'
                          )}
                        </span>
                      </span>
                      <span className="inbox-row__trailing">
                        {count > 0 && (
                          <span
                            className="inbox-unread"
                            aria-label={`${count} unread message${count === 1 ? '' : 's'}`}
                          >
                            {count} unread
                          </span>
                        )}
                        <Icon name="chevronRight" size={20} />
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <aside
          className="inbox-guidance"
          aria-labelledby="inbox-guidance-title"
        >
          <span className="inbox-guidance__icon" aria-hidden="true">
            <Icon name="message" size={28} />
          </span>
          <p className="eyebrow">A little clarity goes a long way</p>
          <h2 id="inbox-guidance-title">Make a plan before you rent.</h2>
          <p>
            Use your conversation to check the condition, confirm your dates,
            and arrange pickup or access directly with the other person.
          </p>
          <div className="inbox-guidance__note">
            <Icon name="clock" size={18} />
            <p>
              Your inbox checks for new messages every 15 seconds. You can also
              refresh it above.
            </p>
          </div>
          <Link to="/bookings" className="btn btn-ghost">
            View your bookings
            <Icon name="arrowRight" size={18} />
          </Link>
        </aside>
      </div>
    </section>
  )
}
