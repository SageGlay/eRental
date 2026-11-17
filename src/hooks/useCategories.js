import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

// Loads the ten categories from the database, in their intended order.
export function useCategories() {
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState({
    categories: [],
    loading: Boolean(supabase),
    error: supabase ? null : 'Supabase is not configured.',
  })

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    setState({ categories: [], loading: true, error: null })
    ;(async () => {
      try {
        const { data, error } = await supabase.from('categories').select('id, slug, name').order('sort_order').abortSignal(controller.signal)
        if (error) throw error
        if (!cancelled) setState({ categories: data ?? [], loading: false, error: null })
      } catch {
        if (!cancelled) setState({ categories: [], loading: false, error: 'We couldn’t load the categories. Check your connection and try again.' })
      } finally {
        clearTimeout(timeout)
      }
    })()
    return () => { cancelled = true; clearTimeout(timeout); controller.abort() }
  }, [revision])

  return { ...state, retry: () => setRevision((v) => v + 1) }
}
