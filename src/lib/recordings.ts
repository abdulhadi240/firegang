// Recordings the admin supplies by hand, for calls the reconciliation could not
// pair with a recording of its own — an unmatched row, or one whose recording
// URL never made it into our sheet.
//
// Two ways in: paste a URL, or upload the file. Uploads land in a public
// Supabase Storage bucket and are stored back into the row's `Recording` column
// as a plain URL, so everything downstream (the sheet, the webhook, the
// auditor) sees one kind of value and needs no knowledge of storage at all.

/** Public bucket created by `supabase-recordings-migration.sql`. */
export const RECORDINGS_BUCKET = 'call-recordings'

/** Keep in step with the bucket's own `file_size_limit`. */
export const RECORDING_MAX_BYTES = 200 * 1024 * 1024

/** What the file picker offers. Extensions, since browsers disagree on audio MIME types. */
export const RECORDING_ACCEPT = '.mp4,.m4a,.mp3,.wav,.webm,.ogg,.oga,audio/*,video/mp4'

const RECORDING_EXTENSIONS = ['mp4', 'm4a', 'mp3', 'wav', 'webm', 'ogg', 'oga'] as const

/**
 * Browsers report audio types inconsistently (an .m4a arrives as `audio/x-m4a`,
 * `audio/mp4` or nothing at all), so the extension is what we trust. The bucket
 * enforces its own MIME allow-list as the backstop.
 */
export function recordingFileError(file: { name: string; size: number }): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!(RECORDING_EXTENSIONS as readonly string[]).includes(ext)) {
    return `Unsupported file type. Upload one of: ${RECORDING_EXTENSIONS.join(', ')}`
  }
  if (file.size === 0) return 'That file is empty'
  if (file.size > RECORDING_MAX_BYTES) {
    return `That file is ${formatBytes(file.size)} — the limit is ${formatBytes(RECORDING_MAX_BYTES)}`
  }
  return null
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Storage rejects most punctuation in keys, and a collision would overwrite someone's call. */
export function storageSafeName(name: string): string {
  const cleaned = name.normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/-{2,}/g, '-')
  return cleaned.slice(-80) || 'recording'
}

/**
 * The path inside the bucket, or null when the URL points somewhere else — a
 * pasted link to GHL, say, which we must never try to delete.
 */
export function storagePathFromUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${RECORDINGS_BUCKET}/`
  const at = url.indexOf(marker)
  if (at === -1) return null
  const path = url.slice(at + marker.length).split('?')[0]
  return path ? decodeURIComponent(path) : null
}

/** True for a recording we host, as opposed to one the admin pasted a link to. */
export function isUploadedRecording(url: string): boolean {
  return storagePathFromUrl(url) !== null
}
