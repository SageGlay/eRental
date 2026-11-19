import { supabase } from './supabaseClient.js'

export const formatTime = (iso) =>
  new Date(iso).toLocaleString('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

// A retry always looks up the same renter/listing pair before attempting creation.
export async function startConversation(listingId, renterId) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  const unavailable =
    'We couldn’t open the conversation. Check your connection and try again.'
  const find = () =>
    supabase
      .from('conversations')
      .select('id')
      .eq('listing_id', listingId)
      .eq('renter_id', renterId)
      .abortSignal(controller.signal)
      .maybeSingle()
  try {
    const existing = await find()
    if (existing.error) return { error: unavailable }
    if (existing.data) return { id: existing.data.id }
    const created = await supabase
      .from('conversations')
      .insert({ listing_id: listingId, renter_id: renterId })
      .select('id')
      .abortSignal(controller.signal)
      .single()
    if (created.data) return { id: created.data.id }
    if (!controller.signal.aborted) {
      const confirmed = await find()
      if (confirmed.data) return { id: confirmed.data.id }
    }
    return { error: unavailable }
  } catch {
    return { error: unavailable }
  } finally {
    clearTimeout(timeout)
  }
}
