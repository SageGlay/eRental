import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

// Loads the ten categories from the database, in their intended order.
export function useCategories() {
  const [state, setState] = useState({
    categories: [],
    loading: Boolean(supabase),
    error: supabase ? null : 'Supabase is not configured.',
  })

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    supabase.from('categories').select('id, slug, name').order('sort_order').then(({ data, error }) => {
      if (!cancelled) setState({ categories: data ?? [], loading: false, error: error ? error.message : null })
    })
    return () => { cancelled = true }
  }, [])

  return state
}
