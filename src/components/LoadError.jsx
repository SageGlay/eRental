export default function LoadError({ children, onRetry }) {
  return (
    <div className="load-error">
      <p className="form-error" role="alert">{children}</p>
      <button type="button" className="btn btn-ghost" onClick={onRetry}>Try again</button>
    </div>
  )
}
