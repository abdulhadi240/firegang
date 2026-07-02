-- Add approval workflow to summary_documents
-- approval_status is independent of `status` (draft/saved edit state)
-- and of teamwork_inserted_at (published state).
-- Run this in your Supabase SQL editor.

ALTER TABLE summary_documents
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending';

ALTER TABLE summary_documents
  DROP CONSTRAINT IF EXISTS summary_documents_approval_status_check;

ALTER TABLE summary_documents
  ADD CONSTRAINT summary_documents_approval_status_check
  CHECK (approval_status IN ('pending', 'approved', 'disapproved'));

-- Timestamp of the approve/disapprove decision (optional audit trail)
ALTER TABLE summary_documents
  ADD COLUMN IF NOT EXISTS approval_decided_at timestamptz;
