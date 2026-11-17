import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

export function useListingRecord(id, fields) {
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState({ id, listing: null, loading: Boolean(supabase), error: supabase ? null : 'Supabase is not configured.' })

  useEffect(() => {
    if (!supabase) return
    let active = true
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    setState({ id, listing: null, loading: true, error: null })
    ;(async () => {
      try {
        const { data, error } = await supabase.from('listings').select(fields).eq('id', id).maybeSingle().abortSignal(controller.signal)
        if (error) throw error
        if (active) setState({ id, listing: data, loading: false, error: null })
      } catch {
        if (active) setState({ id, listing: null, loading: false, error: 'We couldn’t load this listing. Check your connection and try again.' })
      } finally {
        clearTimeout(timeout)
      }
    })()
    return () => { active = false; clearTimeout(timeout); controller.abort() }
  }, [id, fields, revision])

  // Do not briefly render the old record for a new URL before the effect runs.
  const current = state.id === id ? state : { listing: null, loading: Boolean(supabase), error: supabase ? null : 'Supabase is not configured.' }
  return { ...current, retry: () => setRevision((v) => v + 1) }
}
