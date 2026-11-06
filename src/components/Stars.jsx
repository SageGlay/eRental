// Read-only stars, e.g. <StarRating value={4.3} count={12} />
export function StarRating({ value, count }) {
  const filled = Math.max(0, Math.min(5, Math.round(value)))
  const label = `${Number(value).toFixed(1)} out of 5 stars${count == null ? '' : `, ${count} review${count === 1 ? '' : 's'}`}`
  return <span className="stars-display" role="img" aria-label={label}>{'★'.repeat(filled)}{'☆'.repeat(5 - filled)}</span>
}

// Star picker made of radio buttons, so it works with the keyboard and screen readers.
export function StarInput({ value, onChange }) {
  return (
    <fieldset className="stars">
      <legend>Your rating</legend>
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n} className={n <= value ? 'is-on' : ''}>
          <input type="radio" name="rating" value={n} checked={value === n} onChange={() => onChange(n)} />
          <span aria-hidden="true">★</span>
          <span className="sr-only">{n} star{n > 1 ? 's' : ''}</span>
        </label>
      ))}
    </fieldset>
  )
}
