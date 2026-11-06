import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

const CARD_FIELDS = 'id, title, price, price_period, location_text, status, created_at, categories(name, slug), listing_photos(storage_path, sort_order)'

// Newest listings first. Removed listings are never shown here.
export function useLatestListings(limit = 6) {
  const [state, setState] = useState({
    listings: [],
    loading: Boolean(supabase),
    error: supabase ? null : 'Supabase is not configured.',
  })

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    supabase.from('listings').select(CARD_FIELDS).neq('status', 'removed').order('created_at', { ascending: false }).limit(limit)
      .then(({ data, error }) => {
        if (!cancelled) setState({ listings: data ?? [], loading: false, error: error ? error.message : null })
      })
    return () => { cancelled = true }
  }, [limit])

  return state
}
