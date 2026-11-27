import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { REVIEW_DISPUTE_REASONS, REVIEW_TEXT_LIMIT, isUncertainWrite } from '../lib/reviewTrust.js'
import { supabase } from '../lib/supabaseClient.js'
import Dialog from './Dialog.jsx'

const actions = {
  reply: {
    title: 'Owner response',
    button: 'Publish response',
    success: 'Your response was published.',
    rpc: 'save_review_response',
  },
  remove: {
    title: 'Remove your response?',
    button: 'Remove response',
    success: 'Your response was removed.',
    rpc: 'remove_review_response',
  },
  dispute: {
    title: 'Dispute review',
    button: 'Submit dispute',
    success: 'Your dispute was submitted.',
    rpc: 'submit_review_dispute',
  },
}

export default function ReviewActionDialog({ mode, review, response, onClose, onDone }) {
  const [reason, setReason] = useState('')
  const [content, setContent] = useState(response?.response_text ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [unconfirmed, setUnconfirmed] = useState(false)
  const reasonField = useRef(null)
  const contentField = useRef(null)
  const write = useRef(null)
  const titleId = useId()
  const textId = titleId + '-text'
  const reasonId = titleId + '-reason'
  const action = actions[mode]

  useEffect(() => () => {
    const activeWrite = write.current
    write.current = null
    activeWrite?.abort()
  }, [])

  async function submit(event) {
    event.preventDefault()
    if (write.current || unconfirmed) return
    const text = content.trim()
    if (mode === 'dispute' && !Object.hasOwn(REVIEW_DISPUTE_REASONS, reason)) {
      setError('Choose a reason for the dispute.')
      reasonField.current?.focus()
      return
    }
    if (mode !== 'remove' && (!text || text.length > REVIEW_TEXT_LIMIT)) {
      setError(mode === 'dispute' ? 'Describe the policy concern in 1 to 1,000 characters.' : 'Enter a response of 1 to 1,000 characters.')
      contentField.current?.focus()
      return
    }

    const params = { p_review_id: review.id }
    if (mode === 'reply') params.p_response = text
    if (mode === 'dispute') {
      params.p_reason = reason
      params.p_details = text
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    write.current = controller
    setBusy(true)
    setError('')
    try {
      const { error: failure, status } = await supabase.rpc(action.rpc, params).abortSignal(controller.signal)
      if (write.current !== controller) return
      if (failure) {
        if (isUncertainWrite(status)) throw failure
        setError(failure.code === '23505' && mode === 'dispute'
          ? 'This review already has a pending dispute.'
          : 'This change was declined. Check that you can still manage this review.')
        return
      }
      onDone(action.success)
    } catch {
      if (write.current !== controller) return
      setUnconfirmed(true)
      setError(mode === 'dispute'
        ? 'We couldn’t confirm this dispute. Check your dispute history for its status.'
        : 'We couldn’t confirm this change. Reload the review before making another change.')
    } finally {
      clearTimeout(timeout)
      if (write.current === controller) {
        write.current = null
        setBusy(false)
      }
    }
  }

  return (
    <Dialog title={action.title} busy={busy} onClose={unconfirmed ? () => onDone('') : onClose}>
      <form className="review-dialog-form" onSubmit={submit} noValidate>
        {mode === 'dispute' && (
          <>
            <p>Only you and authorized moderators can read the details you enter here.</p>
            <div className="field">
              <label htmlFor={reasonId}>Reason</label>
              <select id={reasonId} ref={reasonField} value={reason} disabled={busy || unconfirmed} onChange={event => setReason(event.target.value)}>
                <option value="">Choose a reason</option>
                {Object.entries(REVIEW_DISPUTE_REASONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
          </>
        )}
        {mode === 'remove'
          ? <p>The renter’s review and rating will stay published.</p>
          : (
            <div className="field">
              <label htmlFor={textId}>{mode === 'reply' ? 'Public response' : 'Supporting details'}</label>
              <textarea id={textId} ref={contentField} value={content} maxLength={REVIEW_TEXT_LIMIT} disabled={busy || unconfirmed} rows={4} onChange={event => setContent(event.target.value)} />
            </div>
          )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="review-actions">
          {unconfirmed
            ? mode === 'dispute'
              ? <Link className="btn btn-primary" to="/review-disputes">Check dispute history</Link>
              : <button type="button" className="btn btn-primary" onClick={() => onDone('')}>Reload review</button>
            : <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : action.button}</button>}
        </div>
      </form>
    </Dialog>
  )
}
