import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

// Wrap any page that needs a signed-in user: <RequireAuth><MyPage /></RequireAuth>
export default function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <p className="container page" aria-busy="true">Loading…</p>
  if (!user) return <Navigate to="/login" replace />
  return children
}
