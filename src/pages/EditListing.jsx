import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import CreateListing from './CreateListing.jsx'
import EmptyState from '../components/EmptyState.jsx'
import LoadError from '../components/LoadError.jsx'
import Icon from '../components/Icon.jsx'
import PageHeading from '../components/PageHeading.jsx'
import { useListingRecord } from '../hooks/useListingRecord.js'

const FIELDS =
  'id, owner_id, category_id, title, description, price, price_period, deposit, location_text, terms, details, status, removed_by_admin, listing_photos(id, storage_path, sort_order)'

// Loads a listing and reuses the create form in "edit" mode. Only the owner can edit.
export default function EditListing() {
  const { id } = useParams()
  const { user } = useAuth()
  const { listing, loading, error, retry } = useListingRecord(id, FIELDS)
  if (loading)
    return (
      <section className="container page" aria-busy="true">
        <PageHeading eyebrow="Owner workspace" title="Edit listing">
          Update the details renters see before they send a request.
        </PageHeading>
        <p role="status">Loading…</p>
        <div className="owner-editor__section" aria-hidden="true">
          <div className="skeleton skeleton--line" />
          <div className="skeleton skeleton--short" />
        </div>
      </section>
    )
  if (error)
    return (
      <section className="container page">
        <PageHeading eyebrow="Owner workspace" title="Edit listing">
          Your listing details couldn’t be loaded. Try again to continue
          editing.
        </PageHeading>
        <LoadError onRetry={retry}>{error}</LoadError>
      </section>
    )
  if (
    !listing ||
    listing.owner_id !== user.id ||
    listing.status === 'removed' ||
    listing.removed_by_admin
  ) {
    return (
      <section className="container page">
        <PageHeading eyebrow="Owner workspace" title="Edit listing">
          Manage rental details from your own listings.
        </PageHeading>
        <EmptyState
          icon={<Icon name="shield" size={30} />}
          title="You can’t edit this listing"
          action={
            <Link className="btn btn-primary" to="/my-listings">
              Go to my listings
            </Link>
          }
        >
          It may not exist, may have been removed, or may belong to someone
          else.
        </EmptyState>
      </section>
    )
  }
  return <CreateListing key={listing.id} listing={listing} />
}
