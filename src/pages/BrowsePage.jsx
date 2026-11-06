import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ListingCard from '../components/ListingCard.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { useCategories } from '../hooks/useCategories.js'
import { useSearchListings } from '../hooks/useSearchListings.js'

const PERIODS = ['hour', 'day', 'week', 'month', 'year']
const SORTS = [['relevance', 'Best match'], ['newest', 'Newest'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low']]

function FilterForm({ initial, categories, onApply, onClear }) {
  const [f, setF] = useState(initial)
  const [error, setError] = useState('')
  const set = (key) => (e) => setF({ ...f, [key]: e.target.value })

  function handleSubmit(e) {
    e.preventDefault()
    if (f.min !== '' && f.max !== '' && Number(f.min) > Number(f.max)) return setError('The minimum price can’t be higher than the maximum.')
    setError('')
    onApply(f)
  }

  return (
    <form className="filters" role="search" onSubmit={handleSubmit}>
      <div className="field wide wider">
        <label htmlFor="q">Search</label>
        <input id="q" type="search" placeholder="e.g. motorbike, studio, projector" value={f.q} onChange={set('q')} />
      </div>
      <div className="field wide">
        <label htmlFor="category">Category</label>
        <select id="category" value={f.category} onChange={set('category')}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
        </select>
      </div>
      <div className="field wide">
        <label htmlFor="location">Location</label>
        <input id="location" type="text" placeholder="e.g. Tibanga" value={f.location} onChange={set('location')} />
      </div>
      <div className="field">
        <label htmlFor="min">Min price (₱)</label>
        <input id="min" type="number" min="0" inputMode="decimal" value={f.min} onChange={set('min')} />
      </div>
      <div className="field">
        <label htmlFor="max">Max price (₱)</label>
        <input id="max" type="number" min="0" inputMode="decimal" value={f.max} onChange={set('max')} />
      </div>
      <div className="field">
        <label htmlFor="per">Priced per</label>
        <select id="per" value={f.per} onChange={set('per')}>
          <option value="">Any</option>
          {PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="sort">Sort by</label>
        <select id="sort" value={f.sort} onChange={set('sort')}>
          {SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="filters__actions">
        <button type="submit" className="btn btn-primary">Search</button>
        <button type="button" className="btn btn-ghost" onClick={onClear}>Clear filters</button>
      </div>
    </form>
  )
}

export default function BrowsePage() {
  const [params, setParams] = useSearchParams()
  const { categories, loading: catsLoading } = useCategories()

  const get = (key) => params.get(key) ?? ''
  const slug = get('category')
  const category = categories.find((c) => c.slug === slug)
  const initial = { q: get('q'), category: slug, location: get('location'), min: get('min'), max: get('max'), per: get('per'), sort: get('sort') || (get('q') ? 'relevance' : 'newest') }
  // -1 matches nothing, so an unknown category in the address shows "no results" instead of everything.
  const filters = { q: initial.q, categoryId: slug ? (category?.id ?? -1) : null, location: initial.location, min: initial.min, max: initial.max, per: initial.per, sort: initial.sort }
  const { items, total, loading, loadingMore, error, loadMore } = useSearchListings(filters, !slug || !catsLoading)

  function apply(f) {
    const next = {}
    for (const [key, value] of Object.entries(f)) if (String(value).trim() !== '') next[key] = String(value).trim()
    setParams(next)
  }

  return (
    <section className="container page">
      <h1>Browse rentals</h1>
      <FilterForm key={params.toString()} initial={initial} categories={categories} onApply={apply} onClear={() => setParams({})} />
      {error && <p className="form-error" role="alert">We couldn’t load listings ({error}).</p>}
      <p className="results__count" aria-live="polite">{loading ? 'Searching…' : error ? '' : `${total} listing${total === 1 ? '' : 's'} found`}</p>
      {!loading && !error && items.length === 0 && (
        <EmptyState icon="🔎" title="No listings match your search" action={<button type="button" className="btn btn-primary" onClick={() => setParams({})}>Clear filters</button>}>
          Try a shorter keyword, a different category, or a wider price range.
        </EmptyState>
      )}
      {items.length > 0 && (
        <ul className="listing-grid">
          {items.map((l) => <li key={l.id}><ListingCard listing={l} /></li>)}
        </ul>
      )}
      {items.length > 0 && items.length < total && (
        <div className="load-more">
          <button type="button" className="btn btn-primary" disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Loading…' : 'Load more'}</button>
        </div>
      )}
    </section>
  )
}
