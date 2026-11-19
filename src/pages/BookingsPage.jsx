import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import { formatPrice, formatRate } from '../lib/format.js'
import {
  STATUS_LABELS,
  estimateAmounts,
  formatRange,
  setBookingStatus,
  simulateBookingPayment,
  today,
} from '../lib/bookings.js'
import { StarRating } from '../components/Stars.jsx'
import ReviewForm from '../components/ReviewForm.jsx'
import { startConversation } from '../lib/messages.js'
import EmptyState from '../components/EmptyState.jsx'
import LoadError from '../components/LoadError.jsx'
import Dialog from '../components/Dialog.jsx'
import PageHeading from '../components/PageHeading.jsx'
import Icon from '../components/Icon.jsx'
import '../styles/bookings.css'

const SELECT =
  'id, status, start_date, end_date, message, owner_response, price, price_period, deposit, simulated_payments(kind, amount, status), reviews(rating, comment), listings(id, title), renter:profiles!bookings_renter_id_fkey(display_name)'
const STATUSES = Object.keys(STATUS_LABELS)
const CONFIRMATION = {
  accepted: {
    title: 'Accept this rental request?',
    action: 'Accept',
    description:
      'This confirms the requested dates for your listing. The renter can then simulate payment and arrange the handover with you.',
  },
  rejected: {
    title: 'Decline this request?',
    action: 'Decline',
    description:
      'The renter will see that their request was declined. This does not create a confirmed booking.',
  },
  cancelled: {
    title: 'Cancel this rental request?',
    action: 'Cancel request',
    description:
      'This request will be marked as cancelled. You will need to send a new request if you want to rent it later.',
  },
  completed: {
    title: 'Mark this rental completed?',
    action: 'Mark completed',
    description:
      'The rental will move to your history. The renter can then leave a review.',
  },
}

function useBookings(column, userId) {
  const [state, setState] = useState({ rows: [], loading: true, error: null })
  const active = useRef(null)
  const load = useCallback(async () => {
    active.current?.abort()
    const controller = new AbortController()
    active.current = controller
    const timeout = setTimeout(() => controller.abort(), 15_000)
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select(SELECT)
        .eq(column, userId)
        .order('created_at', { ascending: false })
        .abortSignal(controller.signal)
      if (error) throw error
      if (active.current !== controller) return false
      setState({ rows: data ?? [], loading: false, error: null })
      return true
    } catch {
      if (active.current === controller) {
        setState({
          rows: [],
          loading: false,
          error: 'Check your connection and try again.',
        })
      }
      return false
    } finally {
      clearTimeout(timeout)
    }
  }, [column, userId])
  useEffect(() => {
    load()
    return () => {
      active.current?.abort()
      active.current = null
    }
  }, [load])
  return { ...state, reload: load }
}

const monthName = new Intl.DateTimeFormat('en-PH', {
  month: 'short',
  timeZone: 'UTC',
})
const weekdayName = new Intl.DateTimeFormat('en-PH', {
  weekday: 'short',
  timeZone: 'UTC',
})

function BookingDate({ date }) {
  const start = new Date(date)
  return (
    <div className="booking-date" aria-hidden="true">
      <span>{monthName.format(start)}</span>
      <strong>{start.getUTCDate()}</strong>
      <span>{weekdayName.format(start)}</span>
    </div>
  )
}

function PriceBreakdown({ estimate, simulated = false }) {
  return (
    <dl className="booking-costs">
      <div>
        <dt>Rental estimate</dt>
        <dd>{formatPrice(estimate.rental)}</dd>
      </div>
      <div>
        <dt>Deposit</dt>
        <dd>{formatPrice(estimate.deposit)}</dd>
      </div>
      <div className="booking-costs__total">
        <dt>{simulated ? 'Simulated payment total' : 'Estimated total'}</dt>
        <dd>{formatPrice(estimate.total)}</dd>
      </div>
    </dl>
  )
}

