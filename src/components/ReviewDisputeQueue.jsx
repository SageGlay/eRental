import { useCallback, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { formatDate } from '../lib/format.js'
import { REVIEW_DISPUTE_REASONS, REVIEW_DISPUTE_STATUSES, UUID_PATTERN } from '../lib/reviewTrust.js'
import { supabase } from '../lib/supabaseClient.js'
import useReviewResource from '../hooks/useReviewResource.js'
import EmptyState from './EmptyState.jsx'
import LoadError from './LoadError.jsx'
import ResolveReviewDisputeDialog from './ResolveReviewDisputeDialog.jsx'

const pageSize = 12
const fields = 'id,review_id,reason,details,status,admin_note,reviewed_at,created_at'
const badge = { pending: 'pending', upheld: 'completed', dismissed: 'cancelled' }

function disputeQuery(userId) {
  const query = supabase.from('review_disputes').select(fields)
  return userId ? query.eq('submitted_by', userId) : query
}

function DisputeCard({ item, onInspect }) {
  return (
    <li id={`dispute-${item.id}`} className="review dispute-card" tabIndex={-1}>
      <div className="dispute-card__header">
        <h3>{REVIEW_DISPUTE_REASONS[item.reason] ?? 'Policy concern'}</h3>
        <span className={`status status--${badge[item.status] ?? 'pending'}`}>{REVIEW_DISPUTE_STATUSES[item.status] ?? 'Status unavailable'}</span>
      </div>
      <p className="detail__meta">Submitted {formatDate(item.created_at)}</p>
      <p>{item.details}</p>
      {item.admin_note && (
        <div className="dispute-card__decision">
          <h4>Decision{item.reviewed_at ? ' · ' + formatDate(item.reviewed_at) : ''}</h4>
          <p>{item.admin_note}</p>
        </div>
      )}
      {onInspect && (
        <button className="btn btn-ghost" type="button" onClick={() => onInspect(item)}>
          {item.status === 'pending' ? 'Review dispute' : 'View evidence'}
        </button>
      )}
    </li>
  )
}

export default function ReviewDisputeQueue({ userId, admin = false }) {
  const { hash } = useLocation()
  const focusId = hash.startsWith('#dispute-') ? hash.slice(9) : ''
  const [filter, setFilter] = useState(admin ? 'pending' : '')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(null)
  const [notice, setNotice] = useState('')
  const heading = useRef(null)
  const load = useCallback(async signal => {
    const offset = (page - 1) * pageSize
    const query = disputeQuery(userId)
    if (filter) query.eq('status', filter)
    const { data, error } = await query.order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(offset, offset + pageSize).abortSignal(signal)
    if (error) throw error
    const rows = data ?? []
    let linked = null
    if (!admin && UUID_PATTERN.test(focusId) && !rows.slice(0, pageSize).some(item => item.id === focusId)) {
      const result = await disputeQuery(userId).eq('id', focusId).maybeSingle().abortSignal(signal)
      if (result.error) throw result.error
      linked = result.data
    }
    return { rows, linked }
  }, [userId, admin, focusId, filter, page])
  const queue = useReviewResource(load)
  const rows = queue.data?.rows ?? []

  function recheck(message = '') {
    setSelected(null)
    setNotice(message)
    queue.refresh()
    requestAnimationFrame(() => heading.current?.focus())
  }

  function updatePage(next) {
    setPage(next)
    requestAnimationFrame(() => heading.current?.focus())
  }

  return (
    <>
      <div className="review-filter">
        <div className="field">
          <label htmlFor="review-dispute-filter">Status</label>
          <select id="review-dispute-filter" value={filter} onChange={event => { setFilter(event.target.value); setPage(1); setNotice('') }}>
            <option value="">All statuses</option>
            {Object.entries(REVIEW_DISPUTE_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => recheck()} disabled={queue.loading}>Refresh</button>
      </div>
      <h2 ref={heading} tabIndex={-1}>{admin ? 'Review queue' : 'Your cases'}</h2>
      {notice && <p role="status" className="form-success">{notice}</p>}
      {queue.loading && <p role="status">Loading disputes…</p>}
      {queue.error && <LoadError onRetry={() => recheck()}>We couldn’t load review disputes. Check your connection and try again.</LoadError>}
      {queue.data?.linked && <ul className="reviews__list" aria-label="Linked dispute"><DisputeCard item={queue.data.linked} /></ul>}
      {queue.data && rows.length === 0 && !queue.data.linked && (
        <EmptyState title="No disputes found">
          {page > 1 ? 'Return to an earlier page.' : 'Cases matching this status will appear here.'}
        </EmptyState>
      )}
      {rows.length > 0 && (
        <ul className="reviews__list" aria-label="Review disputes">
          {rows.slice(0, pageSize).map(item => <DisputeCard key={item.id} item={item} onInspect={admin ? setSelected : null} />)}
        </ul>
      )}
      {(page > 1 || rows.length > pageSize) && (
        <nav className="review-pagination" aria-label="Dispute pages">
          <button type="button" className="btn btn-ghost" disabled={page === 1} onClick={() => updatePage(page - 1)}>Previous</button>
          <span>Page {page}</span>
          <button type="button" className="btn btn-ghost" disabled={rows.length <= pageSize} onClick={() => updatePage(page + 1)}>Next</button>
        </nav>
      )}
      {selected && <ResolveReviewDisputeDialog key={selected.id} item={selected} onClose={() => setSelected(null)} onRecheck={recheck} />}
    </>
  )
}
