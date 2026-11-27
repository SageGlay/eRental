import { supabase } from './supabaseClient.js'

export const REVIEW_TEXT_LIMIT = 1000
export const REVIEW_PAGE_SIZE = 10
export const REVIEW_DISPUTE_REASONS = {
  abuse: 'Harassment or abusive language',
  personal_information: 'Inappropriate personal information',
  unrelated: 'Unrelated to this rental',
  fraud: 'Suspected fraudulent or manipulated content',
  other: 'Other policy concern',
}
export const REVIEW_DISPUTE_STATUSES = {
  pending: 'Pending',
  upheld: 'Upheld',
  dismissed: 'Dismissed',
}
export const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

export async function readReviewSummary(filters, signal) {
  const { data, error } = await supabase.rpc('public_review_summary', filters).abortSignal(signal)
  if (error) throw error
  const count = Number(data?.count)
  const average = data?.average === null ? null : Number(data?.average)
  if (!Number.isSafeInteger(count) || count < 0 || (count > 0 && !(average >= 1 && average <= 5))) {
    throw new Error('Invalid rating summary')
  }
  return { count, average }
}

export async function readListingReviews(listingId, page, signal) {
  const start = (page - 1) * REVIEW_PAGE_SIZE
  const [summary, { data, error }] = await Promise.all([
    readReviewSummary({ p_listing_id: listingId }, signal),
    supabase.from('reviews')
      .select('id,owner_id,rating,comment,created_at,reviewer:profiles!reviews_reviewer_id_fkey(display_name),review_responses(response_text,updated_at)')
      .eq('listing_id', listingId).eq('is_published', true)
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(start, start + REVIEW_PAGE_SIZE - 1).abortSignal(signal),
  ])
  if (error) throw error
  return { summary, rows: data ?? [] }
}

export function isUncertainWrite(status) {
  return !status || status === 408 || status >= 500
}
