-- ============================================================
-- CALL RECORDING UPLOADS
-- Calls that reach the reconciliation with no recording — an unmatched
-- row, or one whose URL never made it into our sheet — can be given one
-- by hand: paste a URL, or upload the audio/video file itself. Uploads
-- land in this bucket and are written back into the row's `Recording`
-- column as an ordinary public URL, so the sheet, the webhook and the
-- auditor all see one kind of value.
--
-- Run this in your Supabase SQL editor. Safe to re-run.
-- ============================================================

-- Public, because n8n and the auditor fetch the recording with nothing but
-- the URL — the same way they fetch a GHL-hosted one. The keys are random
-- UUIDs, so a URL cannot be guessed from the call it belongs to.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'call-recordings',
  'call-recordings',
  true,
  209715200,  -- 200 MB; keep in step with RECORDING_MAX_BYTES in src/lib/recordings.ts
  array[
    'video/mp4',
    'audio/mp4',
    'audio/x-m4a',
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/x-wav',
    'audio/wave',
    'audio/webm',
    'video/webm',
    'audio/ogg',
    'application/octet-stream'  -- browsers often report nothing for .m4a
  ]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- No RLS policies needed on storage.objects for this bucket:
--   · reads  — the bucket is public
--   · writes — the browser uploads to a signed URL minted server-side with
--              the service role, which is what authorises the write
--   · deletes — done server-side with the service role
