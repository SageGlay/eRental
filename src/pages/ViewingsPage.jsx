import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabaseClient.js'
import { VIEWING_STATUSES, VIEWING_HISTORY_LABELS, formatViewingTime, isViewingId, viewingMutationError } from '../lib/viewings.js'
import EmptyState from '../components/EmptyState.jsx'
import Icon from '../components/Icon.jsx'
import LoadError from '../components/LoadError.jsx'
import PageHeading from '../components/PageHeading.jsx'
import ViewingActionDialog from '../components/ViewingActionDialog.jsx'
import '../styles/viewings.css'

const pageSize = 20
const fields = 'id, listing_id, renter_id, owner_id, status, requested_start_at, confirmed_start_at, confirmed_end_at, proposed_start_at, request_note, meeting_details, proposed_details, revision, listings(title), renter:profiles!viewing_appointments_renter_id_fkey(display_name), owner:profiles!viewing_appointments_owner_id_fkey(display_name)'
const actions = {
  confirm: { label: 'Confirm viewing', noteLabel: 'Private meeting details (optional)' },
  decline: { label: 'Decline request', noteLabel: 'Reason for declining', noteRequired: true },
  propose: { label: 'Propose new time', askTime: true, noteLabel: 'Private meeting details (optional)' },
  accept_proposal: { label: 'Accept new time' },
  decline_proposal: { label: 'Decline new time' },
  cancel: { label: 'Cancel viewing' },
  complete: { label: 'Mark completed' },
}

function useViewings(userId, incoming, filter, page, selectedId) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState(null)
  const key = [userId, incoming, filter, page, selectedId, attempt].join('/')
  useEffect(() => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    let active = true
    const participant = incoming ? 'owner_id' : 'renter_id'
    const read = () => supabase.from('viewing_appointments').select(fields).eq(participant, userId)

    async function load() {
      try {
        let query = read()
        if (filter === 'upcoming') {
          query = query.in('status', ['confirmed', 'reschedule_proposed'])
            .gte('confirmed_start_at', new Date().toISOString()).order('confirmed_start_at')
        } else {
          if (filter !== 'all') query = query.eq('status', filter)
          query = query.order('created_at', { ascending: false })
        }
        query = query.order('id', { ascending: false })
        const first = (page - 1) * pageSize
        const list = query.range(first, first + pageSize).abortSignal(controller.signal)
        const selected = selectedId
          ? read().eq('id', selectedId).maybeSingle().abortSignal(controller.signal)
          : Promise.resolve({ data: null })
        const [batch, target] = await Promise.all([list, selected])
        if (batch.error || target.error) throw new Error('Viewings unavailable')
        if (active) {
          const rows = batch.data.slice(0, pageSize)
          if (target.data && !rows.some(row => row.id === target.data.id)) rows.unshift(target.data)
          setResult({ key, rows, more: batch.data.length > pageSize, missing: selectedId && !target.data })
        }
      } catch {
        if (active) setResult({ key, error: true })
      } finally {
        clearTimeout(timeout)
      }
    }
    load()
    return () => {
      active = false
      clearTimeout(timeout)
      controller.abort()
    }
  }, [userId, incoming, filter, page, selectedId, key])
  return { result: result?.key === key ? result : null, reload: () => setAttempt(key => key + 1) }
}

function availableActions(item, incoming) {
  const now = Date.now()
  const future = start => !start || Date.parse(start) > now
  const result = []
  if (incoming && item.status === 'pending') {
    if (future(item.requested_start_at)) result.push('confirm')
    result.push('decline')
  }
  if (incoming && ['pending', 'confirmed'].includes(item.status) && future(item.confirmed_start_at))
    result.push('propose')
  if (!incoming && item.status === 'reschedule_proposed') {
    if (future(item.confirmed_start_at) && future(item.proposed_start_at)) result.push('accept_proposal')
    result.push('decline_proposal')
  }
  if (['pending', 'confirmed', 'reschedule_proposed'].includes(item.status) && future(item.confirmed_start_at))
    result.push('cancel')
  if (incoming && ['confirmed', 'reschedule_proposed'].includes(item.status) && Date.parse(item.confirmed_end_at) <= now)
    result.push('complete')
  return result
}

