import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'

export function useUnreadCount() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const userId = user?.id
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (!supabase || !userId) return
    let active = true
    let controller
    async function load() {
      controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)
      try {
        const { count, error } = await supabase.from('messages')
          .select('id', { count: 'exact', head: true })
          .is('read_at', null)
          .neq('sender_id', userId)
          .abortSignal(controller.signal)
        if (active && !error) setResult({ userId, count: count ?? 0 })
      } catch {
        // Keep the last confirmed badge for this account until the next refresh.
      } finally {
        clearTimeout(timeout)
      }
    }
    load()
    const timer = setInterval(load, 30000)
    return () => {
      active = false
      clearInterval(timer)
      controller?.abort()
    }
  }, [userId, pathname])

  return result?.userId === userId ? (result?.count ?? 0) : 0
}
