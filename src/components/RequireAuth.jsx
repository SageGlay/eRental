import { Navigate, useLocation } from 'react-router-dom'
import { Fragment, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import LoadError from './LoadError.jsx'

// Wrap any page that needs a signed-in user: <RequireAuth><MyPage /></RequireAuth>
export default function RequireAuth({ children }) {
  const { user, loading, authError, retrySession } = useAuth()
  const location = useLocation()
  const previouslySignedIn = useRef(false)
  useEffect(() => { if (user) previouslySignedIn.current = true }, [user])
  if (loading) return <p className="container page" role="status" aria-busy="true">Loading…</p>
  if (authError) return <section className="container page"><LoadError onRetry={retrySession}>{authError}</LoadError></section>
  if (!user) {
    const state = previouslySignedIn.current ? null : { returnTo: location.pathname + location.search + location.hash }
    return <Navigate to="/login" replace state={state} />
  }
  return <Fragment key={user.id}>{children}</Fragment>
}
