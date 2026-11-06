import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import { formatPrice, formatRate } from '../lib/format.js'
import { STATUS_LABELS, estimateAmounts, formatRange, setBookingStatus, today } from '../lib/bookings.js'
import { StarRating } from '../components/Stars.jsx'
import ReviewForm from '../components/ReviewForm.jsx'
import { startConversation } from '../lib/messages.js'
import EmptyState from '../components/EmptyState.jsx'

const SELECT = 'id, status, start_date, end_date, message, owner_response, price, price_period, deposit, simulated_payments(kind, amount, status), reviews(rating, comment), listings(id, title), renter:profiles!bookings_renter_id_fkey(display_name)'

function useBookings(column, userId) {
  const [state, setState] = useState({ rows: [], loading: true, error: null })
  const load = useCallback(() => {
    supabase.from('bookings').select(SELECT).eq(column, userId).order('created_at', { ascending: false })
      .then(({ data, error }) => setState({ rows: data ?? [], loading: false, error: error ? error.message : null }))
  }, [column, userId])
  useEffect(() => { load() }, [load])
  return { ...state, reload: load }
}

function BookingCard({ b, role, onChange }) {
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { user } = useAuth()
  const navigate = useNavigate()
  const isOwner = role === 'owner'
  const payments = b.simulated_payments ?? []
  const review = Array.isArray(b.reviews) ? b.reviews[0] : b.reviews
  const paid = payments.filter((p) => p.status === 'simulated_paid')
  const refunded = payments.filter((p) => p.status === 'simulated_refunded')
  const sum = (list) => list.reduce((total, p) => total + Number(p.amount), 0)
  const estimate = estimateAmounts(b)
  const canPay = !isOwner && b.status === 'accepted' && payments.length === 0
  const actions = []
  if (b.status === 'pending') {
    if (isOwner) actions.push(['Accept', 'accepted', false], ['Decline', 'rejected', true])
    else actions.push(['Cancel request', 'cancelled', true])
  }
  if (b.status === 'accepted') {
    if (b.start_date > today()) actions.push(['Cancel booking', 'cancelled', true])
    if (isOwner && b.end_date <= today()) actions.push(['Mark completed', 'completed', false])
  }

  async function messageOwner() {
    setBusy(true)
    setError('')
    const result = await startConversation(b.listings.id, user.id)
    setBusy(false)
    if (result.error) return setError(result.error)
    navigate(`/messages/${result.id}`)
  }

  async function pay() {
    setBusy(true)
    setError('')
    const { error: payError } = await supabase.rpc('simulate_payment', { p_booking_id: b.id })
    setBusy(false)
    if (payError) return setError(payError.message)
    onChange()
  }

  async function act(status) {
    setBusy(true)
    setError('')
    const message = await setBookingStatus(b.id, status)
    setBusy(false)
    setConfirm(null)
    if (message) return setError(message)
    onChange()
  }

  return (
    <li className="booking">
      <div className="booking__main">
        <Link to={`/listings/${b.listings?.id}`}><strong>{b.listings?.title}</strong></Link>
        <span>{formatRange(b.start_date, b.end_date)} · {formatRate(b.price, b.price_period)}</span>
        {isOwner && <span>Requested by {b.renter?.display_name}</span>}
        {b.message && <span className="booking__note">“{b.message}”</span>}
        {b.owner_response && <span className="booking__note">Note: {b.owner_response}</span>}
        <span className={`status status--${b.status}`}>{STATUS_LABELS[b.status]}</span>
        {paid.length > 0 && <span className="status status--completed">{isOwner ? 'Renter paid' : 'Paid'} (simulated) · {formatPrice(sum(paid))}</span>}
        {refunded.length > 0 && <span className="status status--cancelled">Refunded (simulated) · {formatPrice(sum(refunded))}</span>}
        {canPay && (
          <span className="payment-box">
            Simulated payment: rental {formatPrice(estimate.rental)} + deposit {formatPrice(estimate.deposit)} = <strong>{formatPrice(estimate.total)}</strong>. No real money is charged.
          </span>
        )}
        {b.status === 'completed' && review && (
          <span className="booking__note"><StarRating value={review.rating} /> {isOwner ? 'Renter’s review' : 'Your review'}{review.comment ? `: “${review.comment}”` : ''}</span>
        )}
        {b.status === 'completed' && !review && !isOwner && <ReviewForm bookingId={b.id} onDone={onChange} />}
        {!isOwner && b.listings && <button type="button" className="btn btn-ghost" disabled={busy} onClick={messageOwner}>Message owner</button>}
        {error && <span className="form-error" role="alert">{error}</span>}
      </div>
      {(actions.length > 0 || canPay) && (
        <div className="booking__actions">
          {confirm ? (
            <>
              <span>Are you sure?</span>
              <button type="button" className="btn btn-danger" disabled={busy} onClick={() => act(confirm)}>Yes</button>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirm(null)}>No</button>
            </>
          ) : (
            <>
              {canPay && <button type="button" className="btn btn-primary" disabled={busy} onClick={pay}>Pay {formatPrice(estimate.total)} (simulated)</button>}
              {actions.map(([label, status, needsConfirm]) => (
                <button key={status} type="button" disabled={busy} className={needsConfirm ? 'btn btn-ghost' : 'btn btn-primary'}
                  onClick={() => (needsConfirm ? setConfirm(status) : act(status))}>{label}</button>
              ))}
            </>
          )}
        </div>
      )}
    </li>
  )
}

