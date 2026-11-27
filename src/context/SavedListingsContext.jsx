import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import { supabase } from '../lib/supabaseClient.js'
import { visibleRental } from '../lib/discovery.js'
import '../styles/saved-listings.css'

const SavedListingsContext = createContext(null)
const emptyRows = []
const batchSize = 200

async function readBookmarks(userId, signal) {
  const rows = []
  let cursor = null
  while (true) {
    let query = supabase.from('saved_listings')
      .select('listing_id,created_at,listings(category_id,status,removed_by_admin)')
      .eq('user_id', userId)
      .in('listings.status', ['available', 'unavailable'])
      .eq('listings.removed_by_admin', false)
      .order('listing_id')
      .limit(batchSize)
    if (cursor) query = query.gt('listing_id', cursor)
    const { data, error } = await query.abortSignal(signal)
    if (error) throw error
    // Keep a removable bookmark when RLS or moderation hides the joined listing.
    rows.push(...data.map(row => ({ ...row, listings: visibleRental(row.listings) ? row.listings : null })))
    if (data.length < batchSize) break
    cursor = data[data.length - 1].listing_id
  }
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at) || a.listing_id.localeCompare(b.listing_id))
}

export function SavedListingsProvider({ children }) {
  const { user } = useAuth()
  const userId = user?.id
  const identity = useRef(userId)
  identity.current = userId
  const [snapshot, setSnapshot] = useState(null)
  const [pending, setPending] = useState([])
  const [notice, setNotice] = useState(null)
  const writes = useRef(new Map())
  const lastRead = useRef(null)
  const channel = useRef(null)

  const refresh = useCallback(async () => {
    if (!userId || identity.current !== userId) return
    lastRead.current?.abort()
    const controller = new AbortController()
    lastRead.current = controller
    const timer = setTimeout(() => controller.abort(), 15000)
    try {
      const rows = await readBookmarks(userId, controller.signal)
      if (identity.current === userId && lastRead.current === controller) {
        setSnapshot({ userId, rows, error: null })
      }
    } catch {
      if (identity.current === userId && lastRead.current === controller) {
        setSnapshot({ userId, rows: [], error: 'We couldn’t load your saved listings. Check your connection and try again.' })
      }
    } finally {
      clearTimeout(timer)
    }
  }, [userId])

  useEffect(() => {
    setSnapshot(null)
    setNotice(null)
    setPending([])
    if (!userId) return
    refresh()
    const visible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', visible)
    // Only an invalidation signal leaves this tab; bookmark contents stay in Supabase.
    const updates = typeof BroadcastChannel === 'function' ? new BroadcastChannel('erental-saved-listings') : null
    channel.current = updates
    if (updates) updates.onmessage = visible
    return () => {
      document.removeEventListener('visibilitychange', visible)
      updates?.close()
      channel.current = null
      lastRead.current?.abort()
      lastRead.current = null
      for (const controller of writes.current.values()) controller.abort()
      writes.current.clear()
    }
  }, [userId, refresh])

  useEffect(() => {
    if (!notice || notice.error) return
    const timer = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(timer)
  }, [notice])

  const current = userId && snapshot?.userId === userId ? snapshot : null
  const rows = current?.rows ?? emptyRows
  const savedIds = useMemo(() => new Set(rows.map(row => row.listing_id)), [rows])
  const savedCategoryIds = useMemo(() => [...new Set(rows.filter(row => row.listings).map(row => row.listings.category_id))], [rows])

  async function setSaved(listing, shouldSave) {
    if (!userId || !current || current.error || writes.current.has(listing.id)) return
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    writes.current.set(listing.id, controller)
    setPending([...writes.current.keys()])
    setNotice(null)
    try {
      const table = supabase.from('saved_listings')
      const query = shouldSave
        ? table.insert({ user_id: userId, listing_id: listing.id })
        : table.delete().eq('user_id', userId).eq('listing_id', listing.id)
      const { error } = await query.abortSignal(controller.signal)
      if (error && !(shouldSave && error.code === '23505')) throw error
      if (identity.current !== userId) return
      setNotice({ userId, text: shouldSave ? 'Listing saved.' : 'Listing removed from saved.' })
    } catch {
      if (identity.current !== userId) return
      setNotice({ userId, error: true, text: 'We couldn’t confirm that change. Check the refreshed saved state before trying again.' })
    } finally {
      clearTimeout(timer)
      if (identity.current === userId && writes.current.get(listing.id) === controller) {
        channel.current?.postMessage('refresh')
        await refresh()
        if (writes.current.get(listing.id) === controller) {
          writes.current.delete(listing.id)
          setPending([...writes.current.keys()])
        }
      }
    }
  }

  const value = { rows, savedIds, savedCategoryIds, loading: Boolean(userId && !current), error: current?.error, pending, refresh, setSaved }
  return (
    <SavedListingsContext.Provider value={value}>
      {children}
      {notice && notice.userId === userId && (
        <div className={`saved-feedback ${notice.error ? 'form-error' : 'form-success'}`}>
          <span role={notice.error ? 'alert' : 'status'}>{notice.text}</span>
          {notice.error && <button type="button" className="btn btn-ghost" onClick={() => setNotice(null)}>Dismiss</button>}
        </div>
      )}
    </SavedListingsContext.Provider>
  )
}

export const useSavedListings = () => useContext(SavedListingsContext)
