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
      className="verification-user__form"
      onSubmit={submit}
      noValidate
      aria-busy={busy}
    >
      <h2>Submit a document</h2>
      <p className="verification-user__intro">
        {kind === 'business'
          ? 'Choose a document showing the business name on your profile.'
          : 'Choose a document that identifies you by the name on your profile.'}
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
            Upload a readable JPEG, PNG, WebP or PDF up to 5 MB.
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
        An administrator reviews one request per account at a time. If sending
        fails, keep this page open to retry.
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
      <nav className="verification-return" aria-label="Account">
        <Link to="/profile">
          <Icon name="arrowLeft" size={16} />
          My profile
        </Link>
      </nav>
      <PageHeading
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
          Verify your identity or business to display a badge on your profile
          and rental listings.
        </p>
      </PageHeading>
      {notice && (
        <p className="form-success" role="status">
          {notice}
        </p>
      )}
      <section
        className="verification-user__status-card"
        aria-label="Current verification status"
        aria-busy={checking}
      >
        <div className="verification-user__status-heading">
          <Icon name="shield" size={24} />
          <h2>Verification status</h2>
        </div>
        <div className="verification-user__status-detail">
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
        </div>
        {profile && (
          <dl className="verification-user__account">
            <div>
              <dt>
                {profile.account_type === 'business'
                  ? 'Business account'
                  : 'Individual account'}
              </dt>
              <dd>
                {profile.business_name && profile.account_type === 'business'
                  ? profile.business_name
                  : profile.display_name}
              </dd>
            </div>
            <div>
              <dt>Review type</dt>
              <dd>
                {profile.account_type === 'business'
                  ? 'Business document'
                  : 'Identity document'}
              </dd>
            </div>
          </dl>
        )}
      </section>
      <div className="verification-workbench">
        <div className="verification-workbench__main">
          {profile && !isVerified(profile) && !pending && !sent && (
            <SubmissionForm
              key={profile.account_type}
              user={user}
              profile={profile}
              blocked={
                checking ||
                Boolean(requests.error || profileError) ||
                (profile.account_type === 'business' &&
                  !profile.business_name?.trim())
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
          {profile?.account_type === 'business' &&
            !profile.business_name?.trim() && (
              <p className="form-error" role="alert">
                Add your business name in My profile before submitting.
              </p>
            )}
          <section className="verification-user__history-section">
            <h2>Recent requests</h2>
            <p className="field__hint">
              Your ten most recent submissions, newest first.
            </p>
            {!requests.loading && !requests.error && !requests.rows.length && (
              <div className="verification-user__empty">
                <Icon name="clock" size={20} />
                <div>
                  <h3>No requests yet.</h3>
                  <p>
                    Your requests and review decisions will appear here after
                    you submit a document.
                  </p>
                </div>
              </div>
            )}
            <ul className="verification-user__history">
              {requests.rows.map((r) => (
                <li key={r.id} className="verification-user__request">
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
        </div>
        <aside
          className="verification-user__guide"
          aria-labelledby="document-privacy"
        >
          <Icon name="shield" size={24} />
          <h2 id="document-privacy">Document privacy</h2>
          <p>
            Only you and authorized administrators can access your document.
            Other members see your badge after approval.
          </p>
          <h3>What the badge covers</h3>
          <p>
            It confirms a review of your identity or business. Renters still
            need to check the listing, item condition and handover terms.
          </p>
          <Link className="verification-user__profile-link" to="/profile">
            Update profile details <Icon name="arrowRight" size={16} />
          </Link>
        </aside>
      </div>
    </section>
  )
}
