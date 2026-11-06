const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0, maximumFractionDigits: 2 })

export const formatPrice = (amount) => peso.format(amount)
export const formatRate = (amount, period) => `${peso.format(amount)} / ${period}`
export const formatDate = (iso) => new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
