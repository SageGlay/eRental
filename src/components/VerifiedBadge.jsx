import { isVerified } from '../lib/verification.js'

export default function VerifiedBadge({ profile }) {
  if (!isVerified(profile)) return null
  return (
    <span className="verified-badge">
      {profile.verified_kind === 'business'
        ? 'Business verified'
        : 'Identity verified'}
    </span>
  )
}
