import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { reportReasonLabel, reportReasons, reportStatusLabel } from '../lib/conversationSafety.js'
import { formatTime } from '../lib/messages.js'
import AdminNavigation from '../components/AdminNavigation.jsx'
import Dialog from '../components/Dialog.jsx'
import EmptyState from '../components/EmptyState.jsx'
import LoadError from '../components/LoadError.jsx'
import PageHeading from '../components/PageHeading.jsx'
import '../styles/admin-reports.css'
import '../styles/conversation.css'

const fields = 'id,reason,details,status,admin_note,reviewed_at,created_at,reporter:profiles!conversation_reports_reporter_id_fkey(display_name),counterpart:profiles!conversation_reports_reported_user_id_fkey(display_name)'
const pageSize = 15

function ReviewReport({ report, onClose, onResult }) {
  const [revision, setRevision] = useState(0)
  const [evidence, setEvidence] = useState({ loading: true })
  const [action, setAction] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const mutation = useRef(null)
  useEffect(() => {
    const signal = new AbortController()
    let active = true
    const timeout = setTimeout(() => signal.abort(), 15000)
    setEvidence({ loading: true })
    supabase.rpc('get_conversation_report_evidence', { p_report_id: report.id })
      .abortSignal(signal.signal).then(({ data, error }) => {
        if (active) setEvidence(error ? { error: true } : { rows: data ?? [] })
      }).catch(() => {
        if (active) setEvidence({ error: true })
      }).finally(() => clearTimeout(timeout))
    return () => { active = false; clearTimeout(timeout); signal.abort() }
  }, [report.id, revision])
  useEffect(() => () => {
    mutation.current?.abort()
    mutation.current = null
  }, [])

  async function resolve(event) {
    event.preventDefault()
    if (!action || !note.trim() || mutation.current || uncertain) return
    const controller = new AbortController()
    mutation.current = controller
    const timeout = setTimeout(() => controller.abort(), 15000)
    setBusy(true)
    setError('')
    try {
      const { error } = await supabase.rpc('resolve_conversation_report', {
        p_report_id: report.id, p_action: action, p_note: note.trim(),
      }).abortSignal(controller.signal)
      if (mutation.current !== controller) return
      if (error) throw error
      onResult('Report resolution saved.')
    } catch {
      if (mutation.current === controller) {
        setUncertain(true)
        setError('We couldn’t confirm the resolution. Close and refresh the queue before retrying.')
      }
    } finally {
      clearTimeout(timeout)
      if (mutation.current === controller) {
        mutation.current = null
        setBusy(false)
      }
    }
  }

  return (
    <Dialog title="Review conversation report" busy={busy} onClose={onClose}>
      <div className="conversation-report-form">
        <p><strong>{reportReasonLabel(report.reason)}</strong> · {reportStatusLabel(report.status)}</p>
        {report.details && <p>{report.details}</p>}
        <section aria-label="Messages selected by the reporter">
          <h3>Selected evidence</h3>
          {evidence.loading && <p role="status">Loading selected messages…</p>}
          {evidence.error && <LoadError onRetry={() => setRevision((value) => value + 1)}>We couldn’t load the selected evidence.</LoadError>}
          {evidence.rows?.length === 0 && <p>No messages were selected for this report.</p>}
          {evidence.rows?.length > 0 && (
            <ol className="moderation-queue">
              {evidence.rows.map((row) => (
                <li key={row.message_id} className="moderation-reason">
                  <strong>{row.sender_role === 'reporter' ? 'Reporter' : 'Other participant'}</strong>
                  <span> · {formatTime(row.created_at)}</span>
                  <p>{row.body}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
        {report.status === 'pending' ? (
          <form className="conversation-report-form" onSubmit={resolve}>
            <div className="field">
              <label htmlFor="moderation-decision">Decision</label>
              <select id="moderation-decision" required value={action} disabled={busy || uncertain} onChange={(e) => setAction(e.target.value)}>
                <option value="">Choose a decision</option>
                <option value="upheld">Uphold report</option>
                <option value="dismissed">Dismiss report</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="moderation-reason">Reason shared with the reporter</label>
              <textarea id="moderation-reason" required rows={3} maxLength={500} value={note} disabled={busy || uncertain} onChange={(e) => setNote(e.target.value)} />
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="dialog-actions">
              <button type="submit" className="btn btn-primary" disabled={busy || uncertain || !action || !note.trim() || !evidence.rows}>
                {busy ? 'Saving decision…' : 'Save decision'}
              </button>
            </div>
          </form>
        ) : (
          <p><strong>Recorded reason</strong><br />{report.admin_note}</p>
        )}
      </div>
    </Dialog>
  )
}

export default function AdminConversationReportsPage() {
  const [status, setStatus] = useState('pending')
  const [reason, setReason] = useState('')
  const [page, setPage] = useState(0)
  const [revision, setRevision] = useState(0)
  const [selected, setSelected] = useState(null)
  const [notice, setNotice] = useState('')
  const [result, setResult] = useState(null)
  const heading = useRef(null)
  const key = [status, reason, page, revision].join('/')
  const current = result?.key === key ? result : null
  const refresh = () => setRevision((value) => value + 1)
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const timeout = setTimeout(() => controller.abort(), 15000)
    let query = supabase.from('conversation_reports').select(fields, { count: 'exact' })
      .eq('status', status).order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1)
    if (reason) query = query.eq('reason', reason)
    query.abortSignal(controller.signal).then(({ data, error, count }) => {
      if (!active) return
      if (page && (error?.code === 'PGRST103' || (!error && !data?.length))) setPage(0)
      else setResult(error ? { key, error: true } : { key, rows: data ?? [], total: count ?? data?.length ?? 0 })
    }).catch(() => {
      if (active) setResult({ key, error: true })
    }).finally(() => clearTimeout(timeout))
    return () => { active = false; clearTimeout(timeout); controller.abort() }
  }, [key, status, reason, page])
  return (
    <section className="container page moderation-workspace admin-reports-page">
      <AdminNavigation />
      <div className="moderation-workspace__body">
        <PageHeading title="Conversation reports" actions={<button type="button" className="btn" onClick={refresh}>Refresh reports</button>}>
          Review reports and the messages participants chose to share.
        </PageHeading>
        <div className="moderation-toolbar">
          <div className="field">
            <label htmlFor="conversation-queue-status">Status</label>
            <select id="conversation-queue-status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0) }}>
              <option value="pending">Pending review</option>
              <option value="upheld">Upheld</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="conversation-queue-reason">Reason</label>
            <select id="conversation-queue-reason" value={reason} onChange={(e) => { setReason(e.target.value); setPage(0) }}>
              <option value="">All reasons</option>
              {reportReasons.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
        </div>
        <h2 tabIndex={-1} ref={heading}>{status === 'pending' ? 'Reports to review' : 'Resolution history'}</h2>
        {notice && <p className="form-success" role="status">{notice}</p>}
        {!current && <p role="status">Loading conversation reports…</p>}
        {current?.error && <LoadError onRetry={refresh}>We couldn’t load conversation reports. Try again.</LoadError>}
        {current?.rows?.length === 0 && <EmptyState title="No matching reports">Choose a different status or reason to see other reports.</EmptyState>}
        {current?.rows?.length > 0 && (
          <>
            <ul className="moderation-queue">
              {current.rows.map((report) => (
                <li className="moderation-card" key={report.id}>
                  <div className="moderation-card__content">
                    <h3>{reportReasonLabel(report.reason)}</h3>
                    <p>{report.reporter?.display_name || 'Marketplace member'} reported {report.counterpart?.display_name || 'another participant'}</p>
                    <p>{reportStatusLabel(report.status)} · {formatTime(report.created_at)}</p>
                    <button className="btn" type="button" onClick={() => setSelected(report)}>Review report</button>
                  </div>
                </li>
              ))}
            </ul>
            {current.total > pageSize && (
              <nav className="dialog-actions" aria-label="Conversation report pages">
                <button className="btn" type="button" disabled={!page} onClick={() => setPage(page - 1)}>Previous</button>
                <button className="btn" type="button" disabled={(page + 1) * pageSize >= current.total} onClick={() => setPage(page + 1)}>Next</button>
              </nav>
            )}
          </>
        )}
        {selected && (
          <ReviewReport key={selected.id} report={selected}
            onClose={() => { setSelected(null); refresh() }}
            onResult={(message) => {
              setSelected(null)
              setNotice(message)
              refresh()
              requestAnimationFrame(() => heading.current?.focus())
            }}
          />
        )}
      </div>
    </section>
  )
}