function ViewingHistory({ id }) {
  const [count, setCount] = useState(pageSize)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState(null)
  const key = count + '/' + attempt

  useEffect(() => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    let active = true
    async function load() {
      try {
        const { data, error } = await supabase.from('viewing_appointment_events')
          .select('id,event_type,actor_role,scheduled_at,reason,created_at')
          .eq('appointment_id', id).order('revision', { ascending: false })
          .limit(count + 1).abortSignal(controller.signal)
        if (error) throw error
        if (active) setResult({ key, rows: data.slice(0, count), more: data.length > count })
      } catch {
        if (active) setResult({ key, error: true })
      } finally {
        clearTimeout(timeout)
      }
    }
    load()
    return () => {
      active = false
      clearTimeout(timeout)
      controller.abort()
    }
  }, [id, key, count])
  if (result?.key !== key) return <p role="status">Loading viewing history…</p>
  if (result.error) return <LoadError onRetry={() => setAttempt(value => value + 1)}>We couldn’t load the history.</LoadError>
  return (
    <>
      <ol className="viewing-history">
        {result.rows.map(event => (
          <li key={event.id}>
            <strong>{VIEWING_HISTORY_LABELS[event.event_type]}</strong>
            <time dateTime={event.created_at}>{formatViewingTime(event.created_at)} · {event.actor_role}</time>
            {event.scheduled_at && <p>Scheduled time <time dateTime={event.scheduled_at}>{formatViewingTime(event.scheduled_at)}</time></p>}
            {event.reason && <p className="prewrap">{event.reason}</p>}
          </li>
        ))}
      </ol>
      {result.more && <button type="button" className="btn btn-ghost" onClick={() => setCount(value => value + pageSize)}>Load earlier updates</button>}
    </>
  )
}

function ViewingCard({ item, incoming, onAction }) {
  const [historyOpen, setHistoryOpen] = useState(false)
  const title = item.listings?.title
  const other = incoming ? item.renter : item.owner
  return (
    <li id={'viewing-' + item.id} tabIndex={-1} className="viewing-card">
      <div className="viewing-card__heading">
        <div>
          <h2>{title && item.listing_id ? <Link to={'/listings/' + item.listing_id}>{title}</Link> : 'Rental listing unavailable'}</h2>
          <p>{incoming ? 'Renter' : 'Owner'} · {other?.display_name || 'Marketplace member'}</p>
        </div>
        <span className={'viewing-status viewing-status--' + item.status}>{VIEWING_STATUSES[item.status]}</span>
      </div>
      <dl className="viewing-schedule">
        <div><dt>Requested</dt><dd><time dateTime={item.requested_start_at}>{formatViewingTime(item.requested_start_at)}</time></dd></div>
        {item.confirmed_start_at && <div><dt>Confirmed slot</dt><dd><time dateTime={item.confirmed_start_at}>{formatViewingTime(item.confirmed_start_at)}</time></dd></div>}
        {item.proposed_start_at && <div><dt>Proposed time</dt><dd><time dateTime={item.proposed_start_at}>{formatViewingTime(item.proposed_start_at)}</time></dd></div>}
      </dl>
      {item.request_note && <p className="viewing-note"><strong>Request note</strong><span className="prewrap">{item.request_note}</span></p>}
      {item.meeting_details && <p className="viewing-note"><strong>Private meeting details</strong><span className="prewrap">{item.meeting_details}</span></p>}
      {item.proposed_details && <p className="viewing-note"><strong>Private details for the proposed time</strong><span className="prewrap">{item.proposed_details}</span></p>}
      <div className="viewing-card__actions">
        {availableActions(item, incoming).map(action => (
          <button type="button" key={action} onClick={() => onAction(item, action)}
            className={'btn ' + (['confirm', 'accept_proposal'].includes(action) ? 'btn-primary' : 'btn-ghost')}>
            {actions[action].label}
          </button>
        ))}
      </div>
      <details className="viewing-card__history" onToggle={event => setHistoryOpen(event.currentTarget.open)}>
        <summary>Viewing history</summary>
        {historyOpen && <ViewingHistory key={item.revision} id={item.id} />}
      </details>
    </li>
  )
}

