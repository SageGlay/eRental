import { Link } from 'react-router-dom'
import SearchBar from '../components/SearchBar.jsx'
import EmptyState from '../components/EmptyState.jsx'
import ListingCard from '../components/ListingCard.jsx'
import { useLatestListings } from '../hooks/useListings.js'
import { useCategories } from '../hooks/useCategories.js'
import { categories as categoryIcons } from '../data/categories.js'

// Icons are a display detail, so they stay in the app and are matched to database rows by slug.
const emojiBySlug = Object.fromEntries(categoryIcons.map((c) => [c.slug, c.emoji]))

const steps = [
  { title: 'Search and compare', text: 'Browse by category, location and price to see what is available around Iligan City.' },
  { title: 'Send a rental request', text: 'Choose your dates and send a request. The owner accepts or declines it.' },
  { title: 'Arrange the handover', text: 'Agree on pickup or access directly with the owner. eRental does not handle delivery or handover.' },
]

export default function Home() {
  const { categories, loading, error } = useCategories()
  const latest = useLatestListings(6)
  return (
    <>
      <section className="hero">
        <div className="container">
          <p className="eyebrow">Iligan City’s rental marketplace</p>
          <h1>Rent almost anything, <span>all in one place.</span></h1>
          <p className="hero__lead">Find vehicles, rooms, tools, gadgets, event items and more from individual owners and rental businesses around Iligan City.</p>
          <SearchBar />
        </div>
      </section>

      <section className="section" id="categories">
        <div className="container">
          <div className="section__head">
            <h2>Browse by category</h2>
            <p>Ten categories cover everything from motorbikes and rooms to party equipment and gowns.</p>
          </div>
          {loading && <p aria-busy="true">Loading categories…</p>}
          {error && <p className="form-error" role="alert">We couldn’t load the categories ({error}). Check your connection and your .env settings.</p>}
          <ul className="category-grid">
            {categories.map((c) => (
              <li key={c.slug}>
                <Link className="category-card" to={`/listings?category=${c.slug}`}>
                  <span className="category-card__icon" aria-hidden="true">{emojiBySlug[c.slug] ?? '📦'}</span>
                  <span className="category-card__name">{c.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section section--alt">
        <div className="container">
          <div className="section__head">
            <h2>Latest listings</h2>
          </div>
          {latest.loading && <p aria-busy="true">Loading listings…</p>}
          {latest.error && <p className="form-error" role="alert">We couldn’t load the listings ({latest.error}).</p>}
          {!latest.loading && !latest.error && latest.listings.length === 0 && (
            <EmptyState icon="🗂️" title="No listings yet" action={<Link className="btn btn-primary" to="/list">List an item</Link>}>
              Listings will appear here once owners start publishing. Be the first to list something for rent in Iligan City.
            </EmptyState>
          )}
          {latest.listings.length > 0 && (
            <ul className="listing-grid">
              {latest.listings.map((l) => <li key={l.id}><ListingCard listing={l} /></li>)}
            </ul>
          )}
        </div>
      </section>

      <section className="section" id="how-it-works">
        <div className="container">
          <div className="section__head">
            <h2>How eRental works</h2>
          </div>
          <ol className="steps">
            {steps.map((s) => (
              <li className="step" key={s.title}>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
          <p className="notice">
            <strong>Prototype notice:</strong> payments are simulated and no real money changes hands. Owners’ listings are not guaranteed to be inspected or verified, so renters should check details with the owner directly.
          </p>
        </div>
      </section>

      <section className="section section--tight">
        <div className="container">
          <div className="cta">
            <div>
              <h2>Have something to rent out?</h2>
              <p>Individual owners and rental businesses can publish listings and reach renters across Iligan City.</p>
            </div>
            <Link className="btn" to="/list">List an item</Link>
          </div>
        </div>
      </section>
    </>
  )
}
