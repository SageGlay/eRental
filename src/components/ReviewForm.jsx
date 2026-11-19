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
  const [needsCheck, setNeedsCheck] = useState(false)
  const form = useRef(null)
  const opener = useRef(null)
  const active = useRef(null)

  useEffect(() => () => active.current?.abort(), [])

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
    if (active.current) return
    if (!rating) {
      setError('Please choose a star rating.')
      form.current?.querySelector('input[type="radio"]')?.focus()
      return
    }
    const text = comment.trim()
    if (text.length > 1000)
      return setError('Comments can be up to 1,000 characters.')
    const controller = new AbortController()
    active.current = controller
    const timeout = setTimeout(() => controller.abort(), 15_000)
    setBusy(true)
    setError('')
    try {
      if (needsCheck) {
        const { data, error: readError } = await supabase
          .from('reviews')
          .select('rating')
          .eq('booking_id', bookingId)
          .eq('reviewer_id', user.id)
          .abortSignal(controller.signal)
          .maybeSingle()
        if (readError) {
          setError('We couldn’t check this review. Try checking again.')
        } else if (data) {
          await onDone('Your review is already saved.')
        } else {
          setNeedsCheck(false)
          setError(
            'There is no saved review for this booking. You can submit your draft again.',
          )
        }
        return
      }
      const { error: insertError, status } = await supabase
        .from('reviews')
        .insert({
          booking_id: bookingId,
          reviewer_id: user.id,
          rating,
          comment: text || null,
        })
        .abortSignal(controller.signal)
      if (insertError) {
        if (
          insertError.code === '23505' ||
          !status ||
          status === 408 ||
          status >= 500
        ) {
          setNeedsCheck(true)
          setError(
            insertError.code === '23505'
              ? 'A review already exists for this booking.'
              : 'We couldn’t confirm your review. Check for a saved review before trying again.',
          )
        } else {
          setError(
            'Your review could not be saved. Check your rating and try again.',
          )
        }
        return
      }
      await onDone('Review submitted.')
    } catch {
      setNeedsCheck(true)
      setError(
        'We couldn’t confirm your review. Check for a saved review before trying again.',
      )
    } finally {
      clearTimeout(timeout)
      active.current = null
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
      <fieldset disabled={busy || needsCheck} className="review-form__fields">
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
          {needsCheck
            ? busy
              ? 'Checking…'
              : 'Check saved review'
            : busy
              ? 'Saving…'
              : 'Submit review'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy || needsCheck}
          onClick={close}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
