import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { reportReasonLabel, reportReasons, reportStatusLabel } from '../lib/conversationSafety.js'
import { formatTime } from '../lib/messages.js'
import { announceMessageActivity } from '../hooks/useMessageRealtime.js'
import Dialog from './Dialog.jsx'
import Icon from './Icon.jsx'
import LoadError from './LoadError.jsx'

export function useOwnConversationReports(conversationId, userId) {
  const [rows, setRows] = useState([])
  const [error, setError] = useState(false)
  const active = useRef(null)
  const refresh = useCallback(async () => {
    if (!conversationId) return
    active.current?.abort()
    const controller = new AbortController()
    active.current = controller
    const deadline = setTimeout(() => controller.abort(), 15_000)
    try {
      const { data, error } = await supabase.from('conversation_reports')
        .select('id,reason,status,admin_note,created_at')
        .eq('conversation_id', conversationId)
        .eq('reporter_id', userId)
        .order('created_at', { ascending: false }).order('id').limit(12)
        .abortSignal(controller.signal)
      if (error) throw error
      if (active.current === controller) {
        setRows(data ?? [])
        setError(false)
      }
    } catch {
      if (active.current === controller) setError(true)
    } finally {
      clearTimeout(deadline)
      if (active.current === controller) active.current = null
    }
  }, [conversationId, userId])
  useEffect(() => {
    void refresh()
    return () => {
      active.current?.abort()
      active.current = null
    }
  }, [refresh])
  return { rows, error, refresh }
}

