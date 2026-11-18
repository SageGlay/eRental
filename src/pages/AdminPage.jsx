import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { formatDate } from '../lib/format.js'
import { REASONS } from '../components/ReportListing.jsx'
import EmptyState from '../components/EmptyState.jsx'
import LoadError from '../components/LoadError.jsx'
import AdminNavigation from '../components/AdminNavigation.jsx'
import Dialog from '../components/Dialog.jsx'
import Icon from '../components/Icon.jsx'
import PageHeading from '../components/PageHeading.jsx'
import '../styles/admin-reports.css'

const SELECT =
  'id, reason, details, status, admin_note, created_at, listings(id, title, status, removed_by_admin, profiles(display_name)), reporter:profiles!listing_reports_reporter_id_fkey(display_name)'
const REASON_LABELS = Object.fromEntries(REASONS)
const RESULT_LABELS = { dismissed: 'Dismissed', actioned: 'Listing removed' }

function ReportCard({ report, onChange }) {
  const [note, setNote] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submitting = useRef(false)
  const listing = report.listings

  async function resolve(action) {
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    setError('')
    try {
      const { error: rpcError } = await supabase.rpc('resolve_report', {
        p_report_id: report.id,
        p_action: action,
        p_note: note.trim() || null,
      })
      if (rpcError) return setError(rpcError.message)
      setConfirm(false)
      onChange(action, listing?.title ?? 'this listing')
    } catch {
      setError(
        'We couldn’t confirm this decision. Refresh the reports before trying again.',
      )
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <li className="moderation-card">
      <div className="moderation-card__content">
        <div className="moderation-card__topline">
          <span
            className={`moderation-status moderation-status--${report.status}`}
          >
            {report.status === 'open'
              ? 'Needs review'
              : RESULT_LABELS[report.status]}
          </span>
          <span className="moderation-date">
            <Icon name="clock" size={16} />
            {formatDate(report.created_at)}
          </span>
        </div>
        <h3>
          {listing?.id ? (
            <Link to={`/listings/${listing.id}`}>
              {listing.title ?? 'Listing'}
              <Icon name="arrowRight" size={18} />
            </Link>
          ) : (
            'Listing no longer available'
          )}
        </h3>
        <dl className="moderation-people">
          <div>
            <dt>Owner</dt>
            <dd>{listing?.profiles?.display_name ?? 'Unknown'}</dd>
          </div>
          <div>
            <dt>Reported by</dt>
            <dd>{report.reporter?.display_name ?? 'Unknown'}</dd>
          </div>
        </dl>
        <div className="moderation-reason">
          <strong>{REASON_LABELS[report.reason] ?? report.reason}</strong>
          {report.details && <p>{report.details}</p>}
        </div>
        {listing?.status === 'removed' && (
          <p className="moderation-removed">
            <Icon name="shield" size={16} />
            Listing is removed{listing.removed_by_admin ? ' (by an admin)' : ''}
          </p>
        )}
        {report.status !== 'open' && (
          <p className="moderation-resolution">
            {RESULT_LABELS[report.status]}
            {report.admin_note ? ` · ${report.admin_note}` : ''}
          </p>
        )}
        {error && !confirm && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      {report.status === 'open' && (
        <div className="moderation-card__actions">
          <div className="field">
            <label htmlFor={`note-${report.id}`}>Note (optional)</label>
            <input
              id={`note-${report.id}`}
              type="text"
              maxLength={500}
              placeholder="Record the reason for your decision"
              value={note}
              disabled={busy}
              onChange={(e) => setNote(e.target.value)}
            />
            <span className="field__hint">
              Saved with the resolution. Up to 500 characters.
            </span>
          </div>
          <div className="moderation-card__buttons">
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => resolve('dismiss')}
            >
              {busy && !confirm ? 'Dismissing…' : 'Dismiss report'}
            </button>
            <button
              type="button"
              className="btn btn-ghost moderation-remove"
              disabled={busy}
              onClick={() => {
                setError('')
                setConfirm(true)
              }}
            >
              Remove listing
            </button>
          </div>
        </div>
      )}
      {confirm && (
        <Dialog
          title="Remove this listing?"
          busy={busy}
          onClose={() => setConfirm(false)}
        >
          <p>
            <strong>{listing?.title ?? 'This listing'}</strong> will be removed
            from the marketplace. Every open report about it will close, and its
            owner cannot restore it.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="verification-actions">
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              Keep listing
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={() => resolve('remove_listing')}
            >
              {busy ? 'Removing…' : 'Yes, remove'}
            </button>
          </div>
        </Dialog>
      )}
    </li>
  )
}

function ReportsPanel() {
  const [view, setView] = useState('open')
  const [state, setState] = useState({ rows: [], loading: true, error: null })
  const [feedback, setFeedback] = useState(null)
  const queueHeading = useRef(null)
  const currentLoad = useRef(0)
  const load = useCallback(() => {
    const generation = ++currentLoad.current
    setState((s) => ({ ...s, loading: true, error: null }))
    const query = supabase.from('listing_reports').select(SELECT)
    ;(view === 'open'
      ? query.eq('status', 'open')
      : query.neq('status', 'open')
    )
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (generation === currentLoad.current)
          setState({
            rows: data ?? [],
            loading: false,
            error: error ? error.message : null,
          })
      })
      .catch(() => {
        if (generation === currentLoad.current)
          setState((s) => ({
            ...s,
            loading: false,
            error: 'Check your connection and try again.',
          }))
      })
  }, [view])
  useEffect(() => {
    load()
    return () => {
      currentLoad.current += 1
    }
  }, [load])
  useEffect(() => {
    if (feedback) queueHeading.current?.focus()
  }, [feedback])

  function resolved(action, title) {
    setFeedback({
      message:
        action === 'remove_listing'
          ? `Listing “${title}” removed. Open reports about it are closed.`
          : `Report dismissed for “${title}”.`,
    })
    load()
  }

  const { rows, loading, error } = state
  function changeTab(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next =
      event.key === 'Home'
        ? 'open'
        : event.key === 'End'
          ? 'resolved'
          : view === 'open'
            ? 'resolved'
            : 'open'
    setView(next)
    event.currentTarget.parentElement
      .querySelector(`[data-view="${next}"]`)
      ?.focus()
  }
  return (
    <>
      {feedback && (
        <p className="form-success" role="status">
          {feedback.message}
        </p>
      )}
      <div className="moderation-toolbar">
        <div
          className="tabs moderation-tabs"
          role="tablist"
          aria-label="Report status"
        >
          {[
            ['open', 'Open'],
            ['resolved', 'Resolved'],
          ].map(([value, label]) => (
            <button
              key={value}
              id={`report-tab-${value}`}
              data-view={value}
              type="button"
              role="tab"
              tabIndex={view === value ? 0 : -1}
              aria-selected={view === value}
              aria-controls="report-panel"
              onKeyDown={changeTab}
              onClick={() => setView(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={loading}
          onClick={load}
        >
          <Icon name="clock" size={16} />
          Refresh reports
        </button>
      </div>
      <div
        id="report-panel"
        role="tabpanel"
        aria-labelledby={`report-tab-${view}`}
      >
        <div className="moderation-queue-head">
          <div>
            <h2 ref={queueHeading} tabIndex={-1}>
              {view === 'open' ? 'Reports to review' : 'Resolution history'}
            </h2>
            <p>
              {view === 'open'
                ? 'Review the context before making a decision.'
                : 'Previously dismissed reports and removed listings.'}
            </p>
          </div>
          <span className="moderation-count" role="status">
            {loading
              ? 'Loading reports…'
              : error
                ? 'Reports unavailable'
                : `${rows.length} ${view === 'open' ? 'open' : 'resolved'} report${rows.length === 1 ? '' : 's'}`}
          </span>
        </div>
        {loading && (
          <p className="moderation-loading" role="status">
            Loading…
          </p>
        )}
        {error && (
          <LoadError onRetry={load}>
            We couldn’t load reports ({error}).
          </LoadError>
        )}
        {!loading && !error && rows.length === 0 && (
          <EmptyState
            icon={<Icon name="shield" size={28} />}
            title={view === 'open' ? 'No open reports' : 'Nothing resolved yet'}
          >
            {view === 'open'
              ? 'When someone reports a listing, it will show up here for review.'
              : 'Reports you dismiss or act on will be listed here.'}
          </EmptyState>
        )}
        {!loading && !error && (
          <ul className="moderation-queue">
            {rows.map((r) => (
              <ReportCard key={r.id} report={r} onChange={resolved} />
            ))}
          </ul>
        )}
        {!loading && !error && rows.length > 0 && (
          <p className="moderation-limit">
            Showing up to 100 most recent{' '}
            {view === 'open' ? 'open' : 'resolved'} reports.
          </p>
        )}
      </div>
    </>
  )
}

export default function AdminPage() {
  return (
    <section className="container page admin-reports-page">
      <AdminNavigation />
      <PageHeading eyebrow="Marketplace administration" title="Admin">
        <p>Keep the marketplace useful, clear and trustworthy.</p>
      </PageHeading>
      <div className="moderation-intro">
        <span className="moderation-intro__icon">
          <Icon name="shield" size={24} />
        </span>
        <div>
          <h2>Listing reports</h2>
          <p>
            Dismiss a report if the listing is fine, or remove the listing.
            Removing a listing closes every open report about it. Owners can’t
            bring back a listing an admin removed.
          </p>
        </div>
      </div>
      <ReportsPanel />
    </section>
  )
}
