import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { formatDate, formatPrice, formatRate } from '../lib/format.js'
import { photoUrl, sortedPhotos } from '../lib/photos.js'
import { fieldsFor } from '../data/categoryFields.js'
import { useAuth } from '../context/AuthContext.jsx'
import ReportListing from '../components/ReportListing.jsx'
import ListingReviews from '../components/ListingReviews.jsx'
import OwnerRating from '../components/OwnerRating.jsx'
import MessageOwnerButton from '../components/MessageOwnerButton.jsx'
import RequestForm from '../components/RequestForm.jsx'
import EmptyState from '../components/EmptyState.jsx'
import LoadError from '../components/LoadError.jsx'
import { useListingRecord } from '../hooks/useListingRecord.js'
import VerifiedBadge from '../components/VerifiedBadge.jsx'
import Icon from '../components/Icon.jsx'
import '../styles/detail.css'

const FIELDS =
  'id, owner_id, title, description, price, price_period, deposit, location_text, terms, details, status, created_at, categories(name, slug), listing_photos(storage_path, sort_order), profiles(display_name, account_type, business_name, created_at, verified_kind, verified_at)'

function RentalPhoto({ path, alt, thumbnail = false }) {
  const [failed, setFailed] = useState(false)
  return failed ? (
    <span
      className={`rental-photo-fallback${thumbnail ? ' rental-photo-fallback--thumbnail' : ''}`}
    >
      <Icon name="image" size={thumbnail ? 24 : 40} />
      {!thumbnail && <span>This photo couldn’t be loaded.</span>}
    </span>
  ) : (
    <img
      src={photoUrl(path)}
      alt={alt}
      onError={() => setFailed(true)}
      loading={thumbnail ? 'lazy' : 'eager'}
    />
  )
}

