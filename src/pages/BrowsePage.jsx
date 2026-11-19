import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ListingCard from '../components/ListingCard.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { useCategories } from '../hooks/useCategories.js'
import { useSearchListings } from '../hooks/useSearchListings.js'
import LoadError from '../components/LoadError.jsx'
import Icon from '../components/Icon.jsx'
import { formatPrice } from '../lib/format.js'
import PageHeading from '../components/PageHeading.jsx'
import ListingSkeleton from '../components/ListingSkeleton.jsx'
import '../styles/discovery.css'

const PERIODS = ['hour', 'day', 'week', 'month', 'year']
const SORTS = [['relevance', 'Best match'], ['newest', 'Newest'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low']]

function FilterForm({ initial, categories, onApply, onClear }) {
  const [f, setF] = useState(initial)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const formRef = useRef(null)
  const queryRef = useRef(null)
  const composing = useRef(false)
  const set = (key) => (e) => { setF({ ...f, [key]: e.target.value }); setError(null) }
  const filterCount = ['category', 'location', 'min', 'max', 'per'].filter((key) => initial[key] !== '').length

  function showError(field, message) {
    setError({ field, message })
    setExpanded(true)
    requestAnimationFrame(() => formRef.current?.elements.namedItem(field)?.focus())
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (composing.current) return
    for (const field of ['min', 'max']) {
      if (f[field] !== '' && (!Number.isFinite(Number(f[field])) || Number(f[field]) < 0)) return showError(field, 'Enter a price of zero or more.')
    }
    if (f.min !== '' && f.max !== '' && Number(f.min) > Number(f.max)) return showError('min', 'The minimum price can’t be higher than the maximum.')
    setError(null)
    onApply(f)
  }

  const compositionEvents = {
    onCompositionStart: () => { composing.current = true },
    onCompositionEnd: () => { composing.current = false },
    onKeyDown: (e) => { if (e.key === 'Enter' && (e.nativeEvent.isComposing || composing.current)) e.preventDefault() },
  }

  return (
    <form className="filters browse-filters" role="search" noValidate onSubmit={handleSubmit} ref={formRef}>
      <div className="browse-filters__heading"><Icon name="sliders" /><h2>Filters &amp; sort</h2></div>
      <div className="field browse-filters__query">
        <label htmlFor="q">Search</label>
        <div className="browse-query-control">
          <input id="q" ref={queryRef} type="search" placeholder="e.g. motorbike, studio, projector" value={f.q} onChange={set('q')} {...compositionEvents} />
          {f.q && <button type="button" className="browse-query-control__clear" aria-label="Clear search" onClick={() => { setF({ ...f, q: '' }); setError(null); onApply({ ...f, q: '' }); requestAnimationFrame(() => document.getElementById('q')?.focus()) }}><Icon name="x" size={16} /></button>}
        </div>
      </div>
      <button type="button" className="btn browse-filters__toggle" aria-expanded={expanded} aria-controls="browse-filter-options" onClick={() => setExpanded((value) => !value)}>
        <Icon name="sliders" size={18} />Filters & sort{filterCount > 0 && <span className="browse-filter-count">{filterCount}</span>}<Icon name="chevronDown" className={expanded ? 'is-expanded' : ''} size={18} />
      </button>
      <div id="browse-filter-options" className={`browse-filters__options ${expanded ? 'is-expanded' : ''}`}>
        <div className="field">
          <label htmlFor="category">Category</label>
          <select id="category" value={f.category} onChange={set('category')}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="location">Location</label>
          <input id="location" type="text" placeholder="e.g. Tibanga" value={f.location} onChange={set('location')} {...compositionEvents} />
        </div>
        <div className="browse-filters__price">
          <div className="field">
            <label htmlFor="min">Min price (₱)</label>
            <input id="min" name="min" type="number" min="0" inputMode="decimal" placeholder="0" value={f.min} onChange={set('min')} aria-invalid={error?.field === 'min' || undefined} aria-describedby={error?.field === 'min' ? 'filter-error' : undefined} />
          </div>
          <div className="field">
            <label htmlFor="max">Max price (₱)</label>
            <input id="max" name="max" type="number" min="0" inputMode="decimal" placeholder="Any" value={f.max} onChange={set('max')} aria-invalid={error?.field === 'max' || undefined} aria-describedby={error?.field === 'max' ? 'filter-error' : undefined} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="per">Priced per</label>
          <select id="per" value={f.per} onChange={set('per')}>
            <option value="">Any rental period</option>
            {PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sort">Sort by</label>
          <select id="sort" value={f.sort} onChange={set('sort')}>
            {SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>
      {error && <p id="filter-error" className="form-error" role="alert">{error.message}</p>}
      <div className="filters__actions">
        <button type="submit" className="btn btn-primary"><Icon name="search" size={18} />Search</button>
        <button type="button" className="btn btn-ghost" onClick={onClear}>Clear filters</button>
      </div>
    </form>
  )
}

export default function BrowsePage() {
  const [params, setParams] = useSearchParams()
  const { categories, loading: catsLoading, error: catsError, retry: retryCategories } = useCategories()

  const resultsHeading = useRef(null)
  const chipList = useRef(null)

  const get = (key) => params.get(key) ?? ''
  const slug = get('category')
  const category = categories.find((c) => c.slug === slug)
  const initial = { q: get('q'), category: slug, location: get('location'), min: get('min'), max: get('max'), per: get('per'), sort: get('sort') || (get('q') ? 'relevance' : 'newest') }
  // An unknown category matches nothing; it must not silently show everything.
  const filters = { q: initial.q, categoryId: slug ? (category?.id ?? -1) : null, location: initial.location, min: initial.min, max: initial.max, per: initial.per, sort: initial.sort }
  const waitingForCategory = Boolean(slug && (catsLoading || catsError))
  const { items, total, hasMore, loading, loadingMore, error, moreError, loadMore, retry } = useSearchListings(filters, !waitingForCategory)

  const chips = [
    ['q', initial.q && 'Search · ' + initial.q],
    ['category', slug && (category?.name || slug)],
    ['location', initial.location && 'Area · ' + initial.location],
    ['min', initial.min && 'From ' + formatPrice(initial.min)],
    ['max', initial.max && 'Up to ' + formatPrice(initial.max)],
    ['per', initial.per && 'Per ' + initial.per],
  ].filter(([, label]) => label)

  function removeFilter(key, position) {
    const next = new URLSearchParams(params)
    next.delete(key)
    setParams(next)
    requestAnimationFrame(() => {
      const remaining = chipList.current?.querySelectorAll('button')
      const target = remaining?.[position] || remaining?.[position - 1] || resultsHeading.current
      target?.focus()
    })
  }

  function apply(f) {
    const next = {}
    for (const [key, value] of Object.entries(f)) if (String(value).trim() !== '') next[key] = String(value).trim()
    setParams(next)
  }

  function clearFilters() {
    setParams({})
    requestAnimationFrame(() => document.getElementById('q')?.focus())
  }

  const searching = loading || (waitingForCategory && catsLoading)

  return (
    <section className="container page browse-page">
      <PageHeading title="Browse rentals" actions={<span className="browse-place"><Icon name="mapPin" size={17} />Iligan City, Philippines</span>} />
      <div className="browse-layout">
        <aside className="browse-sidebar" aria-label="Rental filters">
          <FilterForm key={params.toString()} initial={initial} categories={categories} onApply={apply} onClear={clearFilters} />
        </aside>
        <div className="browse-results">
          <header className="browse-results__heading">
            <h2 ref={resultsHeading} tabIndex={-1}>{category?.name || (chips.length ? 'Search results' : 'All rentals')}</h2>
            <p className="results__count" aria-live="polite">{waitingForCategory ? catsLoading ? 'Loading categories…' : '' : loading ? 'Searching…' : error ? '' : `${total} listing${total === 1 ? '' : 's'} found`}</p>
          </header>
          {chips.length > 0 && (
            <ul className="browse-chips" ref={chipList} aria-label="Active filters">
              {chips.map(([key, label], index) => (
                <li key={key}><button type="button" onClick={() => removeFilter(key, index)} aria-label={'Remove ' + label}>
                  {label}<Icon name="x" size={15} />
                </button></li>
              ))}
            </ul>
          )}
          {catsError && <LoadError onRetry={retryCategories}>{catsError}</LoadError>}
          {error && <LoadError onRetry={retry}>We couldn’t load listings. {error}</LoadError>}
          {searching && <ListingSkeleton count={6} />}
          {!waitingForCategory && !loading && !error && items.length === 0 && (
            <EmptyState icon={<Icon name="search" size={30} />} title="No listings match your search" action={<button type="button" className="btn btn-primary" onClick={clearFilters}>Clear filters</button>}>
              Try a shorter keyword, a different category, or a wider price range.
            </EmptyState>
          )}
          {items.length > 0 && (
            <ul className="listing-grid">
              {items.map((l) => <li key={l.id}><ListingCard listing={l} /></li>)}
            </ul>
          )}
          {items.length > 0 && hasMore && (
            <div className="load-more">
              {moreError && <p className="form-error" role="alert">{moreError}</p>}
              <button type="button" className="btn btn-primary" disabled={loadingMore} aria-busy={loadingMore} onClick={loadMore}>{loadingMore ? 'Loading…' : moreError ? 'Try loading more again' : 'Load more'}</button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
