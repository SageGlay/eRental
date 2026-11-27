import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { announceMessageActivity } from '../hooks/useMessageRealtime.js'
import LoadError from './LoadError.jsx'

export default function BlockedAccounts({ userId }) {
  const [state, setState] = useState({ loading: true })
  const [revision, setRevision] = useState(0)
  const [pending, setPending] = useState(null)
  const [notice, setNotice] = useState(null)
  const active = useRef(null)
  const heading = useRef(null)
  const refresh = () => setRevision((value) => value + 1)
  useEffect(() => {
    const controller = new AbortController()
    let alive = true
    const timeout = setTimeout(() => controller.abort(), 15000)
    setState({ loading: true })
    supabase.from('user_blocks')
      .select('blocked_id,profiles!user_blocks_blocked_id_fkey(display_name,business_name)')
      .eq('blocker_id', userId).order('created_at', { ascending: false })
      .abortSignal(controller.signal).then(({ data, error }) => {
        if (alive) setState(error ? { error: true } : { rows: data ?? [] })
      }).catch(() => { if (alive) setState({ error: true }) })
      .finally(() => clearTimeout(timeout))
    return () => { alive = false; clearTimeout(timeout); controller.abort() }
  }, [userId, revision])
  useEffect(() => () => {
    active.current?.abort()
    active.current = null
  }, [])

  async function unblock(id) {
    if (active.current) return
    const controller = new AbortController()
    active.current = controller
    const timeout = setTimeout(() => controller.abort(), 15000)
    setPending(id)
    setNotice(null)
    try {
      const { error } = await supabase.rpc('set_user_block', {
        p_user_id: id, p_blocked: false,
      }).abortSignal(controller.signal)
      if (active.current !== controller) return
      if (error) throw error
      announceMessageActivity()
      setNotice({ text: 'Your block was removed.' })
    } catch {
      if (active.current === controller) setNotice({ error: true, text: 'We couldn’t confirm the change. Check the refreshed list.' })
    } finally {
      clearTimeout(timeout)
      if (active.current === controller) {
        active.current = null
        setPending(null)
        heading.current?.focus()
        refresh()
      }
    }
  }

  return (
    <section id="blocked-accounts" tabIndex={-1} aria-labelledby="blocked-accounts-heading">
      <h3 id="blocked-accounts-heading" ref={heading} tabIndex={-1}>Blocked accounts</h3>
      <p>While either account has an active block, new messages, conversations and viewing requests are restricted.</p>
      {notice && <p className={notice.error ? 'form-error' : 'form-success'} role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
      {state.loading && <p role="status">Loading blocked accounts…</p>}
      {state.error && <LoadError onRetry={refresh}>We couldn’t load blocked accounts.</LoadError>}
      {state.rows?.length === 0 && <p>You haven’t blocked any accounts.</p>}
      {state.rows?.length > 0 && (
        <ul>
          {state.rows.map((entry) => (
            <li className="profile-settings__row" key={entry.blocked_id}>
              <span>{entry.profiles?.business_name || entry.profiles?.display_name || 'Marketplace member'}</span>
              <button type="button" className="btn" disabled={Boolean(pending)} onClick={() => unblock(entry.blocked_id)}>
                {pending === entry.blocked_id ? 'Unblocking…' : 'Unblock'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
