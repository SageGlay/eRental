import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useVerificationSubmissions } from '../hooks/useVerificationSubmissions.js'
import {
  DOCUMENT_TYPES,
  DOCUMENT_LABELS,
  DOCUMENT_MIME_TYPES,
  isVerified,
  submissionError,
  submitVerification,
  validateDocumentContents,
  verificationKind,
} from '../lib/verification.js'
import { formatDate } from '../lib/format.js'
import LoadError from '../components/LoadError.jsx'
import VerifiedBadge from '../components/VerifiedBadge.jsx'
import PageHeading from '../components/PageHeading.jsx'
import Icon from '../components/Icon.jsx'
import '../styles/verification-user.css'

function SubmissionForm({ user, profile, blocked, onDone, onConflict }) {
  const kind = verificationKind(profile)
  const [documentType, setDocumentType] = useState(DOCUMENT_TYPES[kind][0][0])
  const [file, setFile] = useState(null)
  const [details, setDetails] = useState('')
  const [error, setError] = useState(null)
  const [invalidField, setInvalidField] = useState(null)
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(null)
  const activeAttempt = useRef(null)
  const submitting = useRef(false)
  const formRef = useRef(null)
  useEffect(() => {
    if (error && !busy && invalidField)
      formRef.current?.elements.namedItem(invalidField)?.focus()
  }, [error, busy, invalidField])

  async function submit(e) {
    e.preventDefault()
    if (submitting.current || blocked) return
    submitting.current = true
    setBusy(true)
    setError(null)
    setInvalidField(null)
    try {
      if (!activeAttempt.current) {
        const invalid = await validateDocumentContents(file)
        if (invalid) {
          setError(invalid)
          setInvalidField('document')
          return
        }
        if (details.trim().length > 500) {
          setError('Details must be 500 characters or fewer.')
          setInvalidField('details')
          return
        }
        if (!DOCUMENT_TYPES[kind].some(([value]) => value === documentType))
          throw new Error('Invalid document type')
        activeAttempt.current = {
          userId: user.id,
          kind,
          documentType,
          details: details.trim(),
          file,
          path: `${user.id}/${crypto.randomUUID()}.${DOCUMENT_MIME_TYPES[file.type]}`,
        }
        setAttempt(activeAttempt.current)
      }
      const result = await submitVerification(activeAttempt.current)
      onDone(result)
    } catch (err) {
      setError(submissionError(err))
      if (
        err?.code === '23505' ||
        err?.message?.includes('pending') ||
        err?.message?.includes('already verified')
      )
        onConflict()
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <form
      ref={formRef}
      className="verification-card verification-user__form"
      onSubmit={submit}
      noValidate
      aria-busy={busy}
    >
      <div className="verification-user__section-label">
        <Icon name="upload" size={22} />
        <span>Private document review</span>
      </div>
      <h2>Submit a document</h2>
      <p className="verification-user__intro">
        {kind === 'business'
          ? 'Business verification checks your rental business documents.'
          : 'Identity verification checks a document that identifies you.'}{' '}
        An administrator reviews each request.
      </p>
      <fieldset
        className="form-controls"
        disabled={busy || blocked || Boolean(attempt)}
      >
        <legend className="sr-only">Verification document and details</legend>
        <div className="field">
          <label htmlFor="document-type">Document type</label>
          <select
            id="document-type"
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
          >
            {DOCUMENT_TYPES[kind].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field verification-user__upload">
          <label htmlFor="verification-document">Document</label>
          <div className="verification-user__upload-heading" aria-hidden="true">
            <Icon name="image" size={28} />
            <span>Choose a clear, readable document</span>
          </div>
          <input
            id="verification-document"
            name="document"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            aria-describedby={
              invalidField === 'document'
                ? 'document-help verification-form-error'
                : 'document-help'
            }
            aria-invalid={invalidField === 'document'}
            onChange={(e) => {
              setFile(e.target.files[0] ?? null)
              setError(null)
            }}
          />
          <span id="document-help" className="field__hint">
            JPEG, PNG, WebP or PDF, up to 5 MB. Private to you and authorized
            administrators. Use only a non-sensitive sample for testing.
          </span>
          {file && (
            <span className="verification-user__filename">
              Selected: {file.name}
            </span>
          )}
        </div>
        <div className="field">
          <label htmlFor="verification-details">Details (optional)</label>
          <textarea
            className="resize-none"
            id="verification-details"
            name="details"
            aria-invalid={invalidField === 'details'}
            aria-describedby={
              invalidField === 'details' ? 'verification-form-error' : undefined
            }
            maxLength={500}
            rows={4}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
          />
          <span
            className="field__hint verification-user__count"
            aria-hidden="true"
          >
            {details.length} / 500
          </span>
        </div>
      </fieldset>
      {attempt && (
        <p className="field__hint">
          This document is kept for the current attempt. Retry to finish sending
          the same request.
        </p>
      )}
      {error && (
        <p id="verification-form-error" className="form-error" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        className="btn btn-primary btn-block"
        disabled={busy || blocked}
      >
        {busy
          ? 'Sending request…'
          : attempt
            ? 'Retry submission'
            : 'Submit verification request'}
      </button>
      <p className="field__hint verification-user__submission-hint">
        Submission does not immediately verify your account. You can have one
        pending request at a time. Keep this page open if a retry is needed.
      </p>
    </form>
  )
}

export default function VerificationPage() {
  const { user, profile, profileLoading, profileError, refreshProfile } =
    useAuth()
  const requests = useVerificationSubmissions({ userId: user.id })
  const [notice, setNotice] = useState('')
  const [sent, setSent] = useState(null)
  const verified = isVerified(profile) && !profileLoading && !profileError
  const pending = requests.rows.find((r) => r.status === 'pending')
  const latest = requests.rows[0]
  const checking = requests.loading || profileLoading
  const status =
    checking || requests.error || profileError
      ? 'Status unavailable'
      : verified
        ? 'Approved'
        : pending
          ? 'Pending'
          : latest?.status === 'rejected'
            ? 'Rejected'
            : 'Not verified'
  const refresh = () => {
    requests.refresh()
    refreshProfile()
  }
  useEffect(() => {
    const onFocus = () => {
      requests.refresh()
      refreshProfile()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [user.id])
  useEffect(() => {
    document.title = 'Account verification · eRental'
  }, [])
  useEffect(() => {
    if (
      sent &&
      !requests.loading &&
      !requests.error &&
      requests.rows.some((r) => r.id === sent.id)
    )
      setSent(null)
  }, [sent, requests.loading, requests.error, requests.rows])
  return (
    <section className="container page verification-page verification-user">
      <p className="breadcrumb">
        <Link to="/profile">My profile</Link> › Account verification
      </p>
      <PageHeading
        eyebrow="Trust & identity"
        title="Account verification"
        actions={
          <button
            type="button"
            className="btn btn-ghost"
            disabled={checking}
            onClick={refresh}
          >
            Refresh status
          </button>
        }
      >
        <p>
          A private document review for your individual or rental business
          account.
        </p>
      </PageHeading>
      {notice && (
        <p className="form-success" role="status">
          {notice}
        </p>
      )}
      <div className="verification-layout">
        <section
          className={`verification-card verification-user__status-card verification-user__status-card--${verified ? 'approved' : pending ? 'pending' : 'neutral'}`}
          aria-label="Current verification status"
          aria-busy={checking}
        >
          <div className="verification-user__status-icon" aria-hidden="true">
            <Icon
              name={verified ? 'shield' : pending ? 'clock' : 'user'}
              size={30}
            />
          </div>
          <p className="verification-user__account-kind">
            {profile
              ? profile.account_type === 'business'
                ? 'Business account'
                : 'Individual account'
              : 'Account document review'}
          </p>
          <h2>Your status</h2>
          <p className="verification-status" aria-live="polite">
            {checking ? 'Checking status…' : status}
          </p>
          {verified && (
            <>
              <VerifiedBadge profile={profile} />
              <p>
                Verified {formatDate(profile.verified_at)}. Changing your
                display name, business name or account type requires a new
                review.
              </p>
            </>
          )}
          {!checking &&
            !requests.error &&
            !profileError &&
            !verified &&
            pending && (
              <p>
                Your document is awaiting administrator review. You do not need
                to submit it again.
              </p>
            )}
          {!checking &&
            !requests.error &&
            !profileError &&
            !verified &&
            !pending &&
            latest?.status === 'rejected' && (
              <p>
                Your request was not approved.
                {latest.admin_note ? ` Reason: ${latest.admin_note}` : ''} You
                may submit another permitted document.
              </p>
            )}
          {!checking &&
            !requests.error &&
            !profileError &&
            !verified &&
            !pending &&
            latest?.status === 'approved' && (
              <p>
                A previous request was approved, but your account is not
                currently verified. You can submit a new request for review.
              </p>
            )}
          {!checking &&
            !requests.error &&
            !profileError &&
            !latest &&
            !verified && (
              <p>
                Choose a document that matches your account type. Review
                decisions will appear here.
              </p>
            )}
          {profileError && (
            <LoadError onRetry={refreshProfile}>{profileError}</LoadError>
          )}
          {requests.error && (
            <LoadError onRetry={requests.refresh}>{requests.error}</LoadError>
          )}
          <Link to="/profile" className="verification-user__profile-link">
            Update profile details <Icon name="arrowRight" size={16} />
          </Link>
          <div className="verification-user__meaning">
            <h3>What verification means</h3>
            <p>
              A badge reflects a completed account document review. It does not
              guarantee a listing or the condition of an item.
            </p>
            <div className="verification-user__privacy-note">
              <Icon name="shield" size={18} />
              <span>
                Your documents are visible only to you and authorized
                administrators.
              </span>
            </div>
          </div>
        </section>
        {profile && !isVerified(profile) && !pending && !sent && (
          <SubmissionForm
            key={profile.account_type}
            user={user}
            profile={profile}
            blocked={
              checking ||
              Boolean(requests.error || profileError) ||
              (profile.account_type === 'business' && !profile.business_name)
            }
            onConflict={refresh}
            onDone={(result) => {
              setSent(result)
              setNotice(
                'Request received. An administrator will review your private document.',
              )
              refresh()
            }}
          />
        )}
        {sent && !pending && !verified && (
          <p className="notice">
            Your request was received. Refresh status to see the latest review
            result.
          </p>
        )}
      </div>
      {profile?.account_type === 'business' && !profile.business_name && (
        <p className="form-error" role="alert">
          Add your business name in My profile before submitting.
        </p>
      )}
      <section className="verification-history verification-user__history-section">
        <div className="verification-user__history-heading">
          <div>
            <p className="eyebrow">Your review history</p>
            <h2>Recent requests</h2>
          </div>
          <Icon name="clock" size={24} />
        </div>
        <p className="field__hint">
          Your ten most recent submissions. Documents and review notes are not
          public.
        </p>
        {!requests.loading && !requests.error && !requests.rows.length && (
          <div className="verification-user__empty">
            <Icon name="shield" size={24} />
            <div>
              <h3>No requests yet.</h3>
              <p>
                Your requests and review decisions will appear here after you
                submit a document.
              </p>
            </div>
          </div>
        )}
        <ul className="verification-user__history">
          {requests.rows.map((r) => (
            <li
              key={r.id}
              className="verification-card verification-user__request"
            >
              <div
                className={`verification-user__request-icon verification-user__request-icon--${r.status}`}
                aria-hidden="true"
              >
                <Icon
                  name={
                    r.status === 'approved'
                      ? 'shield'
                      : r.status === 'pending'
                        ? 'clock'
                        : 'image'
                  }
                  size={22}
                />
              </div>
              <div className="verification-user__request-body">
                <strong>
                  {r.kind === 'business' ? 'Business' : 'Identity'} ·{' '}
                  {r.status[0].toUpperCase() + r.status.slice(1)}
                </strong>
                <p>
                  {DOCUMENT_LABELS[r.document_type]} · Submitted{' '}
                  {formatDate(r.created_at)}
                </p>
                {r.admin_note && (
                  <p className="prewrap">Review note: {r.admin_note}</p>
                )}
                {r.reviewed_at && (
                  <p className="field__hint">
                    Reviewed {formatDate(r.reviewed_at)}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </section>
  )
}
