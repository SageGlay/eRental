import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

const CARD_FIELDS = 'id, title, price, price_period, location_text, status, created_at, categories(name, slug), profiles(verified_kind, verified_at), listing_photos(storage_path, sort_order)'

// Newest listings first. Removed listings are never shown here.
export function useLatestListings(limit = 6) {
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState({
    listings: [],
    loading: Boolean(supabase),
    error: supabase ? null : 'Supabase is not configured.',
  })

  useEffect(() => {
    if (!supabase) return
    let active = true
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    setState({ listings: [], loading: true, error: null })

    async function load() {
      try {
        const { data, error } = await supabase.from('listings')
          .select(CARD_FIELDS)
          .neq('status', 'removed')
          .order('created_at', { ascending: false })
          .limit(limit)
          .abortSignal(controller.signal)
        if (error) throw error
        if (active) setState({ listings: data ?? [], loading: false, error: null })
      } catch {
        if (active) setState({ listings: [], loading: false, error: 'We couldn’t load the latest listings. Check your connection and try again.' })
      } finally {
        clearTimeout(timeout)
      }
    }

    load()
    return () => { active = false; clearTimeout(timeout); controller.abort() }
  }, [limit, revision])

  return { ...state, retry: () => setRevision((value) => value + 1) }
}
