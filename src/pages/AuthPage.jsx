import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { isSupabaseConfigured } from '../lib/supabaseClient.js'

export default function AuthPage({ mode }) {
  const isRegister = mode === 'register'
  const { user, loading, signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ fullName: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  if (!loading && user) return <Navigate to="/" replace />

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    const email = form.email.trim()
    if (isRegister && form.fullName.trim().length < 2) return setError('Please enter your full name.')
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Please enter a valid email address.')
    if (isRegister && form.password.length < 8) return setError('Password must be at least 8 characters.')
    if (!form.password) return setError('Please enter your password.')

    setBusy(true)
    const { data, error: err } = isRegister
      ? await signUp(email, form.password, form.fullName.trim())
      : await signIn(email, form.password)
    setBusy(false)

    if (err) return setError(err.message === 'Invalid login credentials' ? 'Wrong email or password.' : err.message)
    if (isRegister && !data.session) return setNotice('Account created. Check your email to confirm your address, then log in.')
    navigate('/')
  }

  return (
    <section className="container auth">
      <div className="auth__card">
        <h1>{isRegister ? 'Create your account' : 'Welcome back'}</h1>
        <p className="auth__sub">
          {isRegister ? 'One account lets you rent items and list your own.' : 'Log in to manage your rentals and listings.'}
        </p>
        {!isSupabaseConfigured && (
          <p className="form-error" role="alert">Supabase is not configured. Add your keys to the .env file and restart npm run dev.</p>
        )}
        <form onSubmit={handleSubmit} noValidate>
          {isRegister && (
            <div className="field">
              <label htmlFor="fullName">Full name</label>
              <input id="fullName" type="text" autoComplete="name" value={form.fullName} onChange={update('fullName')} />
            </div>
          )}
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" value={form.email} onChange={update('email')} />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} value={form.password} onChange={update('password')} />
            {isRegister && <span className="field__hint">At least 8 characters.</span>}
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          {notice && <p className="form-success" role="status">{notice}</p>}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy || !isSupabaseConfigured}>
            {busy ? 'Please wait…' : isRegister ? 'Create account' : 'Log in'}
          </button>
        </form>
        <p className="auth__switch">
          {isRegister ? <>Already have an account? <Link to="/login">Log in</Link></> : <>New to eRental? <Link to="/register">Create an account</Link></>}
        </p>
      </div>
    </section>
  )
}
