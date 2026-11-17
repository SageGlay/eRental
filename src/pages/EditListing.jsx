import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import CreateListing from './CreateListing.jsx'
import EmptyState from '../components/EmptyState.jsx'
import LoadError from '../components/LoadError.jsx'
import { useListingRecord } from '../hooks/useListingRecord.js'

const FIELDS = 'id, owner_id, category_id, title, description, price, price_period, deposit, location_text, terms, details, status, removed_by_admin, listing_photos(id, storage_path, sort_order)'

// Loads a listing and reuses the create form in "edit" mode. Only the owner can edit.
export default function EditListing() {
  const { id } = useParams()
  const { user } = useAuth()
  const { listing, loading, error, retry } = useListingRecord(id, FIELDS)
  if (loading) return <p className="container page" aria-busy="true">Loading…</p>
  if (error) return <section className="container page"><LoadError onRetry={retry}>{error}</LoadError></section>
  if (!listing || listing.owner_id !== user.id || listing.status === 'removed' || listing.removed_by_admin) {
    return (
      <section className="container page">
        <EmptyState icon="🔒" title="You can’t edit this listing" action={<Link className="btn btn-primary" to="/my-listings">Go to my listings</Link>}>
          It may not exist, may have been removed, or may belong to someone else.
        </EmptyState>
      </section>
    )
  }
  return <CreateListing key={listing.id} listing={listing} />
}
