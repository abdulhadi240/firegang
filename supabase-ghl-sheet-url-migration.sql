-- ============================================================
-- GHL RECONCILIATION → AUDIT SHEET LINK + SIGN-OFF
-- When a verified month is sent for auditing, n8n replies with the
-- Google Sheet it produced. Store it against the reconciliation so
-- the admin can open the finished audit from the app, then approve
-- or disapprove it. Approving ships the sheet on to n8n.
--
-- Run this in your Supabase SQL editor. Safe to re-run.
-- ============================================================

alter table public.ghl_reconciliations
  add column if not exists google_sheet_url text;

alter table public.ghl_reconciliations
  add column if not exists sheet_approval_status text not null default 'pending';

alter table public.ghl_reconciliations
  add column if not exists sheet_approval_decided_at timestamptz;

-- The report HTML n8n writes back after the sheet is approved.
alter table public.ghl_reconciliations
  add column if not exists teamwork_document text;

-- That HTML is promoted into a summary_documents row, so the admin reviews,
-- approves and publishes it through the existing summary flow — this column is
-- just the pointer to that row. Deliberately not a foreign key: deleting the
-- summary shouldn't cascade into the reconciliation.
alter table public.ghl_reconciliations
  add column if not exists summary_document_id text;

-- A month reaches 'audited' once the report document exists — the end of the
-- reconciliation's life, after which only the summary flow acts on it.
alter table public.ghl_reconciliations
  drop constraint if exists ghl_reconciliations_status_check;
alter table public.ghl_reconciliations
  add constraint ghl_reconciliations_status_check
  check (status in ('draft', 'verified', 'submitted', 'audited'));

-- Added separately so re-running the script doesn't trip over an existing check.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ghl_reconciliations_sheet_approval_status_check'
  ) then
    alter table public.ghl_reconciliations
      add constraint ghl_reconciliations_sheet_approval_status_check
      check (sheet_approval_status in ('pending', 'approved', 'disapproved'));
  end if;
end $$;
