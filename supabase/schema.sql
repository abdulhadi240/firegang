-- ============================================================
-- Firegang Call Audit — Supabase Schema
-- Run this in your Supabase SQL editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- COMPANIES
-- ============================================================
create table if not exists public.companies (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  status     text not null default 'active'
               check (status in ('active', 'inactive', 'pending')),
  created_at timestamptz default now()
);

-- RLS
alter table public.companies enable row level security;

create policy "Authenticated users can view companies"
  on public.companies for select
  to authenticated
  using (true);

create policy "Service role can manage companies"
  on public.companies for all
  to service_role
  using (true);


-- ============================================================
-- AUDIT RESULTS
-- Each audited call linked to a company
-- ============================================================
create table if not exists public.audit_results (
  id         uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  call_id    text not null,
  call_tags  text[] default '{}',
  notes      text,
  user_id    uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

-- RLS
alter table public.audit_results enable row level security;

create policy "Authenticated users can view audit results"
  on public.audit_results for select
  to authenticated
  using (true);

create policy "Authenticated users can insert audit results"
  on public.audit_results for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Service role full access"
  on public.audit_results for all
  to service_role
  using (true);


-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_audit_results_company_id on public.audit_results(company_id);
create index if not exists idx_audit_results_user_id    on public.audit_results(user_id);


-- ============================================================
-- LLM TESTING — TEST CALLS
-- Ground-truth calls that human auditors marked as failed
-- ============================================================
create table if not exists public.test_calls (
  id           uuid primary key default uuid_generate_v4(),
  call_id      text not null,
  company_id   uuid references public.companies(id) on delete set null,
  human_tags   text[] not null default '{}',
  created_at   timestamptz not null default now()
);

alter table public.test_calls enable row level security;
create policy "Service role full access" on public.test_calls for all to service_role using (true);


-- ============================================================
-- LLM TESTING — TEST RUNS
-- A batch execution across all 4 LLM models
-- ============================================================
create table if not exists public.test_runs (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  status        text not null default 'pending'
                  check (status in ('pending', 'running', 'completed', 'failed')),
  total_calls   int  not null default 0,
  completed_at  timestamptz,
  created_at    timestamptz not null default now()
);

alter table public.test_runs enable row level security;
create policy "Service role full access" on public.test_runs for all to service_role using (true);


-- ============================================================
-- LLM TESTING — TEST RESULTS
-- One row per (run × call × model)
-- ============================================================
create table if not exists public.test_results (
  id            uuid primary key default uuid_generate_v4(),
  test_run_id   uuid not null references public.test_runs(id)  on delete cascade,
  test_call_id  uuid not null references public.test_calls(id) on delete cascade,
  llm_model     text not null,
  llm_tags      text[] not null default '{}',
  llm_notes     text,
  tags_match    bool,
  latency_ms    int,
  error         text,
  raw_response  jsonb,
  created_at    timestamptz not null default now()
);

alter table public.test_results enable row level security;
create policy "Service role full access" on public.test_results for all to service_role using (true);

create index if not exists idx_test_results_run_id  on public.test_results(test_run_id);
create index if not exists idx_test_results_call_id on public.test_results(test_call_id);
create index if not exists idx_test_results_model   on public.test_results(llm_model);


-- ============================================================
-- RESTRICT SIGNUP TO @firegang.com
-- ============================================================
create or replace function public.check_email_domain()
returns trigger as $$
begin
  if not (new.email like '%@firegang.com') then
    raise exception 'Signup restricted to @firegang.com email addresses';
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- Uncomment to enforce at DB level:
-- create trigger enforce_email_domain
--   before insert on auth.users
--   for each row execute procedure public.check_email_domain();


-- ============================================================
-- SAMPLE DATA
-- ============================================================
-- insert into public.companies (name, status) values
--   ('Acme Dental', 'active'),
--   ('Sunrise Smiles', 'active'),
--   ('City Orthodontics', 'pending');
