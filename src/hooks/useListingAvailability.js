import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

const isDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

export function useListingAvailability(listingId, enabled) {
  const active = useRef(null)
  const [state, setState] = useState({ ranges: [], loading: enabled, error: null })

  const refresh = useCallback(async () => {
    active.current?.abort()
    if (!enabled || !supabase) return null
    const controller = new AbortController()
    active.current = controller
    setState((s) => ({ ...s, loading: true, error: null }))
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      const { data, error } = await supabase.rpc('listing_booked_ranges', { p_listing_id: listingId }).abortSignal(controller.signal)
      if (error || !Array.isArray(data) || !data.every((range) => isDate(range?.start_date) && isDate(range?.end_date) && range.start_date <= range.end_date)) {
        throw error ?? new Error('Availability is unavailable.')
      }
      if (active.current !== controller) return null
      setState({ ranges: data, loading: false, error: null })
      return data
    } catch {
      if (active.current === controller) {
        setState({ ranges: [], loading: false, error: 'We couldn’t check the booked dates. Try again before sending a request.' })
      }
      return null
    } finally {
      clearTimeout(timeout)
    }
  }, [listingId, enabled])

  useEffect(() => {
    refresh()
    return () => { active.current?.abort(); active.current = null }
  }, [refresh])

  return { ...state, refresh }
}
