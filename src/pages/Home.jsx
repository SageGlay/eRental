import { Link } from 'react-router-dom'
import SearchBar from '../components/SearchBar.jsx'
import EmptyState from '../components/EmptyState.jsx'
import ListingCard from '../components/ListingCard.jsx'
import ListingSkeleton from '../components/ListingSkeleton.jsx'
import Icon from '../components/Icon.jsx'
import LoadError from '../components/LoadError.jsx'
import { useLatestListings } from '../hooks/useListings.js'
import { useCategories } from '../hooks/useCategories.js'
import '../styles/home.css'

const categoryIcons = {
  'vehicles-transportation': 'car', 'residential-properties': 'home',
  'commercial-properties': 'building', 'land-lots': 'tree',
  'tools-machinery-equipment': 'tool', 'electronics-gadgets': 'laptop',
  'events-parties-recreation': 'party', 'furniture-household': 'armchair',
  'clothing-special-occasion': 'shirt', other: 'box',
}

const rentingSteps = [
  ['Choose a rental', 'Compare photos, rates, deposits and owner details.'],
  ['Request your dates', 'The owner reviews your request and confirms availability.'],
  ['Arrange handover', 'Use Messages to agree on pickup, access and return.'],
]

export default function Home() {
  const { categories, loading, error, retry } = useCategories()
  const latest = useLatestListings(8)

  return (
    <div className="home-page container">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero__layout">
          <div className="home-hero__content">
            <h1 id="home-title">Rent it in <em>Iligan.</em></h1>
            <p>Find gear, vehicles and spaces from local owners.</p>
          </div>
          <div className="home-hero__photo" aria-hidden="true">
            <img src="/assets/rental-counter.webp" width="1200" height="800" fetchPriority="high" alt="" />
          </div>
        </div>
        <SearchBar />
      </section>

      <section className="home-categories" id="categories" aria-labelledby="categories-title">
        <div className="home-section-head">
          <h2 id="categories-title">Categories</h2>
          <Link className="home-text-link" to="/listings">All rentals <Icon name="arrowRight" size={16} /></Link>
        </div>
        {loading && <p role="status">Loading categories…</p>}
        {error && <LoadError onRetry={retry}>{error}</LoadError>}
        {!loading && !error && !categories.length && <p>Browse all rentals while categories are being added.</p>}
        {categories.length > 0 && (
          <ul className="home-category-list">
            {categories.map((category) => (
              <li key={category.slug}>
                <Link className="home-category" to={'/listings?category=' + encodeURIComponent(category.slug)}>
                  <Icon name={categoryIcons[category.slug] || 'box'} size={19} />
                  <span>{category.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="home-latest" aria-labelledby="latest-title">
        <div className="home-section-head">
          <h2 id="latest-title">Latest listings</h2>
          <Link className="home-text-link" to="/listings?sort=newest">View all <Icon name="arrowRight" size={16} /></Link>
        </div>
        {latest.loading && <><p className="sr-only" role="status">Loading listings…</p><ListingSkeleton count={4} /></>}
        {latest.error && <LoadError onRetry={latest.retry}>{latest.error}</LoadError>}
        {!latest.loading && !latest.error && latest.listings.length === 0 && (
          <EmptyState icon={<Icon name="box" size={32} />} title="No listings yet" action={<Link className="btn btn-primary" to="/list">List an item</Link>}>
            Have something to rent out in Iligan? Add photos, a rate and your pickup area.
          </EmptyState>
        )}
        {latest.listings.length > 0 && (
          <ul className="listing-grid">{latest.listings.map((listing) => <li key={listing.id}><ListingCard listing={listing} /></li>)}</ul>
        )}
      </section>

      <div className="home-guide" id="how-it-works">
        <section aria-labelledby="how-title">
          <h2 id="how-title">How renting works</h2>
          <ol className="home-steps">
            {rentingSteps.map(([title, description]) => <li key={title}><h3>{title}</h3><p>{description}</p></li>)}
          </ol>
          <p className="home-guide__note">Payments are simulated. No money changes hands on eRental.</p>
        </section>
        <div className="home-guide__side">
          <section>
            <h2>List something for rent</h2>
            <p>Set your price, add photos and manage incoming requests from the same account.</p>
            <Link className="home-text-link" to="/list">Create a listing <Icon name="arrowRight" size={16} /></Link>
          </section>
          <section>
            <h2>Account verification</h2>
            <p>Identity and business badges show that an account has passed a document review. Ask the owner about the item’s condition before arranging pickup.</p>
            <Link className="home-text-link" to="/verification">Check your verification status <Icon name="arrowRight" size={16} /></Link>
          </section>
        </div>
      </div>
    </div>
  )
}
