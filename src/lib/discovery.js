import { supabase } from './supabaseClient.js'

export const CARD_FIELDS = 'id, owner_id, category_id, title, price, price_period, location_text, status, created_at, categories(name, slug), profiles(display_name, account_type, business_name, verified_kind, verified_at), listing_photos(storage_path, sort_order)'
const GUEST_KEY = 'erental.recent-listings'
const LIMIT = 12
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
let sessionFallback = []

export function visibleRental(listing) {
  return Boolean(listing && ['available', 'unavailable'].includes(listing.status) && !listing.removed_by_admin)
}

function guestIds() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(GUEST_KEY) || '[]')
    if (!Array.isArray(stored)) return []
    return [...new Set(stored.filter(id => typeof id === 'string' && uuid.test(id)))].slice(0, LIMIT)
  } catch {
    return sessionFallback
  }
}

function saveGuestIds(ids) {
  sessionFallback = ids
  try {
    if (ids.length) sessionStorage.setItem(GUEST_KEY, JSON.stringify(ids))
    else sessionStorage.removeItem(GUEST_KEY)
  } catch {
    // Browsers that disable storage can still remember this page session in memory.
  }
}

export async function recordView(userId, listingId) {
  if (!uuid.test(listingId)) return
  if (userId) {
    const { error } = await supabase.rpc('record_listing_view', { p_listing_id: listingId })
      .abortSignal(AbortSignal.timeout(15000))
    if (error) throw error
  } else {
    saveGuestIds([listingId, ...guestIds().filter(id => id !== listingId)].slice(0, LIMIT))
  }
  window.dispatchEvent(new CustomEvent('erental:recent-listings', { detail: userId }))
}

export async function readHistory(userId, signal) {
  if (userId) {
    const { data, error } = await supabase.from('recently_viewed_listings')
      .select('listing_id, listings(' + CARD_FIELDS + ')').eq('user_id', userId)
      .in('listings.status', ['available', 'unavailable']).eq('listings.removed_by_admin', false)
      .order('viewed_at', { ascending: false }).order('listing_id').limit(LIMIT).abortSignal(signal)
    if (error) throw error
    return { rows: data.map(entry => entry.listings).filter(visibleRental), hasHistory: data.length > 0 }
  }
  const ids = guestIds()
  if (!ids.length) return { rows: [], hasHistory: false }
  const { data, error } = await supabase.from('listings').select(CARD_FIELDS).in('id', ids)
    .in('status', ['available', 'unavailable']).eq('removed_by_admin', false).abortSignal(signal)
  if (error) throw error
  const byId = new Map(data.filter(visibleRental).map(item => [item.id, item]))
  return { rows: ids.map(id => byId.get(id)).filter(Boolean), hasHistory: true }
}

export async function clearHistory(userId) {
  if (userId) {
    const { error } = await supabase.from('recently_viewed_listings').delete()
      .eq('user_id', userId).abortSignal(AbortSignal.timeout(15000))
    if (error) throw error
  } else {
    saveGuestIds([])
  }
}

export function ownerName(listing) {
  const owner = listing.profiles
  return (owner?.account_type === 'business' && owner.business_name?.trim()) || owner?.display_name?.trim()
}

// Among the newest public listings, feature up to three different owners with
// available, photographed rentals and a public name to put alongside the item.
export function featuredRentals(listings) {
  const owners = new Set()
  return listings.filter(item => {
    if (item.status !== 'available' || !item.listing_photos?.some(photo => photo.storage_path) ||
        !ownerName(item) || !item.owner_id || owners.has(item.owner_id)) return false
    owners.add(item.owner_id)
    return true
  }).slice(0, 3)
}

// Alternate recently viewed categories with saved categories so both sources
// can contribute even when the member has saved listings in many categories.
export function discoveryCategories(viewed, saved) {
  const recent = [...new Set(viewed.map(listing => listing.category_id))]
  const bookmarks = [...new Set(saved)].sort((a, b) => a - b)
  const ids = new Set()
  for (let i = 0; i < Math.max(recent.length, bookmarks.length); i++) {
    for (const id of [recent[i], bookmarks[i]]) {
      if (Number.isInteger(id) && id > 0) ids.add(id)
    }
    if (ids.size >= 4) break
  }
  return [...ids].slice(0, 4)
}

export async function readRecommendations(categories, signal) {
  const groups = await Promise.all(categories.map(async id => {
    const { data, error } = await supabase.from('listings').select(CARD_FIELDS)
      .eq('category_id', id).eq('status', 'available').eq('removed_by_admin', false)
      .order('created_at', { ascending: false }).order('id').limit(8).abortSignal(signal)
    if (error) throw error
    return data.filter(item => visibleRental(item) && item.status === 'available' && item.category_id === id)
  }))
  const items = new Map()
  for (let i = 0; i < 8; i++) {
    for (const group of groups) {
      const item = group[i]
      if (item) items.set(item.id, item)
    }
  }
  return [...items.values()]
}