function Section({ title, rows, role, onChange }) {
  if (rows.length === 0) return null
  return (
    <div className="bookings-section">
      <h2>{title} ({rows.length})</h2>
      <ul className="bookings">{rows.map((b) => <BookingCard key={b.id} b={b} role={role} onChange={onChange} />)}</ul>
    </div>
  )
}

function Panel({ role, userId }) {
  const isOwner = role === 'owner'
  const { rows, loading, error, reload } = useBookings(isOwner ? 'owner_id' : 'renter_id', userId)
  if (loading) return <p aria-busy="true">Loading…</p>
  if (error) return <p className="form-error" role="alert">We couldn’t load your bookings ({error}).</p>
  if (rows.length === 0) {
    return (
      <EmptyState icon="📅" title={isOwner ? 'No requests yet' : 'No requests yet'}
        action={isOwner ? <Link className="btn btn-primary" to="/my-listings">My listings</Link> : <Link className="btn btn-primary" to="/listings">Browse rentals</Link>}>
        {isOwner ? 'When renters request your listings, they will show up here.' : 'Requests you send to owners will show up here with their status.'}
      </EmptyState>
    )
  }
  if (!isOwner) return <ul className="bookings">{rows.map((b) => <BookingCard key={b.id} b={b} role="renter" onChange={reload} />)}</ul>
  const confirmed = rows.filter((b) => b.status === 'accepted').sort((a, b) => a.start_date.localeCompare(b.start_date))
  return (
    <>
      <Section title="Pending requests" rows={rows.filter((b) => b.status === 'pending')} role="owner" onChange={reload} />
      <Section title="Confirmed bookings (schedule)" rows={confirmed} role="owner" onChange={reload} />
      <Section title="History" rows={rows.filter((b) => !['pending', 'accepted'].includes(b.status))} role="owner" onChange={reload} />
    </>
  )
}

export default function BookingsPage() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'incoming' ? 'incoming' : 'mine'
  return (
    <section className="container page">
      <h1>Bookings</h1>
      <p className="notice">Payments in eRental are simulated. No real money is charged and no card details are collected.</p>
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'mine'} onClick={() => setParams({})}>My requests</button>
        <button type="button" role="tab" aria-selected={tab === 'incoming'} onClick={() => setParams({ tab: 'incoming' })}>Requests for my listings</button>
      </div>
      <Panel key={tab} role={tab === 'incoming' ? 'owner' : 'renter'} userId={user.id} />
    </section>
  )
}
