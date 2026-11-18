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
  'id, title, price, price_period, status, categories(name), listing_photos(storage_path, sort_order)'

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
  const [params, setParams] = useSearchParams()
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
    setState((current) => ({ ...current, loading: true, error: null }))
    supabase
      .from('listings')
      .select(FIELDS)
      .eq('owner_id', user.id)
      .neq('status', 'removed')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!cancelled)
          setState({
            listings: data ?? [],
            loading: false,
            error: error ? error.message : null,
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
    return () => {
      cancelled = true
    }
  }, [user.id, loadAttempt])

  async function changeStatus(listing, nextStatus) {
    if (mutationBusy.current) return
    mutationBusy.current = true
    setBusyId(listing.id)
    setNotice(null)
    try {
      const { data, error } = await supabase
        .from('listings')
        .update({ status: nextStatus })
        .eq('id', listing.id)
        .select('id')
      if (error || !data?.length) {
        setNotice({
          error: true,
          text: `We couldn’t update “${listing.title}”. ${error ? error.message : 'Please try again.'}`,
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
    } catch (error) {
      setNotice({
        error: true,
        text: `We couldn’t update “${listing.title}”. ${error.message || 'Check your connection and try again.'}`,
      })
    } finally {
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
  const visible =
    status === 'all'
      ? listings
      : listings.filter((listing) => listing.status === status)
  const removing = listings.find((listing) => listing.id === confirmId)
  return (
    <section className="container page owner-workspace">
      <PageHeading
        eyebrow="Your owner space"
        title="My listings"
        actions={
          <>
            <Link className="btn btn-ghost" to="/bookings">
              <Icon name="calendar" />
              View bookings
            </Link>
            <Link className="btn btn-primary" to="/list">
              <Icon name="plus" />
              List an item
            </Link>
          </>
        }
      >
        <p>
          Keep your rentals up to date, manage availability and make room for
          your next booking.
        </p>
      </PageHeading>
      <div className="owner-workspace__toolbar">
        <div>
          <h2>Your rental collection</h2>
          <p>
            Available listings can receive requests. Mark a listing unavailable
            when you’re not ready to rent it out.
          </p>
        </div>
        <div className="field">
          <label htmlFor="owner-listing-status">Show listings</label>
          <select
            id="owner-listing-status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">All listings</option>
            <option value="available">Available</option>
            <option value="unavailable">Unavailable</option>
          </select>
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
          We couldn’t load your listings ({error}).
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
          title={`No ${status} listings`}
          action={
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setStatus('all')}
            >
              Show all listings
            </button>
          }
        >
          Your other rentals are still in your collection. Change the filter to
          see them.
        </EmptyState>
      )}
      {!error && (
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
                    <span
                      className={`owner-listing__status ${available ? 'owner-listing__status--available' : ''}`}
                    >
                      <span aria-hidden="true" />
                      {available ? 'Available' : 'Unavailable'}
                    </span>
                  </div>
                  <h3>
                    <Link to={`/listings/${listing.id}`}>{listing.title}</Link>
                  </h3>
                  <p className="owner-listing__rate">
                    {formatRate(listing.price, listing.price_period)}
                  </p>
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
                    <Link
                      className="btn btn-ghost"
                      to={`/listings/${listing.id}`}
                    >
                      View details
                      <Icon name="arrowRight" size={16} />
                    </Link>
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
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {!loading && listings.length > 0 && (
        <p className="owner-workspace__footnote">
          <Icon name="box" size={16} />
          Removed listings no longer appear in this collection.
        </p>
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
