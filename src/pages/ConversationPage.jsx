import { Fragment, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import EmptyState from '../components/EmptyState.jsx'
import Icon from '../components/Icon.jsx'
import LoadError from '../components/LoadError.jsx'
import RequestViewingButton from '../components/RequestViewingButton.jsx'
import { ContactBlockDialog, ConversationReportDialog, ConversationReportHistory, useOwnConversationReports } from '../components/ConversationSafety.jsx'
import { useConversationContact, useConversationThread } from '../hooks/useConversationThread.js'
import { announceMessageActivity } from '../hooks/useMessageRealtime.js'
import '../styles/conversation.css'

const META =
  'id, renter_id, owner_id, listings(id, title), renter:profiles!conversations_renter_id_fkey(display_name), owner:profiles!conversations_owner_id_fkey(display_name)'

const dayLabel = new Intl.DateTimeFormat('en-PH', { dateStyle: 'long' })
const timeLabel = new Intl.DateTimeFormat('en-PH', { timeStyle: 'short' })
const quickResponses = {
  renter: [
    'Is this still available?',
    'Can I arrange a viewing?',
    'What are the rental requirements?',
    'Thank you for the information.',
  ],
  owner: [
    'Yes, this rental is available.',
    'Please let me know your preferred dates.',
    'We can arrange a viewing.',
    'Thank you for your inquiry.',
  ],
}
const syncLabels = {
  connected: 'Live updates connected',
  connecting: 'Connecting live updates…',
  reconnecting: 'Reconnecting · Automatic checks continue',
  offline: 'Offline · Reconnect to send',
}

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
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [dialog, setDialog] = useState(null)
  const [safetyFeedback, setSafetyFeedback] = useState('')
  const listRef = useRef(null)
  const followLatest = useRef(true)
  const composerRef = useRef(null)
  const headingRef = useRef(null)
  const refreshRef = useRef(null)
  const sendingRef = useRef(null)
  const sendOperation = useRef(null)
  const uncertainSend = useRef(null)
  const refreshInFlight = useRef(false)

  const { messages, messageError, unreadStart, unseen, setUnseen, loadMessages, connection } =
    useConversationThread(conv?.id, user.id, followLatest)
  const { contact, contactError, refreshContact } = useConversationContact(conv?.id)
  const reports = useOwnConversationReports(conv?.id, user.id)
  const readyToSend = contact?.contact_allowed === true && connection !== 'offline'

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

  useEffect(() => () => {
    sendingRef.current?.abort()
    sendingRef.current = null
  }, [])

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
    if (sendingRef.current || needsRefresh || !messages || !readyToSend) return
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
    const operation = sendOperation.current?.text === text
      ? sendOperation.current : { id: crypto.randomUUID(), text }
    sendOperation.current = operation
    try {
      const { data, error: sendError, status } = await supabase
        .rpc('send_conversation_message', {
          p_conversation_id: id, p_operation_id: operation.id, p_body: text,
        })
        .abortSignal(controller.signal)
      if (sendingRef.current !== controller) return
      if (sendError) {
        if (!status || status === 408 || status >= 500) throw sendError
        void refreshContact()
        return setError('We couldn’t send your message. Check that messaging is available and try again.')
      }
      if (data !== operation.id) throw new Error('Send was not confirmed')
      sendOperation.current = null
      uncertainSend.current = null
      setBody('')
      followLatest.current = true
      setUnseen(false)
      setFeedback('Message sent.')
      announceMessageActivity()
      void loadMessages(true)
    } catch {
      if (sendingRef.current === controller) {
        uncertainSend.current = operation
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
      void refreshContact()
      const rows = await loadMessages(true)
      if (!rows || !attempt || uncertainSend.current !== attempt) return
      const matchingMessage = rows.some((message) =>
        message.id === attempt.id && message.sender_id === user.id,
      )
      if (matchingMessage) {
        setBody('')
        sendOperation.current = null
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

  const isRenter = conv.renter_id === user.id
  const other =
    isRenter
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
              <p>{isRenter ? 'Listing owner' : 'Renter'}</p>
            </div>
            <div className="conversation-actions">
              <button
                type="button"
                className="btn"
                ref={refreshRef}
                disabled={refreshing}
                aria-busy={refreshing}
                onClick={refreshMessages}
              >
                <Icon name="refresh" size={18} />
                <span>
                  {refreshing ? 'Refreshing messages…' : 'Refresh messages'}
                </span>
              </button>
              <details className="conversation-action-menu">
                <summary className="btn" aria-label="Conversation actions"><Icon name="sliders" size={19} /></summary>
                <div className="conversation-action-menu__panel">
                  {readyToSend && conv.listings?.id && conv.owner_id && (
                    <RequestViewingButton listingId={conv.listings.id} ownerId={conv.owner_id} />
                  )}
                  {contact?.counterpart_id && (
                    <button type="button" className="btn btn-ghost" onClick={() => { setSafetyFeedback(''); setDialog('block') }}>
                      {contact.blocked_by_me ? 'Unblock account' : 'Block account'}
                    </button>
                  )}
                  <button type="button" className="btn btn-ghost" onClick={() => { setSafetyFeedback(''); setDialog('report') }}>
                    Report conversation
                  </button>
                </div>
              </details>
            </div>
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
          {messageError && (
            <LoadError onRetry={refreshMessages} retrying={refreshing}>
              {messageError}
            </LoadError>
          )}
          {safetyFeedback && <p className="form-success conversation-notice" role="status">{safetyFeedback}</p>}
          <ul
            ref={listRef}
            className="conversation-messages"
            tabIndex={0}
            onScroll={(event) => {
              const list = event.currentTarget
              const nearLatest = list.scrollHeight - list.clientHeight - list.scrollTop < 32
              if (nearLatest && !followLatest.current) {
                setUnseen(false)
                void loadMessages()
              }
              followLatest.current = nearLatest
            }}
            aria-label="Conversation messages"
            aria-live="polite"
            aria-relevant="additions text"
          >
            {messages === null && !messageError && (
              <li role="status" className="conversation-empty">
                Loading messages…
              </li>
            )}
            {messages?.length === 0 && !messageError && (
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
                  {m.id === unreadStart && <li className="conversation-date">Unread messages</li>}
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
          {unseen && (
            <button type="button" className="btn btn-ghost conversation-jump" onClick={() => {
              followLatest.current = true
              listRef.current.scrollTop = listRef.current.scrollHeight
              listRef.current.focus()
              setUnseen(false)
              void loadMessages()
            }}>Go to new messages</button>
          )}
          <form
            className="conversation-composer"
            onSubmit={handleSend}
            noValidate
            aria-busy={busy}
          >
            <div className="conversation-compose-heading">
              <label htmlFor="body">Your message</label>
              {readyToSend && (
                <details className="conversation-quick-responses">
                  <summary className="btn btn-ghost">Quick responses</summary>
                  <ul>
                    {quickResponses[isRenter ? 'renter' : 'owner'].map((response) => (
                      <li key={response}>
                        <button type="button" className="btn btn-ghost" disabled={busy || needsRefresh || !readyToSend}
                          onClick={(event) => {
                            setBody((draft) => draft.trim() ? (draft.trimEnd() + ' ' + response).slice(0, 2000) : response)
                            setFeedback('')
                            event.currentTarget.closest('details').open = false
                            composerRef.current?.focus()
                          }}
                        >{response}</button>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
            {contactError ? (
              <p className="field__hint">Couldn’t check messaging availability. Refresh messages to try again.</p>
            ) : contact?.contact_allowed === false && (
              <p className="field__hint">Messaging is restricted for this conversation. Your history and existing rental activity are still available.</p>
            )}
            <textarea
              ref={composerRef}
              id="body"
              className="resize-none"
              rows={2}
              maxLength={2000}
              placeholder="Write a message…"
              value={body}
              disabled={busy || needsRefresh || !readyToSend}
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
                disabled={busy || needsRefresh || !readyToSend || !messages || !body.trim()}
              >
                <Icon name="arrowRight" size={18} />
                {busy ? 'Sending…' : 'Send'}
              </button>
            </div>
          </form>
        </div>
        <p className="conversation-sync" aria-live="polite">
          <Icon name="clock" size={16} />
          {messageError && connection !== 'offline' ? 'Synchronization paused · Try refreshing messages' : syncLabels[connection]}
        </p>
        <ConversationReportHistory reports={reports} />
        {dialog === 'block' && contact?.counterpart_id && (
          <ContactBlockDialog userId={contact.counterpart_id} blocked={contact.blocked_by_me}
            onRefresh={refreshContact} onClose={() => setDialog(null)}
            onSaved={(message) => {
              setDialog(null)
              setSafetyFeedback(message)
              void refreshContact(true)
            }} />
        )}
        {dialog === 'report' && (
          <ConversationReportDialog conversationId={id} messages={messages ?? []} userId={user.id}
            onClose={() => { setDialog(null); void reports.refresh() }}
            onSubmitted={(message) => {
              setDialog(null)
              setSafetyFeedback(message)
              void reports.refresh()
            }} />
        )}
      </div>
    </section>
  )
}
