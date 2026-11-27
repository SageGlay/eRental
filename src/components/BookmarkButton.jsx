import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useSavedListings } from '../context/SavedListingsContext.jsx'
import Icon from './Icon.jsx'

export default function BookmarkButton({ listing, compact = false }) {
  const { user, loading: authLoading } = useAuth()
  const { savedIds, loading, error, pending, refresh, setSaved } = useSavedListings()
  const navigate = useNavigate()
  if (!listing || listing.status === 'removed' || listing.removed_by_admin) return null
  const saved = savedIds.has(listing.id)
  const busy = authLoading || loading || pending.includes(listing.id)
  const text = error ? 'Retry saved status' : saved ? 'Remove from saved' : 'Save listing'
  const name = !user && !authLoading ? `Log in to save ${listing.title}` : `${text}: ${listing.title}`
  function act() {
    if (!user) return navigate('/login', { state: { returnTo: '/listings/' + listing.id } })
    if (error) return refresh()
    setSaved(listing, !saved)
  }
  return (
    <button type="button" onClick={act} disabled={busy}
      className={`bookmark-button btn btn-ghost${compact ? ' bookmark-button--compact' : ''}`}
      aria-label={name} title={name} aria-busy={busy}
      aria-pressed={user && !loading && !error ? saved : undefined}>
      <Icon name={busy ? 'clock' : error ? 'refresh' : 'bookmark'} size={20} />
      {!compact && <span>{busy ? 'Checking…' : text}</span>}
    </button>
  )
}
