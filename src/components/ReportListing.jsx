import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import Dialog from './Dialog.jsx'
import Icon from './Icon.jsx'

export const REASONS = [
  ['misleading', 'Misleading or inaccurate'],
  ['scam', 'Suspected scam or fraud'],
  ['inappropriate', 'Inappropriate content'],
  ['prohibited', 'Prohibited item or service'],
  ['other', 'Something else'],
]

export default function ReportListing({ listing }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)
  const form = useRef(null)
  const result = useRef(null)

  useEffect(() => {
    if (notice) result.current?.focus()
    if (error?.field) form.current?.elements.namedItem(error.field)?.focus()
  }, [notice, error])

  if (user?.id === listing.owner_id) return null
  if (!user)
    return (
      <p className="detail__meta">
        <Link to="/login">Log in</Link> to report this listing.
      </p>
    )

  async function handleSubmit(e) {
    e.preventDefault()
    if (sending.current) return
    const text = details.trim()
    if (!reason)
      return setError({ field: 'reason', message: 'Please choose a reason.' })
    if (reason === 'other' && !text)
      return setError({
        field: 'details',
        message: 'Please describe the problem.',
      })
    if (text.length > 1000)
      return setError({
        field: 'details',
        message: 'Details can be up to 1,000 characters.',
      })
    sending.current = true
    setBusy(true)
    setError(null)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      const { error: insertError } = await supabase
        .from('listing_reports')
        .insert({
          listing_id: listing.id,
          reporter_id: user.id,
          reason,
          details: text || null,
        })
        .abortSignal(controller.signal)
      if (insertError && insertError.code !== '23505') throw insertError
      setOpen(false)
      setNotice(
        insertError
          ? 'You already reported this listing. An administrator will review it.'
          : 'Report sent. An administrator will review your report.',
      )
    } catch {
      setError({
        message:
          'We couldn’t confirm your report. Check your connection and try again.',
      })
    } finally {
      clearTimeout(timeout)
      sending.current = false
      setBusy(false)
    }
  }

  function close() {
    setOpen(false)
    setError(null)
  }

  if (notice)
    return (
      <p
        ref={result}
        tabIndex={-1}
        className="form-success report-box"
        role="status"
      >
        {notice}
      </p>
    )
  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-small report-box"
        onClick={() => setOpen(true)}
      >
        <Icon name="shield" size={16} />
        Report this listing
      </button>
      {open && (
        <Dialog title="Report this listing" busy={busy} onClose={close}>
          <div className="report-subject">
            <Icon name="box" />
            <strong>{listing.title}</strong>
          </div>
          <form ref={form} onSubmit={handleSubmit} noValidate aria-busy={busy}>
            <div className="field">
              <label htmlFor="report-reason">
                Why are you reporting this listing?
              </label>
              <select
                id="report-reason"
                name="reason"
                required
                disabled={busy}
                value={reason}
                aria-invalid={error?.field === 'reason' || undefined}
                aria-describedby={
                  error?.field === 'reason' ? 'report-error' : undefined
                }
                onChange={(e) => {
                  setReason(e.target.value)
                  setError(null)
                }}
              >
                <option value="">Choose a reason</option>
                {REASONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="report-details">Details</label>
              <p className="field__hint" id="report-details-help">
                {reason === 'other'
                  ? 'Describe the issue so an administrator can review it.'
                  : 'Optional. Include anything that will help an administrator review the listing.'}
              </p>
              <textarea
                className="resize-none"
                id="report-details"
                name="details"
                required={reason === 'other'}
                rows={4}
                maxLength={1000}
                disabled={busy}
                aria-invalid={error?.field === 'details' || undefined}
                aria-describedby={
                  error?.field === 'details'
                    ? 'report-details-help report-error'
                    : 'report-details-help'
                }
                value={details}
                onChange={(e) => {
                  setDetails(e.target.value)
                  setError(null)
                }}
              />
            </div>
            {error && (
              <p id="report-error" className="form-error" role="alert">
                {error.message}
              </p>
            )}
            <div className="verification-actions">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Sending…' : 'Send report'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={close}
              >
                Cancel
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  )
}
