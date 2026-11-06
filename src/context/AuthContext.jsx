import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [profileVersion, setProfileVersion] = useState(0)
  const [isAdmin, setIsAdmin] = useState(null) // null = not known yet
  const [loading, setLoading] = useState(Boolean(supabase))
  const userId = session?.user?.id

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  // Load the public profile row (created automatically by the database at sign-up).
  useEffect(() => {
    if (!supabase || !userId) {
      setProfile(null)
      return
    }
    supabase.from('profiles').select('display_name, avatar_url, account_type, business_name').eq('id', userId).single()
      .then(({ data }) => setProfile(data))
  }, [userId, profileVersion])

  // Only used to show or hide admin screens. The database enforces what admins may actually do.
  useEffect(() => {
    if (!supabase || !userId) {
      setIsAdmin(null)
      return
    }
    supabase.rpc('is_admin').then(({ data }) => setIsAdmin(Boolean(data)))
  }, [userId])

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    isAdmin,
    refreshProfile: () => setProfileVersion((v) => v + 1),
    signUp: (email, password, fullName) =>
      supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } }),
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signOut: () => supabase.auth.signOut(),
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
