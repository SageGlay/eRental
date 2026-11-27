import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabaseClient.js'
import { isViewingId, viewingHref, viewingMutationError } from '../lib/viewings.js'
import Icon from './Icon.jsx'
import ViewingActionDialog from './ViewingActionDialog.jsx'
import '../styles/viewings.css'

export default function RequestViewingButton({ listingId, ownerId, returnTo, disabled = false }) {
  const { user } = useAuth()
  const { pathname, search } = useLocation()
  const [open, setOpen] = useState(false)
  const [sent, setSent] = useState(null)
  const requestId = useRef(null)
  const tracked = useRef(null)
  useEffect(() => {
    if (sent) tracked.current?.focus()
  }, [sent])
  if (!listingId || !ownerId || user?.id === ownerId) return null

  async function submit({ start, note }, signal) {
    requestId.current ??= crypto.randomUUID()
    const response = await supabase.rpc('request_viewing', {
      p_request_id: requestId.current,
      p_listing_id: listingId,
      p_start_at: start,
      p_note: note,
    }).abortSignal(signal)
    if (signal.aborted) throw new Error('Viewing request timed out')
    if (response.error) {
      const problem = viewingMutationError(response, true)
      if (problem) return problem
      throw new Error('Viewing response unavailable')
    }
    if (response.data !== requestId.current || !isViewingId(response.data))
      throw new Error('Viewing response unavailable')
    setSent(response.data)
    setOpen(false)
    requestId.current = null
    return null
  }

  if (sent) return (
    <p className="form-success" role="status">
      Viewing request sent. <Link ref={tracked} to={viewingHref(sent)}>Track your viewing</Link>
    </p>
  )
  if (!user) return (
    <Link className="btn btn-ghost" to="/login" state={{ returnTo: returnTo || pathname + search }}>
      Log in to request a viewing
    </Link>
  )
  return (
    <>
      <button className="btn btn-ghost" type="button" disabled={disabled} onClick={() => setOpen(true)}>
        <Icon name="calendar" size={18} />Request a viewing
      </button>
      {open && <ViewingActionDialog title="Request a viewing" actionLabel="Send viewing request"
        subject="Arrange a 30-minute appointment"
        summary="The owner will review the requested time. Viewings are separate from rental bookings."
        noteLabel="Note for the owner (optional)" askTime
        onClose={() => setOpen(false)} apply={submit} />}
    </>
  )
}
