import { useState } from 'react'
import { Link } from 'react-router-dom'
import SearchBar from '../components/SearchBar.jsx'
import EmptyState from '../components/EmptyState.jsx'
import ListingCard from '../components/ListingCard.jsx'
import ListingSkeleton from '../components/ListingSkeleton.jsx'
import Icon from '../components/Icon.jsx'
import { useLatestListings } from '../hooks/useListings.js'
import { useCategories } from '../hooks/useCategories.js'
import { photoUrl, sortedPhotos } from '../lib/photos.js'
import { formatRate } from '../lib/format.js'
import LoadError from '../components/LoadError.jsx'
import '../styles/home.css'

const iconBySlug = {
  'vehicles-transportation': 'car', 'residential-properties': 'home',
  'commercial-properties': 'building', 'land-lots': 'tree',
  'tools-machinery-equipment': 'tool', 'electronics-gadgets': 'laptop',
  'events-parties-recreation': 'party', 'furniture-household': 'armchair',
  'clothing-special-occasion': 'shirt', other: 'box',
}
const steps = [
  { icon: 'search', title: 'Find your next rental', text: 'Compare listings by category, location and price. Find something that fits your plans.' },
  { icon: 'calendar', title: 'Send a rental request', text: 'Choose your dates and send a request. The owner accepts or declines it.' },
  { icon: 'key', title: 'Make the arrangements', text: 'Message the owner to agree on pickup or access, and confirm the details directly.' },
]

function MarketplacePreview({ listings }) {
  const [failedPath, setFailedPath] = useState(null)
  const featured = listings.find((listing) => sortedPhotos(listing.listing_photos).length > 0)
  const cover = featured ? sortedPhotos(featured.listing_photos)[0] : null
  if (featured && cover.storage_path !== failedPath) return (
    <Link className="home-preview" to={`/listings/${featured.id}`}>
      <div className="home-preview__photo">
        <img src={photoUrl(cover.storage_path)} alt={featured.title} onError={() => setFailedPath(cover.storage_path)} fetchPriority="high" />
        <span className="home-preview__label"><Icon name="mapPin" size={16} /> On the marketplace</span>
        {featured.status === 'unavailable' && <span className="home-preview__unavailable">Currently unavailable</span>}
      </div>
      <div className="home-preview__caption">
        <div><p>{featured.categories?.name}</p><strong>{featured.title}</strong></div>
        <span>{formatRate(featured.price, featured.price_period)}</span><Icon name="arrowRight" />
      </div>
    </Link>
  )
  return (
    <div className="home-collection">
      <div className="home-collection__intro"><span className="home-collection__line" /><p>A place for<br /><strong>your next plan.</strong></p></div>
      <div className="home-collection__tiles" aria-hidden="true">
        {['home', 'car', 'laptop', 'armchair'].map((name) => <span key={name}><Icon name={name} size={44} /></span>)}
      </div>
      <p className="home-collection__caption">Spaces to settle into. Things to get things done.</p>
    </div>
  )
}

