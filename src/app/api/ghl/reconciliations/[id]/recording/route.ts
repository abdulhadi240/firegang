import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticated } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { assertEditable } from '@/lib/ghl-reconciliation'
import {
  RECORDINGS_BUCKET,
  RECORDING_MAX_BYTES,
  formatBytes,
  recordingFileError,
  storagePathFromUrl,
  storageSafeName,
} from '@/lib/recordings'

// Uploading a recording for a call that arrived without one.
//
// The file never passes through this server: it hands back a short-lived signed
// upload URL and the browser PUTs straight to Supabase Storage. That keeps
// hour-long call recordings clear of the request body limits a serverless host
// imposes, and keeps the upload's progress honest.
//
// The row itself is not touched here — the caller writes the returned public URL
// into the row's `Recording` column through the rows endpoint, so a recording
// arrives at the audit as an ordinary URL either way.

// ── Hand out a signed upload URL ─────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const supabase = await createClient()

  const blocked = await assertEditable(supabase, id)
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 })

  const body = (await req.json()) as {
    fileName?: string
    contentType?: string
    size?: number
  }

  if (!body.fileName) {
    return NextResponse.json({ error: 'fileName is required' }, { status: 400 })
  }

  // The browser checks this too; re-checked here because the browser's copy is
  // only a courtesy.
  const invalid = recordingFileError({ name: body.fileName, size: body.size ?? 1 })
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })
  if ((body.size ?? 0) > RECORDING_MAX_BYTES) {
    return NextResponse.json(
      { error: `That file is over the ${formatBytes(RECORDING_MAX_BYTES)} limit` },
      { status: 413 }
    )
  }

  // Grouped by reconciliation, uniquely keyed: re-uploading never clobbers a
  // recording another row is already pointing at.
  const path = `${id}/${crypto.randomUUID()}-${storageSafeName(body.fileName)}`

  const { data, error } = await supabase.storage
    .from(RECORDINGS_BUCKET)
    .createSignedUploadUrl(path)

  if (error || !data) {
    const message = error?.message ?? 'Could not start the upload'
    // The bucket is created by a migration, so this is the one failure worth
    // naming precisely — everything else is opaque to the admin anyway.
    const missingBucket = /bucket not found/i.test(message)
    return NextResponse.json(
      {
        error: missingBucket
          ? `Storage bucket "${RECORDINGS_BUCKET}" does not exist. Run supabase-recordings-migration.sql.`
          : message,
      },
      { status: 500 }
    )
  }

  const { data: pub } = supabase.storage.from(RECORDINGS_BUCKET).getPublicUrl(path)

  return NextResponse.json({
    path,
    token: data.token,
    signedUrl: data.signedUrl,
    publicUrl: pub.publicUrl,
  })
}

// ── Drop an uploaded recording ───────────────────────────────────────────────
// Called when the admin clears or replaces a recording we host, so the bucket
// doesn't fill with files no row refers to. Pasted links are none of our
// business — `storagePathFromUrl` returns null for those and we refuse.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 })

  const path = storagePathFromUrl(url)
  if (!path) {
    return NextResponse.json({ error: 'That recording is not one we host' }, { status: 400 })
  }
  // Uploads are keyed by reconciliation; anything else belongs to another month.
  if (!path.startsWith(`${id}/`)) {
    return NextResponse.json(
      { error: 'That recording belongs to a different reconciliation' },
      { status: 403 }
    )
  }

  const supabase = await createClient()

  const blocked = await assertEditable(supabase, id)
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 })

  const { error } = await supabase.storage.from(RECORDINGS_BUCKET).remove([path])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
