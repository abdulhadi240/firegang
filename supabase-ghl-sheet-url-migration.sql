-- ============================================================
-- GHL RECONCILIATION → AUDIT SHEET LINK
-- When a verified month is sent for auditing, n8n replies with the
-- Google Sheet it produced. Store it against the reconciliation so
-- the admin can open the finished audit from the app.
--
-- Run this in your Supabase SQL editor. Safe to re-run.
-- ============================================================

alter table public.ghl_reconciliations
  add column if not exists google_sheet_url text;
