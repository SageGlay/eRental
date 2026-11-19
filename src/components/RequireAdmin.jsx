import { Link } from 'react-router-dom'
import RequireAuth from './RequireAuth.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import Icon from './Icon.jsx'
import PageHeading from './PageHeading.jsx'
import LoadError from './LoadError.jsx'

function AdministratorAccess({ children }) {
  const { isAdmin, adminError, retryAdmin } = useAuth()
  if (adminError)
    return (
      <section className="container page">
        <LoadError onRetry={retryAdmin}>{adminError}</LoadError>
      </section>
    )
  if (isAdmin === null)
    return (
      <p className="container page" role="status">
        Checking administrator access…
      </p>
    )
  if (!isAdmin) {
    return (
      <section className="container page moderation-access">
        <Icon name="shield" size={36} />
        <PageHeading title="Admins only">
          <p>
            This account can rent and list items. An administrator account is
            required to review reports and verification documents.
          </p>
        </PageHeading>
        <Link className="btn btn-primary" to="/">
          Back to home
        </Link>
        <Link className="btn btn-ghost" to="/profile">
          My profile
        </Link>
      </section>
    )
  }
  return children
}

export default function RequireAdmin({ children }) {
  return (
    <RequireAuth>
      <AdministratorAccess>{children}</AdministratorAccess>
    </RequireAuth>
  )
}
