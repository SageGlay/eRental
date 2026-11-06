import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

const PAGE_SIZE = 12

// Turns a row from the search_listings database function into the shape ListingCard expects.
const toCard = (r) => ({
  id: r.id, title: r.title, price: r.price, price_period: r.price_period, location_text: r.location_text,
  status: r.status, created_at: r.created_at,
  categories: { name: r.category_name, slug: r.category_slug },
  listing_photos: r.cover_path ? [{ storage_path: r.cover_path, sort_order: 0 }] : [],
})

export function useSearchListings(filters, enabled = true) {
  const key = JSON.stringify(filters)
  const [state, setState] = useState({ items: [], total: 0, loading: Boolean(supabase), loadingMore: false, error: supabase ? null : 'Supabase is not configured.' })

  const fetchPage = useCallback((offset) => {
    const f = JSON.parse(key)
    return supabase.rpc('search_listings', {
      p_query: f.q || null,
      p_category: f.categoryId,
      p_location: f.location || null,
      p_min_price: f.min === '' ? null : Number(f.min),
      p_max_price: f.max === '' ? null : Number(f.max),
      p_period: f.per || null,
      p_sort: f.sort,
      p_limit: PAGE_SIZE,
      p_offset: offset,
    })
  }, [key])

  useEffect(() => {
    if (!supabase || !enabled) return
    let cancelled = false
    setState((s) => ({ ...s, items: [], total: 0, loading: true, error: null }))
    fetchPage(0).then(({ data, error }) => {
      if (cancelled) return
      setState({ items: (data ?? []).map(toCard), total: Number(data?.[0]?.total_count ?? 0), loading: false, loadingMore: false, error: error ? error.message : null })
    })
    return () => { cancelled = true }
  }, [fetchPage, enabled])

  async function loadMore() {
    setState((s) => ({ ...s, loadingMore: true }))
    const { data, error } = await fetchPage(state.items.length)
    setState((s) => error
      ? { ...s, loadingMore: false, error: error.message }
      : { ...s, loadingMore: false, items: [...s.items, ...(data ?? []).map(toCard)] })
  }

  return { ...state, loadMore }
}
