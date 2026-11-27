import { useCallback, useEffect, useState } from 'react'

export default function useReviewResource(load) {
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState(null)
  const refresh = useCallback(() => setRevision(value => value + 1), [])

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    async function read() {
      try {
        const data = await load(controller.signal)
        if (active) setResult({ load, revision, data, error: false })
      } catch {
        if (active) setResult({ load, revision, data: null, error: true })
      } finally {
        clearTimeout(timeout)
      }
    }
    read()
    return () => {
      active = false
      clearTimeout(timeout)
      controller.abort()
    }
  }, [load, revision])

  const current = result?.load === load && result.revision === revision ? result : null
  return { data: current?.data, loading: !current, error: Boolean(current?.error), refresh }
}
