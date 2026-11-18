import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useCategories } from '../hooks/useCategories.js'
import { fieldsFor } from '../data/categoryFields.js'
import { ACCEPTED_TYPES, MAX_PHOTO_BYTES, MAX_PHOTOS, photoUrl, sortedPhotos } from '../lib/photos.js'
import { saveListingRecord, savePhotoChanges } from '../lib/listingSave.js'
import LoadError from '../components/LoadError.jsx'
import Icon from '../components/Icon.jsx'
import PageHeading from '../components/PageHeading.jsx'
import UnsavedChangesGuard from '../components/UnsavedChangesGuard.jsx'
import '../styles/owner-create.css'

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
  const [invalidField, setInvalidField] = useState('')
  const [savedId, setSavedId] = useState(null)
  const [busy, setBusy] = useState(false)
  const draftId = useRef(existing?.id ?? crypto.randomUUID())
  const saved = useRef(Boolean(existing))
  const submitting = useRef(false)
  const initialDraft = useRef(JSON.stringify({ form, details }))
  const hasChanges = files.length > 0 || removedPhotos.length > 0 || JSON.stringify({ form, details }) !== initialDraft.current

  const category = categories.find((c) => String(c.id) === form.categoryId)
  const extraFields = fieldsFor(category?.slug)
  const previews = useMemo(() => files.map((task) => URL.createObjectURL(task.file)), [files])
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews])

  const set = (field) => (e) => {
    setForm({ ...form, [field]: e.target.value })
    if (invalidField === field) setInvalidField('')
  }
  const fieldError = (field) => ({
    'aria-invalid': invalidField === field || undefined,
    'aria-describedby': invalidField === field ? 'listing-error' : undefined,
  })

  function showFieldError(field, message) {
    setError(message)
    setInvalidField(field)
    document.getElementById(field)?.focus()
  }

  function onFiles(e) {
    const picked = [...e.target.files]
    e.target.value = ''
    const bad = picked.find((f) => !ACCEPTED_TYPES[f.type] || !f.size || f.size > MAX_PHOTO_BYTES)
    if (bad) return showFieldError('photos', `“${bad.name}” isn’t allowed. Use JPEG, PNG or WebP files up to 5 MB.`)
    if (keptPhotos.length + files.length + picked.length > MAX_PHOTOS) return showFieldError('photos', `You can add up to ${MAX_PHOTOS} photos.`)
    setError('')
    setInvalidField('')
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
    if (!form.categoryId) return ['category', 'Please choose a category.']
    if (title.length < 3 || title.length > 120) return ['title', 'Title must be 3 to 120 characters.']
    if (description.length < 10) return ['description', 'Please write a description of at least 10 characters.']
    if (description.length > 5000) return ['description', 'Description must be 5,000 characters or fewer.']
    if (form.price === '' || !Number.isFinite(Number(form.price)) || Number(form.price) < 0) return ['price', 'Enter a rental price of 0 or more.']
    if (form.deposit !== '' && (!Number.isFinite(Number(form.deposit)) || Number(form.deposit) < 0)) return ['deposit', 'Deposit must be a number of 0 or more.']
    if (location.length < 2 || location.length > 160) return ['location', 'Enter a location, for example a barangay in Iligan City.']
    if (form.terms.trim().length > 3000) return ['terms', 'Terms must be 3,000 characters or fewer.']
    return null
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting.current) return
    const problem = validate()
    if (problem) return showFieldError(...problem)
    setError('')
    setInvalidField('')
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
    <section className="container page owner-editor">
      <UnsavedChangesGuard dirty={hasChanges} />
      <PageHeading
        eyebrow={existing ? 'Your rental · Make it yours' : 'For owners · Iligan City'}
        title={existing ? 'Edit listing' : 'List an item'}
      >
        <p>Good rentals start with clear details. Help someone find exactly what they need.</p>
      </PageHeading>
      <div className="owner-editor__layout">
        <div className="owner-editor__main">
          {catsError && <LoadError onRetry={retryCategories}>{catsError}</LoadError>}
          <form className="listing-form" onSubmit={handleSubmit} noValidate aria-busy={busy}>
            <fieldset className="form-controls" disabled={busy}>
              <legend className="sr-only">Listing details and photos</legend>
              <section className="owner-editor__section" aria-labelledby="listing-basics">
                <div className="owner-editor__section-heading">
                  <span className="owner-editor__section-icon"><Icon name="box" size={22} /></span>
                  <div><h2 id="listing-basics">Basics</h2><p>What would you like to rent out?</p></div>
                </div>
                <div className="field">
                  <label htmlFor="category">Category</label>
                  <select id="category" value={form.categoryId} disabled={catsLoading} {...fieldError('category')} onChange={(e) => { setForm({ ...form, categoryId: e.target.value }); setDetails({}); if (invalidField === 'category') setInvalidField('') }}>
                    <option value="">{catsLoading ? 'Loading…' : 'Choose a category'}</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="title">Title</label>
                  <input id="title" type="text" maxLength={120} placeholder="Give your rental a clear, specific name" value={form.title} onChange={set('title')} {...fieldError('title')} />
                </div>
                <div className="field">
                  <label htmlFor="description">Description</label>
                  <textarea id="description" className="resize-none" maxLength={5000} rows={5} placeholder="Describe its condition, useful features and what’s included." value={form.description} onChange={set('description')} {...fieldError('description')} />
                  <span className="field__hint">At least 10 characters. Be specific so renters know what to expect.</span>
                </div>
              </section>

              <section className="owner-editor__section" aria-labelledby="listing-price">
                <div className="owner-editor__section-heading">
                  <span className="owner-editor__section-icon"><Icon name="clock" size={22} /></span>
                  <div><h2 id="listing-price">Price</h2><p>Set the rate and the time it covers.</p></div>
                </div>
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="price">Rental price (₱)</label>
                    <input id="price" type="number" min="0" step="any" inputMode="decimal" placeholder="0.00" value={form.price} onChange={set('price')} {...fieldError('price')} />
                  </div>
                  <div className="field">
                    <label htmlFor="period">Per</label>
                    <select id="period" value={form.period} onChange={set('period')}>
                      {['hour', 'day', 'week', 'month', 'year'].map((period) => <option key={period} value={period}>{period}</option>)}
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="deposit">Deposit (₱, optional)</label>
                  <input id="deposit" type="number" min="0" step="any" inputMode="decimal" placeholder="Leave empty if no deposit is needed" value={form.deposit} onChange={set('deposit')} {...fieldError('deposit')} />
                </div>
              </section>

              <section className="owner-editor__section" aria-labelledby="listing-location">
                <div className="owner-editor__section-heading">
                  <span className="owner-editor__section-icon"><Icon name="mapPin" size={22} /></span>
                  <div><h2 id="listing-location">Location</h2><p>Help nearby renters find your listing.</p></div>
                </div>
                <div className="field">
                  <label htmlFor="location">Where is it?</label>
                  <input id="location" type="text" maxLength={160} placeholder="e.g. Tibanga, Iligan City" value={form.location} onChange={set('location')} {...fieldError('location')} />
                  <span className="field__hint">Use a barangay or area. Arrange the exact handover location privately.</span>
                </div>
              </section>

              {extraFields.length > 0 && (
                <section className="owner-editor__section" aria-labelledby="listing-specifics">
                  <div className="owner-editor__section-heading">
                    <span className="owner-editor__section-icon"><Icon name="sliders" size={22} /></span>
                    <div><h2 id="listing-specifics">More about this {category.name.toLowerCase()}</h2><p>A few details can help renters decide.</p></div>
                  </div>
                  {extraFields.map((field) => (
                    <div className="field" key={field.key}>
                      <label htmlFor={`d-${field.key}`}>{field.label} (optional)</label>
                      {field.options ? (
                        <select id={`d-${field.key}`} value={details[field.key] ?? ''} onChange={(e) => setDetails({ ...details, [field.key]: e.target.value })}>
                          <option value="">Not specified</option>
                          {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      ) : (
                        <input id={`d-${field.key}`} type={field.type === 'number' ? 'number' : 'text'} min={field.type === 'number' ? '0' : undefined} value={details[field.key] ?? ''} onChange={(e) => setDetails({ ...details, [field.key]: e.target.value })} />
                      )}
                    </div>
                  ))}
                </section>
              )}

              <section className="owner-editor__section" aria-labelledby="listing-terms">
                <div className="owner-editor__section-heading">
                  <span className="owner-editor__section-icon"><Icon name="key" size={22} /></span>
                  <div><h2 id="listing-terms">Rental terms</h2><p>Make your expectations clear before a request.</p></div>
                </div>
                <div className="field">
                  <label htmlFor="terms">Terms, rules and requirements (optional)</label>
                  <textarea id="terms" className="resize-none" maxLength={3000} rows={4} placeholder="For example, pickup arrangements, care instructions or return requirements." value={form.terms} onChange={set('terms')} {...fieldError('terms')} />
                </div>
              </section>

              <section className="owner-editor__section" aria-labelledby="listing-photos">
                <div className="owner-editor__section-heading">
                  <span className="owner-editor__section-icon"><Icon name="image" size={22} /></span>
                  <div><h2 id="listing-photos">Photos</h2><p>Show the real rental from a few useful angles.</p></div>
                  <span className="owner-editor__photo-count">{keptPhotos.length + files.length} / {MAX_PHOTOS}</span>
                </div>
                <div className="field owner-editor__upload">
                  <Icon name="upload" size={28} />
                  <label htmlFor="photos">Add photos (up to {MAX_PHOTOS})</label>
                  <input id="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={onFiles} {...fieldError('photos')} />
                  <span className="field__hint">JPEG, PNG or WebP, up to 5 MB each. The first photo is the cover. Photos are public.</span>
                </div>
                {keptPhotos.length > 0 && (
                  <ul className="photo-previews">
                    {keptPhotos.map((photo, i) => (
                      <li key={photo.id}>
                        <img src={photoUrl(photo.storage_path)} alt={`Current photo ${i + 1}`} />
                        <button type="button" aria-label={`Remove current photo ${i + 1}`} onClick={() => { setKeptPhotos(keptPhotos.filter((kept) => kept.id !== photo.id)); setRemovedPhotos([...removedPhotos, photo]) }}><Icon name="x" size={16} /></button>
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
                          setFiles(files.filter((file) => file.id !== task.id))
                        }}><Icon name="x" size={16} /></button>
                        <div className="photo-caption">
                          <span className="field__hint">{task.file.name}</span>
                          {task.error && <span className="photo-error">{task.error}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {removedPhotos.some((task) => task.error) && <p className="field__hint">Some removed photos still need cleanup. Save again to retry.</p>}
              </section>
            </fieldset>
            <div className="owner-editor__submit">
              {error && <p id="listing-error" className="form-error" role="alert">{error} {savedId && <Link to={`/listings/${savedId}`}>View your listing</Link>}</p>}
              <p className="field__hint">Your listing details and photos will be public. Your email stays private.</p>
              <button type="submit" className="btn btn-primary btn-block" disabled={busy || catsLoading || Boolean(catsError)}>{busy ? 'Saving…' : existing || savedId ? 'Save changes' : 'Publish listing'}{!busy && <Icon name="arrowRight" size={18} />}</button>
            </div>
          </form>
        </div>
        <aside className="owner-editor__guide" aria-labelledby="owner-guide-title">
          <div className="owner-editor__guide-symbol"><Icon name="home" size={28} /></div>
          <p className="eyebrow">A little detail goes a long way</p>
          <h2 id="owner-guide-title">Make it easy to say, “That’s the one.”</h2>
          <ul>
            <li><Icon name="check" /><span><strong>Keep it accurate</strong>Describe the current condition and what’s included.</span></li>
            <li><Icon name="check" /><span><strong>Make it clear</strong>Set a rate, rental period and any deposit upfront.</span></li>
            <li><Icon name="check" /><span><strong>Show the real thing</strong>Use well-lit photos of the actual item or property.</span></li>
          </ul>
          <div className="owner-editor__guide-note"><Icon name="message" /><p>Renters send a request first. You decide whether to accept, then arrange handover together.</p></div>
          <p className="field__hint">If a photo needs another try, keep this page open and save again.</p>
        </aside>
      </div>
    </section>
  )
}
