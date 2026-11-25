import { supabase } from './supabaseClient.js'

// Contract: supabase/contracts/verification.json (exported from the existing project).
export const VERIFICATION_BUCKET = 'verification-documents'
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024
export const DOCUMENT_MIME_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}
export const DOCUMENT_TYPES = {
  identity: [
    ['government_id', 'Government ID'],
    ['school_id', 'School ID'],
    ['other', 'Other identity document'],
  ],
  business: [
    ['business_registration', 'Business registration'],
    ['other', 'Other business document'],
  ],
}
export const DOCUMENT_LABELS = {
  government_id: 'Government ID',
  school_id: 'School ID',
  business_registration: 'Business registration',
  other: 'Other document',
}
export const VERIFICATION_FIELDS =
  'id, user_id, kind, document_type, document_path, details, status, admin_note, reviewed_by, reviewed_at, created_at'
export const verificationKind = (profile) =>
  profile?.account_type === 'business' ? 'business' : 'identity'
export const isVerified = (profile) =>
  ['identity', 'business'].includes(profile?.verified_kind) &&
  Boolean(profile?.verified_at) &&
  Number.isFinite(Date.parse(profile.verified_at))

async function withDeadline(operation, milliseconds = 30000) {
  let timer
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Request was not confirmed in time.')),
          milliseconds,
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

export function validateDocument(file) {
  if (!file) return 'Choose a document to upload.'
  if (!Object.hasOwn(DOCUMENT_MIME_TYPES, file.type))
    return 'Use a JPEG, PNG, WebP or PDF document.'
  if (!file.size) return 'The document is empty. Choose another file.'
  if (file.size > MAX_DOCUMENT_BYTES)
    return 'The document must be 5 MB or smaller.'
  return null
}

export async function validateDocumentContents(file) {
  const error = validateDocument(file)
  if (error) return error
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const text = (start, end) => String.fromCharCode(...bytes.slice(start, end))
  const valid = {
    'image/jpeg': bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    'image/png':
      bytes[0] === 0x89 &&
      text(1, 4) === 'PNG' &&
      bytes[4] === 13 &&
      bytes[5] === 10 &&
      bytes[6] === 26 &&
      bytes[7] === 10,
    'image/webp': text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP',
    'application/pdf': text(0, 5) === '%PDF-',
  }[file.type]
  return valid
    ? null
    : 'The file contents do not match its type. Choose a valid JPEG, PNG, WebP or PDF.'
}

export function submissionError(error) {
  const message = error?.message ?? ''
  if (error?.code === '23505' || message.includes('pending'))
    return 'You already have a pending request. Refresh your status before trying again.'
  const known = [
    'Your account is already verified.',
    'The submission type must match your account type (individual or rental business).',
    'Add your business name to your profile first.',
    'You have sent several submissions today. Please try again tomorrow.',
  ]
  return (
    known.find((text) => message.includes(text)) ??
    'We couldn’t send your request. Your document stays private. Try again without selecting the file again.'
  )
}

export async function submitVerification(attempt, client = supabase) {
  // id/status/review fields are deliberately omitted: only the five columns
  // below have INSERT grants. The database prepares status and generates the ID.
  const previous = await client
    .from('verification_submissions')
    .select(VERIFICATION_FIELDS)
    .eq('user_id', attempt.userId)
    .eq('document_path', attempt.path)
    .maybeSingle()
    .abortSignal(AbortSignal.timeout(15000))
  if (previous.error) throw previous.error
  if (previous.data) return previous.data
  const pending = await client
    .from('verification_submissions')
    .select('id')
    .eq('user_id', attempt.userId)
    .eq('status', 'pending')
    .maybeSingle()
    .abortSignal(AbortSignal.timeout(15000))
  if (pending.error) throw pending.error
  if (pending.data) throw new Error('You already have a pending request.')

  const bucket = client.storage.from(VERIFICATION_BUCKET)
  if (!attempt.uploaded && attempt.uploadStarted) {
    // This bucket has SELECT/INSERT policies, but no UPDATE/DELETE policy.
    // Reconcile an uncertain upload instead of upserting or deleting private ID.
    const filename = attempt.path.split('/')[1]
    const { data, error } = await withDeadline(
      bucket.list(attempt.userId, { search: filename, limit: 1 }),
      15000,
    )
    if (error) throw error
    attempt.uploaded = Boolean(data?.some((object) => object.name === filename))
  }
  if (!attempt.uploaded) {
    attempt.uploadStarted = true
    // The installed Storage SDK has no upload abort parameter. Bound the wait;
    // an upload can still finish server-side, so retries reconcile the same key.
    const { error } = await withDeadline(
      bucket.upload(attempt.path, attempt.file, {
        contentType: attempt.file.type,
        cacheControl: '0',
        upsert: false,
      }),
    )
    if (error) throw error
    attempt.uploaded = true
  }
  const { data, error } = await client
    .from('verification_submissions')
    .insert({
      user_id: attempt.userId,
      kind: attempt.kind,
      document_type: attempt.documentType,
      document_path: attempt.path,
      details: attempt.details || null,
    })
    .select(VERIFICATION_FIELDS)
    .single()
    .abortSignal(AbortSignal.timeout(30000))
  if (error) throw error
  if (!data) throw new Error('Request was not confirmed.')
  return data
}

export function isSafeVerificationPath(submission) {
  const parts = submission.document_path?.split('/') ?? []
  // Storage's SDK concatenates paths into URLs. Reject encoded traversal and
  // URL delimiters as well as literal dot segments before an admin credential
  // is used. Our uploads use UUID filenames; safe nested legacy keys also work.
  return (
    parts[0] === submission.user_id &&
    parts.length >= 2 &&
    parts.every(
      (part) =>
        part &&
        !/[%?#\\\u0000-\u001f\u007f]/.test(part) &&
        part !== '.' &&
        part !== '..',
    )
  )
}

export async function downloadVerificationDocument(
  submission,
  signal,
  client = supabase,
) {
  if (!isSafeVerificationPath(submission))
    throw new Error('Invalid document path.')
  const encodedPath = submission.document_path
    .split('/')
    .map(encodeURIComponent)
    .join('/')
  const { data, error } = await client.storage
    .from(VERIFICATION_BUCKET)
    .download(encodedPath, {}, { signal, cache: 'no-store' })
  if (error) throw error
  // Files can also arrive through other authorized Storage clients. Validate
  // their signature as we do on upload before creating a browser preview.
  if (await validateDocumentContents(data))
    throw new Error('Unsupported document.')
  return data
}
