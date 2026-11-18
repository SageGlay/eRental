import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import { formatTime } from '../lib/messages.js'
import EmptyState from '../components/EmptyState.jsx'
import Icon from '../components/Icon.jsx'
import PageHeading from '../components/PageHeading.jsx'
import '../styles/conversation.css'

const META =
  'id, renter_id, listings(id, title), renter:profiles!conversations_renter_id_fkey(display_name), owner:profiles!conversations_owner_id_fkey(display_name)'

export default function ConversationPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const [conv, setConv] = useState(undefined) // undefined = loading, null = not found
  const [messages, setMessages] = useState([])
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const endRef = useRef(null)
  const composerRef = useRef(null)
  const sendingRef = useRef(false)

  const loadMessages = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('messages')
      .select('id, sender_id, body, created_at, read_at')
      .eq('conversation_id', id)
      .order('created_at')
    if (loadError) return setError(loadError.message)
    setMessages(data ?? [])
    if ((data ?? []).some((m) => m.sender_id !== user.id && !m.read_at)) {
      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('conversation_id', id)
        .neq('sender_id', user.id)
        .is('read_at', null)
    }
  }, [id, user.id])

  useEffect(() => {
    supabase
      .from('conversations')
      .select(META)
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => setConv(data ?? null))
    loadMessages()
    const timer = setInterval(loadMessages, 8000)
    return () => clearInterval(timer)
  }, [id, loadMessages])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [messages.length])
  useEffect(() => {
    if (sent && !busy) composerRef.current?.focus()
  }, [sent, busy])

  async function handleSend(e) {
    e.preventDefault()
    if (sendingRef.current) return
    const text = body.trim()
    if (!text) return composerRef.current?.focus()
    if (text.length > 2000) {
      setError('Messages can be up to 2,000 characters.')
      composerRef.current?.focus()
      return
    }
    sendingRef.current = true
    setBusy(true)
    setSent(false)
    setError('')
    const { error: sendError } = await supabase
      .from('messages')
      .insert({ conversation_id: id, sender_id: user.id, body: text })
    sendingRef.current = false
    setBusy(false)
    if (sendError) return setError(sendError.message)
    setBody('')
    setSent(true)
    loadMessages()
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
          actions={
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setError('')
                loadMessages()
              }}
            >
              <Icon name="message" size={18} />
              Refresh messages
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
            <ul
              className="thread__list conversation-messages"
              aria-label="Conversation messages"
              aria-live="polite"
              aria-relevant="additions text"
            >
              {messages.length === 0 && (
                <li className="conversation-empty">
                  <Icon name="message" size={36} />
                  <h2>Start with a hello</h2>
                  <p>
                    Ask about the rental, discuss your dates, or arrange the
                    handover.
                  </p>
                </li>
              )}
              {messages.map((m) => (
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
                disabled={busy}
                aria-describedby={`message-help${error ? ' message-error' : ''}`}
                onChange={(e) => {
                  setBody(e.target.value)
                  setSent(false)
                }}
              />
              {error && (
                <div className="conversation-error">
                  <p id="message-error" className="form-error" role="alert">
                    {error}
                  </p>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy}
                    onClick={() => {
                      setError('')
                      loadMessages()
                    }}
                  >
                    Try loading messages again
                  </button>
                </div>
              )}
              <div className="conversation-composer__footer">
                <span id="message-help" className="field__hint">
                  Up to 2,000 characters
                </span>
                <span className="sr-only" role="status">
                  {sent ? 'Message sent.' : ''}
                </span>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={busy || !body.trim()}
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
