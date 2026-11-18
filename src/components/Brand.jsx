export default function Brand({ compact = false }) {
  return (
    <span className="brand">
      <svg
        className="brand__symbol"
        width="36"
        height="36"
        viewBox="0 0 36 36"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M6 27V12a7 7 0 0 1 14 0v12a7 7 0 0 0 14 0"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          transform="translate(-2 0)"
        />
        <path
          d="M29 9v15a7 7 0 0 1-14 0V12"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
      {!compact && (
        <span>
          eRental<span className="brand__dot">.</span>
        </span>
      )}
    </span>
  )
}
