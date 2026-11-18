import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Dialog from './Dialog.jsx'

// Anchored in-app navigation + actual page unload. BrowserRouter cannot block history traversal.
export default function UnsavedChangesGuard({ dirty }) {
  const [destination, setDestination] = useState(null)
  const navigate = useNavigate()
  useEffect(() => {
    if (!dirty) return
    const unload = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const link = (event) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return
      const anchor = event.target.closest('a[href]')
      if (
        !anchor ||
        anchor.target === '_blank' ||
        anchor.hasAttribute('download')
      )
        return
      const url = new URL(anchor.href)
      if (
        url.origin !== location.origin ||
        (url.pathname === location.pathname && url.search === location.search)
      )
        return
      event.preventDefault()
      event.stopPropagation()
      setDestination(url.pathname + url.search + url.hash)
    }
    window.addEventListener('beforeunload', unload)
    document.addEventListener('click', link, true)
    return () => {
      window.removeEventListener('beforeunload', unload)
      document.removeEventListener('click', link, true)
    }
  }, [dirty])
  if (!destination || !dirty) return null
  return (
    <Dialog title="Leave without saving?" onClose={() => setDestination(null)}>
      <p>
        Your unsaved changes will be lost. Stay here to finish saving your work.
      </p>
      <div className="verification-actions">
        <button
          className="btn btn-primary"
          onClick={() => setDestination(null)}
        >
          Keep editing
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => {
            const next = destination
            setDestination(null)
            navigate(next)
          }}
        >
          Leave page
        </button>
      </div>
    </Dialog>
  )
}
