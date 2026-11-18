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
import Icon from '../components/Icon.jsx'
import '../styles/verification-admin.css'

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
      <div className="admin-verification-review">
        <div className="verification-applicant-summary">
          <span className="verification-applicant-icon">
            <Icon
              name={request.kind === 'business' ? 'building' : 'user'}
              size={24}
            />
          </span>
          <div>
            <p className="eyebrow">Applicant</p>
            <h3>{applicant?.display_name ?? 'Applicant'}</h3>
            {applicant?.business_name && <p>{applicant.business_name}</p>}
            <VerifiedBadge profile={applicant} />
          </div>
        </div>
        <dl className="verification-review-facts">
          <div>
            <dt>Verification</dt>
            <dd>{request.kind === 'business' ? 'Business' : 'Identity'}</dd>
          </div>
          <div>
            <dt>Document</dt>
            <dd>{DOCUMENT_LABELS[request.document_type]}</dd>
          </div>
          <div>
            <dt>Submitted</dt>
            <dd>{formatDate(request.created_at)}</dd>
          </div>
        </dl>
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
            <p className="verification-review-decision">
              Decision:{' '}
              <span
                className={`verification-queue-status verification-queue-status--${request.status}`}
              >
                {request.status}
              </span>
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
                aria-invalid={Boolean(error && !needsRefresh)}
                aria-describedby={
                  error ? 'verification-review-error' : undefined
                }
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
              <p
                id="verification-review-error"
                className="form-error"
                role="alert"
              >
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
                  <strong>{applicant?.display_name ?? 'this applicant'}</strong>
                  ?{' '}
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
      </div>
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
    <section className="container page verification-page admin-verification-page">
      <AdminNavigation />
      <header className="page-heading admin-verification-heading">
        <div>
          <p className="eyebrow">Administration · Account trust</p>
          <h1 ref={heading} tabIndex={-1}>
            Verification requests
          </h1>
          <p className="page-heading__lead">
            Review identity and business documents, compare account details, and
            give applicants a clear decision.
          </p>
        </div>
        <span className="verification-private-label">
          <Icon name="shield" size={18} />
          Private document review
        </span>
      </header>
      <div className="admin-verification-toolbar">
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
        <p className="verification-queue-guidance">
          Open a request to view its document and review history. A verified
          account badge does not verify individual listings.
        </p>
      </div>
      <div className="admin-verification-queue" aria-busy={requests.loading}>
        {notice && (
          <p className="form-success" role="status">
            {notice}
          </p>
        )}
        {requests.error && (
          <LoadError onRetry={requests.refresh}>{requests.error}</LoadError>
        )}
        {(requests.loading || requests.outOfRange) && (
          <div className="verification-queue-loading" role="status">
            <span className="verification-loading-mark" aria-hidden="true">
              <Icon name="shield" size={24} />
            </span>
            <p>Loading verification requests…</p>
          </div>
        )}
        {!requests.loading &&
          !requests.outOfRange &&
          !requests.error &&
          !requests.rows.length && (
            <EmptyState
              icon={<Icon name="shield" size={32} />}
              title={`No ${status} requests`}
            >
              Requests with this status will appear here. Choose another status
              or refresh to check for updates.
            </EmptyState>
          )}
        {!requests.loading && !requests.error && requests.rows.length > 0 && (
          <>
            <p className="field__hint verification-queue-range">
              Showing {(page - 1) * 10 + 1}–
              {Math.min(page * 10, requests.total)} of {requests.total} requests
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
                        <div className="verification-applicant-cell">
                          <span
                            className="verification-applicant-avatar"
                            aria-hidden="true"
                          >
                            {(r.applicant?.display_name || 'A')
                              .trim()
                              .charAt(0)
                              .toUpperCase()}
                          </span>
                          <div>
                            <strong>
                              {r.applicant?.display_name ?? 'Applicant'}
                            </strong>
                            {r.applicant?.business_name && (
                              <span className="field__hint verification-block">
                                {r.applicant.business_name}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        {r.kind === 'business' ? 'Business' : 'Identity'}
                        <span className="field__hint verification-block">
                          {DOCUMENT_LABELS[r.document_type]}
                        </span>
                      </td>
                      <td>{formatDate(r.created_at)}</td>
                      <td>
                        <span
                          className={`verification-queue-status verification-queue-status--${r.status}`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td>{rowAction(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="verification-mobile-cards">
              {requests.rows.map((r) => (
                <li
                  key={r.id}
                  className="verification-card verification-queue-mobile-card"
                >
                  <div className="verification-queue-card-heading">
                    <span
                      className={`verification-queue-status verification-queue-status--${r.status}`}
                    >
                      {r.status}
                    </span>
                    <span className="field__hint">
                      {formatDate(r.created_at)}
                    </span>
                  </div>
                  <h2>{r.applicant?.display_name ?? 'Applicant'}</h2>
                  {r.applicant?.business_name && (
                    <p>{r.applicant.business_name}</p>
                  )}
                  <p>
                    {r.kind === 'business' ? 'Business' : 'Identity'} ·{' '}
                    {DOCUMENT_LABELS[r.document_type]}
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
      </div>
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
