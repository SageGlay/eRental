import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import CreateListing from './CreateListing.jsx'
import EmptyState from '../components/EmptyState.jsx'

const FIELDS = 'id, owner_id, category_id, title, description, price, price_period, deposit, location_text, terms, details, status, removed_by_admin, listing_photos(id, storage_path, sort_order)'

// Loads a listing and reuses the create form in "edit" mode. Only the owner can edit.
export default function EditListing() {
  const { id } = useParams()
  const { user } = useAuth()
  const [state, setState] = useState({ listing: null, loading: true })

  useEffect(() => {
    let cancelled = false
    supabase.from('listings').select(FIELDS).eq('id', id).maybeSingle().then(({ data }) => {
      if (!cancelled) setState({ listing: data, loading: false })
    })
    return () => { cancelled = true }
  }, [id])

  const { listing, loading } = state
  if (loading) return <p className="container page" aria-busy="true">Loading…</p>
  if (!listing || listing.owner_id !== user.id || listing.status === 'removed' || listing.removed_by_admin) {
    return (
      <section className="container page">
        <EmptyState icon="🔒" title="You can’t edit this listing" action={<Link className="btn btn-primary" to="/my-listings">Go to my listings</Link>}>
          It may not exist, may have been removed, or may belong to someone else.
        </EmptyState>
      </section>
    )
  }
  return <CreateListing key={listing.id} listing={listing} />
}
