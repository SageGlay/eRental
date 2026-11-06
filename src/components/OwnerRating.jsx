import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { StarRating } from './Stars.jsx'

// Average of every review this owner has received, across all their listings.
export default function OwnerRating({ ownerId }) {
  const [ratings, setRatings] = useState(null)

  useEffect(() => {
    let cancelled = false
    supabase.from('reviews').select('rating').eq('owner_id', ownerId).then(({ data }) => { if (!cancelled) setRatings(data ?? []) })
    return () => { cancelled = true }
  }, [ownerId])

  if (!ratings) return null
  if (ratings.length === 0) return <p className="detail__meta">No reviews yet</p>
  const average = ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length
  return <p className="detail__meta"><StarRating value={average} /> {average.toFixed(1)} from {ratings.length} review{ratings.length === 1 ? '' : 's'}</p>
}