function BookingCard({ b, role, onChange, onResult }) {
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const busyRef = useRef(false)
  const refreshRef = useRef(null)
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
    if (isOwner)
      actions.push(['Accept', 'accepted', true], ['Decline', 'rejected', true])
    else actions.push(['Cancel request', 'cancelled', true])
  }
  if (b.status === 'accepted') {
    if (b.start_date > today())
      actions.push(['Cancel booking', 'cancelled', true])
    if (isOwner && b.end_date <= today())
      actions.push(['Mark completed', 'completed', true])
  }

  useEffect(() => {
    if (needsRefresh && !busy) refreshRef.current?.focus()
  }, [needsRefresh, busy, confirm])

  function begin() {
    if (busyRef.current) return false
    busyRef.current = true
    setBusy(true)
    setError('')
    return true
  }

  function finish() {
    busyRef.current = false
    setBusy(false)
  }

  async function messageOwner() {
    if (!begin()) return
    try {
      const result = await startConversation(b.listings.id, user.id)
      if (result.error) return setError(result.error)
      navigate(`/messages/${result.id}`)
    } catch (err) {
      setError(err?.message || 'We couldn’t open the conversation. Try again.')
    } finally {
      finish()
    }
  }

  async function act(status) {
    if (needsRefresh || !begin()) return
    const payment = status === 'simulate_payment'
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)
    try {
      const message = payment
        ? await simulateBookingPayment(b.id, controller.signal)
        : await setBookingStatus(b.id, status, controller.signal)
      if (message) return setError(message)
      setConfirm(null)
      await onChange()
      onResult(
        payment
          ? 'Payment simulation completed. No real money was charged.'
          : `Booking updated: ${STATUS_LABELS[status]}.`,
      )
    } catch {
      setNeedsRefresh(true)
      setError(
        payment
          ? 'We couldn’t confirm the payment simulation. Refresh bookings before trying again.'
          : 'We couldn’t confirm the booking update. Refresh bookings before trying again.',
      )
    } finally {
      clearTimeout(timeout)
      finish()
    }
  }

  async function refreshBooking() {
    if (!begin()) return
    try {
      if (await onChange()) {
        setNeedsRefresh(false)
        setConfirm(null)
        onResult('Bookings refreshed.')
      } else {
        setError('We couldn’t refresh this booking. Try again.')
      }
    } finally {
      finish()
    }
  }

  function ask(label, status) {
    setError('')
    setConfirm({
      ...CONFIRMATION[status],
      status,
      action: label,
      ...(status === 'cancelled' && b.status === 'accepted'
        ? {
            title: 'Cancel this booking?',
            description:
              'This confirmed booking will be cancelled. Any payment records are simulated; no real funds are transferred.',
          }
        : {}),
    })
  }

  function askPayment() {
    setError('')
    setConfirm({
      status: 'simulate_payment',
      title: 'Simulate this payment?',
      action: 'Simulate payment',
      description:
        'This creates a simulated payment record for your booking. No real money is charged or transferred, and no card details are collected.',
    })
  }

  return (
    <li className="booking booking-card">
      <div className="booking-card__content">
        <header className="booking-card__heading">
          <BookingDate date={b.start_date} />
          <div className="booking-card__identity">
            <h3>
              {b.listings?.id ? (
                <Link to={`/listings/${b.listings.id}`}>
                  {b.listings.title}
                </Link>
              ) : (
                <span>Listing no longer available</span>
              )}
            </h3>
            <p className="booking-card__range">
              {formatRange(b.start_date, b.end_date)}
            </p>
          </div>
          <span className={`status status--${b.status}`}>
            {STATUS_LABELS[b.status]}
          </span>
        </header>
        <div className="booking-card__body">
          <div className="booking-card__terms">
            <dl className="booking-card__details">
              <div>
                <dt>Rental rate</dt>
                <dd>{formatRate(b.price, b.price_period)}</dd>
              </div>
              {isOwner && (
                <div>
                  <dt>
                    <Icon name="user" size={16} /> Requested by
                  </dt>
                  <dd>{b.renter?.display_name || 'Renter'}</dd>
                </div>
              )}
            </dl>
            {b.message && (
              <blockquote className="booking-card__note">
                <span>Request message</span>
                <p>“{b.message}”</p>
              </blockquote>
            )}
            {b.owner_response && (
              <div className="booking-card__note">
                <span>Owner’s note</span>
                <p>{b.owner_response}</p>
              </div>
            )}
            {(paid.length > 0 || refunded.length > 0) && (
              <div className="booking-card__payments">
                {paid.length > 0 && (
                  <span className="status status--completed">
                    {isOwner ? 'Renter paid' : 'Paid'} (simulated) ·{' '}
                    {formatPrice(sum(paid))}
                  </span>
                )}
                {refunded.length > 0 && (
                  <span className="status status--cancelled">
                    Refunded (simulated) · {formatPrice(sum(refunded))}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="booking-card__estimate">
            <PriceBreakdown estimate={estimate} simulated={canPay} />
          </div>
        </div>
        {b.status === 'completed' && review && (
          <div className="booking-card__review">
            <StarRating value={review.rating} />
            <p>
              {isOwner ? 'Renter’s review' : 'Your review'}
              {review.comment ? `: “${review.comment}”` : ''}
            </p>
          </div>
        )}
        {b.status === 'completed' && !review && !isOwner && (
          <div className="booking-card__review">
            <ReviewForm
              bookingId={b.id}
              onDone={async () => {
                await onChange()
                onResult('Review submitted.')
              }}
            />
          </div>
        )}
        {error && !confirm && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <footer className="booking-card__footer">
        {b.listings?.id && (
          <Link className="btn btn-ghost" to={`/listings/${b.listings.id}`}>
            View listing
            <Icon name="arrowRight" size={16} />
          </Link>
        )}
        <div className="booking__actions">
          {!isOwner && b.listings?.id && (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={messageOwner}
            >
              <Icon name="message" size={16} />
              Message owner
            </button>
          )}
          {canPay && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || needsRefresh}
              onClick={askPayment}
            >
              Pay {formatPrice(estimate.total)} (simulated)
            </button>
          )}
          {actions.map(([label, status, needsConfirm]) => (
            <button
              key={status}
              type="button"
              disabled={busy || needsRefresh}
              className={
                status === 'accepted' || status === 'completed'
                  ? 'btn btn-primary'
                  : 'btn btn-ghost'
              }
              onClick={() => (needsConfirm ? ask(label, status) : act(status))}
            >
              {label}
            </button>
          ))}
          {needsRefresh && !confirm && (
            <button
              ref={refreshRef}
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={refreshBooking}
            >
              {busy ? 'Refreshing…' : 'Refresh bookings'}
            </button>
          )}
        </div>
      </footer>
      {confirm && (
        <Dialog
          title={confirm.title}
          busy={busy}
          onClose={() => setConfirm(null)}
        >
          <p className="booking-confirm__listing">{b.listings?.title}</p>
          <p className="detail__meta">
            {formatRange(b.start_date, b.end_date)}
          </p>
          <p>{confirm.description}</p>
          {confirm.status === 'accepted' && (
            <dl className="booking-card__details booking-confirm__details">
              <div>
                <dt>Rental rate</dt>
                <dd>{formatRate(b.price, b.price_period)}</dd>
              </div>
              {b.deposit != null && (
                <div>
                  <dt>Deposit</dt>
                  <dd>{formatPrice(b.deposit)}</dd>
                </div>
              )}
            </dl>
          )}
          {confirm.status === 'simulate_payment' && (
            <PriceBreakdown estimate={estimate} simulated />
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="booking-confirm__actions">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              Go back
            </button>
            <button
              type="button"
              ref={needsRefresh ? refreshRef : undefined}
              className={`btn ${needsRefresh || ['accepted', 'completed', 'simulate_payment'].includes(confirm.status) ? 'btn-primary' : 'btn-danger'}`}
              disabled={busy}
              onClick={() =>
                needsRefresh ? refreshBooking() : act(confirm.status)
              }
            >
              {needsRefresh
                ? busy
                  ? 'Refreshing…'
                  : 'Refresh bookings'
                : busy
                  ? confirm.status === 'simulate_payment'
                    ? 'Simulating…'
                    : 'Updating…'
                  : confirm.action}
            </button>
          </div>
        </Dialog>
      )}
    </li>
  )
}

function Section({ title, rows, role, onChange, onResult }) {
  if (rows.length === 0) return null
  return (
    <div className="bookings-section">
      <h2>
        {title} <span className="bookings-section__count">{rows.length}</span>
      </h2>
      <ul className="bookings">
        {rows.map((b) => (
          <BookingCard
            key={b.id}
            b={b}
            role={role}
            onChange={onChange}
            onResult={onResult}
          />
        ))}
      </ul>
    </div>
  )
}

function Panel({ role, userId, status, onStatusChange }) {
  const isOwner = role === 'owner'
  const [notice, setNotice] = useState('')
  const listHeading = useRef(null)
  const { rows, loading, error, reload } = useBookings(
    isOwner ? 'owner_id' : 'renter_id',
    userId,
  )
  function showResult(message) {
    setNotice(message)
    requestAnimationFrame(() => listHeading.current?.focus())
  }
  const result = notice && (
    <p className="form-success" role="status">
      {notice}
    </p>
  )
  if (loading)
    return (
      <div className="bookings-loading" role="status" aria-busy="true">
        <Icon name="calendar" size={28} />
        <p>Loading your bookings…</p>
      </div>
    )
  if (error)
    return (
      <div>
        {result}
        <LoadError onRetry={reload}>
          We couldn’t load your bookings. {error}
        </LoadError>
      </div>
    )
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Icon name="calendar" size={32} />}
        title="No requests yet"
        action={
          isOwner ? (
            <Link className="btn btn-primary" to="/my-listings">
              My listings
            </Link>
          ) : (
            <Link className="btn btn-primary" to="/listings">
              Browse rentals
            </Link>
          )
        }
      >
        {isOwner
          ? 'When renters request your listings, they will show up here.'
          : 'Requests you send to owners will show up here with their status.'}
      </EmptyState>
    )
  }
  const filtered = status ? rows.filter((b) => b.status === status) : rows
  const confirmed = filtered
    .filter((b) => b.status === 'accepted')
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
  return (
    <>
      <div className="bookings-toolbar">
        <div>
          <h2 ref={listHeading} tabIndex={-1}>
            {isOwner ? 'Your incoming requests' : 'Your rental activity'}
          </h2>
          <p>
            {rows.length} {rows.length === 1 ? 'booking' : 'bookings'} ·{' '}
            {rows.filter((b) => b.status === 'pending').length} pending
          </p>
        </div>
        <div className="field">
          <label htmlFor="booking-status">Filter bookings</label>
          <select
            id="booking-status"
            value={status}
            onChange={(e) => onStatusChange(e.target.value)}
          >
            <option value="">All statuses</option>
            {STATUSES.map((value) => (
              <option value={value} key={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {result}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Icon name="calendar" size={32} />}
          title="No bookings with this status"
          action={
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onStatusChange('')}
            >
              Show all bookings
            </button>
          }
        >
          Choose another status to see your other rental activity.
        </EmptyState>
      ) : !isOwner ? (
        <ul className="bookings">
          {filtered.map((b) => (
            <BookingCard
              key={b.id}
              b={b}
              role="renter"
              onChange={reload}
              onResult={showResult}
            />
          ))}
        </ul>
      ) : (
        <>
          <Section
            title="Pending requests"
            rows={filtered.filter((b) => b.status === 'pending')}
            role="owner"
            onChange={reload}
            onResult={showResult}
          />
          <Section
            title="Confirmed bookings (schedule)"
            rows={confirmed}
            role="owner"
            onChange={reload}
            onResult={showResult}
          />
          <Section
            title="History"
            rows={filtered.filter(
              (b) => !['pending', 'accepted'].includes(b.status),
            )}
            role="owner"
            onChange={reload}
            onResult={showResult}
          />
        </>
      )}
    </>
  )
}

const railQuery = '(min-width: 980px)'
function observeRail(callback) {
  const media = window.matchMedia(railQuery)
  media.addEventListener('change', callback)
  return () => media.removeEventListener('change', callback)
}
const hasRail = () => window.matchMedia(railQuery).matches

export default function BookingsPage() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'incoming' ? 'incoming' : 'mine'
  const status = STATUSES.includes(params.get('status'))
    ? params.get('status')
    : ''
  const tabsRef = useRef([])
  const vertical = useSyncExternalStore(observeRail, hasRail)

  function changeTab(next) {
    setParams(next === 'incoming' ? { tab: 'incoming' } : {})
  }

  function tabKey(e, index) {
    const arrows = vertical
      ? ['ArrowUp', 'ArrowDown']
      : ['ArrowLeft', 'ArrowRight']
    if (![...arrows, 'Home', 'End'].includes(e.key)) return
    e.preventDefault()
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? 1 : 1 - index
    changeTab(next ? 'incoming' : 'mine')
    tabsRef.current[next]?.focus()
  }

  function changeStatus(value) {
    const next = new URLSearchParams(params)
    if (value) next.set('status', value)
    else next.delete('status')
    setParams(next)
  }

  return (
    <section className="container page bookings-page">
      <PageHeading title="Bookings">
        <p>Manage the rentals you request and the items you rent out.</p>
      </PageHeading>
      <div className="bookings-workspace">
        <div className="bookings-navigation">
          <div
            className="bookings-tabs"
            role="tablist"
            aria-label="Booking views"
            aria-orientation={vertical ? 'vertical' : 'horizontal'}
          >
            {[
              ['mine', 'My requests', 'key'],
              ['incoming', 'Requests for my listings', 'home'],
            ].map(([value, label, icon], index) => (
              <button
                key={value}
                ref={(el) => {
                  tabsRef.current[index] = el
                }}
                id={`booking-tab-${value}`}
                type="button"
                role="tab"
                aria-selected={tab === value}
                tabIndex={tab === value ? 0 : -1}
                aria-controls="booking-panel"
                onKeyDown={(e) => tabKey(e, index)}
                onClick={() => changeTab(value)}
              >
                <Icon name={icon} size={18} />
                {label}
              </button>
            ))}
          </div>
          <div className="bookings-simulation">
            <Icon name="shield" size={20} />
            <p>
              <strong>Simulated payments only.</strong> No real money is
              charged.
            </p>
          </div>
        </div>
        <div
          id="booking-panel"
          role="tabpanel"
          aria-labelledby={`booking-tab-${tab}`}
        >
          <Panel
            key={`${user.id}/${tab}`}
            role={tab === 'incoming' ? 'owner' : 'renter'}
            userId={user.id}
            status={status}
            onStatusChange={changeStatus}
          />
        </div>
      </div>
    </section>
  )
}
