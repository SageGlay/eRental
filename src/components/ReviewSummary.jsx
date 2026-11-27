import { StarRating } from './Stars.jsx'

export default function ReviewSummary({ summary }) {
  if (!summary.count) return <p className="detail__meta">No reviews yet</p>
  return (
    <p className="review-summary">
      <StarRating value={summary.average} />
      <strong>{summary.average.toFixed(1)}</strong>
      <span> · {summary.count.toLocaleString('en-PH')} {summary.count === 1 ? 'review' : 'reviews'}</span>
    </p>
  )
}
