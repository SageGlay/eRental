import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import EmptyState from './EmptyState.jsx'
import LoadError from './LoadError.jsx'

// Convenience only: the database is what really stops non-admins from reading or changing admin data.
export default function RequireAdmin({ children }) {
  const { user, loading, isAdmin, authError, retrySession, adminError, retryAdmin } = useAuth()
  if (loading) return <p className="container page" aria-busy="true">Loading…</p>
  if (authError) return <section className="container page"><LoadError onRetry={retrySession}>{authError}</LoadError></section>
  if (!user) return <Navigate to="/login" replace />
  if (adminError) return <section className="container page"><LoadError onRetry={retryAdmin}>{adminError}</LoadError></section>
  if (isAdmin === null) return <p className="container page" aria-busy="true">Checking administrator access…</p>
  if (!isAdmin) {
    return (
      <section className="container page">
        <EmptyState icon="🔒" title="Admins only" action={<Link className="btn btn-primary" to="/">Back to home</Link>}>
          This area is only for eRental administrators.
        </EmptyState>
      </section>
    )
  }
  return children
}
