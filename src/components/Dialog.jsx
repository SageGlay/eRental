import { useEffect, useId, useRef } from 'react'

export default function Dialog({ title, onClose, children, busy = false }) {
  const dialog = useRef(null)
  const titleId = useId()
  useEffect(() => {
    const element = dialog.current
    const opener = document.activeElement
    element.showModal()
    return () => {
      element.close()
      if (opener?.isConnected) opener.focus()
    }
  }, [])
  useEffect(() => {
    if (busy) dialog.current?.focus()
  }, [busy])
  return (
    <dialog
      ref={dialog}
      className="app-dialog"
      tabIndex={-1}
      aria-busy={busy}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        if (!busy) onClose()
      }}
    >
      <div className="dialog-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={onClose}
          autoFocus
        >
          Close
        </button>
      </div>
      {children}
    </dialog>
  )
}
