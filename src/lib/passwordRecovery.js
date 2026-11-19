import { createClient } from '@supabase/supabase-js'

const resetPath = '/reset-password'

// Capture the email callback before the usual persisted client reads the URL.
// A recovery for one account must leave another open marketplace session alone.
function consumeRecoveryFragment() {
  if (typeof window === 'undefined') return null
  const path = window.location.pathname.replace(/\/+$/, '').toLowerCase()
  const fragment = new URLSearchParams(window.location.hash.slice(1))
  // Supabase may fall back to the configured Site URL instead of the requested
  // redirect. Route its recovery session before the ordinary client sees it.
  if (path !== resetPath && fragment.get('type') !== 'recovery') return null
  window.history.replaceState(window.history.state, '', resetPath)
  if (fragment.has('error') || fragment.get('type') !== 'recovery') return null
  const access_token = fragment.get('access_token')
  const refresh_token = fragment.get('refresh_token')
  return access_token && refresh_token ? { access_token, refresh_token } : null
}

let linkCredentials = consumeRecoveryFragment()

function recoveryAuth() {
  const { url, key } = __ERENTAL_SUPABASE_CONFIG__
  return createClient(url, key, {
    auth: {
      storageKey: 'erental-recovery',
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
    },
  }).auth
}

export function openPasswordRecovery() {
  if (!linkCredentials) return null
  const credentials = linkCredentials
  linkCredentials = null
  const auth = recoveryAuth()
  return { auth, ready: auth.setSession(credentials) }
}

export async function requestPasswordRecovery(email) {
  const auth = recoveryAuth()
  try {
    return await auth.resetPasswordForEmail(email, {
      redirectTo: new URL(resetPath, window.location.origin).href,
    })
  } finally {
    await auth.dispose()
  }
}
