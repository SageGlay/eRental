// Vite exposes these values in the browser. Only Supabase's public keys belong here.
function isPublicKey(key) {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true

  // Legacy anon keys are JWTs. The role check prevents accidental use of a
  // privileged key. Supabase still verifies the token and enforces privileges.
  const token = key.match(/^[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+$/)
  if (!token) return false
  try {
    const payload = atob(token[1].replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(payload)?.role === 'anon'
  } catch {
    return false
  }
}

export function validateSupabaseConfig(env) {
  const url = env.VITE_SUPABASE_URL?.trim()
  const key = env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url) return { error: 'Set VITE_SUPABASE_URL to the project URL.' }

  const invalidUrl =
    'Set VITE_SUPABASE_URL to a valid HTTP or HTTPS project URL without credentials, a query, or a fragment.'
  try {
    const parsed = new URL(url)
    if (
      !/^https?:\/\/[^/]/i.test(url) ||
      /[\s\\?#]/.test(url) ||
      parsed.username ||
      parsed.password
    ) {
      return { error: invalidUrl }
    }
  } catch {
    return { error: invalidUrl }
  }

  if (!key)
    return {
      error:
        'Set VITE_SUPABASE_ANON_KEY to the project’s public publishable or anon key.',
    }
  if (!isPublicKey(key)) {
    return {
      error:
        'VITE_SUPABASE_ANON_KEY must be a public publishable or legacy anon key.',
    }
  }

  return { url, key }
}
