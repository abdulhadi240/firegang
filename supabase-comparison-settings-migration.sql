-- ============================================================
-- COMPARISON SETTINGS — practices left out of the roll-up
-- The Comparison page adds every practice report for a month into one
-- company-wide figure. A single outlier practice (one that reported over a
-- hundred wrong tags in a month) can move that figure on its own, so the
-- admin can switch individual practices out of the all-practices totals from
-- Dashboard → Settings. This table remembers which ones are switched off.
--
-- Keyed by the practice id as it appears on the monthly reports
-- (summary_documents.company_id). The name is stored alongside so the
-- exclusion still applies if the practice is ever re-created under a new id.
-- No foreign key: companies.id is text in production and one report carries
-- an id with no companies row.
--
-- Run this in your Supabase SQL editor. Safe to re-run.
-- ============================================================

create table if not exists public.comparison_exclusions (
  company_id   text primary key,
  company_name text not null,
  created_at   timestamptz not null default now()
);

alter table public.comparison_exclusions enable row level security;

drop policy if exists "Authenticated users can view comparison exclusions" on public.comparison_exclusions;
create policy "Authenticated users can view comparison exclusions"
  on public.comparison_exclusions for select
  to authenticated
  using (true);

drop policy if exists "Service role can manage comparison exclusions" on public.comparison_exclusions;
create policy "Service role can manage comparison exclusions"
  on public.comparison_exclusions for all
  to service_role
  using (true);
