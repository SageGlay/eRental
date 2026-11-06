import { useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import { StarInput } from './Stars.jsx'

// Shown to the renter on a completed booking. The database checks that the rental is theirs and completed.
export default function ReviewForm({ bookingId, onDone }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!open) return <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>Leave a review</button>

  async function handleSubmit(e) {
    e.preventDefault()
    const text = comment.trim()
    if (!rating) return setError('Please choose a star rating.')
    if (text.length > 1000) return setError('Comments can be up to 1,000 characters.')
    setBusy(true)
    setError('')
    const { error: insertError } = await supabase.from('reviews').insert({ booking_id: bookingId, reviewer_id: user.id, rating, comment: text || null })
    setBusy(false)
    if (insertError) return setError(insertError.code === '23505' ? 'You already reviewed this rental.' : insertError.message)
    onDone()
  }

  return (
    <form className="review-form" onSubmit={handleSubmit} noValidate>
      <StarInput value={rating} onChange={setRating} />
      <label htmlFor={`comment-${bookingId}`} className="sr-only">Comment (optional)</label>
      <textarea id={`comment-${bookingId}`} maxLength={1000} placeholder="How was the rental? (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="booking__actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Submit review'}</button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  )
}
