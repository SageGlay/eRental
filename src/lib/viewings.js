export const VIEWING_STATUSES = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  reschedule_proposed: 'New time proposed',
  declined: 'Declined',
  cancelled: 'Cancelled',
  completed: 'Completed',
}

export const VIEWING_HISTORY_LABELS = {
  viewing_requested: 'Viewing requested',
  viewing_confirmed: 'Viewing confirmed',
  viewing_declined: 'Viewing declined',
  viewing_reschedule_proposed: 'New time proposed',
  viewing_reschedule_accepted: 'New time accepted',
  viewing_reschedule_declined: 'New time declined',
  viewing_cancelled: 'Viewing cancelled',
  viewing_completed: 'Viewing completed',
}

const formatManila = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short',
})

export const viewingHref = (id, tab) =>
  '/viewings' + (tab === 'incoming' ? '?tab=incoming' : '') + '#viewing-' + id

export const isViewingId = value =>
  typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)

export const formatViewingTime = value => formatManila.format(new Date(value))

export function manilaTimestamp(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const date = new Date(value + ':00+08:00')
  if (!Number.isFinite(date.getTime())) return null
  // Reject impossible calendar dates that Date would otherwise roll forward.
  const manilaWallClock = new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString()
  return manilaWallClock.slice(0, 16) === value ? date.toISOString() : null
}

export function viewingMutationError({ error, status }, request) {
  if (!status || status === 408 || status >= 500) return null
  if (error?.code === '23P01') return 'The owner has another confirmed viewing at that time.'
  if (error?.code === '23505' && request) return 'You already have an active request for this rental. Check Viewings.'
  if (error?.code === '40001') return 'This viewing changed. Refresh the page before trying again.'
  if (error?.code === '42501') return 'This account cannot make that viewing change.'
  if (error?.code === '22023' && error?.message) return error.message
  return 'We couldn’t make that change. Check the viewing and try again.'
}
