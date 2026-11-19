const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0, maximumFractionDigits: 2 })

export const formatPrice = (amount) => peso.format(amount)
export const formatRate = (amount, period) => `${peso.format(amount)} / ${period}`
const dateOptions = { year: 'numeric', month: 'short', day: 'numeric' }
const calendarDate = new Intl.DateTimeFormat('en-PH', { ...dateOptions, timeZone: 'UTC' })
const localDate = new Intl.DateTimeFormat('en-PH', dateOptions)

export function formatDate(iso) {
  // Postgres DATE values name a calendar day. Only timestamps represent an instant.
  const formatter = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? calendarDate : localDate
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : formatter.format(date)
}
