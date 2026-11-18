import { createClient } from '@supabase/supabase-js'

function initializeSupabase(config) {
  if (config.error) return config

  try {
    return { client: createClient(config.url, config.key) }
  } catch {
    return {
      error:
        'Supabase could not start. Check the project URL and public key in your app settings.',
    }
  }
}

export const {
  client: supabase = null,
  error: supabaseConfigurationError = null,
} = initializeSupabase(__ERENTAL_SUPABASE_CONFIG__)
export const isSupabaseConfigured = Boolean(supabase)
