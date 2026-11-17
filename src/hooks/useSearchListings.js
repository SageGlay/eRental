import { useCallback, useEffect, useRef, useState } from 'react'
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
  const active = useRef(null)
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState({ items: [], total: 0, hasMore: false, loading: Boolean(supabase), loadingMore: false, error: supabase ? null : 'Supabase is not configured.', moreError: null })

  const fetchPage = useCallback((offset, signal) => {
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
    }).abortSignal(signal)
  }, [key])

  useEffect(() => {
    const request = { controller: new AbortController(), loading: true, loadingMore: false, offset: 0, total: 0, exhausted: false, key }
    active.current = request
    if (!supabase || !enabled) {
      setState({ items: [], total: 0, hasMore: false, loading: false, loadingMore: false, error: supabase ? null : 'Supabase is not configured.', moreError: null })
      return () => { request.controller.abort(); active.current = null }
    }
    setState({ items: [], total: 0, hasMore: false, loading: true, loadingMore: false, error: null, moreError: null })
    const timeout = setTimeout(() => request.controller.abort(), 15000)
    ;(async () => {
      try {
        const { data, error } = await fetchPage(0, request.controller.signal)
        if (error) throw error
        if (active.current !== request) return
        request.offset = data?.length ?? 0
        request.total = Number(data?.[0]?.total_count ?? 0)
        request.exhausted = !data?.length
        setState({ items: (data ?? []).map(toCard), total: request.total, hasMore: !request.exhausted && request.offset < request.total, loading: false, loadingMore: false, error: null, moreError: null })
      } catch {
        if (active.current === request) setState((s) => ({ ...s, loading: false, error: 'Check your connection and try again.' }))
      } finally {
        request.loading = false
        clearTimeout(timeout)
      }
    })()
    return () => { clearTimeout(timeout); request.controller.abort(); active.current = null }
  }, [fetchPage, enabled, revision, key])

  async function loadMore() {
    const request = active.current
    if (!supabase || !enabled || !request || request.key !== key || request.loading || request.loadingMore || request.exhausted || request.offset >= request.total) return
    request.loadingMore = true
    // Use a separate controller so a timed-out page can be retried without
    // poisoning all later requests for the same filters.
    const controller = new AbortController()
    const abort = () => controller.abort()
    request.controller.signal.addEventListener('abort', abort, { once: true })
    const timeout = setTimeout(abort, 15000)
    setState((s) => ({ ...s, loadingMore: true, moreError: null }))
    try {
      const { data, error } = await fetchPage(request.offset, controller.signal)
      if (error) throw error
      if (active.current !== request) return
      // Pagination advances by rows fetched, even when changing catalog data
      // causes overlapping IDs that are omitted from the rendered list.
      request.offset += data?.length ?? 0
      request.total = Number(data?.[0]?.total_count ?? request.total)
      request.exhausted = !data?.length
      setState((s) => ({ ...s, total: request.total, hasMore: !request.exhausted && request.offset < request.total, loadingMore: false, moreError: null, items: [...s.items, ...(data ?? []).map(toCard).filter((item) => !s.items.some((old) => old.id === item.id))] }))
    } catch {
      if (active.current === request) setState((s) => ({ ...s, loadingMore: false, moreError: 'We couldn’t load more listings. Your current results are still here.' }))
    } finally {
      clearTimeout(timeout)
      request.controller.signal.removeEventListener('abort', abort)
      request.loadingMore = false
    }
  }

  return { ...state, loadMore, retry: () => setRevision((r) => r + 1) }
}
