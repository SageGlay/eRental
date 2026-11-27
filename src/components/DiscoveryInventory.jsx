import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSavedListings } from '../context/SavedListingsContext.jsx'
import { useLatestListings } from '../hooks/useListings.js'
import {
  clearHistory, discoveryCategories, featuredRentals, ownerName, readHistory, readRecommendations,
} from '../lib/discovery.js'
import EmptyState from './EmptyState.jsx'
import Icon from './Icon.jsx'
import ListingCard from './ListingCard.jsx'
import ListingSkeleton from './ListingSkeleton.jsx'
import LoadError from './LoadError.jsx'

function useDiscoveryRead(read) {
  const [state, setState] = useState(null)
  const [revision, setRevision] = useState(0)
  const retry = useCallback(() => setRevision(value => value + 1), [])
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    read(controller.signal)
      .then(data => { if (active) setState({ read, revision, data }) })
      .catch(() => { if (active) setState({ read, revision, error: true }) })
      .finally(() => clearTimeout(timeout))
    return () => { active = false; controller.abort(); clearTimeout(timeout) }
  }, [read, revision])
  const current = state?.read === read && state.revision === revision ? state : null
  return { data: current?.data, error: current?.error, retry }
}

function RentalGrid({ rows, featured = false }) {
  return (
    <ul className={'listing-grid' + (featured ? ' discovery-featured-grid' : '')}>
      {rows.map(item => (
        <li key={item.id}>
          <ListingCard listing={item} />
          {featured && <p className="discovery-owner"><Icon name="user" size={16} />Listed by {ownerName(item)}</p>}
        </li>
      ))}
    </ul>
  )
}

export default function DiscoveryInventory({ userId }) {
  const latest = useLatestListings(32)
  const { savedIds, savedCategoryIds } = useSavedListings()
  const loadHistory = useCallback(signal => readHistory(userId, signal), [userId])
  const history = useDiscoveryRead(loadHistory)
  const recent = history.data?.rows || []
  const categories = discoveryCategories(recent, savedCategoryIds).join(',')
  const loadMatches = useCallback(
    signal => categories ? readRecommendations(categories.split(',').map(Number), signal) : Promise.resolve([]),
    [categories],
  )
  const matches = useDiscoveryRead(loadMatches)
  const [clearing, setClearing] = useState(false)
  const [clearError, setClearError] = useState(false)
  const inventoryHeading = useRef(null)

  useEffect(() => {
    const reload = event => { if (event.detail === userId) history.retry() }
    window.addEventListener('erental:recent-listings', reload)
    return () => window.removeEventListener('erental:recent-listings', reload)
  }, [userId, history.retry])

  async function clear() {
    if (clearing) return
    setClearing(true)
    setClearError(false)
    try {
      await clearHistory(userId)
      inventoryHeading.current?.focus()
      history.retry()
    } catch {
      setClearError(true)
    } finally {
      setClearing(false)
    }
  }

  const featured = featuredRentals(latest.listings)
  const shown = new Set(recent.map(row => row.id))
  for (const item of featured) shown.add(item.id)
  const recommended = (matches.data || []).filter(row => !shown.has(row.id) && !savedIds.has(row.id)).slice(0, 4)
  for (const item of recommended) shown.add(item.id)
  const remaining = latest.listings.filter(row => !shown.has(row.id)).slice(0, 8)

  return (
    <>
      {featured.length > 0 && (
        <section className="discovery-section discovery-featured" aria-labelledby="featured-title">
          <div className="home-section-head"><h2 id="featured-title">Featured listings</h2></div>
          <RentalGrid rows={featured} featured />
        </section>
      )}

      {(recommended.length > 0 || matches.error) && (
        <section className="discovery-section" aria-labelledby="recommended-title">
          <div className="home-section-head"><h2 id="recommended-title">From your categories</h2></div>
          {matches.error
            ? <LoadError onRetry={matches.retry}>We couldn’t load recommendations. Try again.</LoadError>
            : <><p className="discovery-caption">Based on rentals you’ve viewed or saved.</p><RentalGrid rows={recommended} /></>}
        </section>
      )}

      <section className="home-latest" aria-labelledby="latest-title">
        <div className="home-section-head">
          <h2 id="latest-title" ref={inventoryHeading} tabIndex={-1}>Latest listings</h2>
          <Link className="home-text-link" to="/listings?sort=newest">View all <Icon name="arrowRight" size={16} /></Link>
        </div>
        {latest.loading && <><p className="sr-only" role="status">Loading listings…</p><ListingSkeleton count={4} /></>}
        {latest.error && <LoadError onRetry={latest.retry}>{latest.error}</LoadError>}
        {!latest.loading && !latest.error && latest.listings.length === 0 && (
          <EmptyState icon={<Icon name="box" size={32} />} title="No listings yet" action={<Link className="btn btn-primary" to="/list">List an item</Link>}>
            Have something to rent out in Iligan? Add photos, a rate and your pickup area.
          </EmptyState>
        )}
        {remaining.length > 0 && <RentalGrid rows={remaining} />}
        {!latest.loading && !latest.error && latest.listings.length > 0 && !remaining.length && (
          <p className="discovery-caption">You’ve reached the end of the latest rentals.</p>
        )}
      </section>

      {(history.data?.hasHistory || history.error) && (
        <section className="discovery-section" aria-labelledby="recent-title">
          <div className="home-section-head">
            <h2 id="recent-title">Recently viewed</h2>
            {history.data?.hasHistory && (
              <button type="button" className="btn btn-ghost" disabled={clearing} onClick={clear}>
                {clearing ? 'Clearing…' : 'Clear history'}
              </button>
            )}
          </div>
          {history.error && <LoadError onRetry={history.retry}>We couldn’t load recently viewed rentals. Try again.</LoadError>}
          {clearError && <p className="form-error" role="alert">We couldn’t clear your viewing history. Try again.</p>}
          {recent.length > 0 && <RentalGrid rows={recent} />}
          {history.data?.hasHistory && !recent.length && <p>Your previously viewed rentals are no longer visible.</p>}
        </section>
      )}
    </>
  )
}
