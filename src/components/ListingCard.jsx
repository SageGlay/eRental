import { Link } from 'react-router-dom'
import { formatRate } from '../lib/format.js'
import { photoUrl, sortedPhotos } from '../lib/photos.js'

export default function ListingCard({ listing }) {
  const cover = sortedPhotos(listing.listing_photos)[0]
  return (
    <Link className="listing-card" to={`/listings/${listing.id}`}>
      <div className="listing-card__media">
        {cover ? <img src={photoUrl(cover.storage_path)} alt={listing.title} loading="lazy" /> : <span aria-hidden="true">📷</span>}
        {listing.status === 'unavailable' && <span className="badge">Unavailable</span>}
      </div>
      <div className="listing-card__body">
        <p className="listing-card__category">{listing.categories?.name}</p>
        <h3>{listing.title}</h3>
        <p className="listing-card__price">{formatRate(listing.price, listing.price_period)}</p>
        <p className="listing-card__location">📍 {listing.location_text}</p>
      </div>
    </Link>
  )
}
