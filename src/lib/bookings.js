import { supabase } from './supabaseClient.js'
import { formatDate } from './format.js'

export const STATUS_LABELS = { pending: 'Pending', accepted: 'Confirmed', rejected: 'Declined', cancelled: 'Cancelled', completed: 'Completed' }
export const formatRange = (start, end) => (start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`)
export const today = () => new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in the user's own time zone

// The database raises clear messages for most rules; this only rewrites the technical ones.
export function friendlyBookingError(error) {
  const message = error?.message ?? ''
  if (message.includes('bookings_one_pending_per_renter')) return 'You already have a pending request for this listing.'
  if (message.includes('bookings_no_overlap')) return 'Those dates overlap with another confirmed booking.'
  return message || 'Something went wrong. Please try again.'
}

// Returns null on success, or an error message. The database decides whether the change is allowed.
export async function setBookingStatus(id, status) {
  const { data, error } = await supabase.from('bookings').update({ status }).eq('id', id).select('id')
  if (error) return friendlyBookingError(error)
  if (!data?.length) return 'That booking could not be updated.'
  return null
}

// Display-only estimate. The database calculates the real simulated amounts when the renter pays.
export function estimateAmounts(b) {
  const days = Math.round((new Date(b.end_date) - new Date(b.start_date)) / 86400000) + 1
  const units = { hour: days * 24, day: days, week: Math.ceil(days / 7), month: Math.ceil(days / 30) }[b.price_period] ?? Math.ceil(days / 365)
  const rental = Number(b.price) * units
  const deposit = Number(b.deposit ?? 0)
  return { rental, deposit, total: rental + deposit }
}
