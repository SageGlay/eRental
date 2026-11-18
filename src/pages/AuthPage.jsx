import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { isSupabaseConfigured } from '../lib/supabaseClient.js'
import LoadError from '../components/LoadError.jsx'
import Icon from '../components/Icon.jsx'
import '../styles/account-auth.css'

export default function AuthPage({ mode }) {
  const isRegister = mode === 'register'
  const { user, loading, signIn, signUp, authError, retrySession } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ fullName: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [invalidField, setInvalidField] = useState('')
  const submitting = useRef(false)
  const fields = useRef({})

  useEffect(() => setShowPassword(false), [mode])

  if (!loading && user) return <Navigate to="/" replace />

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
      navigate('/')
    } catch {
      setError('We couldn’t connect. Check your connection and try again.')
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <section className="container auth account-auth">
      <aside
        className="account-auth__story"
        aria-label="About your eRental account"
      >
        <Link to="/listings" className="account-auth__back">
          <Icon name="arrowLeft" size={18} /> Explore the marketplace
        </Link>
        <div className="account-auth__intro">
          <p className="eyebrow">Around Iligan. Within reach.</p>
          <p className="account-auth__headline">
            Rent what you need.
            <br />
            <span>Share what you have.</span>
          </p>
          <p className="account-auth__description">
            A place for everyday plans and bigger occasions. Find a rental
            nearby, or give something you own a new purpose.
          </p>
        </div>
        <div className="account-auth__possibilities">
          <div>
            <span className="account-auth__icon">
              <Icon name="search" size={22} />
            </span>
            <div>
              <strong>Find your next rental</strong>
              <p>Compare listings and send a request to the owner.</p>
            </div>
          </div>
          <div>
            <span className="account-auth__icon">
              <Icon name="key" size={22} />
            </span>
            <div>
              <strong>Make room for more</strong>
              <p>List as an individual or a rental business.</p>
            </div>
          </div>
        </div>
        <p className="account-auth__location">
          <Icon name="mapPin" size={16} /> Iligan City, Philippines
        </p>
      </aside>
      <div className="auth__card account-auth__card">
        <p className="eyebrow">
          {isRegister ? 'Join the neighborhood' : 'Your rental plans, together'}
        </p>
        <h1>{isRegister ? 'Create your account' : 'Welcome back'}</h1>
        <p className="auth__sub">
          {isRegister
            ? 'One account lets you rent items and list your own.'
            : 'Log in to manage your rentals and listings.'}
        </p>
        {!isSupabaseConfigured && (
          <p className="form-error" role="alert">
            Supabase is not configured. Add your keys to the .env file and
            restart npm run dev.
          </p>
        )}
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
                  autoComplete={
                    isRegister ? 'new-password' : 'current-password'
                  }
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
          <p className="account-auth__account-note">
            <Icon name="user" size={18} />
            <span>
              Start with one account. You can choose Individual or Rental
              business in your profile after signing up.
            </span>
          </p>
        )}
        <p className="auth__switch">
          {isRegister ? (
            <>
              Already have an account? <Link to="/login">Log in</Link>
            </>
          ) : (
            <>
              New to eRental? <Link to="/register">Create an account</Link>
            </>
          )}
        </p>
      </div>
    </section>
  )
}
