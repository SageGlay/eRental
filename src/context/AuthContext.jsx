import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState({ session: null, loading: Boolean(supabase), error: null })
  const [sessionVersion, setSessionVersion] = useState(0)
  const [profileVersion, setProfileVersion] = useState(0)
  const [adminVersion, setAdminVersion] = useState(0)
  const [profileState, setProfileState] = useState({ userId: null, data: null, loading: false, error: null })
  const [adminState, setAdminState] = useState({ userId: null, allowed: null, error: null })
  const userId = auth.session?.user?.id

  useEffect(() => {
    if (!supabase) return
    let active = true
    let changed = false
    setAuth({ session: null, loading: true, error: null })
    const timeout = setTimeout(() => {
      if (active && !changed) {
        changed = true
        setAuth({ session: null, loading: false, error: 'We couldn’t restore your session. Try again or log in.' })
      }
    }, 15000)
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active || changed) return
      clearTimeout(timeout)
      if (error) setAuth({ session: null, loading: false, error: 'We couldn’t restore your session. Try again or log in.' })
      else setAuth({ session: data.session, loading: false, error: null })
    }).catch(() => {
      if (active && !changed) {
        clearTimeout(timeout)
        setAuth({ session: null, loading: false, error: 'We couldn’t restore your session. Try again or log in.' })
      }
    })
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // Initial-session errors belong to the explicit lookup. Later auth events
      // win over it, so a late response cannot resurrect a signed-out user.
      if (!active || event === 'INITIAL_SESSION') return
      changed = true
      clearTimeout(timeout)
      setAuth({ session, loading: false, error: null })
    })
    return () => { active = false; clearTimeout(timeout); data.subscription.unsubscribe() }
  }, [sessionVersion])

  useEffect(() => {
    if (!supabase || !userId) return
    let active = true
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    setProfileState((s) => ({ userId, session: auth.session, data: s.userId === userId ? s.data : null, loading: true, error: null }))
    ;(async () => {
      try {
        const { data, error } = await supabase.from('profiles').select('id, display_name, avatar_url, account_type, business_name')
          .eq('id', userId).maybeSingle().abortSignal(controller.signal)
        if (error) throw error
        if (active) setProfileState({ userId, session: auth.session, data, loading: false, error: data ? null : 'Your profile isn’t available. Try again or contact the project administrator.' })
      } catch {
        if (active) setProfileState((s) => ({ ...s, userId, loading: false, error: 'We couldn’t load your profile. Check your connection and try again.' }))
      } finally {
        clearTimeout(timeout)
      }
    })()
    return () => { active = false; clearTimeout(timeout); controller.abort() }
  }, [userId, auth.session, profileVersion])

  useEffect(() => {
    if (!supabase || !userId) return
    let active = true
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    setAdminState({ userId, session: auth.session, allowed: null, error: null })
    ;(async () => {
      try {
        const { data, error } = await supabase.rpc('is_admin').abortSignal(controller.signal)
        if (error || typeof data !== 'boolean') throw error ?? new Error('Invalid permission response')
        if (active) setAdminState({ userId, session: auth.session, allowed: data, error: null })
      } catch {
        if (active) setAdminState({ userId, session: auth.session, allowed: null, error: 'We couldn’t verify your administrator access. Try again.' })
      } finally {
        clearTimeout(timeout)
      }
    })()
    return () => { active = false; clearTimeout(timeout); controller.abort() }
  }, [userId, auth.session, adminVersion])

  // Scope derived values to the current identity, including the render before
  // its lookup effect runs. A previous user's role/profile must never carry over.
  const ownsProfile = Boolean(userId && profileState.session === auth.session)
  const ownsAdmin = Boolean(userId && adminState.session === auth.session)
  const value = {
    session: auth.session,
    user: auth.session?.user ?? null,
    loading: auth.loading,
    authError: auth.error,
    retrySession: () => setSessionVersion((v) => v + 1),
    profile: ownsProfile ? profileState.data : null,
    profileLoading: Boolean(userId && (!ownsProfile || profileState.loading)),
    profileError: ownsProfile ? profileState.error : null,
    isAdmin: ownsAdmin ? adminState.allowed : null,
    adminError: ownsAdmin ? adminState.error : null,
    refreshProfile: () => setProfileVersion((v) => v + 1),
    retryAdmin: () => setAdminVersion((v) => v + 1),
    signUp: (email, password, fullName) => supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } }),
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signOut: () => supabase.auth.signOut(),
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
