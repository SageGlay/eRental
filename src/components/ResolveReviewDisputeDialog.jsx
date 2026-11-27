import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { formatDate } from '../lib/format.js'
import { REVIEW_DISPUTE_REASONS, REVIEW_TEXT_LIMIT, isUncertainWrite } from '../lib/reviewTrust.js'
import { supabase } from '../lib/supabaseClient.js'
import useReviewResource from '../hooks/useReviewResource.js'
import Dialog from './Dialog.jsx'
import LoadError from './LoadError.jsx'
import { StarRating } from './Stars.jsx'

export default function ResolveReviewDisputeDialog({ item, onClose, onRecheck }) {
  const [action, setAction] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [unconfirmed, setUnconfirmed] = useState(false)
  const actionField = useRef(null)
  const noteField = useRef(null)
  const retry = useRef(null)
  const write = useRef(null)
  const name = useId()
  const load = useCallback(async signal => {
    const { data, error: failure } = await supabase.rpc('get_review_dispute_evidence', { p_dispute_id: item.id }).abortSignal(signal)
    if (failure || !data) throw new Error('Evidence unavailable')
    return data
  }, [item.id])
  const evidence = useReviewResource(load)
  const open = item.status === 'pending'

  useEffect(() => () => {
    const activeWrite = write.current
    write.current = null
    activeWrite?.abort()
  }, [])

  useEffect(() => {
    if (unconfirmed && !busy) retry.current?.focus()
  }, [unconfirmed, busy])

  async function resolve(event) {
    event.preventDefault()
    if (!open || !evidence.data || write.current || unconfirmed) return
    const text = note.trim()
    if (!action) {
      setError('Choose a decision.')
      actionField.current?.focus()
      return
    }
    if (!text || text.length > REVIEW_TEXT_LIMIT) {
      setError('Enter a decision reason of 1 to 1,000 characters.')
      noteField.current?.focus()
      return
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    write.current = controller
    setBusy(true)
    setError('')
    try {
      const { error: failure, status } = await supabase.rpc('resolve_review_dispute', {
        p_dispute_id: item.id,
        p_action: action,
        p_note: text,
      }).abortSignal(controller.signal)
      if (write.current !== controller) return
      if (failure) {
        if (isUncertainWrite(status) || status === 409 || failure.code === '55000') throw failure
        setError('This decision could not be saved. Check your access and the case status.')
        return
      }
      onRecheck(action === 'uphold' ? 'Dispute upheld. The review is hidden.' : 'Dispute dismissed.')
    } catch {
      if (write.current !== controller) return
      setUnconfirmed(true)
      setError('We couldn’t confirm this decision. Refresh the queue and check the dispute before trying again.')
    } finally {
      clearTimeout(timeout)
      if (write.current === controller) {
        write.current = null
        setBusy(false)
      }
    }
  }

  return (
    <Dialog title={open ? 'Review dispute' : 'Dispute evidence'} busy={busy} onClose={unconfirmed ? () => onRecheck() : onClose}>
      {evidence.loading && <p role="status">Loading evidence…</p>}
      {evidence.error && <LoadError onRetry={evidence.refresh}>We couldn’t load evidence for this dispute.</LoadError>}
      {evidence.data && (
        <>
          <div className="review">
            <h3>{REVIEW_DISPUTE_REASONS[item.reason] ?? 'Policy concern'}</h3>
            <p>{item.details}</p>
          </div>
          <div className="review">
            <h3>{evidence.data.listing_title || 'Rental listing'}</h3>
            <p><StarRating value={evidence.data.rating} /> · {formatDate(evidence.data.created_at)}</p>
            <p>{evidence.data.comment || 'The renter left a rating without a written comment.'}</p>
            <p className="detail__meta">{evidence.data.booking_completed ? 'Completed rental' : 'Rental completion unavailable'} · {evidence.data.is_published ? 'Published review' : 'Hidden review'}</p>
          </div>
          {open && (
            <form className="review-dialog-form" noValidate onSubmit={resolve}>
              <div className="field">
                <label htmlFor={name + '-action'}>Decision</label>
                <select id={name + '-action'} ref={actionField} value={action} onChange={event => setAction(event.target.value)} disabled={busy || unconfirmed}>
                  <option value="">Choose a decision</option>
                  <option value="dismiss">Dismiss dispute</option>
                  <option value="uphold">Uphold and hide review</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor={name + '-note'}>Decision reason</label>
                <textarea id={name + '-note'} ref={noteField} rows={4} maxLength={REVIEW_TEXT_LIMIT} value={note} onChange={event => setNote(event.target.value)} disabled={busy || unconfirmed} />
              </div>
              {error && <p role="alert" className="form-error">{error}</p>}
              {unconfirmed
                ? <button ref={retry} type="button" className="btn btn-primary" onClick={() => onRecheck()}>Check dispute status</button>
                : <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Record decision'}</button>}
            </form>
          )}
        </>
      )}
    </Dialog>
  )
}
