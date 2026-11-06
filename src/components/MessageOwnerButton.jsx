import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { startConversation } from '../lib/messages.js'

export default function MessageOwnerButton({ listing }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!user || user.id === listing.owner_id) return null

  async function open() {
    setBusy(true)
    setError('')
    const result = await startConversation(listing.id, user.id)
    setBusy(false)
    if (result.error) return setError(result.error)
    navigate(`/messages/${result.id}`)
  }

  return (
    <div className="message-owner">
      <button type="button" className="btn btn-ghost" disabled={busy} onClick={open}>{busy ? 'Opening…' : 'Message the owner'}</button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  )
}
