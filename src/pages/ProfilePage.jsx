import { useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'

function ProfileForm({ user, profile, onSaved }) {
  const [displayName, setDisplayName] = useState(profile.display_name)
  const [accountType, setAccountType] = useState(profile.account_type)
  const [businessName, setBusinessName] = useState(profile.business_name ?? '')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaved(false)
    const name = displayName.trim()
    const business = businessName.trim()
    if (name.length < 1 || name.length > 80) return setError('Display name must be 1 to 80 characters.')
    if (accountType === 'business' && (business.length < 2 || business.length > 120)) {
      return setError('Please enter your business name (2 to 120 characters).')
    }

    setBusy(true)
    const { error: err } = await supabase
      .from('profiles')
      .update({ display_name: name, account_type: accountType, business_name: accountType === 'business' ? business : null })
      .eq('id', user.id)
    setBusy(false)

    if (err) return setError(`We couldn’t save your profile. ${err.message}`)
    setSaved(true)
    onSaved()
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor="displayName">Display name</label>
        <input id="displayName" type="text" maxLength={80} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <span className="field__hint">Shown to other users on your listings and requests. Your email is never shown publicly.</span>
      </div>
      <fieldset className="field--choices">
        <legend>Account type</legend>
        <label className="choice">
          <input type="radio" name="accountType" checked={accountType === 'individual'} onChange={() => setAccountType('individual')} />
          Individual
        </label>
        <label className="choice">
          <input type="radio" name="accountType" checked={accountType === 'business'} onChange={() => setAccountType('business')} />
          Rental business
        </label>
        <span className="field__hint">Either type can both rent items and list items.</span>
      </fieldset>
      {accountType === 'business' && (
        <div className="field">
          <label htmlFor="businessName">Business name</label>
          <input id="businessName" type="text" maxLength={120} value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      {saved && <p className="form-success" role="status">Profile saved.</p>}
      <button type="submit" className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
    </form>
  )
}

export default function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth()
  return (
    <section className="container auth">
      <div className="auth__card">
        <h1>My profile</h1>
        <p className="auth__sub">{user.email}</p>
        {profile ? <ProfileForm user={user} profile={profile} onSaved={refreshProfile} /> : <p aria-busy="true">Loading your profile…</p>}
      </div>
    </section>
  )
}
