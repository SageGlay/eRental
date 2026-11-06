import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import { formatTime } from '../lib/messages.js'
import EmptyState from '../components/EmptyState.jsx'

const SELECT = 'id, last_message_at, renter_id, listings(title), renter:profiles!conversations_renter_id_fkey(display_name), owner:profiles!conversations_owner_id_fkey(display_name)'

export default function MessagesPage() {
  const { user } = useAuth()
  const [state, setState] = useState({ rows: [], unread: {}, loading: true, error: null })

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const [convs, unread] = await Promise.all([
        supabase.from('conversations').select(SELECT).order('last_message_at', { ascending: false }),
        supabase.from('messages').select('conversation_id').is('read_at', null).neq('sender_id', user.id),
      ])
      if (cancelled) return
      const counts = {}
      for (const m of unread.data ?? []) counts[m.conversation_id] = (counts[m.conversation_id] ?? 0) + 1
      setState({ rows: convs.data ?? [], unread: counts, loading: false, error: (convs.error ?? unread.error)?.message ?? null })
    }
    load()
    const timer = setInterval(load, 15000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [user.id])

  const { rows, unread, loading, error } = state
  return (
    <section className="container page">
      <h1>Messages</h1>
      {loading && <p aria-busy="true">Loading…</p>}
      {error && <p className="form-error" role="alert">We couldn’t load your messages ({error}).</p>}
      {!loading && !error && rows.length === 0 && (
        <EmptyState icon="💬" title="No conversations yet" action={<Link className="btn btn-primary" to="/listings">Browse rentals</Link>}>
          Open a listing and choose “Message the owner” to start a conversation. Owners can reply here once someone writes to them.
        </EmptyState>
      )}
      <ul className="inbox">
        {rows.map((c) => {
          const other = c.renter_id === user.id ? c.owner?.display_name : c.renter?.display_name
          return (
            <li key={c.id}>
              <Link to={`/messages/${c.id}`}>
                <span className="inbox__main">
                  <strong>{other ?? 'Someone'}</strong>
                  <span>About: {c.listings?.title ?? 'a listing'}</span>
                  <span>Last message {formatTime(c.last_message_at)}</span>
                </span>
                {unread[c.id] > 0 && <span className="nav-badge" aria-label={`${unread[c.id]} unread`}>{unread[c.id]}</span>}
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
