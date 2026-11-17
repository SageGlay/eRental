import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabaseClient.js'
import { useVerificationSubmissions } from '../hooks/useVerificationSubmissions.js'
import {
  DOCUMENT_LABELS,
  isSafeVerificationPath,
  verificationKind,
} from '../lib/verification.js'
import { formatDate } from '../lib/format.js'
import AdminNavigation from '../components/AdminNavigation.jsx'
import Dialog from '../components/Dialog.jsx'
import LoadError from '../components/LoadError.jsx'
import EmptyState from '../components/EmptyState.jsx'
import VerificationDocument from '../components/VerificationDocument.jsx'
import VerifiedBadge from '../components/VerifiedBadge.jsx'

function ReviewDialog({ request, onClose, onDone, onRefresh }) {
  const { isAdmin, refreshProfile } = useAuth()
  const [note, setNote] = useState('')
  const [action, setAction] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const running = useRef(false)
  const noteInput = useRef(null)
  const confirmCancel = useRef(null)
  const approveButton = useRef(null)
  const rejectButton = useRef(null)
  const lastAction = useRef(null)
  const refreshButton = useRef(null)
  const applicant = request.applicant
  const matchesAccount = Boolean(
    applicant &&
      verificationKind(applicant) === request.kind &&
      (request.kind !== 'business' || applicant.business_name),
  )
  const canApprove = matchesAccount && isSafeVerificationPath(request)
  useEffect(() => {
    if (busy) return
    if (needsRefresh) refreshButton.current?.focus()
    else if (action) confirmCancel.current?.focus()
    else if (lastAction.current)
      (lastAction.current === 'approve'
        ? approveButton
        : rejectButton
      ).current?.focus()
  }, [action, busy, needsRefresh])
  function choose(value) {
    setError(null)
    if (value === 'reject' && !note.trim()) {
      setError('Give a reason for rejecting this request.')
      noteInput.current.focus()
      return
    }
    if (note.trim().length > 500) {
      setError('Review notes must be 500 characters or fewer.')
      noteInput.current.focus()
      return
    }
    if (value === 'approve' && !canApprove) return
    lastAction.current = value
    setAction(value)
  }
  async function review() {
    if (
      running.current ||
      needsRefresh ||
      isAdmin !== true ||
      !['approve', 'reject'].includes(action) ||
      (action === 'approve' && !canApprove)
    )
      return
    running.current = true
    setBusy(true)
    setError(null)
    const controller = new AbortController()
    const deadline = setTimeout(() => controller.abort(), 15000)
    try {
      const { error } = await supabase
        .rpc('review_verification', {
          p_submission_id: request.id,
          p_action: action,
          p_note: note.trim() || null,
        })
        .abortSignal(controller.signal)
      if (error) throw error
      refreshProfile()
      onDone(
        action === 'approve'
          ? 'Verification approved.'
          : 'Verification rejected.',
      )
    } catch {
      setError(
        'We couldn’t confirm this review. The request may have changed. Refresh the queue before trying again.',
      )
      setNeedsRefresh(true)
      setAction(null)
    } finally {
      clearTimeout(deadline)
      running.current = false
      setBusy(false)
    }
  }
  return (
    <Dialog title="Review verification" onClose={onClose} busy={busy}>
      <h3>{applicant?.display_name ?? 'Applicant'}</h3>
      {applicant?.business_name && <p>{applicant.business_name}</p>}
      <VerifiedBadge profile={applicant} />
      <p>
        {request.kind === 'business' ? 'Business' : 'Identity'} ·{' '}
        {DOCUMENT_LABELS[request.document_type]} · Submitted{' '}
        {formatDate(request.created_at)}
      </p>
      <p className="field__hint">
        Profile details are current. Compare the document with the applicant
        before making a decision.
      </p>
      {request.details && (
        <p className="prewrap">Applicant details: {request.details}</p>
      )}
      <VerificationDocument submission={request} />
      {request.status !== 'pending' ? (
        <>
          <p>
            Decision: <strong>{request.status}</strong>
          </p>
          {request.admin_note && (
            <p className="prewrap">Review note: {request.admin_note}</p>
          )}
          {request.reviewed_at && (
            <p>Reviewed {formatDate(request.reviewed_at)}</p>
          )}
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor="review-note">
              Review note (required for rejection)
            </label>
            <textarea
              className="resize-none"
              ref={noteInput}
              id="review-note"
              maxLength={500}
              rows={4}
              disabled={busy || Boolean(action)}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          {!matchesAccount && (
            <p className="notice">
              The current account details do not match this request. Reject it
              with an explanation so the applicant can submit matching
              documents.
            </p>
          )}
          {!isSafeVerificationPath(request) && (
            <p className="notice">
              This document path is invalid. Reject the request with an
              explanation so the applicant can resubmit.
            </p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {needsRefresh && (
            <button
              ref={refreshButton}
              type="button"
              className="btn btn-ghost"
              onClick={onRefresh}
            >
              Refresh queue
            </button>
          )}
          {action ? (
            <div className="review-confirmation">
              <p>
                {action === 'approve' ? 'Approve' : 'Reject'} {request.kind}{' '}
                verification for{' '}
                <strong>{applicant?.display_name ?? 'this applicant'}</strong>?{' '}
                {action === 'approve'
                  ? 'This grants the corresponding verified badge.'
                  : 'The applicant will see your review note.'}
              </p>
              <div className="verification-actions">
                <button
                  ref={confirmCancel}
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => setAction(null)}
                >
                  Go back
                </button>
                <button
                  type="button"
                  className={`btn ${action === 'reject' ? 'btn-danger' : 'btn-primary'}`}
                  disabled={busy}
                  onClick={review}
                >
                  {busy
                    ? 'Saving review…'
                    : action === 'approve'
                      ? 'Confirm approval'
                      : 'Confirm rejection'}
                </button>
              </div>
            </div>
          ) : (
            <div className="verification-actions">
              <button
                ref={approveButton}
                type="button"
                className="btn btn-primary"
                disabled={!canApprove || needsRefresh}
                onClick={() => choose('approve')}
              >
                Approve
              </button>
              <button
                ref={rejectButton}
                type="button"
                className="btn btn-ghost"
                disabled={needsRefresh}
                onClick={() => choose('reject')}
              >
                Reject
              </button>
            </div>
          )}
        </>
      )}
    </Dialog>
  )
}

export default function AdminVerificationPage() {
  const [params, setParams] = useSearchParams()
  const { user } = useAuth()
  const status = ['pending', 'approved', 'rejected'].includes(
    params.get('status'),
  )
    ? params.get('status')
    : 'pending'
  const page = Math.max(
    1,
    Math.min(1000000, Number.parseInt(params.get('page'), 10) || 1),
  )
  const ascending = params.get('sort') === 'oldest'
  const requests = useVerificationSubmissions({
    userId: user.id,
    status,
    page,
    ascending,
    admin: true,
  })
  const [selected, setSelected] = useState(null)
  const [notice, setNotice] = useState('')
  const heading = useRef(null)
  const pages = Math.max(1, Math.ceil(requests.total / 10))
  function update(changes) {
    setParams({
      status,
      sort: ascending ? 'oldest' : 'newest',
      page: '1',
      ...changes,
    })
    setSelected(null)
  }
  useEffect(() => {
    document.title = 'Verification requests · eRental'
  }, [])
  useEffect(() => {
    setSelected(null)
  }, [params.toString()])
  useEffect(() => {
    if (!selected && notice) {
      const frame = requestAnimationFrame(() => heading.current?.focus())
      return () => cancelAnimationFrame(frame)
    }
  }, [selected, notice])
  useEffect(() => {
    if (requests.outOfRange) update({ page: '1' })
    else if (!requests.loading && !requests.error && page > pages)
      update({ page: String(pages) })
  }, [requests.loading, requests.error, requests.outOfRange, page, pages])
  function rowAction(r) {
    return (
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => {
          setNotice('')
          setSelected(r)
        }}
        aria-label={`Review request from ${r.applicant?.display_name ?? 'applicant'}`}
      >
        Review request
      </button>
    )
  }
  return (
    <section className="container page verification-page">
      <AdminNavigation />
      <h1 ref={heading} tabIndex={-1}>
        Verification requests
      </h1>
      <p className="detail__meta">
        Review private identity and business documents. Decisions are enforced
        by the existing administrator review function.
      </p>
      <div className="verification-filters">
        <div className="field">
          <label htmlFor="verification-status-filter">Status</label>
          <select
            id="verification-status-filter"
            value={status}
            onChange={(e) => update({ status: e.target.value })}
          >
            {['pending', 'approved', 'rejected'].map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="verification-sort">Sort by</label>
          <select
            id="verification-sort"
            value={ascending ? 'oldest' : 'newest'}
            onChange={(e) => update({ sort: e.target.value })}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={requests.loading}
          onClick={requests.refresh}
        >
          Refresh requests
        </button>
      </div>
      {notice && (
        <p className="form-success" role="status">
          {notice}
        </p>
      )}
      {requests.error && (
        <LoadError onRetry={requests.refresh}>{requests.error}</LoadError>
      )}
      {(requests.loading || requests.outOfRange) && (
        <p role="status">Loading verification requests…</p>
      )}
      {!requests.loading &&
        !requests.outOfRange &&
        !requests.error &&
        !requests.rows.length && (
          <EmptyState title={`No ${status} requests`}>
            Requests with this status will appear here.
          </EmptyState>
        )}
      {!requests.loading && !requests.error && requests.rows.length > 0 && (
        <>
          <p className="field__hint">
            Showing {(page - 1) * 10 + 1}–{Math.min(page * 10, requests.total)}{' '}
            of {requests.total} requests
          </p>
          <div className="verification-table">
            <table>
              <caption className="sr-only">
                {status} verification requests
              </caption>
              <thead>
                <tr>
                  <th scope="col">Applicant</th>
                  <th scope="col">Request</th>
                  <th
                    scope="col"
                    aria-sort={ascending ? 'ascending' : 'descending'}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        update({ sort: ascending ? 'newest' : 'oldest' })
                      }
                    >
                      Submitted {ascending ? '↑' : '↓'}
                    </button>
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {requests.rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.applicant?.display_name ?? 'Applicant'}
                      {r.applicant?.business_name && (
                        <span className="field__hint verification-block">
                          {r.applicant.business_name}
                        </span>
                      )}
                    </td>
                    <td>
                      {r.kind === 'business' ? 'Business' : 'Identity'}
                      <span className="field__hint verification-block">
                        {DOCUMENT_LABELS[r.document_type]}
                      </span>
                    </td>
                    <td>{formatDate(r.created_at)}</td>
                    <td>{r.status}</td>
                    <td>{rowAction(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="verification-mobile-cards">
            {requests.rows.map((r) => (
              <li key={r.id} className="verification-card">
                <h2>{r.applicant?.display_name ?? 'Applicant'}</h2>
                {r.applicant?.business_name && (
                  <p>{r.applicant.business_name}</p>
                )}
                <p>
                  {r.kind === 'business' ? 'Business' : 'Identity'} ·{' '}
                  {DOCUMENT_LABELS[r.document_type]}
                </p>
                <p>
                  {r.status} · {formatDate(r.created_at)}
                </p>
                {rowAction(r)}
              </li>
            ))}
          </ul>
        </>
      )}
      {!requests.error && !requests.loading && requests.total > 0 && (
        <nav
          className="verification-pagination"
          aria-label="Verification request pages"
        >
          <button
            type="button"
            className="btn btn-ghost"
            disabled={page <= 1}
            onClick={() => update({ page: String(page - 1) })}
          >
            Previous
          </button>
          <span aria-current="page">
            Page {page} of {pages}
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={page >= pages}
            onClick={() => update({ page: String(page + 1) })}
          >
            Next
          </button>
        </nav>
      )}
      {selected && (
        <ReviewDialog
          key={selected.id}
          request={selected}
          onClose={() => setSelected(null)}
          onRefresh={() => {
            setSelected(null)
            setNotice(
              'Review closed. Check the latest request before retrying.',
            )
            requests.refresh()
          }}
          onDone={(message) => {
            setSelected(null)
            setNotice(message)
            requests.refresh()
          }}
        />
      )}
    </section>
  )
}
