import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import { announceMessageActivity, listenForMessageActivity, useMessageRealtime } from './useMessageRealtime.js'

export function useUnreadCount() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const userId = user?.id
  const [result, setResult] = useState(null)

  const invalidate = useCallback(() => announceMessageActivity(false), [])
  useMessageRealtime('recipient_id', userId, invalidate)

  useEffect(() => {
    if (!supabase || !userId) return
    let active = true
    let controller
    let refreshQueued = false
    async function load() {
      if (controller) {
        refreshQueued = true
        return
      }
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
        controller = null
        if (active && refreshQueued) {
          refreshQueued = false
          void load()
        }
      }
    }
    const visible = () => { if (!document.hidden) void load() }
    const unlisten = listenForMessageActivity(load)
    load()
    const timer = setInterval(visible, 30000)
    window.addEventListener('focus', visible)
    document.addEventListener('visibilitychange', visible)
    return () => {
      active = false
      clearInterval(timer)
      window.removeEventListener('focus', visible)
      document.removeEventListener('visibilitychange', visible)
      unlisten()
      controller?.abort()
    }
  }, [userId, pathname])

  return result?.userId === userId ? (result?.count ?? 0) : 0
}
