import { useEffect, useState } from 'react'
import { useBlocker, useNavigate } from 'react-router-dom'
import Dialog from './Dialog.jsx'

// Handle linked departures, browser history traversal and document unload.
export default function UnsavedChangesGuard({ dirty }) {
  const [destination, setDestination] = useState(null)
  const navigate = useNavigate()
  const history = useBlocker(({ historyAction, currentLocation, nextLocation }) =>
    dirty && historyAction === 'POP' &&
    (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search),
  )
  const cancel = () => {
    setDestination(null)
    if (history.state === 'blocked') history.reset()
  }
  const leave = () => {
    if (history.state === 'blocked') {
      history.proceed()
    } else if (destination) {
      navigate(destination)
      setDestination(null)
    }
  }
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
  if (!dirty || (!destination && history.state !== 'blocked')) return null
  return (
    <Dialog title="Leave without saving?" onClose={cancel}>
      <p>
        Your unsaved changes will be lost. Stay here to finish saving your work.
      </p>
      <div className="verification-actions">
        <button
          className="btn btn-primary"
          onClick={cancel}
        >
          Keep editing
        </button>
        <button
          className="btn btn-ghost"
          onClick={leave}
        >
          Leave page
        </button>
      </div>
    </Dialog>
  )
}
