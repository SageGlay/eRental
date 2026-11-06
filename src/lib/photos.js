import { supabase } from './supabaseClient.js'

// Must match the rules of the "listing-photos" storage bucket in Supabase.
export const ACCEPTED_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024
export const MAX_PHOTOS = 10

export const photoUrl = (path) => supabase.storage.from('listing-photos').getPublicUrl(path).data.publicUrl
export const sortedPhotos = (photos = []) => [...photos].sort((a, b) => a.sort_order - b.sort_order)
