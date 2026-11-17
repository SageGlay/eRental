import { Navigate } from 'react-router-dom'
import { Fragment } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import LoadError from './LoadError.jsx'

// Wrap any page that needs a signed-in user: <RequireAuth><MyPage /></RequireAuth>
export default function RequireAuth({ children }) {
  const { user, loading, authError, retrySession } = useAuth()
  if (loading) return <p className="container page" aria-busy="true">Loading…</p>
  if (authError) return <section className="container page"><LoadError onRetry={retrySession}>{authError}</LoadError></section>
  if (!user) return <Navigate to="/login" replace />
  return <Fragment key={user.id}>{children}</Fragment>
}