export default function ListingDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const { listing, loading, error, retry } = useListingRecord(id, FIELDS)
  const [active, setActive] = useState(0)

  useEffect(() => {
    setActive(0)
  }, [id])

  if (loading)
    return (
      <section className="container page listing-detail" aria-busy="true">
        <p role="status">Loading listing…</p>
        <div className="listing-detail__loading" aria-hidden="true">
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      </section>
    )
  if (error)
    return (
      <section className="container page">
        <LoadError onRetry={retry}>{error}</LoadError>
      </section>
    )
  if (!listing) {
    return (
      <section className="container page">
        <EmptyState
          icon={<Icon name="search" size={32} />}
          title="Listing not found"
          action={
            <Link className="btn btn-primary" to="/">
              Back to home
            </Link>
          }
        >
          This listing may have been removed, or the link is wrong.
        </EmptyState>
      </section>
    )
  }

  const photos = sortedPhotos(listing.listing_photos)
  const owner = listing.profiles
  const ownerName =
    owner?.account_type === 'business' && owner.business_name
      ? owner.business_name
      : owner?.display_name || 'Listing owner'
  const specs = fieldsFor(listing.categories?.slug).filter(
    (f) => listing.details?.[f.key],
  )
  const activeIndex = Math.min(active, Math.max(0, photos.length - 1))

  return (
    <section className="container page listing-detail">
      <nav className="rental-breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <Icon name="chevronRight" size={14} />
        <Link to="/listings">Browse rentals</Link>
        {listing.categories?.slug && (
          <>
            <Icon name="chevronRight" size={14} />
            <Link to={`/listings?category=${listing.categories.slug}`}>
              {listing.categories.name}
            </Link>
          </>
        )}
      </nav>

      <header className="listing-detail__heading">
        <div>
          <p className="eyebrow">
            {listing.categories?.name || 'Rental listing'}
          </p>
          <h1>{listing.title}</h1>
          <div className="listing-detail__meta">
            <span>
              <Icon name="mapPin" size={18} />
              {listing.location_text}
            </span>
            <span>Listed {formatDate(listing.created_at)}</span>
          </div>
        </div>
        {user?.id === listing.owner_id && (
          <Link
            className="btn btn-ghost listing-detail__edit"
            to={`/listings/${listing.id}/edit`}
          >
            Edit this listing
            <Icon name="arrowRight" size={16} />
          </Link>
        )}
      </header>

      <div className="listing-detail__layout">
        <section className="rental-gallery" aria-label="Listing photos">
          <div className="gallery__main">
            {photos.length > 0 ? (
              <RentalPhoto
                key={photos[activeIndex].storage_path}
                path={photos[activeIndex].storage_path}
                alt={`${listing.title}, photo ${activeIndex + 1} of ${photos.length}`}
              />
            ) : (
              <span className="rental-photo-fallback">
                <Icon name="image" size={40} />
                <span>No photos added</span>
              </span>
            )}
            {photos.length > 0 && (
              <span className="rental-gallery__count">
                {activeIndex + 1} / {photos.length}
              </span>
            )}
          </div>
          {photos.length > 1 && (
            <div className="rental-gallery__navigation">
              <button
                type="button"
                className="rental-gallery__arrow"
                aria-label="Previous photo"
                disabled={activeIndex === 0}
                onClick={() => setActive(activeIndex - 1)}
              >
                <Icon name="arrowLeft" size={18} />
              </button>
              <ul className="gallery__thumbs">
                {photos.map((p, i) => (
                  <li key={p.storage_path}>
                    <button
                      type="button"
                      className={i === activeIndex ? 'is-active' : ''}
                      aria-label={`Show photo ${i + 1}`}
                      aria-current={i === activeIndex ? 'true' : undefined}
                      onClick={() => setActive(i)}
                    >
                      <RentalPhoto path={p.storage_path} alt="" thumbnail />
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="rental-gallery__arrow"
                aria-label="Next photo"
                disabled={activeIndex === photos.length - 1}
                onClick={() => setActive(activeIndex + 1)}
              >
                <Icon name="arrowRight" size={18} />
              </button>
            </div>
          )}
        </section>

        <aside
          className="rental-request"
          aria-label="Rental request and contact"
        >
          <div className="rental-request__rate">
            <p className="eyebrow">Your rental, your dates</p>
            {listing.status === 'unavailable' && (
              <span className="badge badge--inline">Currently unavailable</span>
            )}
            <p className="detail__price">
              {formatRate(listing.price, listing.price_period)}
            </p>
            {listing.deposit != null && (
              <p className="detail__meta">
                Deposit: {formatPrice(listing.deposit)}
              </p>
            )}
          </div>
          <RequestForm
            key={`request-${listing.id}-${user?.id ?? 'guest'}`}
            listing={listing}
          />
          <div className="rental-request__contact">
            <MessageOwnerButton listing={listing} />
          </div>
          <div className="rental-request__report">
            <ReportListing
              key={`report-${listing.id}-${user?.id ?? 'guest'}`}
              listing={listing}
            />
          </div>
        </aside>

        <div className="listing-detail__content">
          <section className="listing-detail__section">
            <h2>Description</h2>
            <p className="prewrap">{listing.description}</p>
          </section>
          {specs.length > 0 && (
            <section className="listing-detail__section">
              <h2>Details</h2>
              <dl className="specs">
                {specs.map((f) => (
                  <div key={f.key}>
                    <dt>{f.label}</dt>
                    <dd>{listing.details[f.key]}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          {listing.terms && (
            <section className="listing-detail__section">
              <h2>Rental terms and conditions</h2>
              <p className="prewrap">{listing.terms}</p>
            </section>
          )}

          <section
            className="owner-card rental-owner"
            aria-labelledby="rental-owner-title"
          >
            <div className="rental-owner__avatar" aria-hidden="true">
              <Icon
                name={owner?.account_type === 'business' ? 'building' : 'user'}
                size={28}
              />
            </div>
            <div className="rental-owner__identity">
              <p className="detail__meta" id="rental-owner-title">
                Listed by
              </p>
              <h2>{ownerName}</h2>
              <div className="rental-owner__badges">
                <VerifiedBadge profile={owner} />
                {owner?.account_type === 'business' && (
                  <span className="badge badge--inline">Rental business</span>
                )}
              </div>
              <OwnerRating ownerId={listing.owner_id} />
              {owner && (
                <p className="detail__meta">
                  Member since {formatDate(owner.created_at)}
                </p>
              )}
            </div>
          </section>

          <section
            className="listing-detail__section listing-detail__reviews"
            aria-label="Listing reviews"
          >
            <ListingReviews listingId={listing.id} />
          </section>
          <p className="notice">
            eRental does not inspect or guarantee the condition of listed items
            or properties. Renters and owners arrange handover directly with
            each other.
          </p>
        </div>
      </div>
    </section>
  )
}
