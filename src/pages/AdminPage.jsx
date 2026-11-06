import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { formatDate } from '../lib/format.js'
import { REASONS } from '../components/ReportListing.jsx'
import EmptyState from '../components/EmptyState.jsx'

const SELECT = 'id, reason, details, status, admin_note, created_at, listings(id, title, status, removed_by_admin, profiles(display_name)), reporter:profiles!listing_reports_reporter_id_fkey(display_name)'
const REASON_LABELS = Object.fromEntries(REASONS)
const RESULT_LABELS = { dismissed: 'Dismissed', actioned: 'Listing removed' }

function ReportCard({ report, onChange }) {
  const [note, setNote] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const listing = report.listings

  async function resolve(action) {
    setBusy(true)
    setError('')
    const { error: rpcError } = await supabase.rpc('resolve_report', { p_report_id: report.id, p_action: action, p_note: note.trim() || null })
    setBusy(false)
    setConfirm(false)
    if (rpcError) return setError(rpcError.message)
    onChange()
  }

  return (
    <li className="booking">
      <div className="booking__main">
        <Link to={`/listings/${listing?.id}`}><strong>{listing?.title ?? 'Listing'}</strong></Link>
        <span>Owner: {listing?.profiles?.display_name ?? 'Unknown'} · Reported by {report.reporter?.display_name ?? 'Unknown'} · {formatDate(report.created_at)}</span>
        <span><strong>{REASON_LABELS[report.reason]}</strong>{report.details ? `: ${report.details}` : ''}</span>
        {listing?.status === 'removed' && <span className="status status--cancelled">Listing is removed{listing.removed_by_admin ? ' (by an admin)' : ''}</span>}
        {report.status !== 'open' && <span className="status status--completed">{RESULT_LABELS[report.status]}{report.admin_note ? ` · ${report.admin_note}` : ''}</span>}
        {error && <span className="form-error" role="alert">{error}</span>}
      </div>
      {report.status === 'open' && (
        <div className="booking__actions">
          <label htmlFor={`note-${report.id}`} className="sr-only">Note (optional)</label>
          <input id={`note-${report.id}`} className="admin-note" type="text" maxLength={500} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          {confirm ? (
            <>
              <span>Remove this listing?</span>
              <button type="button" className="btn btn-danger" disabled={busy} onClick={() => resolve('remove_listing')}>Yes, remove</button>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirm(false)}>No</button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => resolve('dismiss')}>Dismiss report</button>
              <button type="button" className="btn btn-danger" disabled={busy} onClick={() => setConfirm(true)}>Remove listing</button>
            </>
          )}
        </div>
      )}
    </li>
  )
}

function ReportsPanel() {
  const [view, setView] = useState('open')
  const [state, setState] = useState({ rows: [], loading: true, error: null })
  const load = useCallback(() => {
    const query = supabase.from('listing_reports').select(SELECT)
    ;(view === 'open' ? query.eq('status', 'open') : query.neq('status', 'open'))
      .order('created_at', { ascending: false }).limit(100)
      .then(({ data, error }) => setState({ rows: data ?? [], loading: false, error: error ? error.message : null }))
  }, [view])
  useEffect(() => { setState((s) => ({ ...s, loading: true })); load() }, [load])

  const { rows, loading, error } = state
  return (
    <>
      <div className="tabs" role="tablist" aria-label="Report status">
        <button type="button" role="tab" aria-selected={view === 'open'} onClick={() => setView('open')}>Open</button>
        <button type="button" role="tab" aria-selected={view === 'resolved'} onClick={() => setView('resolved')}>Resolved</button>
      </div>
      {loading && <p aria-busy="true">Loading…</p>}
      {error && <p className="form-error" role="alert">We couldn’t load reports ({error}).</p>}
      {!loading && !error && rows.length === 0 && (
        <EmptyState icon="✅" title={view === 'open' ? 'No open reports' : 'Nothing resolved yet'}>
          {view === 'open' ? 'When someone reports a listing, it will show up here for review.' : 'Reports you dismiss or act on will be listed here.'}
        </EmptyState>
      )}
      <ul className="bookings">{rows.map((r) => <ReportCard key={r.id} report={r} onChange={load} />)}</ul>
    </>
  )
}

export default function AdminPage() {
  return (
    <section className="container page">
      <h1>Admin</h1>
      <h2>Listing reports</h2>
      <p className="detail__meta">Dismiss a report if the listing is fine, or remove the listing. Removing a listing closes every open report about it. Owners can’t bring back a listing an admin removed.</p>
      <ReportsPanel />
    </section>
  )
}
