import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useCategories } from '../hooks/useCategories.js'
import { fieldsFor } from '../data/categoryFields.js'
import { ACCEPTED_TYPES, MAX_PHOTO_BYTES, MAX_PHOTOS, photoUrl, sortedPhotos } from '../lib/photos.js'

const EMPTY = { categoryId: '', title: '', description: '', price: '', period: 'day', deposit: '', location: '', terms: '' }

// Used for both creating a listing and (when `listing` is passed) editing one.
export default function CreateListing({ listing: existing = null }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { categories, loading: catsLoading, error: catsError } = useCategories()
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

  const category = categories.find((c) => String(c.id) === form.categoryId)
  const extraFields = fieldsFor(category?.slug)
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews])

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  function onFiles(e) {
    const picked = [...e.target.files]
    e.target.value = ''
    const bad = picked.find((f) => !ACCEPTED_TYPES[f.type] || f.size > MAX_PHOTO_BYTES)
    if (bad) return setError(`“${bad.name}” isn’t allowed. Use JPEG, PNG or WebP files up to 5 MB.`)
    if (keptPhotos.length + files.length + picked.length > MAX_PHOTOS) return setError(`You can add up to ${MAX_PHOTOS} photos.`)
    setError('')
    setFiles([...files, ...picked])
  }

  function validate() {
    const title = form.title.trim()
    const description = form.description.trim()
    const location = form.location.trim()
    if (!form.categoryId) return 'Please choose a category.'
    if (title.length < 3 || title.length > 120) return 'Title must be 3 to 120 characters.'
    if (description.length < 10) return 'Please write a description of at least 10 characters.'
    if (description.length > 5000) return 'Description must be 5,000 characters or fewer.'
    if (form.price === '' || Number(form.price) < 0) return 'Enter a rental price of 0 or more.'
    if (form.deposit !== '' && Number(form.deposit) < 0) return 'Deposit can’t be negative.'
    if (location.length < 2 || location.length > 160) return 'Enter a location, for example a barangay in Iligan City.'
    if (form.terms.trim().length > 3000) return 'Terms must be 3,000 characters or fewer.'
    return ''
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const problem = validate()
    if (problem) return setError(problem)
    setError('')
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
    const query = existing
      ? supabase.from('listings').update(fields).eq('id', existing.id)
      : supabase.from('listings').insert({ owner_id: user.id, ...fields })
    const { data: listing, error: insertError } = await query.select('id').single()
    if (insertError) {
      setBusy(false)
      return setError(`We couldn’t save your listing. ${insertError.message}`)
    }

    let failed = 0
    for (const photo of removedPhotos) {
      const { error: deleteError } = await supabase.from('listing_photos').delete().eq('id', photo.id)
      if (deleteError) failed++
      else await supabase.storage.from('listing-photos').remove([photo.storage_path])
    }
    const nextOrder = keptPhotos.length ? Math.max(...keptPhotos.map((p) => p.sort_order)) + 1 : 0
    for (const [i, file] of files.entries()) {
      const path = `${user.id}/${listing.id}/${crypto.randomUUID()}.${ACCEPTED_TYPES[file.type]}`
      const { error: uploadError } = await supabase.storage.from('listing-photos').upload(path, file, { contentType: file.type })
      if (uploadError) { failed++; continue }
      const { error: rowError } = await supabase.from('listing_photos').insert({ listing_id: listing.id, storage_path: path, sort_order: nextOrder + i })
      if (rowError) { failed++; await supabase.storage.from('listing-photos').remove([path]) }
    }
    setBusy(false)
    if (failed) {
      setSavedId(listing.id)
      return setError(`Your listing was saved, but ${failed} photo change${failed > 1 ? 's' : ''} didn’t go through.`)
    }
    navigate(`/listings/${listing.id}`)
  }

  return (
    <section className="container page">
      <div className="form-page">
        <h1>{existing ? 'Edit listing' : 'List an item'}</h1>
        <p className="auth__sub">Tell renters what you’re offering. Everything you enter here is public except your email.</p>
        {catsError && <p className="form-error" role="alert">We couldn’t load the categories ({catsError}).</p>}
        <form onSubmit={handleSubmit} noValidate>
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
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`}>
                  <img src={previews[i]} alt={`Selected photo ${i + 1}`} />
                  <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => setFiles(files.filter((_, idx) => idx !== i))}>✕</button>
                </li>
              ))}
            </ul>
          )}

          {error && <p className="form-error" role="alert">{error} {savedId && <Link to={`/listings/${savedId}`}>View your listing</Link>}</p>}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy || catsLoading}>{busy ? 'Saving…' : existing ? 'Save changes' : 'Publish listing'}</button>
        </form>
      </div>
    </section>
  )
}
