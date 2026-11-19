import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useCategories } from '../hooks/useCategories.js'
import { fieldsFor } from '../data/categoryFields.js'
import {
  ACCEPTED_TYPES,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS,
  photoUrl,
  sortedPhotos,
} from '../lib/photos.js'
import { formatPrice, formatRate } from '../lib/format.js'
import { saveListingRecord, savePhotoChanges } from '../lib/listingSave.js'
import LoadError from '../components/LoadError.jsx'
import Icon from '../components/Icon.jsx'
import PageHeading from '../components/PageHeading.jsx'
import UnsavedChangesGuard from '../components/UnsavedChangesGuard.jsx'
import '../styles/owner-create.css'

const EMPTY = {
  availability: 'available',
  categoryId: '',
  title: '',
  description: '',
  price: '',
  period: 'day',
  deposit: '',
  location: '',
  terms: '',
}

// Used for both creating a listing and (when `listing` is passed) editing one.
export default function CreateListing({ listing: existing = null }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { search } = useLocation()
  const {
    categories,
    loading: catsLoading,
    error: catsError,
    retry: retryCategories,
  } = useCategories()
  const [form, setForm] = useState(
    existing
      ? {
          availability: existing.status,
          categoryId: String(existing.category_id),
          title: existing.title,
          description: existing.description,
          price: String(existing.price),
          period: existing.price_period,
          deposit: existing.deposit == null ? '' : String(existing.deposit),
          location: existing.location_text,
          terms: existing.terms ?? '',
        }
      : EMPTY,
  )
  const [details, setDetails] = useState(existing?.details ?? {})
  const [files, setFiles] = useState([])
  const [keptPhotos, setKeptPhotos] = useState(
    sortedPhotos(existing?.listing_photos),
  )
  const [removedPhotos, setRemovedPhotos] = useState([])
  const [error, setError] = useState('')
  const [invalidField, setInvalidField] = useState('')
  const [photoFeedback, setPhotoFeedback] = useState(null)
  const photoFeedbackRef = useRef(null)
  useEffect(() => {
    if (photoFeedback) photoFeedbackRef.current?.focus()
  }, [photoFeedback])
  const [savedId, setSavedId] = useState(null)
  const [attemptedSave, setAttemptedSave] = useState(false)
  const [busy, setBusy] = useState(false)
  const draftId = useRef(existing?.id ?? crypto.randomUUID())
  const saved = useRef(Boolean(existing))
  const submitting = useRef(false)
  const initialDraft = useRef(JSON.stringify({ form, details }))
  const hasChanges =
    files.length > 0 ||
    removedPhotos.length > 0 ||
    JSON.stringify({ form, details }) !== initialDraft.current

  const category = categories.find((c) => String(c.id) === form.categoryId)
  const extraFields = fieldsFor(category?.slug)
  const previews = useMemo(
    () => files.map((task) => URL.createObjectURL(task.file)),
    [files],
  )
  useEffect(
    () => () => previews.forEach((url) => URL.revokeObjectURL(url)),
    [previews],
  )

  const set = (field) => (e) => {
    setForm({ ...form, [field]: e.target.value })
    if (invalidField === field) {
      setInvalidField('')
      setError('')
    }
  }
  const fieldError = (field, hint) => ({
    'aria-invalid': invalidField === field || undefined,
    'aria-describedby':
      [hint, invalidField === field ? 'listing-error' : null]
        .filter(Boolean)
        .join(' ') || undefined,
  })

  function showFieldError(field, message) {
    setError(message)
    setInvalidField(field)
    document.getElementById(field)?.focus()
  }

  function validationMessage(field) {
    if (invalidField !== field) return null
    return (
      <p id="listing-error" className="form-error" role="alert">
        {error}
      </p>
    )
  }

  function confirmPhotoChange(message) {
    setPhotoFeedback({ message })
  }

  function onFiles(e) {
    const picked = [...e.target.files]
    setPhotoFeedback(null)
    e.target.value = ''
    const bad = picked.find(
      (f) => !ACCEPTED_TYPES[f.type] || !f.size || f.size > MAX_PHOTO_BYTES,
    )
    if (bad)
      return showFieldError(
        'photos',
        `“${bad.name}” isn’t allowed. Use JPEG, PNG or WebP files up to 5 MB.`,
      )
    if (keptPhotos.length + files.length + picked.length > MAX_PHOTOS)
      return showFieldError('photos', `You can add up to ${MAX_PHOTOS} photos.`)
    setError('')
    setInvalidField('')
    const previousPhotos = [...keptPhotos, ...files, ...removedPhotos]
    const nextOrder =
      Math.max(-1, ...previousPhotos.map((photo) => photo.sort_order)) + 1
    setFiles([
      ...files,
      ...picked.map((file, i) => {
        const id = crypto.randomUUID()
        return {
          id,
          file,
          sort_order: nextOrder + i,
          storage_path: `${user.id}/${draftId.current}/${id}.${ACCEPTED_TYPES[file.type]}`,
        }
      }),
    ])
  }

  const basicsReady =
    form.categoryId &&
    form.title.trim().length >= 3 &&
    form.description.trim().length >= 10
  const validAmount = (value) =>
    value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0
  const rateReady = validAmount(form.price)
  const depositReady = form.deposit === '' || validAmount(form.deposit)
  const handoverReady =
    rateReady && depositReady && form.location.trim().length >= 2
  const photos = sortedPhotos([
    ...keptPhotos.map((photo, index) => ({
      ...photo,
      src: photoUrl(photo.storage_path),
      index,
    })),
    ...files.map((task, index) => ({ ...task, src: previews[index], index })),
  ])
  const chapters = [
    [
      'listing-basics',
      'Rental details',
      basicsReady ? 'Complete' : 'Category and description',
    ],
    [
      'listing-price',
      'Price & handover',
      handoverReady ? 'Complete' : 'Rate, location and terms',
    ],
    [
      'listing-photos',
      'Photos',
      photos.length ? `${photos.length} selected` : 'Optional',
    ],
    [
      'listing-review',
      'Review listing',
      existing || savedId ? 'Check your changes' : 'Check before publishing',
    ],
  ]

  function removePhoto(photo) {
    if (photo.file) {
      confirmPhotoChange(`${photo.file.name} removed from the draft.`)
      // An attempted row may exist even when its response was lost.
      if (photo.attempted)
        setRemovedPhotos([...removedPhotos, files[photo.index]])
      setFiles(files.filter((task) => task.id !== photo.id))
    } else {
      confirmPhotoChange(
        'Photo marked for removal. Save your changes to remove it from the listing.',
      )
      setKeptPhotos(keptPhotos.filter((kept) => kept.id !== photo.id))
      setRemovedPhotos([
        ...removedPhotos,
        { ...keptPhotos[photo.index], canRestore: true },
      ])
    }
  }

  function chooseCover(photo) {
    const reordered = [
      files[photo.index],
      ...files.filter((task) => task.id !== photo.id),
    ]
    setFiles(reordered.map((task, sort_order) => ({ ...task, sort_order })))
    confirmPhotoChange(`${photo.file.name} is now the cover photo.`)
  }

  function validate() {
    if (!form.categoryId) return ['category', 'Please choose a category.']
    if (form.title.trim().length < 3 || form.title.trim().length > 120)
      return ['title', 'Title must be 3 to 120 characters.']
    if (form.description.trim().length < 10)
      return [
        'description',
        'Please write a description of at least 10 characters.',
      ]
    if (form.description.trim().length > 5000)
      return ['description', 'Description must be 5,000 characters or fewer.']
    if (!rateReady) return ['price', 'Enter a rental price of 0 or more.']
    if (!depositReady)
      return ['deposit', 'Deposit must be a number of 0 or more.']
    if (form.location.trim().length < 2 || form.location.trim().length > 160)
      return [
        'location',
        'Enter a location, for example a barangay in Iligan City.',
      ]
    if (form.terms.trim().length > 3000)
      return ['terms', 'Terms must be 3,000 characters or fewer.']
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
    setAttemptedSave(true)
    setPhotoFeedback(null)

    const cleanDetails = Object.fromEntries(
      Object.entries(details).filter(([, v]) => String(v).trim() !== ''),
    )
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
      const { data: listing, error: saveError } = await saveListingRecord(
        supabase,
        {
          id: draftId.current,
          ownerId: user.id,
          fields,
          saved: saved.current,
          openingStatus: form.availability,
        },
      )
      if (saveError) throw saveError
      saved.current = true
      setSavedId(listing.id)

      const uploads = [...files]
      const removals = removedPhotos.map((photo) => ({
        ...photo,
        canRestore: false,
      }))
      const syncProgress = () => {
        setKeptPhotos((photos) =>
          sortedPhotos([
            ...photos.filter(
              (photo) => !removals.some((r) => r.id === photo.id),
            ),
            ...uploads
              .filter(
                (task) =>
                  task.done && !photos.some((photo) => photo.id === task.id),
              )
              .map(({ id, storage_path, sort_order }) => ({
                id,
                storage_path,
                sort_order,
              })),
          ]),
        )
        setFiles(uploads.filter((task) => !task.done))
        setRemovedPhotos(removals.filter((task) => !task.done))
      }
      await savePhotoChanges(supabase, {
        listingId: listing.id,
        uploads,
        removals,
        onChange: syncProgress,
      })
      const failed =
        uploads.filter((task) => !task.done).length +
        removals.filter((task) => !task.done).length
      if (failed)
        return setError(
          `Your listing was saved, but ${failed} photo change${failed > 1 ? 's' : ''} didn’t go through. Save again to retry the remaining changes.`,
        )
      navigate(`/listings/${listing.id}`)
    } catch {
      setError(
        'We couldn’t confirm your changes were saved. Try saving again here to keep the same listing.',
      )
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <section className="container page owner-editor">
      <UnsavedChangesGuard dirty={hasChanges} />
      <Link className="owner-editor__back" to="/my-listings">
        <Icon name="arrowLeft" size={16} /> My listings
      </Link>
      <PageHeading title={existing ? 'Edit listing' : 'List an item'}>
        <p>
          {existing
            ? existing.title
            : 'Set your rate and tell renters what they can borrow.'}
        </p>
      </PageHeading>
      <div className="owner-editor__layout">
        <nav className="owner-editor__index" aria-label="Listing sections">
          <ol>
            {chapters.map(([id, label, progress], i) => (
              <li key={id}>
                <Link to={{ search, hash: `#${id}` }}>
                  <span className="owner-editor__step" aria-hidden="true">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span>
                    <strong>{label}</strong>
                    <small>{progress}</small>
                  </span>
                  {progress === 'Complete' && <Icon name="check" size={16} />}
                </Link>
              </li>
            ))}
          </ol>
        </nav>
        <div className="owner-editor__main">
          {catsError && (
            <LoadError onRetry={retryCategories}>{catsError}</LoadError>
          )}
          <form
            className="listing-form"
            onSubmit={handleSubmit}
            noValidate
            aria-busy={busy}
          >
            <fieldset className="form-controls" disabled={busy}>
              <legend className="sr-only">Listing details and photos</legend>
              <section
                className="owner-editor__section"
                aria-labelledby="listing-basics"
              >
                <h2 id="listing-basics" tabIndex={-1}>
                  Rental details
                </h2>
                <div className="field">
                  <label htmlFor="category">Category</label>
                  <select
                    id="category"
                    required
                    value={form.categoryId}
                    disabled={catsLoading}
                    {...fieldError('category')}
                    onChange={(e) => {
                      setForm({ ...form, categoryId: e.target.value })
                      setDetails({})
                      if (invalidField === 'category') {
                        setInvalidField('')
                        setError('')
                      }
                    }}
                  >
                    <option value="">
                      {catsLoading ? 'Loading…' : 'Choose a category'}
                    </option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {validationMessage('category')}
                </div>
                <div className="field">
                  <label htmlFor="title">Title</label>
                  <input
                    id="title"
                    required
                    type="text"
                    maxLength={120}
                    placeholder="Give your rental a clear, specific name"
                    value={form.title}
                    onChange={set('title')}
                    {...fieldError('title')}
                  />
                  {validationMessage('title')}
                </div>
                <div className="field">
                  <label htmlFor="description">Description</label>
                  <textarea
                    id="description"
                    required
                    className="resize-none"
                    maxLength={5000}
                    rows={5}
                    placeholder="Describe its condition, useful features and what’s included."
                    value={form.description}
                    onChange={set('description')}
                    {...fieldError('description', 'description-hint')}
                  />
                  {validationMessage('description')}
                  <span id="description-hint" className="field__hint">
                    At least 10 characters. Be specific so renters know what to
                    expect.
                  </span>
                </div>
                {extraFields.length > 0 && (
                  <div className="owner-editor__specifics">
                    <h3>{category.name} details</h3>
                    {extraFields.map((field) => (
                      <div className="field" key={field.key}>
                        <label htmlFor={`d-${field.key}`}>
                          {field.label} (optional)
                        </label>
                        {field.options ? (
                          <select
                            id={`d-${field.key}`}
                            value={details[field.key] ?? ''}
                            onChange={(e) =>
                              setDetails({
                                ...details,
                                [field.key]: e.target.value,
                              })
                            }
                          >
                            <option value="">Not specified</option>
                            {field.options.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            id={`d-${field.key}`}
                            type={field.type === 'number' ? 'number' : 'text'}
                            min={field.type === 'number' ? '0' : undefined}
                            value={details[field.key] ?? ''}
                            onChange={(e) =>
                              setDetails({
                                ...details,
                                [field.key]: e.target.value,
                              })
                            }
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section
                className="owner-editor__section"
                aria-labelledby="listing-price"
              >
                <h2 id="listing-price" tabIndex={-1}>
                  Price &amp; handover
                </h2>
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="price">Rental price (₱)</label>
                    <input
                      id="price"
                      required
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={form.price}
                      onChange={set('price')}
                      {...fieldError('price')}
                    />
                    {validationMessage('price')}
                  </div>
                  <div className="field">
                    <label htmlFor="period">Per</label>
                    <select
                      id="period"
                      value={form.period}
                      onChange={set('period')}
                    >
                      {['hour', 'day', 'week', 'month', 'year'].map(
                        (period) => (
                          <option key={period} value={period}>
                            {period}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="deposit">Deposit (₱, optional)</label>
                  <input
                    id="deposit"
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    placeholder="Leave empty if no deposit is needed"
                    value={form.deposit}
                    onChange={set('deposit')}
                    {...fieldError('deposit')}
                  />
                  {validationMessage('deposit')}
                </div>
                <div className="field">
                  <label htmlFor="location">Where is it?</label>
                  <input
                    id="location"
                    required
                    type="text"
                    maxLength={160}
                    placeholder="e.g. Tibanga, Iligan City"
                    value={form.location}
                    onChange={set('location')}
                    {...fieldError('location', 'location-hint')}
                  />
                  {validationMessage('location')}
                  <span id="location-hint" className="field__hint">
                    Use a barangay or area. Arrange the exact handover location
                    privately.
                  </span>
                </div>
                <div className="field">
                  <label htmlFor="terms">
                    Terms, rules and requirements (optional)
                  </label>
                  <textarea
                    id="terms"
                    className="resize-none"
                    maxLength={3000}
                    rows={4}
                    placeholder="For example, pickup arrangements, care instructions or return requirements."
                    value={form.terms}
                    onChange={set('terms')}
                    {...fieldError('terms')}
                  />
                  {validationMessage('terms')}
                </div>
                {!existing && (
                  <div className="field">
                    <label htmlFor="opening-status">
                      Availability at publication
                    </label>
                    <select
                      id="opening-status"
                      value={form.availability}
                      onChange={set('availability')}
                      disabled={attemptedSave}
                      aria-describedby="opening-status-hint"
                    >
                      <option value="available">Available for requests</option>
                      <option value="unavailable">
                        Unavailable for requests
                      </option>
                    </select>
                    <span id="opening-status-hint" className="field__hint">
                      {attemptedSave
                        ? 'After the first save attempt, change availability in My listings.'
                        : 'Both options publish the listing. Unavailable listings cannot receive booking requests.'}
                    </span>
                  </div>
                )}
              </section>

              <section
                className="owner-editor__section"
                aria-labelledby="listing-photos"
              >
                <div className="owner-editor__section-heading">
                  <h2 id="listing-photos" tabIndex={-1}>
                    Photos
                  </h2>
                  <span className="owner-editor__photo-count">
                    {photos.length} / {MAX_PHOTOS}
                  </span>
                </div>
                <div className="field owner-editor__upload">
                  <Icon name="upload" size={28} />
                  <label htmlFor="photos">
                    Add photos (up to {MAX_PHOTOS})
                  </label>
                  <input
                    id="photos"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={onFiles}
                    {...fieldError('photos', 'photos-hint')}
                  />
                  {validationMessage('photos')}
                  <span id="photos-hint" className="field__hint">
                    JPEG, PNG or WebP, up to 5 MB each. The first photo is the
                    cover. Photos are public.
                  </span>
                </div>
                {photoFeedback && (
                  <p
                    className="field__hint"
                    ref={photoFeedbackRef}
                    tabIndex={-1}
                    role="status"
                  >
                    {photoFeedback.message}
                  </p>
                )}
                {photos.length > 0 && (
                  <ol
                    className="owner-photo-strip"
                    aria-label="Listing photos in display order"
                  >
                    {photos.map((photo, position) => (
                      <li key={photo.id}>
                        <div className="owner-photo__image">
                          <img
                            src={photo.src}
                            alt={`${photo.file ? 'Selected' : 'Current'} photo ${photo.index + 1}`}
                          />
                          <button
                            type="button"
                            aria-label={`Remove ${photo.file ? '' : 'current '}photo ${photo.index + 1}`}
                            onClick={() => removePhoto(photo)}
                          >
                            <Icon name="x" size={16} />
                          </button>
                        </div>
                        <strong>
                          {position === 0
                            ? 'Cover photo'
                            : `Photo ${position + 1}`}
                        </strong>
                        {photo.file && (
                          <span className="field__hint">{photo.file.name}</span>
                        )}
                        {photo.error && (
                          <span className="photo-error">{photo.error}</span>
                        )}
                        {position > 0 &&
                          keptPhotos.length === 0 &&
                          removedPhotos.length === 0 &&
                          files.every((task) => !task.attempted) && (
                            <button
                              type="button"
                              className="owner-editor__text-action"
                              onClick={() => chooseCover(photo)}
                            >
                              Make cover
                              <span className="sr-only">
                                {' '}
                                for {photo.file.name}
                              </span>
                            </button>
                          )}
                      </li>
                    ))}
                  </ol>
                )}
                {removedPhotos
                  .filter((task) => task.canRestore)
                  .map((photo) => (
                    <div className="owner-photo__removal" key={photo.id}>
                      <img src={photoUrl(photo.storage_path)} alt="" />
                      <span>
                        {photos.length >= MAX_PHOTOS
                          ? `Remove another photo to restore this one (maximum ${MAX_PHOTOS}).`
                          : 'Photo marked for removal'}
                      </span>
                      <button
                        type="button"
                        className="owner-editor__text-action"
                        disabled={photos.length >= MAX_PHOTOS}
                        onClick={() => {
                          confirmPhotoChange('Photo restored to the draft.')
                          setKeptPhotos(sortedPhotos([...keptPhotos, photo]))
                          setRemovedPhotos(
                            removedPhotos.filter(
                              (task) => task.id !== photo.id,
                            ),
                          )
                        }}
                      >
                        Undo removal
                      </button>
                    </div>
                  ))}
                {removedPhotos.some((task) => task.error) && (
                  <p className="field__hint">
                    Some removed photos still need cleanup. Save again to retry.
                  </p>
                )}
              </section>
            </fieldset>
            <section
              className="owner-editor__submit"
              aria-labelledby="listing-review"
            >
              <h2 id="listing-review" tabIndex={-1}>
                Review listing
              </h2>
              <div className="owner-review">
                <div className="owner-review__summary">
                  {photos[0] && (
                    <img src={photos[0].src} alt="Listing cover preview" />
                  )}
                  <div>
                    <small>{category?.name || 'Category pending'}</small>
                    <h3>{form.title.trim() || 'Listing title pending'}</h3>
                    <p>{form.location.trim() || 'Location pending'}</p>
                  </div>
                </div>
                <dl>
                  <div>
                    <dt>Rental rate</dt>
                    <dd>
                      {rateReady
                        ? formatRate(form.price, form.period)
                        : 'Rate pending'}
                    </dd>
                  </div>
                  <div>
                    <dt>Deposit</dt>
                    <dd>
                      {!depositReady
                        ? 'Check amount'
                        : Number(form.deposit) > 0
                          ? formatPrice(form.deposit)
                          : 'No deposit'}
                    </dd>
                  </div>
                  <div>
                    <dt>Availability</dt>
                    <dd>
                      {form.availability === 'unavailable'
                        ? 'Unavailable'
                        : 'Available'}
                    </dd>
                  </div>
                  <div>
                    <dt>Rental terms</dt>
                    <dd className="prewrap">
                      {form.terms.trim() || 'No additional terms'}
                    </dd>
                  </div>
                </dl>
              </div>
              <p className="field__hint">
                Manage availability in My listings. Renters see your listing
                details and photos.
              </p>
              {error && !invalidField && (
                <p className="form-error" role="alert">
                  {error}{' '}
                  {savedId && (
                    <Link to={`/listings/${savedId}`}>View your listing</Link>
                  )}
                </p>
              )}
              <button
                type="submit"
                className="btn btn-primary btn-block"
                disabled={busy || catsLoading || Boolean(catsError)}
              >
                {busy
                  ? 'Saving…'
                  : existing || savedId
                    ? 'Save changes'
                    : 'Publish listing'}
                {!busy && <Icon name="arrowRight" size={18} />}
              </button>
            </section>
          </form>
        </div>
      </div>
    </section>
  )
}
