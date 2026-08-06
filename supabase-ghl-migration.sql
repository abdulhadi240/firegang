-- ============================================================
-- GHL CALL RECONCILIATION
-- Month-end merge of the Go High Level export against our own
-- call sheet (which carries the recording URLs).
--
-- This flow is standalone: it runs for a single practice that is
-- NOT in the companies table, so there is no company_id here and
-- no foreign key to companies. A reconciliation is identified by
-- month + year alone.
--
-- Run this in your Supabase SQL editor. The drops are safe — these
-- tables are new and hold no data yet.
-- ============================================================

create extension if not exists "uuid-ossp";

drop table if exists public.ghl_reconciliation_rows cascade;
drop table if exists public.ghl_reconciliations cascade;

-- One reconciliation per month. Re-uploading a month replaces the previous
-- attempt rather than accumulating drafts.
create table public.ghl_reconciliations (
  id            uuid primary key default uuid_generate_v4(),
  month         text not null,
  year          int  not null,
  status        text not null default 'draft'
                  check (status in ('draft', 'verified', 'submitted')),
  -- Counts from the merge: totals, matched, unmatched each way, missing recordings.
  summary       jsonb not null default '{}'::jsonb,
  source_tab    text,
  submitted_at  timestamptz,
  webhook_ref   text,
  -- The audit sheet n8n produces for the month, returned by the webhook.
  google_sheet_url text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- At most one reconciliation per month.
create unique index idx_ghl_recon_month
  on public.ghl_reconciliations(month, year);

alter table public.ghl_reconciliations enable row level security;
create policy "Service role full access"
  on public.ghl_reconciliations for all to service_role using (true);


-- The editable grid the admin reviews before verifying. One row per call.
-- `data` holds the merged record keyed by the shared column names, so the
-- schema survives column changes in either export without a migration.
create table public.ghl_reconciliation_rows (
  id                 uuid primary key default uuid_generate_v4(),
  reconciliation_id  uuid not null references public.ghl_reconciliations(id) on delete cascade,
  source             text not null default 'matched'
                       check (source in ('matched', 'ghl_only', 'sheet_only', 'manual')),
  data               jsonb not null default '{}'::jsonb,
  -- Kept visible in the UI but omitted from the n8n payload.
  excluded           bool not null default false,
  position           int  not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index idx_ghl_recon_rows_recon_id
  on public.ghl_reconciliation_rows(reconciliation_id, position);

alter table public.ghl_reconciliation_rows enable row level security;
create policy "Service role full access"
  on public.ghl_reconciliation_rows for all to service_role using (true);
