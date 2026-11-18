import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import { formatRange, friendlyBookingError, today } from '../lib/bookings.js'
import { useListingAvailability } from '../hooks/useListingAvailability.js'

export default function RequestForm({ listing }) {
  const { user } = useAuth()
  const availability = useListingAvailability(listing.id, Boolean(user && user.id !== listing.owner_id && listing.status === 'available'))
  const [form, setForm] = useState({ start: '', end: '', message: '' })
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)

  if (!user) return <p className="notice"><Link to="/login">Log in</Link> to request this rental.</p>
  if (user.id === listing.owner_id) return <p className="notice">This is your listing. Requests will appear under Bookings.</p>
  if (listing.status !== 'available') return <p className="notice">This listing is currently unavailable, so it can’t be requested.</p>
  if (sent) return <p className="form-success" role="status">Request sent! The owner will review it. Track it under <Link to="/bookings">Bookings</Link>.</p>

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting.current || availability.loading || availability.error) return
    setError('')
    if (!form.start || !form.end) return setError('Please choose a start and end date.')
    if (form.start < today()) return setError('The start date can’t be in the past.')
    if (form.end < form.start) return setError('The end date can’t be before the start date.')
    if (form.message.trim().length > 1000) return setError('Messages can be up to 1,000 characters.')
    submitting.current = true
    setBusy(true)
    try {
      // Recheck at submission time; the displayed ranges may be out of date.
      // Database constraints remain the final authority for concurrent requests.
      const booked = await availability.refresh()
      if (!booked) return
      if (booked.some((b) => form.start <= b.end_date && form.end >= b.start_date)) return setError('Those dates overlap with an existing booking.')
      const { error: insertError } = await supabase.from('bookings').insert({
        listing_id: listing.id, renter_id: user.id, start_date: form.start, end_date: form.end, message: form.message.trim() || null,
      })
      if (insertError) return setError(friendlyBookingError(insertError))
      setSent(true)
    } catch {
      setError('We couldn’t confirm your request was sent. Check Bookings before trying again.')
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <form className="request-form" onSubmit={handleSubmit} noValidate aria-busy={busy || availability.loading}>
      <h2>Request to rent</h2>
      {availability.loading && <p role="status">Checking booked dates…</p>}
      {availability.error && (
        <div>
          <p className="form-error" role="alert">{availability.error}</p>
          <button type="button" className="btn btn-ghost" onClick={availability.refresh}>Try again</button>
        </div>
      )}
      {availability.ranges.length > 0 && (
        <>
          <p className="detail__meta">Already booked:</p>
          <ul className="booked-list">{availability.ranges.map((b) => <li key={b.start_date + b.end_date}>{formatRange(b.start_date, b.end_date)}</li>)}</ul>
        </>
      )}
      <fieldset className="form-controls" disabled={busy}>
        <legend className="sr-only">Rental dates and message</legend>
        <div className="field-row field-row--even">
          <div className="field">
            <label htmlFor="start">From</label>
            <input id="start" type="date" min={today()} value={form.start} onChange={set('start')} />
          </div>
          <div className="field">
            <label htmlFor="end">Until (inclusive)</label>
            <input id="end" type="date" min={form.start || today()} value={form.end} onChange={set('end')} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="message">Message to the owner (optional)</label>
          <textarea className="resize-none" id="message" maxLength={1000} value={form.message} onChange={set('message')} />
        </div>
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary btn-block" disabled={busy || availability.loading || Boolean(availability.error)}>{busy ? 'Sending…' : 'Send request'}</button>
      <p className="detail__meta">Sending a request doesn’t reserve the item until the owner accepts. Rentals are booked by whole days. No payment is taken.</p>
    </form>
  )
}
