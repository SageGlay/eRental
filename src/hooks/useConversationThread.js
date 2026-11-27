import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { announceMessageActivity, listenForMessageActivity, useMessageRealtime } from './useMessageRealtime.js'

const messageFields = 'id, sender_id, body, created_at, read_at'
const batchSize = 500

async function readMessages(conversationId, signal) {
  // Page by immutable identity. Sort at the end so timestamp ties and delayed
  // requests cannot duplicate a bubble or change the reading order.
  const rows = new Map()
  let cursor = null
  for (;;) {
    let query = supabase.from('messages').select(messageFields)
      .eq('conversation_id', conversationId).order('id').limit(batchSize)
    if (cursor) query = query.gt('id', cursor)
    const { data, error } = await query.abortSignal(signal)
    if (error) throw error
    for (const row of data ?? []) rows.set(row.id, row)
    if (!data || data.length < batchSize) break
    cursor = data[data.length - 1].id
  }
  return [...rows.values()].sort((a, b) =>
    new Date(a.created_at) - new Date(b.created_at) || a.id.localeCompare(b.id),
  )
}

export function useConversationThread(conversationId, userId, followLatest) {
  const [messages, setMessages] = useState(null)
  const [messageError, setMessageError] = useState('')
  const [unreadStart, setUnreadStart] = useState(null)
  const [unseen, setUnseen] = useState(false)
  const current = useRef(null)
  const read = useRef(null)
  const queued = useRef(false)

  const loadMessages = useCallback(async function load(replace = false) {
    if (!conversationId) return null
    if (read.current && !replace) {
      queued.current = true
      return null
    }
    read.current?.abort()
    const controller = new AbortController()
    read.current = controller
    const timeout = setTimeout(() => controller.abort(), 15_000)
    try {
      const rows = await readMessages(conversationId, controller.signal)
      if (read.current !== controller) return null
      const previousIds = new Set(current.current?.map(({ id }) => id))
      const incoming = rows.filter((row) => row.sender_id !== userId && !row.read_at)
      if (incoming.length) setUnreadStart((start) => start ?? incoming[0].id)
      if (current.current && !followLatest.current && incoming.some((row) => !previousIds.has(row.id))) {
        setUnseen(true)
      }
      current.current = rows
      setMessages(rows)
      setMessageError('')
      // Mark only the received IDs observed at the live end in a visible tab.
      // Unseen or response-racing arrivals will appear on the next refresh.
      if (document.visibilityState === 'visible' && followLatest.current) {
        for (let start = 0; start < incoming.length; start += 50) {
          const ids = incoming.slice(start, start + 50).map((row) => row.id)
          const { error } = await supabase.from('messages')
            .update({ read_at: new Date().toISOString() })
            .eq('conversation_id', conversationId)
            .neq('sender_id', userId)
            .is('read_at', null)
            .in('id', ids)
            .abortSignal(controller.signal)
          if (error || read.current !== controller) break
          announceMessageActivity()
        }
      }
      return read.current === controller ? rows : null
    } catch {
      if (read.current === controller) {
        setMessageError('We couldn’t load your messages. Check your connection and try again.')
      }
      return null
    } finally {
      clearTimeout(timeout)
      if (read.current === controller) {
        read.current = null
        if (queued.current) {
          queued.current = false
          void load()
        }
      }
    }
  }, [conversationId, userId, followLatest])

  const onMessageChange = useCallback(() => {
    void loadMessages()
  }, [loadMessages])
  const connection = useMessageRealtime('conversation_id', conversationId, onMessageChange)

  useEffect(() => {
    if (!conversationId) return
    const refresh = () => {
      if (!document.hidden) void loadMessages()
    }
    void loadMessages()
    const timeout = setInterval(refresh, connection === 'connected' ? 30_000 : 8000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearInterval(timeout)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  // A transport change adjusts the fallback separately from active read lifetime.
  }, [conversationId, loadMessages, connection])

  useEffect(() => () => {
    queued.current = false
    read.current?.abort()
    read.current = null
  }, [conversationId])

  return { messages, messageError, loadMessages, unreadStart, unseen, setUnseen, connection }
}

export function useConversationContact(conversationId) {
  const [contact, setContact] = useState(null)
  const [contactError, setContactError] = useState(false)
  const active = useRef(null)
  const refresh = useCallback(async (clear = false) => {
    if (!conversationId) return
    if (clear) setContact(null)
    active.current?.abort()
    const controller = new AbortController()
    active.current = controller
    const timer = setTimeout(() => controller.abort(), 15_000)
    try {
      const { data, error } = await supabase.rpc('conversation_contact_status', {
        p_conversation_id: conversationId,
      }).abortSignal(controller.signal)
      if (error || typeof data?.contact_allowed !== 'boolean' || typeof data?.blocked_by_me !== 'boolean') {
        throw error ?? new Error('Invalid contact status')
      }
      if (active.current === controller) {
        setContact(data)
        setContactError(false)
      }
    } catch {
      if (active.current === controller) {
        setContact(null)
        setContactError(true)
      }
    } finally {
      clearTimeout(timer)
      if (active.current === controller) active.current = null
    }
  }, [conversationId])

  useEffect(() => {
    if (!conversationId) return
    void refresh()
    const refreshVisible = () => { if (!document.hidden && !active.current) void refresh() }
    const unlisten = listenForMessageActivity(refreshVisible)
    const timer = setInterval(refreshVisible, 8000)
    window.addEventListener('focus', refreshVisible)
    return () => {
      clearInterval(timer)
      unlisten()
      window.removeEventListener('focus', refreshVisible)
      active.current?.abort()
      active.current = null
    }
  }, [conversationId, refresh])
  return { contact, contactError, refreshContact: refresh }
}
