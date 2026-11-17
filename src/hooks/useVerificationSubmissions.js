import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { VERIFICATION_FIELDS } from '../lib/verification.js'

export function useVerificationSubmissions({
  userId,
  status = null,
  page = 1,
  ascending = false,
  admin = false,
}) {
  const key = JSON.stringify({ userId, status, page, ascending, admin })
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState({
    key,
    rows: [],
    total: 0,
    loading: true,
    error: null,
    outOfRange: false,
  })
  useEffect(() => {
    if (!supabase || (!admin && !userId)) return
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    let active = true
    setState((s) => ({
      key,
      rows: s.key === key ? s.rows : [],
      total: s.key === key ? s.total : 0,
      loading: true,
      error: null,
      outOfRange: false,
    }))
    ;(async () => {
      try {
        const fields = admin
          ? `${VERIFICATION_FIELDS}, applicant:profiles!verification_submissions_user_id_fkey(display_name, account_type, business_name, verified_kind, verified_at)`
          : VERIFICATION_FIELDS
        let query = supabase
          .from('verification_submissions')
          .select(fields, { count: 'exact' })
        if (!admin) query = query.eq('user_id', userId)
        if (status) query = query.eq('status', status)
        const { data, count, error } = await query
          .order('created_at', { ascending })
          .order('id', { ascending })
          .range((page - 1) * 10, page * 10 - 1)
          .abortSignal(controller.signal)
        if (error?.code === 'PGRST103' && page > 1) {
          if (active)
            setState({
              key,
              rows: [],
              total: 0,
              loading: false,
              error: null,
              outOfRange: true,
            })
          return
        }
        if (error) throw error
        if (active)
          setState({
            key,
            rows: data ?? [],
            total: count ?? 0,
            loading: false,
            error: null,
            outOfRange: false,
          })
      } catch {
        if (active)
          setState((s) => ({
            ...s,
            loading: false,
            error:
              'We couldn’t load verification requests. Check your connection and try again.',
          }))
      } finally {
        clearTimeout(timeout)
      }
    })()
    return () => {
      active = false
      clearTimeout(timeout)
      controller.abort()
    }
  }, [key, revision, userId, status, page, ascending, admin])
  const current =
    state.key === key
      ? state
      : { rows: [], total: 0, loading: true, error: null }
  return { ...current, refresh: () => setRevision((v) => v + 1) }
}
