import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
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

const FIELDS = 'id, owner_id, title, description, price, price_period, deposit, location_text, terms, details, status, created_at, categories(name, slug), listing_photos(storage_path, sort_order), profiles(display_name, account_type, business_name, created_at)'

export default function ListingDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const [state, setState] = useState({ listing: null, loading: Boolean(supabase), error: supabase ? null : 'Supabase is not configured.' })
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    setState({ listing: null, loading: true, error: null })
    setActive(0)
    supabase.from('listings').select(FIELDS).eq('id', id).maybeSingle().then(({ data, error }) => {
      if (!cancelled) setState({ listing: data, loading: false, error: error ? error.message : null })
    })
    return () => { cancelled = true }
  }, [id])

  const { listing, loading, error } = state
  if (loading) return <p className="container page" aria-busy="true">Loading listing…</p>
  if (error || !listing) {
    return (
      <section className="container page">
        <EmptyState icon="🔍" title="Listing not found" action={<Link className="btn btn-primary" to="/">Back to home</Link>}>
          This listing may have been removed, or the link is wrong.
        </EmptyState>
      </section>
    )
  }

  const photos = sortedPhotos(listing.listing_photos)
  const owner = listing.profiles
  const specs = fieldsFor(listing.categories?.slug).filter((f) => listing.details?.[f.key])

  return (
    <section className="container page">
      <p className="breadcrumb"><Link to="/">Home</Link> › {listing.categories?.name}</p>
      <div className="detail">
        <div>
          <div className="gallery__main">
            {photos.length > 0
              ? <img src={photoUrl(photos[active].storage_path)} alt={`${listing.title}, photo ${active + 1} of ${photos.length}`} />
              : <span aria-hidden="true">📷</span>}
          </div>
          {photos.length > 1 && (
            <ul className="gallery__thumbs">
              {photos.map((p, i) => (
                <li key={p.storage_path}>
                  <button type="button" className={i === active ? 'is-active' : ''} aria-label={`Show photo ${i + 1}`} aria-current={i === active} onClick={() => setActive(i)}>
                    <img src={photoUrl(p.storage_path)} alt="" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          {listing.status === 'unavailable' && <span className="badge badge--inline">Currently unavailable</span>}
          <h1>{listing.title}</h1>
          {user?.id === listing.owner_id && <Link className="btn btn-ghost" to={`/listings/${listing.id}/edit`}>Edit this listing</Link>}
          <p className="detail__price">{formatRate(listing.price, listing.price_period)}</p>
          {listing.deposit != null && <p className="detail__meta">Deposit: {formatPrice(listing.deposit)}</p>}
          <p className="detail__meta">📍 {listing.location_text}</p>
          <p className="detail__meta">Listed {formatDate(listing.created_at)}</p>
          <div className="owner-card">
            <p className="detail__meta">Listed by</p>
            <strong>{owner?.account_type === 'business' && owner.business_name ? owner.business_name : owner?.display_name}</strong>
            {owner?.account_type === 'business' && <span className="badge badge--inline">Rental business</span>}
            <OwnerRating ownerId={listing.owner_id} />
            <p className="detail__meta">Member since {owner ? formatDate(owner.created_at) : ''}</p>
          </div>
          <MessageOwnerButton listing={listing} />
          <RequestForm listing={listing} />
          <ReportListing listing={listing} />
        </div>
      </div>

      <div className="detail__body">
        <h2>Description</h2>
        <p className="prewrap">{listing.description}</p>
        {specs.length > 0 && (
          <>
            <h2>Details</h2>
            <dl className="specs">
              {specs.map((f) => <div key={f.key}><dt>{f.label}</dt><dd>{listing.details[f.key]}</dd></div>)}
            </dl>
          </>
        )}
        {listing.terms && (
          <>
            <h2>Rental terms and conditions</h2>
            <p className="prewrap">{listing.terms}</p>
          </>
        )}
        <ListingReviews listingId={listing.id} />
        <p className="notice">eRental does not inspect or guarantee the condition of listed items or properties. Renters and owners arrange handover directly with each other.</p>
      </div>
    </section>
  )
}
