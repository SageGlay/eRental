export default function LoadError({ children, onRetry, retrying = false }) {
  return (
    <div className="load-error">
      <p className="form-error" role="alert">
        {children}
      </p>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={onRetry}
        disabled={retrying}
      >
        {retrying ? 'Trying again…' : 'Try again'}
      </button>
    </div>
  )
}
