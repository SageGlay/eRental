import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'

// Number of messages sent to me that I haven't opened yet. Refreshes on every page change and every 30 seconds.
export function useUnreadCount() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const [count, setCount] = useState(0)
  const userId = user?.id

  useEffect(() => {
    if (!supabase || !userId) {
      setCount(0)
      return
    }
    let cancelled = false
    const load = () => supabase.from('messages').select('id', { count: 'exact', head: true }).is('read_at', null).neq('sender_id', userId)
      .then(({ count: total }) => { if (!cancelled) setCount(total ?? 0) })
    load()
    const timer = setInterval(load, 30000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [userId, pathname])

  return count
}
