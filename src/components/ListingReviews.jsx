import { useCallback, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import useReviewResource from '../hooks/useReviewResource.js'
import { REVIEW_PAGE_SIZE, readListingReviews } from '../lib/reviewTrust.js'
import { formatDate } from '../lib/format.js'
import LoadError from './LoadError.jsx'
import ReviewActionDialog from './ReviewActionDialog.jsx'
import ReviewSummary from './ReviewSummary.jsx'
import { StarRating } from './Stars.jsx'
import '../styles/review-trust.css'

function ReviewList({ listingId, userId }) {
  const [page, setPage] = useState(1)
  const [action, setAction] = useState(null)
  const [notice, setNotice] = useState('')
  const heading = useRef(null)
  const load = useCallback(signal => readListingReviews(listingId, page, signal), [listingId, page])
  const reviews = useReviewResource(load)

  function finish(message) {
    setAction(null)
    setNotice(message)
    reviews.refresh()
    requestAnimationFrame(() => heading.current?.focus())
  }

  function navigate(nextPage) {
    setPage(nextPage)
    setNotice('')
    heading.current?.focus()
  }

  return (
    <>
      <h2 ref={heading} tabIndex={-1}>Reviews</h2>
      {notice && <p className="form-success" role="status">{notice}</p>}
      {reviews.loading && <p role="status">Loading reviews…</p>}
      {reviews.error && <LoadError onRetry={reviews.refresh}>We couldn’t load reviews. Check your connection and try again.</LoadError>}
      {reviews.data && (
        <>
          <ReviewSummary summary={reviews.data.summary} />
          {reviews.data.summary.count === 0 && <p className="detail__meta">Renters can review a rental after it is completed.</p>}
          <ul className="reviews__list">
            {reviews.data.rows.map(review => {
              const response = Array.isArray(review.review_responses) ? review.review_responses[0] : review.review_responses
              const owner = userId === review.owner_id
              return (
                <li className="review" key={review.id}>
                  <StarRating value={review.rating} />
                  <span className="review__meta"> {review.reviewer?.display_name ?? 'A renter'} · {formatDate(review.created_at)}</span>
                  {review.comment && <p>{review.comment}</p>}
                  {response && (
                    <div className="review-response">
                      <h3>Owner response</h3>
                      <p>{response.response_text}</p>
                    </div>
                  )}
                  {owner && (
                    <div className="review-actions">
                      <button className="btn btn-ghost" type="button" onClick={() => setAction({ mode: 'reply', review, response })}>
                        {response ? 'Edit response' : 'Write a response'}
                      </button>
                      {response && (
                        <button className="btn btn-ghost" type="button" onClick={() => setAction({ mode: 'remove', review, response })}>
                          Remove response
                        </button>
                      )}
                      <button className="btn btn-ghost" type="button" onClick={() => setAction({ mode: 'dispute', review })}>Dispute review</button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {(page > 1 || reviews.data.summary.count > page * REVIEW_PAGE_SIZE) && (
            <nav className="review-pagination" aria-label="Review pages">
              <button className="btn btn-ghost" type="button" disabled={page === 1} onClick={() => navigate(page - 1)}>Previous</button>
              <span>Page {page}</span>
              <button className="btn btn-ghost" type="button" disabled={reviews.data.summary.count <= page * REVIEW_PAGE_SIZE} onClick={() => navigate(page + 1)}>Next</button>
            </nav>
          )}
          {reviews.data.rows.some(review => userId === review.owner_id) && <Link className="home-text-link" to="/review-disputes">My review disputes</Link>}
        </>
      )}
      {action && <ReviewActionDialog {...action} onClose={() => setAction(null)} onDone={finish} />}
    </>
  )
}

export default function ListingReviews({ listingId }) {
  const { user } = useAuth()
  return <ReviewList key={`${listingId}-${user?.id ?? 'guest'}`} userId={user?.id} listingId={listingId} />
}
