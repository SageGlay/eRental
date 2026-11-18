import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatRate } from '../lib/format.js'
import { photoUrl, sortedPhotos } from '../lib/photos.js'
import Icon from './Icon.jsx'
import '../styles/discovery.css'

export default function ListingCard({ listing }) {
  const cover = sortedPhotos(listing.listing_photos)[0]
  const coverUrl = cover ? photoUrl(cover.storage_path) : null
  const [failedUrl, setFailedUrl] = useState(null)

  return (
    <Link className="listing-card rental-card" to={`/listings/${listing.id}`}>
      <div className="listing-card__media">
        {coverUrl && failedUrl !== coverUrl ? (
          <img src={coverUrl} alt={listing.title} loading="lazy" decoding="async" onError={() => setFailedUrl(coverUrl)} />
        ) : (
          <span className="rental-card__placeholder"><Icon name="image" size={36} /><span>{coverUrl ? 'Photo unavailable' : 'No photo yet'}</span></span>
        )}
        {listing.status === 'unavailable' && <span className="rental-card__availability">Unavailable</span>}
      </div>
      <div className="listing-card__body">
        <p className="listing-card__category">{listing.categories?.name}</p>
        <h3>{listing.title}</h3>
        <p className="listing-card__location"><Icon name="mapPin" size={16} />{listing.location_text}</p>
        <div className="rental-card__bottom">
          <p className="listing-card__price">{formatRate(listing.price, listing.price_period)}</p>
          <Icon name="arrowRight" size={18} />
        </div>
      </div>
    </Link>
  )
}
