import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import { formatTime } from '../lib/messages.js'
import EmptyState from '../components/EmptyState.jsx'
import Icon from '../components/Icon.jsx'
import LoadError from '../components/LoadError.jsx'
import PageHeading from '../components/PageHeading.jsx'
import '../styles/conversation.css'

const META =
  'id, renter_id, listings(id, title), renter:profiles!conversations_renter_id_fkey(display_name), owner:profiles!conversations_owner_id_fkey(display_name)'

export default function ConversationPage() {
  const { id } = useParams()
  // React Router reuses the page on a parameter change. Keep drafts, reads,
  // and replies scoped to the conversation shown in the location.
  return <Conversation key={id} id={id} />
}

function Conversation({ id }) {
  const { user } = useAuth()
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
  const endRef = useRef(null)
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
    endRef.current?.scrollIntoView({ block: 'nearest' })
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
  const name = other ?? 'Marketplace member'
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
          <span aria-hidden="true">/</span>
          <span>{name}</span>
        </nav>
        <PageHeading
          eyebrow="Your conversation"
          title={name}
          titleRef={headingRef}
          actions={
            <button
              type="button"
              className="btn btn-ghost"
              ref={refreshRef}
              disabled={refreshing}
              aria-busy={refreshing}
              onClick={refreshMessages}
            >
              <Icon name="message" size={18} />
              {refreshing ? 'Refreshing messages…' : 'Refresh messages'}
            </button>
          }
        >
          <p>A direct conversation about your rental.</p>
        </PageHeading>
        <div className="conversation-layout">
          <div className="thread conversation-thread">
            <header className="conversation-thread__header">
              <span className="conversation-avatar" aria-hidden="true">
                {initials}
              </span>
              <div>
                <strong>{name}</strong>
                <span>Messages refresh regularly</span>
              </div>
              <Icon name="message" size={22} />
            </header>
            {messagesError && (
              <LoadError onRetry={refreshMessages} retrying={refreshing}>
                {messagesError}
              </LoadError>
            )}
            <ul
              className="thread__list conversation-messages"
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
              {messages?.map((m) => (
                <li
                  key={m.id}
                  className={`bubble conversation-bubble${m.sender_id === user.id ? ' bubble--mine' : ''}`}
                >
                  <span className="sr-only">
                    {m.sender_id === user.id ? 'You' : name}:
                  </span>
                  <p>{m.body}</p>
                  <div className="conversation-bubble__meta">
                    <time dateTime={m.created_at}>
                      {formatTime(m.created_at)}
                    </time>
                    {m.sender_id === user.id && (
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
              ))}
              <li ref={endRef} aria-hidden="true" />
            </ul>
            <form
              className="thread__form conversation-composer"
              onSubmit={handleSend}
              noValidate
              aria-busy={busy}
            >
              <label htmlFor="body">Your message</label>
              <textarea
                ref={composerRef}
                id="body"
                className="resize-none"
                rows={3}
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
                  Up to 2,000 characters
                </span>
                <span className="sr-only" role="status">
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
          <aside className="conversation-context" aria-label="Rental context">
            <div className="conversation-context__icon">
              <Icon name="box" size={28} />
            </div>
            <p className="eyebrow">You’re discussing</p>
            <h2>{conv.listings?.title ?? 'A rental listing'}</h2>
            {conv.listings && (
              <Link
                className="btn btn-ghost"
                to={`/listings/${conv.listings.id}`}
              >
                View listing
                <Icon name="arrowRight" size={16} />
              </Link>
            )}
            <div className="conversation-guidance">
              <Icon name="shield" size={20} />
              <p>
                Confirm the rental details and arrange pickup or access directly
                with the other person.
              </p>
            </div>
            <p className="field__hint">
              Keep arrangements respectful. Never share passwords or send real
              money outside agreed rental terms.
            </p>
          </aside>
        </div>
      </div>
    </section>
  )
}
