import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useCategories } from '../hooks/useCategories.js'
import { fieldsFor } from '../data/categoryFields.js'
import { ACCEPTED_TYPES, MAX_PHOTO_BYTES, MAX_PHOTOS, photoUrl, sortedPhotos } from '../lib/photos.js'
import { saveListingRecord, savePhotoChanges } from '../lib/listingSave.js'
import LoadError from '../components/LoadError.jsx'

const EMPTY = { categoryId: '', title: '', description: '', price: '', period: 'day', deposit: '', location: '', terms: '' }

// Used for both creating a listing and (when `listing` is passed) editing one.
export default function CreateListing({ listing: existing = null }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { categories, loading: catsLoading, error: catsError, retry: retryCategories } = useCategories()
  const [form, setForm] = useState(existing ? {
    categoryId: String(existing.category_id), title: existing.title, description: existing.description,
    price: String(existing.price), period: existing.price_period, deposit: existing.deposit == null ? '' : String(existing.deposit),
    location: existing.location_text, terms: existing.terms ?? '',
  } : EMPTY)
  const [details, setDetails] = useState(existing?.details ?? {})
  const [files, setFiles] = useState([])
  const [keptPhotos, setKeptPhotos] = useState(sortedPhotos(existing?.listing_photos))
  const [removedPhotos, setRemovedPhotos] = useState([])
  const [error, setError] = useState('')
  const [savedId, setSavedId] = useState(null)
  const [busy, setBusy] = useState(false)
  const draftId = useRef(existing?.id ?? crypto.randomUUID())
  const saved = useRef(Boolean(existing))
  const submitting = useRef(false)

  const category = categories.find((c) => String(c.id) === form.categoryId)
  const extraFields = fieldsFor(category?.slug)
  const previews = useMemo(() => files.map((task) => URL.createObjectURL(task.file)), [files])
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews])

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  function onFiles(e) {
    const picked = [...e.target.files]
    e.target.value = ''
    const bad = picked.find((f) => !ACCEPTED_TYPES[f.type] || !f.size || f.size > MAX_PHOTO_BYTES)
    if (bad) return setError(`“${bad.name}” isn’t allowed. Use JPEG, PNG or WebP files up to 5 MB.`)
    if (keptPhotos.length + files.length + picked.length > MAX_PHOTOS) return setError(`You can add up to ${MAX_PHOTOS} photos.`)
    setError('')
    const nextOrder = Math.max(-1, ...keptPhotos.map((p) => p.sort_order), ...files.map((p) => p.sort_order)) + 1
    setFiles([...files, ...picked.map((file, i) => {
      const id = crypto.randomUUID()
      return { id, file, sort_order: nextOrder + i, storage_path: `${user.id}/${draftId.current}/${id}.${ACCEPTED_TYPES[file.type]}` }
    })])
  }

  function validate() {
    const title = form.title.trim()
    const description = form.description.trim()
    const location = form.location.trim()
    if (!form.categoryId) return 'Please choose a category.'
    if (title.length < 3 || title.length > 120) return 'Title must be 3 to 120 characters.'
    if (description.length < 10) return 'Please write a description of at least 10 characters.'
    if (description.length > 5000) return 'Description must be 5,000 characters or fewer.'
    if (form.price === '' || !Number.isFinite(Number(form.price)) || Number(form.price) < 0) return 'Enter a rental price of 0 or more.'
    if (form.deposit !== '' && (!Number.isFinite(Number(form.deposit)) || Number(form.deposit) < 0)) return 'Deposit must be a number of 0 or more.'
    if (location.length < 2 || location.length > 160) return 'Enter a location, for example a barangay in Iligan City.'
    if (form.terms.trim().length > 3000) return 'Terms must be 3,000 characters or fewer.'
    return ''
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting.current) return
    const problem = validate()
    if (problem) return setError(problem)
    setError('')
    submitting.current = true
    setBusy(true)

    const cleanDetails = Object.fromEntries(Object.entries(details).filter(([, v]) => String(v).trim() !== ''))
    const fields = {
      category_id: Number(form.categoryId),
      title: form.title.trim(),
      description: form.description.trim(),
      price: Number(form.price),
      price_period: form.period,
      deposit: form.deposit === '' ? null : Number(form.deposit),
      location_text: form.location.trim(),
      terms: form.terms.trim() || null,
      details: cleanDetails,
    }
    try {
      const { data: listing, error: saveError } = await saveListingRecord(supabase, {
        id: draftId.current, ownerId: user.id, fields, saved: saved.current,
      })
      if (saveError) throw saveError
      saved.current = true
      setSavedId(listing.id)

      const uploads = [...files]
      const removals = [...removedPhotos]
      const syncProgress = () => {
        setKeptPhotos((photos) => sortedPhotos([
          ...photos.filter((photo) => !removals.some((r) => r.id === photo.id)),
          ...uploads.filter((task) => task.done && !photos.some((photo) => photo.id === task.id))
            .map(({ id, storage_path, sort_order }) => ({ id, storage_path, sort_order })),
        ]))
        setFiles(uploads.filter((task) => !task.done))
        setRemovedPhotos(removals.filter((task) => !task.done))
      }
      await savePhotoChanges(supabase, { listingId: listing.id, uploads, removals, onChange: syncProgress })
      const failed = uploads.filter((task) => !task.done).length + removals.filter((task) => !task.done).length
      if (failed) return setError(`Your listing was saved, but ${failed} photo change${failed > 1 ? 's' : ''} didn’t go through. Save again to retry the remaining changes.`)
      navigate(`/listings/${listing.id}`)
    } catch {
      setError('We couldn’t confirm your changes were saved. Try saving again here to keep the same listing.')
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <section className="container page">
      <div className="form-page">
        <h1>{existing ? 'Edit listing' : 'List an item'}</h1>
        <p className="auth__sub">Tell renters what you’re offering. Everything you enter here is public except your email.</p>
        {catsError && <LoadError onRetry={retryCategories}>{catsError}</LoadError>}
        <form className="listing-form" onSubmit={handleSubmit} noValidate aria-busy={busy}>
          <fieldset className="form-controls" disabled={busy}>
            <legend className="sr-only">Listing details and photos</legend>
            <h2 className="form-section">Basics</h2>
            <div className="field">
              <label htmlFor="category">Category</label>
              <select id="category" value={form.categoryId} disabled={catsLoading} onChange={(e) => { setForm({ ...form, categoryId: e.target.value }); setDetails({}) }}>
                <option value="">{catsLoading ? 'Loading…' : 'Choose a category'}</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="title">Title</label>
              <input id="title" type="text" maxLength={120} value={form.title} onChange={set('title')} />
            </div>
            <div className="field">
              <label htmlFor="description">Description</label>
              <textarea id="description" maxLength={5000} value={form.description} onChange={set('description')} />
            </div>

            <h2 className="form-section">Price</h2>
            <div className="field-row">
              <div className="field">
                <label htmlFor="price">Rental price (₱)</label>
                <input id="price" type="number" min="0" step="any" inputMode="decimal" value={form.price} onChange={set('price')} />
              </div>
              <div className="field">
                <label htmlFor="period">Per</label>
                <select id="period" value={form.period} onChange={set('period')}>
                  {['hour', 'day', 'week', 'month', 'year'].map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="deposit">Deposit (₱, optional)</label>
              <input id="deposit" type="number" min="0" step="any" inputMode="decimal" value={form.deposit} onChange={set('deposit')} />
            </div>

            <h2 className="form-section">Location</h2>
            <div className="field">
              <label htmlFor="location">Where is it?</label>
              <input id="location" type="text" maxLength={160} placeholder="e.g. Tibanga, Iligan City" value={form.location} onChange={set('location')} />
            </div>

            {extraFields.length > 0 && (
              <>
                <h2 className="form-section">More about this {category.name.toLowerCase()}</h2>
                {extraFields.map((f) => (
                  <div className="field" key={f.key}>
                    <label htmlFor={`d-${f.key}`}>{f.label} (optional)</label>
                    {f.options ? (
                      <select id={`d-${f.key}`} value={details[f.key] ?? ''} onChange={(e) => setDetails({ ...details, [f.key]: e.target.value })}>
                        <option value="">Not specified</option>
                        {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input id={`d-${f.key}`} type={f.type === 'number' ? 'number' : 'text'} min={f.type === 'number' ? '0' : undefined} value={details[f.key] ?? ''} onChange={(e) => setDetails({ ...details, [f.key]: e.target.value })} />
                    )}
                  </div>
                ))}
              </>
            )}

            <h2 className="form-section">Rental terms</h2>
            <div className="field">
              <label htmlFor="terms">Terms, rules and requirements (optional)</label>
              <textarea id="terms" maxLength={3000} value={form.terms} onChange={set('terms')} />
            </div>

            <h2 className="form-section">Photos</h2>
            <div className="field">
              <label htmlFor="photos">Add photos (up to {MAX_PHOTOS})</label>
              <input id="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={onFiles} />
              <span className="field__hint">JPEG, PNG or WebP, up to 5 MB each. The first photo is the cover. Photos are public.</span>
            </div>
            {keptPhotos.length > 0 && (
              <ul className="photo-previews">
                {keptPhotos.map((p, i) => (
                  <li key={p.id}>
                    <img src={photoUrl(p.storage_path)} alt={`Current photo ${i + 1}`} />
                    <button type="button" aria-label={`Remove current photo ${i + 1}`} onClick={() => { setKeptPhotos(keptPhotos.filter((k) => k.id !== p.id)); setRemovedPhotos([...removedPhotos, p]) }}>✕</button>
                  </li>
                ))}
              </ul>
            )}
            {files.length > 0 && (
              <ul className="photo-previews">
                {files.map((task, i) => (
                  <li key={task.id} className={task.error ? 'photo-preview--failed' : undefined}>
                    <img src={previews[i]} alt={`Selected photo ${i + 1}`} />
                    <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => {
                      // Metadata may have committed even if its response was lost.
                      // Queue both removals when discarding an attempted upload.
                      if (task.attempted) setRemovedPhotos([...removedPhotos, task])
                      setFiles(files.filter((f) => f.id !== task.id))
                    }}>✕</button>
                    <div className="photo-caption">
                      <span className="field__hint">{task.file.name}</span>
                      {task.error && <span className="photo-error">{task.error}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {removedPhotos.some((task) => task.error) && <p className="field__hint">Some removed photos still need cleanup. Save again to retry.</p>}
          </fieldset>
          {error && <p className="form-error" role="alert">{error} {savedId && <Link to={`/listings/${savedId}`}>View your listing</Link>}</p>}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy || catsLoading || Boolean(catsError)}>{busy ? 'Saving…' : existing || savedId ? 'Save changes' : 'Publish listing'}</button>
        </form>
      </div>
    </section>
  )
}
