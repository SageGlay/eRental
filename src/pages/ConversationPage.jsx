import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import { formatTime } from '../lib/messages.js'
import EmptyState from '../components/EmptyState.jsx'

const META = 'id, renter_id, listings(id, title), renter:profiles!conversations_renter_id_fkey(display_name), owner:profiles!conversations_owner_id_fkey(display_name)'

export default function ConversationPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const [conv, setConv] = useState(undefined) // undefined = loading, null = not found
  const [messages, setMessages] = useState([])
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef(null)

  const loadMessages = useCallback(async () => {
    const { data, error: loadError } = await supabase.from('messages').select('id, sender_id, body, created_at, read_at').eq('conversation_id', id).order('created_at')
    if (loadError) return setError(loadError.message)
    setMessages(data ?? [])
    if ((data ?? []).some((m) => m.sender_id !== user.id && !m.read_at)) {
      await supabase.from('messages').update({ read_at: new Date().toISOString() }).eq('conversation_id', id).neq('sender_id', user.id).is('read_at', null)
    }
  }, [id, user.id])

  useEffect(() => {
    supabase.from('conversations').select(META).eq('id', id).maybeSingle().then(({ data }) => setConv(data ?? null))
    loadMessages()
    const timer = setInterval(loadMessages, 8000)
    return () => clearInterval(timer)
  }, [id, loadMessages])

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }) }, [messages.length])

  async function handleSend(e) {
    e.preventDefault()
    const text = body.trim()
    if (!text) return
    if (text.length > 2000) return setError('Messages can be up to 2,000 characters.')
    setBusy(true)
    setError('')
    const { error: sendError } = await supabase.from('messages').insert({ conversation_id: id, sender_id: user.id, body: text })
    setBusy(false)
    if (sendError) return setError(sendError.message)
    setBody('')
    loadMessages()
  }

  if (conv === undefined) return <p className="container page" aria-busy="true">Loading…</p>
  if (conv === null) {
    return (
      <section className="container page">
        <EmptyState icon="💬" title="Conversation not found" action={<Link className="btn btn-primary" to="/messages">Back to messages</Link>}>
          It may not exist, or it belongs to someone else.
        </EmptyState>
      </section>
    )
  }

  const other = conv.renter_id === user.id ? conv.owner?.display_name : conv.renter?.display_name
  return (
    <section className="container page">
      <div className="thread">
        <p className="breadcrumb"><Link to="/messages">Messages</Link> › {other ?? 'Someone'}</p>
        <h1>{other ?? 'Someone'}</h1>
        <p className="detail__meta">About: {conv.listings ? <Link to={`/listings/${conv.listings.id}`}>{conv.listings.title}</Link> : 'a listing'}</p>
        <ul className="thread__list" aria-live="polite">
          {messages.length === 0 && <li className="detail__meta">No messages yet. Say hello!</li>}
          {messages.map((m) => (
            <li key={m.id} className={`bubble${m.sender_id === user.id ? ' bubble--mine' : ''}`}>
              {m.body}
              <time dateTime={m.created_at}>{formatTime(m.created_at)}</time>
            </li>
          ))}
          <li ref={endRef} aria-hidden="true" />
        </ul>
        <form className="thread__form" onSubmit={handleSend} noValidate>
          <label htmlFor="body" className="sr-only">Your message</label>
          <textarea id="body" maxLength={2000} placeholder="Write a message…" value={body} onChange={(e) => setBody(e.target.value)} />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send'}</button>
        </form>
        <p className="detail__meta">Keep arrangements respectful. Never share passwords or send real money outside agreed rental terms.</p>
      </div>
    </section>
  )
}
