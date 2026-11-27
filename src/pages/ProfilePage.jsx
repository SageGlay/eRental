import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import LoadError from '../components/LoadError.jsx'
import VerifiedBadge from '../components/VerifiedBadge.jsx'
import ThemeControl from '../components/ThemeControl.jsx'
import PageHeading from '../components/PageHeading.jsx'
import BlockedAccounts from '../components/BlockedAccounts.jsx'
import Icon from '../components/Icon.jsx'
import UnsavedChangesGuard from '../components/UnsavedChangesGuard.jsx'
import '../styles/profile.css'

function ProfileForm({ user, profile, onSaved }) {
  const [displayName, setDisplayName] = useState(profile.display_name)
  const [accountType, setAccountType] = useState(profile.account_type)
  const [businessName, setBusinessName] = useState(profile.business_name ?? '')
  const [error, setError] = useState('')
  const [invalidField, setInvalidField] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [baseline, setBaseline] = useState({
    displayName: profile.display_name,
    accountType: profile.account_type,
    businessName: profile.business_name ?? '',
  })
  const submitting = useRef(false)
  const nameInput = useRef(null)
  const businessInput = useRef(null)
  const dirty =
    displayName !== baseline.displayName ||
    accountType !== baseline.accountType ||
    (accountType === 'business' && businessName !== baseline.businessName)

  function invalid(field, message) {
    setError(message)
    setInvalidField(field)
    ;(field === 'displayName' ? nameInput : businessInput).current?.focus()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting.current) return
    setError('')
    setInvalidField('')
    setSaved(false)
    const name = displayName.trim()
    const business = businessName.trim()
    if (name.length < 1 || name.length > 80)
      return invalid('displayName', 'Display name must be 1 to 80 characters.')
    if (
      accountType === 'business' &&
      (business.length < 2 || business.length > 120)
    ) {
      return invalid(
        'businessName',
        'Please enter your business name (2 to 120 characters).',
      )
    }

    setBusy(true)
    submitting.current = true
    try {
      const { data, error: err } = await supabase
        .from('profiles')
        .update({
          display_name: name,
          account_type: accountType,
          business_name: accountType === 'business' ? business : null,
        })
        .eq('id', user.id)
        .select('id')
        .single()
      if (err || !data)
        return setError(
          'We couldn’t save your profile. Try again. Your changes are still here.',
        )
      setDisplayName(name)
      setBusinessName(accountType === 'business' ? business : '')
      setBaseline({
        displayName: name,
        accountType,
        businessName: accountType === 'business' ? business : '',
      })
      setSaved(true)
      onSaved()
    } catch {
      setError(
        'We couldn’t confirm your profile was saved. Try again. Your changes are still here.',
      )
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <form
      className="profile-form"
      onSubmit={handleSubmit}
      noValidate
      aria-busy={busy}
    >
      <UnsavedChangesGuard dirty={dirty && !busy} />
      <div className="profile-section-heading">
        <Icon name="user" />
        <div>
          <h2>Public profile</h2>
          <p>Choose how your name appears on listings and rental requests.</p>
        </div>
      </div>
      <fieldset className="form-controls" disabled={busy}>
        <div className="field">
          <label htmlFor="displayName">Display name</label>
          <input
            ref={nameInput}
            id="displayName"
            type="text"
            autoComplete="name"
            maxLength={80}
            value={displayName}
            aria-invalid={invalidField === 'displayName' || undefined}
            aria-describedby={`displayName-hint${invalidField === 'displayName' ? ' profile-error' : ''}`}
            onChange={(e) => {
              setDisplayName(e.target.value)
              setSaved(false)
            }}
          />
          <span className="field__hint" id="displayName-hint">
            Use a name renters and owners will recognize.
          </span>
        </div>
        <fieldset className="field--choices profile-account-choices">
          <legend>Account type</legend>
          <div className="profile-account-options">
            <label
              className={`choice profile-account-choice${accountType === 'individual' ? ' is-selected' : ''}`}
            >
              <input
                type="radio"
                name="accountType"
                checked={accountType === 'individual'}
                onChange={() => {
                  setAccountType('individual')
                  setSaved(false)
                }}
              />
              <span>
                <strong>Individual</strong>
                <span>Rent for yourself or list things you own.</span>
              </span>
            </label>
            <label
              className={`choice profile-account-choice${accountType === 'business' ? ' is-selected' : ''}`}
            >
              <input
                type="radio"
                name="accountType"
                checked={accountType === 'business'}
                onChange={() => {
                  setAccountType('business')
                  setSaved(false)
                }}
              />
              <span>
                <strong>Rental business</strong>
                <span>Represent your rental business.</span>
              </span>
            </label>
          </div>
        </fieldset>
        {accountType === 'business' && (
          <div className="field">
            <label htmlFor="businessName">Business name</label>
            <input
              ref={businessInput}
              id="businessName"
              type="text"
              autoComplete="organization"
              maxLength={120}
              value={businessName}
              aria-invalid={invalidField === 'businessName' || undefined}
              aria-describedby={
                invalidField === 'businessName' ? 'profile-error' : undefined
              }
              onChange={(e) => {
                setBusinessName(e.target.value)
                setSaved(false)
              }}
            />
          </div>
        )}
      </fieldset>
      <div className="profile-verification-note">
        <Icon name="shield" />
        <p>
          Changing your display name, business name or account type clears an
          existing verification and requires a new review.
        </p>
      </div>
      {error && (
        <p id="profile-error" className="form-error" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="form-success" role="status">
          Profile saved.
        </p>
      )}
      <div className="profile-save">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}

export default function ProfilePage() {
  const { user, profile, profileLoading, profileError, refreshProfile } =
    useAuth()
  const authoritativeProfile = !profileLoading && !profileError ? profile : null
  return (
    <section className="container page profile-page">
      <PageHeading title="My profile" />
      <div className="profile-layout">
        <aside className="profile-sidebar" aria-label="Account overview">
          <div className="profile-identity">
            <span className="profile-avatar" aria-hidden="true">
              {profile?.display_name?.trim().slice(0, 1).toUpperCase() || (
                <Icon name="user" size={28} />
              )}
            </span>
            <div>
              <h2>{profile?.display_name || 'Your account'}</h2>
              {authoritativeProfile && (
                <p className="profile-kind">
                  {authoritativeProfile.account_type === 'business'
                    ? 'Rental business'
                    : 'Individual account'}
                </p>
              )}
              <VerifiedBadge profile={authoritativeProfile} />
            </div>
          </div>
          <nav className="profile-index" aria-label="Profile sections">
            <a href="#public-profile">
              <Icon name="user" size={18} /> Public profile
            </a>
            <Link to="/verification">
              <Icon name="shield" size={18} /> Account verification
            </Link>
            <a href="#account-settings">
              <Icon name="sliders" size={18} /> Account settings
            </a>
          </nav>
        </aside>
        <div className="profile-editor">
          <section id="public-profile" aria-label="Edit public profile">
            {profileError && (
              <LoadError onRetry={refreshProfile}>{profileError}</LoadError>
            )}
            {profile ? (
              <ProfileForm
                key={user.id}
                user={user}
                profile={profile}
                onSaved={refreshProfile}
              />
            ) : profileLoading ? (
              <div className="profile-loading" role="status" aria-busy="true">
                <span className="skeleton skeleton--line" aria-hidden="true" />
                <p>Loading your profile…</p>
              </div>
            ) : null}
          </section>
          <section
            id="account-settings"
            className="profile-settings"
            aria-labelledby="settings-heading"
          >
            <h2 id="settings-heading">Account settings</h2>
            <div className="profile-settings__row">
              <div>
                <h3>Sign-in email</h3>
                <p>{user.email}</p>
              </div>
              <Link to="/forgot-password" className="btn btn-small">
                Reset password
              </Link>
            </div>
            <div className="profile-settings__row">
              <div>
                <h3>Appearance</h3>
                <p>Choose a color theme for this browser.</p>
              </div>
              <ThemeControl />
            </div>
            <div className="profile-settings__row">
              <div>
                <h3>Marketplace information</h3>
                <p><Link to="/terms">Terms and conditions</Link> · <Link to="/privacy">Privacy notice</Link></p>
              </div>
            </div>
            <BlockedAccounts key={user.id} userId={user.id} />
          </section>
        </div>
      </div>
    </section>
  )
}
