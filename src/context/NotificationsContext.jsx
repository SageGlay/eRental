import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import { supabase } from '../lib/supabaseClient.js'

const NotificationsContext = createContext(null)

export function NotificationsProvider({ children }) {
  const userId = useAuth().user?.id
  const [result, setResult] = useState(null)
  const [revision, setRevision] = useState(0)
  const refreshCount = useCallback(() => setRevision((value) => value + 1), [])

  useEffect(() => {
    if (!userId) {
      setResult(null)
      return
    }
    let active = true
    let controller = null
    async function load() {
      if (controller) return
      controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)
      try {
        const { count, error } = await supabase.from('notifications')
          .select('id', { head: true, count: 'exact' })
          .eq('recipient_id', userId).is('read_at', null).abortSignal(controller.signal)
        if (error || count === null) throw new Error('Count unavailable')
        if (active) setResult({ userId, count, error: false })
      } catch {
        if (active) setResult({ userId, count: null, error: true })
      } finally {
        clearTimeout(timeout)
        controller = null
      }
    }
    const refreshVisible = () => { if (!document.hidden) load() }
    load()
    const timer = setInterval(refreshVisible, 30000)
    window.addEventListener('focus', refreshVisible)
    document.addEventListener('visibilitychange', refreshVisible)
    return () => {
      active = false
      clearInterval(timer)
      window.removeEventListener('focus', refreshVisible)
      document.removeEventListener('visibilitychange', refreshVisible)
      controller?.abort()
    }
  }, [userId, revision])

  const current = userId && result?.userId === userId ? result : null
  return (
    <NotificationsContext.Provider value={{ unreadCount: current?.count ?? null, countError: Boolean(current?.error), refreshCount }}>
      {children}
    </NotificationsContext.Provider>
  )
}

export const useNotifications = () => useContext(NotificationsContext)
