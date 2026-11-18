export default function ListingSkeleton({ count = 6 }) {
  return (
    <div className="listing-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div className="listing-skeleton" key={i}>
          <div className="skeleton skeleton--image" />
          <div className="skeleton skeleton--line" />
          <div className="skeleton skeleton--short" />
        </div>
      ))}
    </div>
  )
}
