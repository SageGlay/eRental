import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import useReviewResource from '../hooks/useReviewResource.js'
import { readReviewSummary } from '../lib/reviewTrust.js'
import ReviewSummary from './ReviewSummary.jsx'

export default function OwnerRating({ ownerId }) {
  const load = useCallback(signal => readReviewSummary({ p_owner_id: ownerId }, signal), [ownerId])
  const rating = useReviewResource(load)

  return (
    <>
      {rating.loading && <p className="detail__meta" role="status">Loading owner rating…</p>}
      {rating.error && <button type="button" className="btn btn-ghost" onClick={rating.refresh}>Reload owner rating</button>}
      {rating.data && <ReviewSummary summary={rating.data} />}
      <Link className="home-text-link" to={`/owners/${ownerId}`}>View owner profile</Link>
    </>
  )
}
