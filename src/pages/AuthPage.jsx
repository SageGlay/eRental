import { useRef, useState } from 'react'
import { Link, matchPath, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { isSupabaseConfigured } from '../lib/supabaseClient.js'
import LoadError from '../components/LoadError.jsx'
import Icon from '../components/Icon.jsx'
import AccountFormFrame from '../components/AccountFormFrame.jsx'

const returnPaths = [
  '/list',
  '/my-listings',
  '/bookings',
  '/saved',
  '/notifications',
  '/viewings',
  '/review-disputes',
  '/listings/:id',
  '/messages',
  '/messages/:id',
  '/profile',
  '/verification',
  '/admin',
  '/admin/verification',
  '/admin/conversation-reports',
  '/admin/review-disputes',
  '/listings/:id/edit',
]

function accountDestination(value) {
  if (
    typeof value !== 'string' ||
    !/^\/(?!\/)/.test(value) ||
    /[\\\x00-\x1F\x7F]/.test(value)
  )
    return '/'
  try {
    const url = new URL(value, window.location.origin)
    if (
      url.origin === window.location.origin &&
      returnPaths.some((path) => matchPath(path, url.pathname))
    ) {
      return url.pathname + url.search + url.hash
    }
  } catch {
    // Invalid or unsupported return paths use the marketplace home.
  }
  return '/'
}

export default function AuthPage({ mode }) {
  return <AccountEntry key={mode} mode={mode} />
}

function AccountEntry({ mode }) {
  const isRegister = mode === 'register'
  const { user, loading, signIn, signUp, authError, retrySession } = useAuth()
  const location = useLocation()
  const destination = accountDestination(location.state?.returnTo)
  const [form, setForm] = useState({ fullName: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [invalidField, setInvalidField] = useState('')
  const submitting = useRef(false)
  const fields = useRef({})

  if (!loading && user) return <Navigate to={destination} replace />

  const update = (field) => (e) => {
    setForm({ ...form, [field]: e.target.value })
    if (invalidField === field) {
      setInvalidField('')
      setError('')
    }
  }

  function invalid(field, message) {
    setInvalidField(field)
    setError(message)
    fields.current[field]?.focus()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting.current || loading || !isSupabaseConfigured) return
    setError('')
    setNotice('')
    setInvalidField('')
    const email = form.email.trim()
    if (isRegister && form.fullName.trim().length < 2)
      return invalid('fullName', 'Please enter your full name.')
    if (!/^\S+@\S+\.\S+$/.test(email))
      return invalid('email', 'Please enter a valid email address.')
    if (isRegister && form.password.length < 8)
      return invalid('password', 'Password must be at least 8 characters.')
    if (!form.password)
      return invalid('password', 'Please enter your password.')

    setBusy(true)
    submitting.current = true
    try {
      const { data, error: err } = isRegister
        ? await signUp(email, form.password, form.fullName.trim())
        : await signIn(email, form.password)
      if (err)
        return setError(
          err.message === 'Invalid login credentials'
            ? 'Wrong email or password.'
            : err.message,
        )
      if (isRegister && !data.session)
        return setNotice(
          'Account created. Check your email to confirm your address, then log in.',
        )
    } catch {
      setError('We couldn’t connect. Check your connection and try again.')
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <AccountFormFrame
      mode={mode}
      returnTo={destination}
      title={isRegister ? 'Create your account' : 'Welcome back'}
      description={
        isRegister
          ? 'Rent from local owners and list your own items with the same account.'
          : 'Log in to arrange a rental, message an owner or manage your listings.'
      }
    >
      {authError && <LoadError onRetry={retrySession}>{authError}</LoadError>}
      <form onSubmit={handleSubmit} noValidate aria-busy={busy}>
        <fieldset
          className="form-controls"
          disabled={busy || loading || !isSupabaseConfigured}
        >
          {isRegister && (
            <div className="field">
              <label htmlFor="fullName">Full name</label>
              <input
                ref={(el) => {
                  fields.current.fullName = el
                }}
                id="fullName"
                type="text"
                autoComplete="name"
                value={form.fullName}
                onChange={update('fullName')}
                aria-invalid={invalidField === 'fullName'}
                aria-describedby={
                  invalidField === 'fullName' ? 'auth-error' : undefined
                }
              />
            </div>
          )}
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              ref={(el) => {
                fields.current.email = el
              }}
              id="email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck="false"
              value={form.email}
              onChange={update('email')}
              aria-invalid={invalidField === 'email'}
              aria-describedby={
                invalidField === 'email' ? 'auth-error' : undefined
              }
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <div className="account-auth__password">
              <input
                ref={(el) => {
                  fields.current.password = el
                }}
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                value={form.password}
                onChange={update('password')}
                aria-invalid={invalidField === 'password'}
                aria-describedby={
                  [
                    isRegister ? 'password-hint' : '',
                    invalidField === 'password' ? 'auth-error' : '',
                  ]
                    .filter(Boolean)
                    .join(' ') || undefined
                }
              />
              <button
                type="button"
                className="account-auth__reveal"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                aria-controls="password"
                onClick={() => setShowPassword((shown) => !shown)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {!isRegister && (
              <Link className="account-entry__recover" to="/forgot-password">
                Forgot password?
              </Link>
            )}
            {isRegister && (
              <span className="field__hint" id="password-hint">
                At least 8 characters.
              </span>
            )}
          </div>
          {error && (
            <p className="form-error" role="alert" id="auth-error">
              {error}
            </p>
          )}
          {notice && (
            <p className="form-success" role="status">
              {notice}
            </p>
          )}
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={busy || loading || !isSupabaseConfigured}
          >
            {busy ? 'Please wait…' : isRegister ? 'Create account' : 'Log in'}
            {!busy && <Icon name="arrowRight" size={18} />}
          </button>
        </fieldset>
      </form>
      {isRegister && (
        <p className="account-entry__legal">
          Read the <Link to="/terms">Terms and conditions</Link> and{' '}
          <Link to="/privacy">Privacy notice</Link> before creating an account.
        </p>
      )}
    </AccountFormFrame>
  )
}
