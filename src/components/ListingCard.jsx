import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatPrice } from '../lib/format.js'
import { photoUrl, sortedPhotos } from '../lib/photos.js'
import Icon from './Icon.jsx'
import VerifiedBadge from './VerifiedBadge.jsx'
import '../styles/discovery.css'

export default function ListingCard({ listing }) {
  const cover = sortedPhotos(listing.listing_photos)[0]
  const coverUrl = cover ? photoUrl(cover.storage_path) : null
  const [failedUrl, setFailedUrl] = useState(null)

  return (
    <Link className="listing-card rental-card" to={'/listings/' + listing.id}>
      <div className="listing-card__media">
        {coverUrl && failedUrl !== coverUrl ? (
          <img src={coverUrl} alt="" loading="lazy" decoding="async" onError={() => setFailedUrl(coverUrl)} />
        ) : (
          <span className="rental-card__placeholder">
            <Icon name="image" size={32} />
            <span>{coverUrl ? 'Photo unavailable' : 'No photo yet'}</span>
          </span>
        )}
        <p className="listing-card__price"><strong>{formatPrice(listing.price)}</strong> / {listing.price_period}</p>
      </div>
      <div className="listing-card__body">
        <p className="listing-card__category">{listing.categories?.name}</p>
        <h3>{listing.title}</h3>
        <p className="listing-card__location"><Icon name="mapPin" size={15} />{listing.location_text}</p>
        <VerifiedBadge profile={listing.profiles} />
        {listing.status === 'unavailable' && <span className="rental-card__status">Currently unavailable</span>}
        {listing.status === 'available' && <span className="rental-card__status rental-card__status--open">Open for requests</span>}
      </div>
    </Link>
  )
}
