import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import EmptyState from './EmptyState.jsx'

// Convenience only: the database is what really stops non-admins from reading or changing admin data.
export default function RequireAdmin({ children }) {
  const { user, loading, isAdmin } = useAuth()
  if (loading || (user && isAdmin === null)) return <p className="container page" aria-busy="true">Loading…</p>
  if (!user) return <Navigate to="/login" replace />
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
