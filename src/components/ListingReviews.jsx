import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { formatDate } from '../lib/format.js'
import { StarRating } from './Stars.jsx'

const FIELDS = 'id, rating, comment, created_at, reviewer:profiles!reviews_reviewer_id_fkey(display_name)'

// Latest reviews of a listing. Average is over the latest 50, which is plenty for this prototype.
export default function ListingReviews({ listingId }) {
  const [state, setState] = useState({ reviews: [], loading: true, error: null })

  useEffect(() => {
    let cancelled = false
    supabase.from('reviews').select(FIELDS).eq('listing_id', listingId).order('created_at', { ascending: false }).limit(50)
      .then(({ data, error }) => { if (!cancelled) setState({ reviews: data ?? [], loading: false, error: error ? error.message : null }) })
    return () => { cancelled = true }
  }, [listingId])

  const { reviews, loading, error } = state
  const average = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0
  return (
    <>
      <h2>Reviews</h2>
      {loading && <p aria-busy="true">Loading reviews…</p>}
      {error && <p className="form-error" role="alert">We couldn’t load reviews ({error}).</p>}
      {!loading && !error && reviews.length === 0 && <p className="detail__meta">No reviews yet. Renters can review a rental after it is completed.</p>}
      {reviews.length > 0 && (
        <>
          <p><StarRating value={average} count={reviews.length} /> <strong>{average.toFixed(1)}</strong> · {reviews.length} review{reviews.length === 1 ? '' : 's'}</p>
          <ul className="reviews__list">
            {reviews.map((r) => (
              <li className="review" key={r.id}>
                <StarRating value={r.rating} />
                <span className="review__meta"> {r.reviewer?.display_name ?? 'A renter'} · {formatDate(r.created_at)}</span>
                {r.comment && <p>{r.comment}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
