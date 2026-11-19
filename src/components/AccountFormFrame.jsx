import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'
import '../styles/account-auth.css'

export default function AccountFormFrame({
  title,
  description,
  mode,
  returnTo,
  children,
}) {
  const signingIn = mode === 'login' || mode === 'register'
  return (
    <section className="container page account-entry">
      <Link
        className="account-entry__back"
        to={signingIn ? '/listings' : '/login'}
      >
        <Icon name="arrowLeft" size={16} />
        {signingIn ? 'Browse rentals' : 'Back to log in'}
      </Link>
      <div className="account-entry__sheet">
        <header className="account-entry__head">
          <div className="account-entry__symbol" aria-hidden="true">
            <Icon name={signingIn ? 'user' : 'key'} size={24} />
          </div>
          <h1>{title}</h1>
          <p>{description}</p>
        </header>
        <div className="account-entry__body">
          {signingIn && (
            <nav className="account-entry__modes" aria-label="Account access">
              <Link
                to="/login"
                state={{ returnTo }}
                aria-current={mode === 'login' ? 'page' : undefined}
              >
                Log in
              </Link>
              <Link
                to="/register"
                state={{ returnTo }}
                aria-current={mode === 'register' ? 'page' : undefined}
              >
                Create account
              </Link>
            </nav>
          )}
          {children}
        </div>
      </div>
    </section>
  )
}
