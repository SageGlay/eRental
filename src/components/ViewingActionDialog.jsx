import { useEffect, useId, useRef, useState } from 'react'
import Dialog from './Dialog.jsx'
import { formatViewingTime, manilaTimestamp } from '../lib/viewings.js'

export default function ViewingActionDialog({
  title, subject, summary, actionLabel, askTime = false, existingTime, noteLabel,
  noteRequired = false, onClose, apply,
}) {
  const timeId = useId()
  const noteId = useId()
  const [form, setForm] = useState({ time: '', note: '' })
  const [confirmed, setConfirmed] = useState(null)
  const [error, setError] = useState(null)
  const [uncertain, setUncertain] = useState(false)
  const [busy, setBusy] = useState(false)
  const reviewHeading = useRef(null)
  const firstField = useRef(null)
  const reviewButton = useRef(null)
  const editing = useRef(false)
  const active = useRef(null)
  useEffect(() => () => {
    active.current?.abort()
    active.current = null
  }, [])
  useEffect(() => {
    if (confirmed && !busy) reviewHeading.current?.focus()
    if (!confirmed && editing.current) {
      (firstField.current || reviewButton.current)?.focus()
      editing.current = false
    }
  }, [confirmed, busy])

  function review(event) {
    event.preventDefault()
    const start = askTime ? manilaTimestamp(form.time) : null
    const note = form.note.trim() || null
    if (askTime && (!start || Date.parse(start) <= Date.now())) {
      setError('Choose a future date and time in Philippine time.')
      return
    }
    if (noteRequired && !note) {
      setError('Enter a reason before continuing.')
      return
    }
    setConfirmed({ start, note })
    setError(null)
  }

  async function confirm(event) {
    event.preventDefault()
    if (active.current) return
    const controller = new AbortController()
    active.current = controller
    const deadline = setTimeout(() => controller.abort(), 15000)
    setBusy(true)
    setError(null)
    try {
      const problem = await apply(confirmed, controller.signal)
      if (active.current === controller && problem) {
        setError(problem)
        setUncertain(false)
      }
    } catch {
      if (active.current === controller) {
        setError('We couldn’t confirm the change. Retry these same details or check Viewings.')
        setUncertain(true)
      }
    } finally {
      clearTimeout(deadline)
      if (active.current === controller) {
        setBusy(false)
        active.current = null
      }
    }
  }

  function setField(field, value) {
    setForm(values => ({ ...values, [field]: value }))
  }

  return (
    <Dialog title={title} onClose={() => onClose(Boolean(error))} busy={busy}>
      <p className="viewing-subject">{subject}</p>
      <p>{summary}</p>
      <form className="viewing-form" onSubmit={confirmed ? confirm : review}>
        {confirmed ? (
          <>
            <h3 ref={reviewHeading} tabIndex={-1}>Review the details</h3>
            {(confirmed.start || existingTime) && <p>{formatViewingTime(confirmed.start || existingTime)} Philippine time · 30 minutes</p>}
            {confirmed.note && <p className="prewrap">{confirmed.note}</p>}
          </>
        ) : (
          <>
            {askTime && <div className="field">
              <label htmlFor={timeId}>Preferred date and time</label>
              <input ref={firstField} id={timeId} type="datetime-local" required value={form.time}
                onChange={event => setField('time', event.target.value)} />
              <p className="field__hint">Asia/Manila · Philippine time · 30 minutes</p>
            </div>}
            {noteLabel && <div className="field">
              <label htmlFor={noteId}>{noteLabel}</label>
              <textarea ref={askTime ? undefined : firstField} id={noteId} value={form.note} maxLength={500} rows={3}
                required={noteRequired} onChange={event => setField('note', event.target.value)} />
            </div>}
          </>
        )}
        {error && <p role="alert" className="form-error">{error}</p>}
        <div className="viewing-form__actions">
          {confirmed && (askTime || noteLabel) && <button type="button" className="btn btn-ghost" disabled={busy || uncertain}
            onClick={() => { editing.current = true; setConfirmed(null); setError(null) }}>Edit details</button>}
          <button ref={reviewButton} type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : confirmed ? actionLabel : 'Review details'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
