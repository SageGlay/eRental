import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import { StarInput } from './Stars.jsx'

// Server authorization and uniqueness are checked for this completed booking.
export default function ReviewForm({ bookingId, onDone }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const form = useRef(null)
  const opener = useRef(null)
  const saving = useRef(false)

  useEffect(() => {
    if (open) form.current?.querySelector('input[type="radio"]')?.focus()
  }, [open])

  function close() {
    setOpen(false)
    setError('')
    requestAnimationFrame(() => opener.current?.focus())
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (saving.current) return
    if (!rating) {
      setError('Please choose a star rating.')
      form.current?.querySelector('input[type="radio"]')?.focus()
      return
    }
    const text = comment.trim()
    if (text.length > 1000)
      return setError('Comments can be up to 1,000 characters.')
    saving.current = true
    setBusy(true)
    setError('')
    try {
      const { error: insertError } = await supabase.from('reviews').insert({
        booking_id: bookingId,
        reviewer_id: user.id,
        rating,
        comment: text || null,
      })
      if (insertError) {
        if (insertError.code === '23505') {
          setError('You already reviewed this rental.')
        } else {
          setError(
            'We couldn’t confirm your review. Check your bookings before trying again.',
          )
        }
        return
      }
      await onDone()
    } catch {
      setError(
        'We couldn’t confirm your review. Check your bookings before trying again.',
      )
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  if (!open)
    return (
      <button
        ref={opener}
        type="button"
        className="btn btn-primary"
        onClick={() => setOpen(true)}
      >
        Leave a review
      </button>
    )
  return (
    <form
      ref={form}
      className="review-form"
      noValidate
      onSubmit={handleSubmit}
      aria-busy={busy}
    >
      <h4>Review this rental</h4>
      <fieldset disabled={busy} className="review-form__fields">
        <StarInput
          value={rating}
          onChange={(value) => {
            setRating(value)
            setError('')
          }}
        />
        <div className="field">
          <label htmlFor={`comment-${bookingId}`}>Comment (optional)</label>
          <textarea
            id={`comment-${bookingId}`}
            maxLength={1000}
            rows={2}
            placeholder="What should another renter know?"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>
      </fieldset>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="booking__actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Submit review'}
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
  )
}
