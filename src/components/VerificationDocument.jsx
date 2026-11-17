import { useEffect, useRef, useState } from 'react'
import { downloadVerificationDocument } from '../lib/verification.js'

export default function VerificationDocument({ submission }) {
  const [state, setState] = useState({
    url: null,
    type: null,
    error: null,
    loading: false,
  })
  const mounted = useRef(true)
  const download = useRef(null)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      download.current?.abort()
    }
  }, [])
  useEffect(
    () => () => {
      if (state.url) URL.revokeObjectURL(state.url)
    },
    [state.url],
  )
  async function open() {
    if (state.loading) return
    const controller = new AbortController()
    download.current = controller
    const timeout = setTimeout(() => controller.abort(), 15000)
    setState({ url: null, type: null, error: null, loading: true })
    try {
      const blob = await downloadVerificationDocument(
        submission,
        controller.signal,
      )
      if (!mounted.current) return
      setState({
        url: URL.createObjectURL(blob),
        type: blob.type,
        error: null,
        loading: false,
      })
    } catch {
      if (mounted.current)
        setState({
          url: null,
          type: null,
          loading: false,
          error:
            'We couldn’t open this private document. Check your access and try again.',
        })
    } finally {
      clearTimeout(timeout)
    }
  }
  return (
    <section
      className="private-document"
      aria-label="Private verification document"
    >
      <h3>Verification document</h3>
      <p className="field__hint">
        Private to the applicant and authorized administrators. Close this
        review when finished.
      </p>
      {!state.url && (
        <button
          type="button"
          className="btn btn-ghost"
          disabled={state.loading}
          onClick={open}
        >
          {state.loading ? 'Opening document…' : 'View private document'}
        </button>
      )}
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      {state.url && (
        <>
          {state.type.startsWith('image/') && (
            <img
              className="verification-document-image"
              src={state.url}
              alt="Privately submitted verification document"
            />
          )}
          <a
            className="btn btn-ghost"
            href={state.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open document in new tab
          </a>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() =>
              setState({ url: null, type: null, error: null, loading: false })
            }
          >
            Hide document
          </button>
        </>
      )}
    </section>
  )
}
