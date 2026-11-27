import { useCallback, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { CARD_FIELDS, ownerName, visibleRental } from '../lib/discovery.js'
import { UUID_PATTERN, readReviewSummary } from '../lib/reviewTrust.js'
import useReviewResource from '../hooks/useReviewResource.js'
import EmptyState from '../components/EmptyState.jsx'
import ListingCard from '../components/ListingCard.jsx'
import ListingSkeleton from '../components/ListingSkeleton.jsx'
import LoadError from '../components/LoadError.jsx'
import PageHeading from '../components/PageHeading.jsx'
import ReviewSummary from '../components/ReviewSummary.jsx'
import VerifiedBadge from '../components/VerifiedBadge.jsx'
import '../styles/review-trust.css'

const pageSize = 12
const ownerFields = 'id,display_name,business_name,account_type,verified_kind,verified_at'

function OwnerProfile({ ownerId }) {
  const [page, setPage] = useState(1)
  const resultsHeading = useRef(null)
  const loadOwner = useCallback(async signal => {
    if (!UUID_PATTERN.test(ownerId)) return null
    const { data, error } = await supabase.from('profiles').select(ownerFields).eq('id', ownerId).maybeSingle().abortSignal(signal)
    if (error) throw error
    return data
  }, [ownerId])
  const loadRating = useCallback(signal => readReviewSummary({ p_owner_id: ownerId }, signal), [ownerId])
  const loadListings = useCallback(async signal => {
    const offset = (page - 1) * pageSize
    const { data, error } = await supabase.from('listings')
      .select(CARD_FIELDS).eq('owner_id', ownerId).in('status', ['available', 'unavailable']).eq('removed_by_admin', false)
      .order('created_at', { ascending: false }).order('id').range(offset, offset + pageSize).abortSignal(signal)
    if (error) throw error
    return (data ?? []).filter(visibleRental)
  }, [ownerId, page])
  const owner = useReviewResource(loadOwner)

  if (owner.loading) return <p className="container page" role="status">Loading owner profile…</p>
  if (owner.error) return <section className="container page"><PageHeading title="Owner profile" /><LoadError onRetry={owner.refresh}>We couldn’t load this owner profile.</LoadError></section>
  if (!owner.data) {
    return (
      <section className="container page">
        <PageHeading title="Owner unavailable" />
        <EmptyState title="This profile could not be found" action={<Link className="btn btn-primary" to="/listings">Browse rentals</Link>}>
          The profile may have been removed.
        </EmptyState>
      </section>
    )
  }

  return (
    <section className="container page owner-profile-page">
      <PageHeading title={ownerName({ profiles: owner.data }) || 'Marketplace owner'}>
        <VerifiedBadge profile={owner.data} />
      </PageHeading>
      <OwnerListings
        loadRating={loadRating}
        loadListings={loadListings}
        heading={resultsHeading}
        page={page}
        onPage={next => { setPage(next); resultsHeading.current?.focus() }}
      />
    </section>
  )
}

function OwnerListings({ loadRating, loadListings, heading, page, onPage }) {
  const rating = useReviewResource(loadRating)
  const listings = useReviewResource(loadListings)
  const rows = listings.data ?? []
  return (
    <>
      <section className="owner-profile-section" aria-labelledby="owner-rating-title">
        <h2 id="owner-rating-title">Owner rating</h2>
        {rating.loading && <p role="status">Loading rating…</p>}
        {rating.error && <LoadError onRetry={rating.refresh}>We couldn’t load the owner’s rating.</LoadError>}
        {rating.data && <ReviewSummary summary={rating.data} />}
      </section>
      <section className="owner-profile-section" aria-labelledby="owner-listings-title">
        <h2 ref={heading} id="owner-listings-title" tabIndex={-1}>Published rentals</h2>
        {listings.loading && <><p className="sr-only" role="status">Loading rentals…</p><ListingSkeleton count={3} /></>}
        {listings.error && <LoadError onRetry={listings.refresh}>We couldn’t load this owner’s rentals.</LoadError>}
        {listings.data && rows.length === 0 && <p className="detail__meta">{page === 1 ? 'This owner has no published rentals.' : 'There are no more rentals on this page.'}</p>}
        {rows.length > 0 && <ul className="listing-grid">{rows.slice(0, pageSize).map(listing => <li key={listing.id}><ListingCard listing={listing} /></li>)}</ul>}
        {(page > 1 || rows.length > pageSize) && (
          <nav className="review-pagination" aria-label="Published rental pages">
            <button type="button" className="btn btn-ghost" disabled={page === 1} onClick={() => onPage(page - 1)}>Previous</button>
            <span>Page {page}</span>
            <button type="button" className="btn btn-ghost" disabled={rows.length <= pageSize} onClick={() => onPage(page + 1)}>Next</button>
          </nav>
        )}
      </section>
    </>
  )
}

export default function OwnerProfilePage() {
  const { id } = useParams()
  return <OwnerProfile key={id} ownerId={id} />
}
