import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import EmptyState from '../components/EmptyState.jsx'
import Icon from '../components/Icon.jsx'
import LoadError from '../components/LoadError.jsx'
import '../styles/conversation.css'

const META =
  'id, renter_id, listings(id, title), renter:profiles!conversations_renter_id_fkey(display_name), owner:profiles!conversations_owner_id_fkey(display_name)'

const dayLabel = new Intl.DateTimeFormat('en-PH', { dateStyle: 'long' })
const timeLabel = new Intl.DateTimeFormat('en-PH', { timeStyle: 'short' })

export default function ConversationPage() {
  const { id } = useParams()
  const { user } = useAuth()
  // React Router reuses the page on a parameter change. Keep drafts, reads,
  // and replies scoped to the conversation shown in the location.
  return <Conversation key={`${user.id}/${id}`} id={id} user={user} />
}

function Conversation({ id, user }) {
  const [conv, setConv] = useState(undefined) // undefined = loading, null = not found
  const [conversationError, setConversationError] = useState('')
  const [revision, setRevision] = useState(0)
  const [messages, setMessages] = useState(null)
  const [messagesError, setMessagesError] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const listRef = useRef(null)
  const followLatest = useRef(true)
  const composerRef = useRef(null)
  const headingRef = useRef(null)
  const refreshRef = useRef(null)
  const sendingRef = useRef(null)
  const readingRef = useRef(null)
  const uncertainSend = useRef(null)
  const refreshInFlight = useRef(false)

  const loadMessages = useCallback(
    async (replacePending = false) => {
      if (readingRef.current && !replacePending) return null
      readingRef.current?.abort()
      const controller = new AbortController()
      readingRef.current = controller
      const timeout = setTimeout(() => controller.abort(), 15_000)
      try {
        const { data, error: loadError } = await supabase
          .from('messages')
          .select('id, sender_id, body, created_at, read_at')
          .eq('conversation_id', id)
          .order('created_at')
          .abortSignal(controller.signal)
        if (loadError) throw loadError
        if (readingRef.current !== controller) return null
        const rows = data ?? []
        setMessages(rows)
        setMessagesError('')
        if ((data ?? []).some((m) => m.sender_id !== user.id && !m.read_at)) {
          await supabase
            .from('messages')
            .update({ read_at: new Date().toISOString() })
            .eq('conversation_id', id)
            .neq('sender_id', user.id)
            .is('read_at', null)
            .abortSignal(controller.signal)
        }
        return readingRef.current === controller ? rows : null
      } catch {
        if (readingRef.current === controller) {
          setMessagesError(
            'We couldn’t load your messages. Check your connection and try again.',
          )
        }
        return null
      } finally {
        clearTimeout(timeout)
        if (readingRef.current === controller) readingRef.current = null
      }
    },
    [id, user.id],
  )

  useEffect(() => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)
    let active = true
    setConversationError('')
    ;(async () => {
      try {
        const { data, error: loadError } = await supabase
          .from('conversations')
          .select(META)
          .eq('id', id)
          .maybeSingle()
          .abortSignal(controller.signal)
        if (loadError) throw loadError
        if (active) setConv(data ?? null)
      } catch {
        if (active)
          setConversationError(
            'We couldn’t load this conversation. Check your connection and try again.',
          )
      } finally {
        clearTimeout(timeout)
      }
    })()
    return () => {
      active = false
      clearTimeout(timeout)
      controller.abort()
    }
  }, [id, revision])

  useEffect(() => {
    if (!conv) return
    loadMessages()
    const timer = setInterval(loadMessages, 8000)
    return () => {
      clearInterval(timer)
      readingRef.current?.abort()
      readingRef.current = null
      sendingRef.current?.abort()
      sendingRef.current = null
    }
  }, [conv, loadMessages])

  const messageCount = messages?.length
  useEffect(() => {
    const list = listRef.current
    if (list && followLatest.current) list.scrollTop = list.scrollHeight
  }, [messageCount])
  useEffect(() => {
    if (conv && revision > 0) headingRef.current?.focus()
  }, [conv, revision])
  useEffect(() => {
    if (busy) return
    if (needsRefresh) refreshRef.current?.focus()
    else if (feedback || error) composerRef.current?.focus()
  }, [busy, error, feedback, needsRefresh])

  async function handleSend(e) {
    e.preventDefault()
    if (sendingRef.current || needsRefresh || !messages) return
    const text = body.trim()
    if (!text) return composerRef.current?.focus()
    if (text.length > 2000) {
      setError('Messages can be up to 2,000 characters.')
      composerRef.current?.focus()
      return
    }
    const controller = new AbortController()
    sendingRef.current = controller
    const timeout = setTimeout(() => controller.abort(), 15_000)
    setBusy(true)
    setFeedback('')
    setError('')
    try {
      const { error: sendError, status } = await supabase
        .from('messages')
        .insert({ conversation_id: id, sender_id: user.id, body: text })
        .abortSignal(controller.signal)
      if (sendingRef.current !== controller) return
      if (sendError) {
        if (!status || status === 408 || status >= 500) throw sendError
        return setError('We couldn’t send your message. Try again.')
      }
      setBody('')
      followLatest.current = true
      setFeedback('Message sent.')
      // A read that began before the insert cannot confirm the new message.
      readingRef.current?.abort()
      readingRef.current = null
      loadMessages()
    } catch {
      if (sendingRef.current === controller) {
        uncertainSend.current = {
          text,
          ids: new Set(messages.map(({ id }) => id)),
        }
        setNeedsRefresh(true)
        setError(
          'We couldn’t confirm your message was sent. Refresh messages to check before sending it again.',
        )
      }
    } finally {
      clearTimeout(timeout)
      if (sendingRef.current === controller) {
        sendingRef.current = null
        setBusy(false)
      }
    }
  }

  async function refreshMessages() {
    if (refreshInFlight.current) return
    refreshInFlight.current = true
    setRefreshing(true)
    const attempt = uncertainSend.current
    try {
      const rows = await loadMessages(true)
      if (!rows || !attempt || uncertainSend.current !== attempt) return
      const matchingMessage = rows.some(
        (message) =>
          message.sender_id === user.id &&
          message.body === attempt.text &&
          !attempt.ids.has(message.id),
      )
      if (matchingMessage) {
        setBody('')
        setFeedback('A matching message is already in this conversation.')
      }
      uncertainSend.current = null
      setNeedsRefresh(false)
      setError(
        matchingMessage
          ? ''
          : 'Check the refreshed conversation before sending your draft again.',
      )
    } finally {
      refreshInFlight.current = false
      setRefreshing(false)
      requestAnimationFrame(() => {
        if (document.activeElement === document.body)
          refreshRef.current?.focus()
      })
    }
  }

  if (conversationError) {
    return (
      <section className="container page conversation-page">
        <LoadError onRetry={() => setRevision((v) => v + 1)}>
          {conversationError}
        </LoadError>
        <Link className="btn btn-ghost" to="/messages">
          Back to messages
        </Link>
      </section>
    )
  }

  if (conv === undefined)
    return (
      <section className="container page conversation-page">
        <p role="status" aria-busy="true">
          Loading conversation…
        </p>
      </section>
    )
  if (conv === null) {
    return (
      <section className="container page conversation-page">
        <EmptyState
          icon={<Icon name="message" size={32} />}
          title="Conversation not found"
          action={
            <Link className="btn btn-primary" to="/messages">
              Back to messages
            </Link>
          }
        >
          It may not exist, or it belongs to someone else.
        </EmptyState>
      </section>
    )
  }

  const other =
    conv.renter_id === user.id
      ? conv.owner?.display_name
      : conv.renter?.display_name
  const name = other?.trim() || 'Marketplace member'
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
  return (
    <section className="container page conversation-page">
      <div className="conversation-workspace">
        <nav className="conversation-back" aria-label="Breadcrumb">
          <Link to="/messages">
            <Icon name="arrowLeft" size={18} />
            Messages
          </Link>
        </nav>
        <div className="conversation-thread">
          <header className="conversation-heading">
            <span className="conversation-avatar" aria-hidden="true">
              {initials}
            </span>
            <div className="conversation-person">
              <h1 ref={headingRef} tabIndex={-1}>
                {name}
              </h1>
              <p>{conv.renter_id === user.id ? 'Listing owner' : 'Renter'}</p>
            </div>
            <button
              type="button"
              className="btn"
              ref={refreshRef}
              disabled={refreshing}
              aria-busy={refreshing}
              onClick={refreshMessages}
            >
              <Icon name="refresh" size={18} />
              <span>{refreshing ? 'Refreshing messages…' : 'Refresh messages'}</span>
            </button>
          </header>
          <aside className="conversation-context" aria-label="Rental context">
            <Icon name="box" size={20} />
            <div>
              <span>Rental listing</span>
              <strong>{conv.listings?.title || 'Listing unavailable'}</strong>
            </div>
            {conv.listings?.id && (
              <Link to={`/listings/${conv.listings.id}`}>
                View listing <Icon name="arrowRight" size={16} />
              </Link>
            )}
          </aside>
          {messagesError && (
            <LoadError onRetry={refreshMessages} retrying={refreshing}>
              {messagesError}
            </LoadError>
          )}
          <ul
            ref={listRef}
            className="conversation-messages"
            tabIndex={0}
            onScroll={(event) => {
              const list = event.currentTarget
              followLatest.current =
                list.scrollHeight - list.clientHeight - list.scrollTop < 32
            }}
            aria-label="Conversation messages"
            aria-live="polite"
            aria-relevant="additions text"
          >
            {messages === null && !messagesError && (
              <li role="status" className="conversation-empty">
                Loading messages…
              </li>
            )}
            {messages?.length === 0 && !messagesError && (
              <li className="conversation-empty">
                <Icon name="message" size={36} />
                <h2>Start with a hello</h2>
                <p>
                  Ask about the rental, discuss your dates, or arrange the
                  handover.
                </p>
              </li>
            )}
            {messages?.map((m, index) => {
              const timestamp = new Date(m.created_at)
              const day = dayLabel.format(timestamp)
              const startsDay =
                index === 0 ||
                day !==
                  dayLabel.format(new Date(messages[index - 1].created_at))
              const mine = m.sender_id === user.id
              return (
                <Fragment key={m.id}>
                  {startsDay && (
                    <li className="conversation-date">
                      <time dateTime={m.created_at}>{day}</time>
                    </li>
                  )}
                  <li
                    className={`conversation-bubble${mine ? ' bubble--mine' : ''}`}
                  >
                    <span className="sr-only">{mine ? 'You' : name}:</span>
                    <p>{m.body}</p>
                    <div className="conversation-bubble__meta">
                      <time dateTime={m.created_at}>
                        {timeLabel.format(timestamp)}
                      </time>
                      {mine && (
                        <span>
                          {m.read_at ? (
                            <>
                              <Icon name="check" size={12} />
                              Read
                            </>
                          ) : (
                            'Sent'
                          )}
                        </span>
                      )}
                    </div>
                  </li>
                </Fragment>
              )
            })}
          </ul>
          <form
            className="conversation-composer"
            onSubmit={handleSend}
            noValidate
            aria-busy={busy}
          >
            <label htmlFor="body">Your message</label>
            <textarea
              ref={composerRef}
              id="body"
              className="resize-none"
              rows={2}
              maxLength={2000}
              placeholder="Write a message…"
              value={body}
              disabled={busy || needsRefresh}
              aria-describedby={`message-help${error ? ' message-error' : ''}`}
              onChange={(e) => {
                setBody(e.target.value)
                setFeedback('')
              }}
            />
            {error && (
              <div className="conversation-error">
                <p id="message-error" className="form-error" role="alert">
                  {error}
                </p>
              </div>
            )}
            <div className="conversation-composer__footer">
              <span id="message-help" className="field__hint">
                {body
                  ? `${body.length.toLocaleString('en-PH')} / 2,000`
                  : 'Up to 2,000 characters'}
              </span>
              <span className="conversation-feedback" role="status">
                {feedback}
              </span>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy || needsRefresh || !messages || !body.trim()}
              >
                <Icon name="arrowRight" size={18} />
                {busy ? 'Sending…' : 'Send'}
              </button>
            </div>
          </form>
        </div>
        <p className="conversation-sync">
          <Icon name="clock" size={16} />
          Checks for new messages every 8 seconds.
        </p>
      </div>
    </section>
  )
}