export default function Home() {
  const { categories, loading, error, retry } = useCategories()
  const latest = useLatestListings(6)
  return (
    <div className="home-page">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="container home-hero__layout">
          <div className="home-hero__content">
            <p className="eyebrow"><Icon name="mapPin" size={16} /> Made for everyday life in Iligan</p>
            <h1 id="home-title">Rent almost anything, <span>all in one place.</span></h1>
            <p className="home-hero__lead">A room for your next chapter. Tools for the weekend. Find what you need from people and rental businesses around Iligan City.</p>
            <SearchBar />
            <p className="home-hero__owner">Have something to share? <Link to="/list">List it for rent <Icon name="arrowRight" size={16} /></Link></p>
          </div>
          <MarketplacePreview listings={latest.listings} />
        </div>
      </section>

      <section className="section home-categories" id="categories" aria-labelledby="categories-title">
        <div className="container">
          <div className="home-section-head"><div><p className="eyebrow">Find your kind of rental</p><h2 id="categories-title">What are you looking for?</h2></div><Link className="home-text-link" to="/listings">Explore all rentals <Icon name="arrowRight" size={18} /></Link></div>
          {loading && <><p className="sr-only" role="status">Loading categories…</p><div className="home-category-grid" aria-hidden="true">{Array.from({ length: 10 }, (_, index) => <div className="home-category-skeleton skeleton" key={index} />)}</div></>}
          {error && <LoadError onRetry={retry}>{error}</LoadError>}
          {categories.length > 0 && <ul className="home-category-grid">{categories.map((category) => (
            <li key={category.slug}><Link className="home-category" to={`/listings?category=${category.slug}`}><span className="home-category__icon"><Icon name={iconBySlug[category.slug] || 'box'} size={28} /></span><span>{category.name}</span><Icon className="home-category__arrow" name="arrowRight" size={16} /></Link></li>
          ))}</ul>}
        </div>
      </section>

      <section className="section home-latest" aria-labelledby="latest-title">
        <div className="container">
          <div className="home-section-head"><div><p className="eyebrow">Around the neighborhood</p><h2 id="latest-title">Latest listings</h2><p>Something for your plans, just around the corner.</p></div><Link className="home-text-link" to="/listings">Browse rentals <Icon name="arrowRight" size={18} /></Link></div>
          {latest.loading && <><p className="sr-only" role="status">Loading listings…</p><ListingSkeleton /></>}
          {latest.error && <div className="form-error" role="alert"><p>We couldn’t load the listings ({latest.error}).</p><Link to="/listings">Try browsing rentals</Link></div>}
          {!latest.loading && !latest.error && latest.listings.length === 0 && <EmptyState icon={<Icon name="box" size={32} />} title="No listings yet" action={<Link className="btn btn-primary" to="/list">List an item</Link>}>Listings will appear here once owners start publishing. Be the first to list something for rent in Iligan City.</EmptyState>}
          {latest.listings.length > 0 && <ul className="listing-grid">{latest.listings.map((listing) => <li key={listing.id}><ListingCard listing={listing} /></li>)}</ul>}
        </div>
      </section>

      <section className="section" id="how-it-works" aria-labelledby="how-title">
        <div className="container">
          <div className="home-section-head"><div><p className="eyebrow">From looking to living</p><h2 id="how-title">A few steps. A lot of possibilities.</h2></div><p>Rent for the moment.<br />Make room for what comes next.</p></div>
          <ol className="home-steps">{steps.map((step, index) => <li className="home-step" key={step.title}><div className="home-step__top"><span className="home-step__number">0{index + 1}</span><Icon name={step.icon} size={28} /></div><h3>{step.title}</h3><p>{step.text}</p></li>)}</ol>
        </div>
      </section>

      <section className="section home-owner-section" aria-labelledby="owner-title">
        <div className="container"><div className="home-owner"><div className="home-owner__symbol" aria-hidden="true"><Icon name="key" size={72} /></div><div className="home-owner__content"><p className="eyebrow">For individuals & rental businesses</p><h2 id="owner-title">Your things could be<br />someone’s next great find.</h2><p>A spare room, a camera, equipment for a celebration. Add photos, set your terms and manage rental requests in one place.</p><Link className="btn" to="/list">List an item <Icon name="arrowRight" size={18} /></Link></div></div></div>
      </section>

      <section className="section home-trust" aria-labelledby="trust-title">
        <div className="container home-trust__layout"><div><span className="home-trust__icon"><Icon name="shield" size={28} /></span><h2 id="trust-title">Get to know who you’re renting with.</h2></div><div><p>Identity and business badges show that an account has completed eRental’s review. They don’t guarantee an item’s condition or a rental outcome. Read the details, ask questions and agree on handover directly.</p><Link className="home-text-link" to="/verification">About account verification <Icon name="arrowRight" size={18} /></Link><p className="home-trust__note">This is an academic prototype. Payments are simulated; no real money is processed.</p></div></div>
      </section>
    </div>
  )
}
