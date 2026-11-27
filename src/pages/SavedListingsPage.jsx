import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSavedListings } from '../context/SavedListingsContext.jsx'
import { supabase } from '../lib/supabaseClient.js'
import { CARD_FIELDS, visibleRental } from '../lib/discovery.js'
import Icon from '../components/Icon.jsx'
import EmptyState from '../components/EmptyState.jsx'
import ListingCard from '../components/ListingCard.jsx'
import ListingSkeleton from '../components/ListingSkeleton.jsx'
import LoadError from '../components/LoadError.jsx'
import PageHeading from '../components/PageHeading.jsx'

const pageSize = 12

export default function SavedListingsPage() {
  const { rows, loading, error, refresh, pending, setSaved } = useSavedListings()
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [cards, setCards] = useState(null)
  const heading = useRef(null)
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const currentPage = Math.min(page, pages)
  const start = (currentPage - 1) * pageSize
  const ids = rows.slice(start, start + pageSize).map(row => row.listing_id).join(',')

  // Request only the cards on this page, with the user's normal listing visibility.
  useEffect(() => {
    if (!ids) return
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    let active = true
    const orderedIds = ids.split(',')
    setCards(null)
    async function load() {
      try {
        const { data, error } = await supabase.from('listings').select(CARD_FIELDS)
          .in('id', orderedIds).in('status', ['available', 'unavailable'])
          .eq('removed_by_admin', false).abortSignal(controller.signal)
        if (error) throw error
        const visible = new Map(data.filter(visibleRental)
          .map(item => [item.id, item]))
        if (active) setCards({ ids, items: visible })
      } catch {
        if (active) setCards({ ids, error: 'We couldn’t load these rentals. Check your connection and try again.' })
      } finally {
        clearTimeout(timer)
      }
    }
    load()
    return () => { active = false; clearTimeout(timer); controller.abort() }
  }, [ids, revision])

  const previousIds = useRef(null)
  useEffect(() => {
    if (previousIds.current && previousIds.current !== ids && document.activeElement === document.body)
      heading.current?.focus()
    previousIds.current = ids
  }, [ids])

  const current = cards?.ids === ids ? cards : null
  const busy = loading || Boolean(ids && !current)
  function retry() {
    refresh()
    setRevision(value => value + 1)
  }

  return (
    <div className="container page saved-page">
      <PageHeading title="Saved listings" titleRef={heading} />
      {(error || current?.error) ? (
        <LoadError onRetry={retry}>{error || current.error}</LoadError>
      ) : busy ? (
        <><p role="status" className="sr-only">Loading saved listings…</p><ListingSkeleton count={3} /></>
      ) : rows.length === 0 ? (
        <EmptyState title="No saved listings yet" icon={<Icon name="bookmark" size={30} />}
          action={<Link className="btn btn-primary" to="/listings">Browse rentals</Link>}>
          Save a rental to find it here when you’re ready.
        </EmptyState>
      ) : (
        <>
          <ul className="listing-grid" aria-label="Saved rentals">
            {rows.slice(start, start + pageSize).map(({ listing_id: id, listings }) => {
              const item = listings && current.items.get(id)
              return <li key={id}>{item ? <ListingCard listing={item} /> : (
                <div className="saved-unlisted">
                  <Icon name="bookmark" size={24} />
                  <h2>Listing no longer visible</h2>
                  <button type="button" className="btn btn-ghost" disabled={pending.includes(id)}
                    onClick={() => setSaved({ id }, false)}>Remove from saved</button>
                </div>
              )}</li>
            })}
          </ul>
          {pages > 1 && (
            <nav className="saved-pagination" aria-label="Saved listings pages">
              <button type="button" className="btn btn-ghost" disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}>Previous</button>
              <span>Page {currentPage} of {pages}</span>
              <button type="button" className="btn btn-ghost" disabled={currentPage === pages}
                onClick={() => setPage(currentPage + 1)}>Next</button>
            </nav>
          )}
        </>
      )}
    </div>
  )
}
