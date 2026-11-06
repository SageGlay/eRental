import { supabase } from './supabaseClient.js'

export const formatTime = (iso) => new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })

// Reopens the renter's conversation about a listing, or starts one. Returns { id } or { error }.
export async function startConversation(listingId, renterId) {
  const find = () => supabase.from('conversations').select('id').eq('listing_id', listingId).eq('renter_id', renterId).maybeSingle()
  const existing = await find()
  if (existing.data) return { id: existing.data.id }
  const created = await supabase.from('conversations').insert({ listing_id: listingId, renter_id: renterId }).select('id').single()
  if (created.data) return { id: created.data.id }
  const retry = await find() // in case it was created a moment ago
  return retry.data ? { id: retry.data.id } : { error: created.error?.message ?? 'Could not start the conversation.' }
}
