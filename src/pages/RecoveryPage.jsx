import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import {
  openPasswordRecovery,
  requestPasswordRecovery,
} from '../lib/passwordRecovery.js'
import AccountFormFrame from '../components/AccountFormFrame.jsx'
import Icon from '../components/Icon.jsx'

function RequestReset() {
  const { user } = useAuth()
  const [email, setEmail] = useState(user?.email || '')
  const [error, setError] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const input = useRef(null)
  const submitting = useRef(false)
  const confirmation = useRef(null)
  useEffect(() => {
    if (sent) confirmation.current?.focus()
  }, [sent])

  async function send(event) {
    event.preventDefault()
    if (submitting.current) return
    const address = email.trim()
    if (!/^\S+@\S+\.\S+$/.test(address)) {
      setInvalid(true)
      setError('Please enter a valid email address.')
      input.current?.focus()
      return
    }
    submitting.current = true
    setBusy(true)
    setError('')
    try {
      const result = await requestPasswordRecovery(address)
      if (result.error?.status === 429) {
        setError('Too many requests. Wait a few minutes before trying again.')
      } else if (result.error && result.error.code !== 'user_not_found') {
        setError(
          'We couldn’t confirm the request. Check your inbox before trying again.',
        )
      } else {
        setSent(true)
      }
    } catch {
      setError(
        'We couldn’t confirm the request. Check your connection and inbox before trying again.',
      )
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <AccountFormFrame
      title="Reset password"
      description="Enter the email address you use for eRental. Open the recovery link in your email to choose a new password."
    >
      {sent ? (
        <>
          <p
            ref={confirmation}
            tabIndex={-1}
            role="status"
            className="form-success"
          >
            If an account uses this email, a recovery link is on its way. Check
            your inbox and spam folder.
          </p>
          <div className="account-entry__actions">
            <Link className="btn btn-primary" to={user ? '/profile' : '/login'}>
              {user ? 'Return to my profile' : 'Back to log in'}
            </Link>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setSent(false)
                requestAnimationFrame(() => input.current?.focus())
              }}
            >
              Use another email
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={send} noValidate aria-busy={busy}>
          <fieldset className="form-controls" disabled={busy}>
            <div className="field">
              <label htmlFor="recovery-email">Email</label>
              <input
                type="email"
                id="recovery-email"
                ref={input}
                autoComplete="email"
                autoCapitalize="none"
                spellCheck="false"
                value={email}
                aria-invalid={invalid || undefined}
                aria-describedby={error ? 'reset-error' : undefined}
                onChange={(event) => {
                  setEmail(event.target.value)
                  setInvalid(false)
                  setError('')
                }}
              />
            </div>
            {error && (
              <p role="alert" className="form-error" id="reset-error">
                {error}
              </p>
            )}
            <button className="btn btn-primary btn-block" type="submit">
              {busy ? 'Requesting link…' : 'Send recovery link'}
              <Icon name="arrowRight" size={18} />
            </button>
          </fieldset>
        </form>
      )}
    </AccountFormFrame>
  )
}

function ChoosePassword() {
  const { user } = useAuth()
  const [state, setState] = useState('checking')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [busy, setBusy] = useState(false)
  const input = useRef(null)
  const session = useRef(null)
  const confirmation = useRef(null)
  useEffect(() => {
    if (state === 'done') confirmation.current?.focus()
  }, [state])
  const submitting = useRef(false)

  useEffect(() => {
    let active = true
    // Open once after mounting. React Strict Mode may immediately unmount its first pass.
    const start = setTimeout(async () => {
      try {
        const recovery = openPasswordRecovery()
        if (!recovery) return setState('invalid')
        session.current = recovery.auth
        const { data, error } = await recovery.ready
        if (!active) return
        if (error || !data.session?.user?.email) {
          setState('invalid')
          return
        }
        setEmail(data.session.user.email)
        setState('ready')
      } catch {
        if (active) setState('invalid')
      }
    }, 0)
    return () => {
      active = false
      clearTimeout(start)
      session.current?.dispose()
      session.current = null
    }
  }, [])

  async function update(event) {
    event.preventDefault()
    if (submitting.current || state !== 'ready' || !session.current) return
    setError('')
    if (password.length < 8) {
      setInvalid(true)
      setError('Password must be at least 8 characters.')
      input.current?.focus()
      return
    }
    submitting.current = true
    setBusy(true)
    try {
      const { data, error } = await session.current.updateUser({ password })
      if (error?.status === 401 || error?.status === 403) {
        setPassword('')
        setState('invalid')
      } else if (error || !data.user) {
        setError(
          error?.code === 'same_password'
            ? 'Choose a different password from the one you already use.'
            : error?.code === 'weak_password'
              ? 'Choose a stronger password and try again.'
              : 'We couldn’t confirm the change. Try logging in with your new password before requesting another link.',
        )
      } else {
        setPassword('')
        setState('done')
        await session.current?.dispose()
        session.current = null
      }
    } catch {
      setError(
        'We couldn’t confirm the change. Try logging in with your new password before requesting another link.',
      )
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <AccountFormFrame
      title="Choose a new password"
      description={
        state === 'ready'
          ? `Change the eRental password for ${email}.`
          : 'Recover access to your marketplace account.'
      }
    >
      {state === 'checking' && (
        <p role="status">Checking your recovery link…</p>
      )}
      {state === 'invalid' && (
        <>
          <p role="alert" className="form-error">
            This recovery link is missing, invalid or expired. Request a fresh
            link to continue.
          </p>
          <Link className="btn btn-primary" to="/forgot-password">
            Request a new link
          </Link>
        </>
      )}
      {state === 'done' && (
        <>
          <p
            ref={confirmation}
            tabIndex={-1}
            role="status"
            className="form-success"
          >
            Password updated. Use your new password the next time you log in.
          </p>
          <Link className="btn btn-primary" to={user ? '/profile' : '/login'}>
            {user ? 'Return to my profile' : 'Back to log in'}
          </Link>
        </>
      )}
      {state === 'ready' && (
        <form onSubmit={update} noValidate aria-busy={busy}>
          <fieldset className="form-controls" disabled={busy}>
            <div className="field">
              <label htmlFor="new-password">New password</label>
              <div className="account-auth__password">
                <input
                  ref={input}
                  type={visible ? 'text' : 'password'}
                  id="new-password"
                  value={password}
                  autoComplete="new-password"
                  aria-invalid={invalid || undefined}
                  aria-describedby={
                    error
                      ? 'new-password-hint update-error'
                      : 'new-password-hint'
                  }
                  onChange={(event) => {
                    setPassword(event.target.value)
                    setInvalid(false)
                    setError('')
                  }}
                />
                <button
                  type="button"
                  className="account-auth__reveal"
                  aria-label={visible ? 'Hide password' : 'Show password'}
                  aria-pressed={visible}
                  aria-controls="new-password"
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? 'Hide' : 'Show'}
                </button>
              </div>
              <span className="field__hint" id="new-password-hint">
                At least 8 characters.
              </span>
            </div>
            {error && (
              <p className="form-error" role="alert" id="update-error">
                {error}
              </p>
            )}
            <button type="submit" className="btn btn-primary btn-block">
              {busy ? 'Updating…' : 'Update password'}
              <Icon name="arrowRight" size={18} />
            </button>
          </fieldset>
        </form>
      )}
    </AccountFormFrame>
  )
}

export default function RecoveryPage({ mode }) {
  return mode === 'reset' ? <ChoosePassword /> : <RequestReset />
}
