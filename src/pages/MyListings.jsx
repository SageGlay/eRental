import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import { formatRate } from '../lib/format.js'
import { photoUrl, sortedPhotos } from '../lib/photos.js'
import EmptyState from '../components/EmptyState.jsx'
import LoadError from '../components/LoadError.jsx'
import PageHeading from '../components/PageHeading.jsx'
import Icon from '../components/Icon.jsx'
import Dialog from '../components/Dialog.jsx'
import '../styles/owner-management.css'

const FIELDS =
  'id, title, price, price_period, status, location_text, categories(name), listing_photos(storage_path, sort_order)'

function ListingThumbnail({ listing }) {
  const [failed, setFailed] = useState(false)
  const cover = sortedPhotos(listing.listing_photos)[0]
  return (
    <div className="owner-listing__photo">
      {cover && !failed ? (
        <img
          src={photoUrl(cover.storage_path)}
          alt={listing.title}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="owner-listing__photo-fallback">
          <Icon name="image" size={32} />
          <span>No photo</span>
        </span>
      )}
    </div>
  )
}

export default function MyListings() {
  const { user } = useAuth()
  return <OwnerCollection key={user.id} ownerId={user.id} />
}

function OwnerCollection({ ownerId }) {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') || ''
  const [state, setState] = useState({
    listings: [],
    loading: true,
    error: null,
  })
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [busyId, setBusyId] = useState(null)
  const mutationBusy = useRef(false)
  const [confirmId, setConfirmId] = useState(null)
  const [notice, setNotice] = useState(null)
  const noticeRef = useRef(null)
  const status = ['available', 'unavailable'].includes(params.get('status'))
    ? params.get('status')
    : 'all'

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    setState((current) => ({ ...current, loading: true, error: null }))
    supabase
      .from('listings')
      .select(FIELDS)
      .eq('owner_id', ownerId)
      .neq('status', 'removed')
      .order('created_at', { ascending: false })
      .abortSignal(controller.signal)
      .then(({ data, error }) => {
        if (!cancelled)
          setState({
            listings: data ?? [],
            loading: false,
            error: error ? 'Check your connection and try again.' : null,
          })
      })
      .catch((error) => {
        if (!cancelled)
          setState((current) => ({
            ...current,
            loading: false,
            error:
              error.message || 'Please check your connection and try again.',
          }))
      })
      .finally(() => clearTimeout(timer))
    return () => {
      cancelled = true
      clearTimeout(timer)
      controller.abort()
    }
  }, [ownerId, loadAttempt])

  async function changeStatus(listing, nextStatus) {
    if (mutationBusy.current) return
    mutationBusy.current = true
    setBusyId(listing.id)
    setNotice(null)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    function refreshAfterChange(message) {
      setConfirmId(null)
      setNotice({ error: true, text: message })
      setLoadAttempt((attempt) => attempt + 1)
      requestAnimationFrame(() => noticeRef.current?.focus())
    }
    try {
      const {
        data,
        error,
        status: responseStatus,
      } = await supabase
        .from('listings')
        .update({ status: nextStatus })
        .eq('id', listing.id)
        .eq('owner_id', ownerId)
        .eq('status', listing.status)
        .select('id')
        .abortSignal(controller.signal)
      if (error && (!responseStatus || responseStatus >= 500)) {
        refreshAfterChange(
          `We couldn’t confirm the update to “${listing.title}”. Check the refreshed list before trying again.`,
        )
        return
      }
      if (!error && !data?.length) {
        refreshAfterChange(
          `“${listing.title}” changed or is no longer accessible. Check the refreshed list before trying again.`,
        )
        return
      }
      if (error) {
        setNotice({
          error: true,
          text: `We couldn’t update “${listing.title}”. ${error.message || 'Please try again.'}`,
        })
        return
      }
      setState((current) => ({
        ...current,
        listings:
          nextStatus === 'removed'
            ? current.listings.filter((item) => item.id !== listing.id)
            : current.listings.map((item) =>
                item.id === listing.id ? { ...item, status: nextStatus } : item,
              ),
      }))
      setConfirmId(null)
      setNotice({
        error: false,
        text:
          nextStatus === 'removed'
            ? `“${listing.title}” was removed.`
            : `“${listing.title}” is now ${nextStatus}.`,
      })
      requestAnimationFrame(() => noticeRef.current?.focus())
    } catch {
      refreshAfterChange(
        `We couldn’t confirm the update to “${listing.title}”. Check the refreshed list before trying again.`,
      )
    } finally {
      clearTimeout(timer)
      mutationBusy.current = false
      setBusyId(null)
    }
  }

  function setStatus(value) {
    const next = new URLSearchParams(params)
    if (value === 'all') next.delete('status')
    else next.set('status', value)
    setParams(next)
  }

  const { listings, loading, error } = state
  const normalized = query.trim().toLowerCase()
  const visible = listings.filter(
    (listing) =>
      (status === 'all' || listing.status === status) &&
      (!normalized ||
        listing.title.toLowerCase().includes(normalized) ||
        listing.location_text?.toLowerCase().includes(normalized)),
  )
  function changeQuery(value) {
    const next = new URLSearchParams(params)
    if (value) next.set('q', value)
    else next.delete('q')
    setParams(next, { replace: true })
  }

  const removing = listings.find((listing) => listing.id === confirmId)
  return (
    <section className="container page owner-workspace">
      <PageHeading
        eyebrow="Owner workspace"
        title="My listings"
        actions={
          <>
            <Link className="btn btn-ghost" to="/bookings?tab=incoming">
              <Icon name="calendar" />
              Incoming requests
            </Link>
            <Link className="btn btn-primary" to="/list">
              <Icon name="plus" />
              List an item
            </Link>
          </>
        }
      >
        <p>Set which listings can accept new requests.</p>
      </PageHeading>
      <div className="owner-workspace__toolbar">
        <div
          className="owner-workspace__filters"
          aria-label="Show listings"
          role="group"
        >
          {[
            ['all', 'All listings'],
            ['available', 'Available'],
            ['unavailable', 'Unavailable'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={status === value}
              onClick={() => setStatus(value)}
            >
              {label}
              {!loading && !error && (
                <span>
                  {value === 'all'
                    ? listings.length
                    : listings.filter((item) => item.status === value).length}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="owner-workspace__search">
          <Icon name="search" size={16} />
          <label className="sr-only" htmlFor="owner-query">
            Find a listing by title or location
          </label>
          <input
            id="owner-query"
            type="search"
            value={query}
            placeholder="Find by title or location"
            onChange={(event) => changeQuery(event.target.value)}
          />
        </div>
      </div>
      {notice && (!removing || !notice.error) && (
        <p
          ref={noticeRef}
          tabIndex={-1}
          className={notice.error ? 'form-error' : 'form-success'}
          role={notice.error ? 'alert' : 'status'}
        >
          {notice.text}
        </p>
      )}
      {loading && (
        <div className="owner-workspace__loading" role="status">
          <Icon name="clock" />
          <span>Loading your listings…</span>
        </div>
      )}
      {error && (
        <LoadError onRetry={() => setLoadAttempt((attempt) => attempt + 1)}>
          We couldn’t load your listings. {error}
        </LoadError>
      )}
      {!loading && !error && (
        <p className="owner-workspace__count" aria-live="polite">
          {visible.length} {visible.length === 1 ? 'listing' : 'listings'}
          {status !== 'all'
            ? ` · ${status === 'available' ? 'Available' : 'Unavailable'}`
            : ''}
        </p>
      )}
      {!loading && !error && listings.length === 0 && (
        <EmptyState
          icon={<Icon name="box" size={32} />}
          title="You haven’t listed anything yet"
          action={
            <Link className="btn btn-primary" to="/list">
              Create your first listing
            </Link>
          }
        >
          Listings you create will show up here, where you can edit them, mark
          them unavailable or remove them.
        </EmptyState>
      )}
      {!loading && !error && listings.length > 0 && visible.length === 0 && (
        <EmptyState
          icon={<Icon name="grid" size={32} />}
          title={
            normalized
              ? 'No listings match your search'
              : `No ${status} listings`
          }
          action={
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setParams({})}
            >
              Show all listings
            </button>
          }
        >
          Try another title, location or availability filter.
        </EmptyState>
      )}
      {!loading && !error && (
        <ul
          className="my-listings owner-workspace__list"
          aria-label="Your listings"
          aria-busy={loading}
        >
          {visible.map((listing) => {
            const available = listing.status === 'available'
            return (
              <li className="my-listing owner-listing" key={listing.id}>
                <ListingThumbnail
                  key={
                    sortedPhotos(listing.listing_photos)[0]?.storage_path ??
                    listing.id
                  }
                  listing={listing}
                />
                <div className="owner-listing__content">
                  <div className="owner-listing__topline">
                    <span className="owner-listing__category">
                      {listing.categories?.name}
                    </span>
                  </div>
                  <h3>
                    <Link to={`/listings/${listing.id}`}>{listing.title}</Link>
                  </h3>
                  {listing.location_text && (
                    <p className="owner-listing__location">
                      <Icon name="mapPin" size={14} /> {listing.location_text}
                    </p>
                  )}
                </div>
                <div className="owner-listing__rental">
                  <span
                    className={`owner-listing__status ${available ? 'owner-listing__status--available' : ''}`}
                  >
                    <span aria-hidden="true" />
                    {available ? 'Available' : 'Unavailable'}
                  </span>
                  <p className="owner-listing__rate">
                    {formatRate(listing.price, listing.price_period)}
                  </p>
                </div>
                <div className="my-listing__actions owner-listing__actions">
                  <Link className="btn" to={`/listings/${listing.id}/edit`}>
                    <Icon name="sliders" size={16} />
                    Edit
                  </Link>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busyId !== null}
                    onClick={() =>
                      changeStatus(
                        listing,
                        available ? 'unavailable' : 'available',
                      )
                    }
                  >
                    {busyId === listing.id
                      ? 'Updating…'
                      : available
                        ? 'Mark unavailable'
                        : 'Mark available'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost owner-listing__remove"
                    disabled={busyId !== null}
                    onClick={() => {
                      setNotice(null)
                      setConfirmId(listing.id)
                    }}
                  >
                    Remove
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {removing && (
        <Dialog
          title="Remove this listing?"
          busy={busyId !== null}
          onClose={() => setConfirmId(null)}
        >
          <p>
            Remove <strong>“{removing.title}”</strong> from your collection and
            the marketplace. This listing will no longer appear here.
          </p>
          {notice?.error && (
            <p className="form-error" role="alert">
              {notice.text}
            </p>
          )}
          <div className="owner-workspace__confirm-actions">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busyId !== null}
              onClick={() => setConfirmId(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={busyId !== null}
              onClick={() => changeStatus(removing, 'removed')}
            >
              {busyId !== null ? 'Removing…' : 'Yes, remove'}
            </button>
          </div>
        </Dialog>
      )}
    </section>
  )
}