export function ConversationReportHistory({ reports }) {
  const { rows, error, refresh } = reports
  if (!rows.length && !error) return null
  return (
    <section className="conversation-report-history" aria-labelledby="conversation-reports">
      <h2 id="conversation-reports" tabIndex={-1}>Your conversation reports</h2>
      {error ? (
        <LoadError onRetry={refresh}>We couldn’t load your report history. Try again.</LoadError>
      ) : (
        <ul>
          {rows.map((report) => (
            <li key={report.id}>
              <div><strong>{reportReasonLabel(report.reason)}</strong> · {reportStatusLabel(report.status)}</div>
              <time dateTime={report.created_at}>{formatTime(report.created_at)}</time>
              {report.admin_note && <p>{report.admin_note}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function ContactBlockDialog({ userId, blocked, onClose, onSaved, onRefresh }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const active = useRef(null)
  useEffect(() => () => {
    active.current?.abort()
    active.current = null
  }, [])
  async function confirm() {
    if (active.current) return
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)
    active.current = controller
    setError('')
    setBusy(true)
    try {
      const { error } = await supabase.rpc('set_user_block', {
        p_user_id: userId, p_blocked: !blocked,
      }).abortSignal(controller.signal)
      if (active.current !== controller) return
      if (error) throw error
      announceMessageActivity()
      onSaved(!blocked ? 'Account blocked.' : 'Your block was removed.')
    } catch {
      if (active.current === controller) {
        setError('We couldn’t confirm the change. Check the refreshed contact status.')
        onRefresh()
      }
    } finally {
      clearTimeout(timeout)
      if (active.current === controller) {
        active.current = null
        setBusy(false)
      }
    }
  }
  return (
    <Dialog title={blocked ? 'Unblock this account?' : 'Block this account?'} busy={busy} onClose={onClose}>
      <p>
        {blocked
          ? 'This removes your block. A separate block can still restrict contact.'
          : 'Either account’s active block prevents new messages, conversations and viewing requests between you. Your conversation history and existing rental obligations stay accessible.'}
      </p>
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="dialog-actions">
        <button type="button" className="btn btn-primary" onClick={confirm} disabled={busy || Boolean(error)}>
          {busy ? 'Saving…' : blocked ? 'Unblock account' : 'Block account'}
        </button>
      </div>
    </Dialog>
  )
}

export function ConversationReportDialog({ conversationId, messages, userId, onClose, onSubmitted }) {
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [evidence, setEvidence] = useState([])
  const [review, setReview] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [retryBlocked, setRetryBlocked] = useState(false)
  const active = useRef(null)
  const reasonInput = useRef(null)
  const reviewHeading = useRef(null)
  const candidates = useRef(messages.slice(-12).reverse()).current
  useEffect(() => () => {
    active.current?.abort()
    active.current = null
  }, [])
  useEffect(() => {
    if (review) reviewHeading.current?.focus()
  }, [review])

  function toggleEvidence(id, checked) {
    setEvidence((selected) => checked ? [...selected, id] : selected.filter((value) => value !== id))
  }

  function check(event) {
    event.preventDefault()
    if (!reason) {
      setError('Choose a report reason.')
      reasonInput.current?.focus()
      return
    }
    setError('')
    setReview(true)
  }

  async function submit() {
    if (active.current) return
    const controller = new AbortController()
    active.current = controller
    const timer = setTimeout(() => controller.abort(), 15_000)
    setBusy(true)
    setError('')
    try {
      const { data, error, status } = await supabase.rpc('report_conversation', {
        p_conversation_id: conversationId,
        p_reason: reason,
        p_details: details.trim() || null,
        p_message_ids: evidence,
      }).abortSignal(controller.signal)
      if (active.current !== controller) return
      if (error && status && status < 500 && status !== 408) {
        if (error.code === '23505') {
          setRetryBlocked(true)
          setError('You already have a pending report for this conversation.')
        } else {
          setError('We couldn’t submit this report. Check your details and try again.')
        }
        return
      }
      if (error || !data) throw error ?? new Error('Report unavailable')
      onSubmitted('Conversation reported. An administrator will review it.')
    } catch {
      if (active.current === controller) {
        setRetryBlocked(true)
        setError('We couldn’t confirm your report. Close this dialog to check your report history before trying again.')
      }
    } finally {
      clearTimeout(timer)
      if (active.current === controller) {
        active.current = null
        setBusy(false)
      }
    }
  }

  return (
    <Dialog title="Report conversation" busy={busy} onClose={onClose}>
      {review ? (
        <div className="conversation-report-form">
          <h3 ref={reviewHeading} tabIndex={-1}>Review your report</h3>
          <p><strong>{reportReasonLabel(reason)}</strong></p>
          {details.trim() && <p>{details.trim()}</p>}
          <p>{evidence.length} selected message{evidence.length === 1 ? '' : 's'} will be available to the reviewing administrator.</p>
          {error && <p role="alert" className="form-error">{error}</p>}
          <div className="dialog-actions">
            <button className="btn btn-ghost" type="button" disabled={busy || retryBlocked} onClick={() => { setReview(false); setError('') }}>Edit report</button>
            <button className="btn btn-primary" type="button" disabled={busy || retryBlocked} onClick={submit}>{busy ? 'Sending…' : 'Submit report'}</button>
          </div>
        </div>
      ) : (
        <form className="conversation-report-form" onSubmit={check} noValidate>
          <div className="field">
            <label htmlFor="conversation-report-reason">Report reason</label>
            <select ref={reasonInput} id="conversation-report-reason" value={reason} required onChange={(event) => setReason(event.target.value)}>
              <option value="">Choose a reason</option>
              {reportReasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="conversation-report-details">Supporting details (optional)</label>
            <textarea id="conversation-report-details" rows={3} maxLength={1000} value={details} onChange={(event) => setDetails(event.target.value)} />
          </div>
          {candidates.length > 0 && (
            <fieldset className="conversation-report-evidence">
              <legend>Recent messages (optional)</legend>
              <p className="field__hint">Select up to five relevant messages to share with the reviewing administrator.</p>
              {candidates.map((message) => {
                const selected = evidence.includes(message.id)
                return (
                  <label key={message.id}>
                    <input type="checkbox" checked={selected} disabled={!selected && evidence.length >= 5} onChange={(event) => toggleEvidence(message.id, event.target.checked)} />
                    <span><strong>{message.sender_id === userId ? 'You' : 'Other participant'}</strong> · {message.body.slice(0, 140)}{message.body.length > 140 ? '…' : ''}</span>
                  </label>
                )
              })}
            </fieldset>
          )}
          {error && <p role="alert" className="form-error">{error}</p>}
          <div className="dialog-actions">
            <button type="submit" className="btn btn-primary"><Icon name="shield" size={18} /> Review report</button>
          </div>
        </form>
      )}
    </Dialog>
  )
}
