import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'

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
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  if (user?.id === listing.owner_id) return null
  if (!user) return <p className="detail__meta"><Link to="/login">Log in</Link> to report this listing.</p>
  if (sent) return <p className="form-success report-box" role="status">Thanks. An administrator will review your report.</p>
  if (!open) return <button type="button" className="btn btn-ghost btn-small report-box" onClick={() => setOpen(true)}>Report this listing</button>

  async function handleSubmit(e) {
    e.preventDefault()
    const text = details.trim()
    if (!reason) return setError('Please choose a reason.')
    if (reason === 'other' && !text) return setError('Please describe the problem.')
    if (text.length > 1000) return setError('Details can be up to 1,000 characters.')
    setBusy(true)
    setError('')
    const { error: insertError } = await supabase.from('listing_reports').insert({ listing_id: listing.id, reporter_id: user.id, reason, details: text || null })
    setBusy(false)
    if (insertError) return setError(insertError.code === '23505' ? 'You already reported this listing. An administrator will review it.' : insertError.message)
    setSent(true)
  }

  return (
    <form className="review-form report-box" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor="report-reason">Why are you reporting this listing?</label>
        <select id="report-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">Choose a reason</option>
          {REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <label htmlFor="report-details" className="sr-only">Details</label>
      <textarea id="report-details" maxLength={1000} placeholder="Details (required for “Something else”)" value={details} onChange={(e) => setDetails(e.target.value)} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="booking__actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send report'}</button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  )
}
