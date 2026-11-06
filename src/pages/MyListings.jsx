import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import { formatRate } from '../lib/format.js'
import { photoUrl, sortedPhotos } from '../lib/photos.js'
import EmptyState from '../components/EmptyState.jsx'

const FIELDS = 'id, title, price, price_period, status, categories(name), listing_photos(storage_path, sort_order)'

export default function MyListings() {
  const { user } = useAuth()
  const [state, setState] = useState({ listings: [], loading: true, error: null })
  const [busyId, setBusyId] = useState(null)
  const [confirmId, setConfirmId] = useState(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    supabase.from('listings').select(FIELDS).eq('owner_id', user.id).neq('status', 'removed').order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!cancelled) setState({ listings: data ?? [], loading: false, error: error ? error.message : null })
      })
    return () => { cancelled = true }
  }, [user.id])

  async function changeStatus(listing, status) {
    setBusyId(listing.id)
    setMessage('')
    const { data, error } = await supabase.from('listings').update({ status }).eq('id', listing.id).select('id')
    setBusyId(null)
    setConfirmId(null)
    if (error || !data?.length) return setMessage(`We couldn’t update “${listing.title}”. ${error ? error.message : 'Please try again.'}`)
    setState((s) => ({ ...s, listings: status === 'removed' ? s.listings.filter((l) => l.id !== listing.id) : s.listings.map((l) => (l.id === listing.id ? { ...l, status } : l)) }))
    if (status === 'removed') setMessage(`“${listing.title}” was removed.`)
  }

  const { listings, loading, error } = state
  return (
    <section className="container page">
      <div className="my-listings__head">
        <h1>My listings</h1>
        <Link className="btn btn-primary" to="/list">List an item</Link>
      </div>
      {loading && <p aria-busy="true">Loading your listings…</p>}
      {error && <p className="form-error" role="alert">We couldn’t load your listings ({error}).</p>}
      {message && <p className="form-success" role="status">{message}</p>}
      {!loading && !error && listings.length === 0 && (
        <EmptyState icon="📦" title="You haven’t listed anything yet" action={<Link className="btn btn-primary" to="/list">Create your first listing</Link>}>
          Listings you create will show up here, where you can edit them, mark them unavailable or remove them.
        </EmptyState>
      )}
      <ul className="my-listings">
        {listings.map((l) => {
          const cover = sortedPhotos(l.listing_photos)[0]
          const available = l.status === 'available'
          return (
            <li className="my-listing" key={l.id}>
              <div className="my-listing__thumb">{cover ? <img src={photoUrl(cover.storage_path)} alt="" /> : <span aria-hidden="true">📷</span>}</div>
              <div className="my-listing__info">
                <Link to={`/listings/${l.id}`}><strong>{l.title}</strong></Link>
                <span>{formatRate(l.price, l.price_period)} · {l.categories?.name}</span>
                <span className={`status ${available ? 'status--available' : 'status--unavailable'}`}>{available ? 'Available' : 'Unavailable'}</span>
              </div>
              <div className="my-listing__actions">
                {confirmId === l.id ? (
                  <>
                    <span>Remove this listing?</span>
                    <button type="button" className="btn btn-danger" disabled={busyId === l.id} onClick={() => changeStatus(l, 'removed')}>Yes, remove</button>
                    <button type="button" className="btn btn-ghost" onClick={() => setConfirmId(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <Link className="btn btn-ghost" to={`/listings/${l.id}/edit`}>Edit</Link>
                    <button type="button" className="btn btn-ghost" disabled={busyId === l.id} onClick={() => changeStatus(l, available ? 'unavailable' : 'available')}>
                      {available ? 'Mark unavailable' : 'Mark available'}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => setConfirmId(l.id)}>Remove</button>
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
