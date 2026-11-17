// Keep IDs stable for the lifetime of a form. Retrying a request whose response
// was lost must target the same records, never create another listing or photo.
export async function saveListingRecord(client, { id, ownerId, fields, saved }) {
  const update = () => client.from('listings').update(fields).eq('id', id).eq('owner_id', ownerId).select('id').single()
  if (saved) return update()
  const result = await client.from('listings').insert({ id, owner_id: ownerId, ...fields }).select('id').single()
  // A prior attempt may have committed even though its response never arrived.
  // The owner filter and RLS still apply when reconciling that exact UUID.
  return result.error?.code === '23505' ? update() : result
}

export async function savePhotoChanges(client, { listingId, uploads, removals, onChange }) {
  const bucket = client.storage.from('listing-photos')
  // Progress is recorded on each task before the next request. A retry can then
  // resume just the failed operation, including a storage-only removal.
  for (const task of removals) {
    task.error = ''
    try {
      if (!task.rowDeleted) {
        const { error } = await client.from('listing_photos').delete().eq('id', task.id).eq('listing_id', listingId)
        if (error) throw error
        task.rowDeleted = true
      }
      const { error } = await bucket.remove([task.storage_path])
      if (error) throw error
      task.done = true
    } catch {
      task.error = 'This photo could not be removed. Save again to retry.'
    }
    onChange()
  }

  for (const task of uploads) {
    if (task.done) continue
    task.error = ''
    try {
      if (!task.uploaded) {
        task.attempted = true
        const { error } = await bucket.upload(task.storage_path, task.file, { contentType: task.file.type, upsert: true })
        if (error) throw error
        task.uploaded = true
      }
      const row = { id: task.id, listing_id: listingId, storage_path: task.storage_path, sort_order: task.sort_order }
      if (task.rowAttempted) {
        // Reconcile before INSERT: a BEFORE INSERT photo-limit trigger can fire
        // before the duplicate-ID constraint, even when our row already exists.
        const previous = await client.from('listing_photos').select('id')
          .eq('id', task.id).eq('listing_id', listingId).eq('storage_path', task.storage_path).maybeSingle()
        if (previous.error) throw previous.error
        if (previous.data) {
          task.done = true
          onChange()
          continue
        }
      }
      task.rowAttempted = true
      const { error } = await client.from('listing_photos').insert(row)
      if (error?.code === '23505') {
        const existing = await client.from('listing_photos').select('id')
          .eq('id', task.id).eq('listing_id', listingId).eq('storage_path', task.storage_path).maybeSingle()
        if (existing.error || !existing.data) throw existing.error ?? error
      } else if (error) throw error
      task.done = true
    } catch {
      task.error = 'This photo could not be saved. Save again to retry, or remove it.'
    }
    onChange()
  }
}
