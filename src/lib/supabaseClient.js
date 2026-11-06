import { createClient } from '@supabase/supabase-js'

// Only PUBLIC values belong here. VITE_ variables are visible in the browser.
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && key)
// null when .env is missing, so the app can show a helpful message instead of crashing.
export const supabase = isSupabaseConfigured ? createClient(url, key) : null