export default function ViewingsPage() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const { hash } = useLocation()
  const anchor = hash.startsWith('#viewing-') ? hash.slice(9) : ''
  const selected = isViewingId(anchor) ? anchor : null
  const incoming = params.get('tab') === 'incoming'
  const status = params.get('status')
  const filter = status === 'upcoming' || Object.hasOwn(VIEWING_STATUSES, status) ? status : 'all'
  const pageParam = params.get('page')
  const page = /^\d{1,4}$/.test(pageParam || '') && Number(pageParam) > 0 ? Number(pageParam) : 1
  const { result, reload } = useViewings(user.id, incoming, filter, page, selected)
  const [selection, setSelection] = useState(null)
  const [notice, setNotice] = useState('')
  const title = useRef(null)

  function changeView(nextIncoming, nextFilter, nextPage = 1) {
    setParams({
      ...(nextIncoming ? { tab: 'incoming' } : {}),
      ...(nextFilter !== 'all' ? { status: nextFilter } : {}),
      ...(nextPage > 1 ? { page: String(nextPage) } : {}),
    })
  }

  async function apply({ start, note }, signal) {
    const response = await supabase.rpc('update_viewing', {
      p_appointment_id: selection.item.id,
      p_revision: selection.item.revision,
      p_action: selection.action,
      p_start_at: start,
      p_note: note,
    }).abortSignal(signal)
    if (signal.aborted) throw new Error('Viewing update timed out')
    if (response.error) {
      const problem = viewingMutationError(response)
      if (problem) return problem
      throw new Error('Viewing response unavailable')
    }
    setSelection(null)
    setNotice('Viewing updated.')
    reload()
    requestAnimationFrame(() => title.current?.focus())
    return null
  }

  function closeSelection(reconcile) {
    setSelection(null)
    if (reconcile) reload()
  }

  return (
    <section className="container page viewings-page">
      <PageHeading title="Viewings" titleRef={title} actions={
        <button type="button" className="btn btn-ghost" onClick={reload}><Icon name="refresh" size={18} />Refresh</button>
      }>
        Arrange a visit before renting. All appointments use Philippine time and last 30 minutes.
      </PageHeading>
      <div className="viewings-toolbar">
        <nav aria-label="Viewing lists" className="viewing-tabs">
          <Link to="/viewings" className="btn btn-ghost" aria-current={!incoming ? 'page' : undefined}>My requests</Link>
          <Link to="/viewings?tab=incoming" className="btn btn-ghost" aria-current={incoming ? 'page' : undefined}>Incoming requests</Link>
        </nav>
        <div className="field">
          <label htmlFor="viewings-status">Status</label>
          <select id="viewings-status" value={filter} onChange={event => changeView(incoming, event.target.value)}>
            <option value="all">All statuses</option>
            <option value="upcoming">Upcoming confirmed times</option>
            {Object.entries(VIEWING_STATUSES).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
          </select>
        </div>
      </div>
      {notice && <p role="status" className="form-success">{notice}</p>}
      {!result && <p className="notice" role="status">Loading viewings…</p>}
      {result?.error && <LoadError onRetry={reload}>We couldn’t load your viewings. Check your connection and try again.</LoadError>}
      {result?.missing && <p className="notice" role="status">This viewing is no longer available to your account.</p>}
      {result?.rows?.length === 0 && (
        <EmptyState icon="calendar" title="No viewings here" action={<Link className="btn btn-primary" to="/listings">Browse rentals</Link>}>
          {filter === 'all' ? 'Viewing requests and appointment updates will appear here.' : 'Choose another status to see other viewings.'}
        </EmptyState>
      )}
      {result?.rows?.length > 0 && (
        <ul className="viewing-list" aria-label={incoming ? 'Incoming viewings' : 'My viewings'}>
          {result.rows.map(item => <ViewingCard key={item.id} item={item} incoming={incoming}
            onAction={(item, action) => { setNotice(''); setSelection({ item, action }) }} />)}
        </ul>
      )}
      {(result?.more || page > 1) && (
        <nav className="viewing-pagination" aria-label="Viewing pages">
          <button type="button" className="btn btn-ghost" disabled={page === 1} onClick={() => changeView(incoming, filter, page - 1)}>Previous</button>
          <span>Page {page}</span>
          <button type="button" className="btn btn-ghost" disabled={!result?.more} onClick={() => changeView(incoming, filter, page + 1)}>Next</button>
        </nav>
      )}
      {selection && (
        <ViewingActionDialog title={actions[selection.action].label} actionLabel={actions[selection.action].label}
          subject={selection.item.listings?.title || 'Viewing appointment'}
          summary="The other participant will receive the viewing update."
          askTime={actions[selection.action].askTime} noteLabel={actions[selection.action].noteLabel}
          existingTime={selection.action.endsWith('_proposal') ? selection.item.proposed_start_at :
            selection.item.confirmed_start_at || selection.item.requested_start_at}
          noteRequired={actions[selection.action].noteRequired} apply={apply} onClose={closeSelection} />
      )}
    </section>
  )
}
