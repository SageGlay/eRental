export default function Brand({ compact = false }) {
  return (
    <span className="brand">
      <svg className="brand__symbol" width="40" height="36" viewBox="0 0 44 36" aria-hidden="true">
        <path fill="currentColor" fillRule="evenodd" d="M4 2h22l8 8-8 8H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm21 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/>
        <path className="brand__return" fillRule="evenodd" d="M40 18H18l-8 8 8 8h22a2 2 0 0 0 2-2V20a2 2 0 0 0-2-2Zm-21 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z"/>
      </svg>
      {!compact && <span>eRental</span>}
    </span>
  )
}
