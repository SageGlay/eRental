import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

const activityEvent = 'erental:message-activity'

export function announceMessageActivity(broadcast = true) {
  window.dispatchEvent(new Event(activityEvent))
  if (broadcast && typeof BroadcastChannel === 'function') {
    const channel = new BroadcastChannel(activityEvent)
    channel.postMessage('refresh')
    channel.close()
  }
}

export function listenForMessageActivity(callback) {
  window.addEventListener(activityEvent, callback)
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(activityEvent) : null
  channel?.addEventListener('message', callback)
  return () => {
    window.removeEventListener(activityEvent, callback)
    channel?.close()
  }
}

export function useMessageRealtime(column, id, onInvalidate) {
  const [state, setState] = useState(navigator.onLine ? 'connecting' : 'offline')

  useEffect(() => {
    if (!supabase || !id) return
    let active = true
    let timer
    const invalidate = () => {
      if (!active || timer) return
      timer = setTimeout(() => {
        timer = undefined
        if (active) onInvalidate()
      }, 80)
    }
    const online = () => {
      setState('reconnecting')
      invalidate()
    }
    const offline = () => setState('offline')
    setState(navigator.onLine ? 'connecting' : 'offline')
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)

    const binding = { schema: 'public', table: 'messages', filter: column + '=eq.' + id }
    const channel = supabase
      .channel('messages-' + column + '-' + crypto.randomUUID())
      .on('postgres_changes', { ...binding, event: 'INSERT' }, invalidate)
      .on('postgres_changes', { ...binding, event: 'UPDATE' }, invalidate)
      .subscribe((status) => {
        if (!active) return
        if (status === 'SUBSCRIBED') {
          setState(navigator.onLine ? 'connected' : 'offline')
          // The socket is only an invalidation signal. Fill gaps from PostgREST.
          invalidate()
        } else {
          setState(navigator.onLine ? 'reconnecting' : 'offline')
        }
      })

    return () => {
      active = false
      clearTimeout(timer)
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
      void supabase.removeChannel(channel)
    }
  }, [column, id, onInvalidate])

  return state
}
