-- Fix summary_documents: one row per company per month (not array of companies)
-- Run this in your Supabase SQL editor

-- 1. Drop the array-based columns
ALTER TABLE summary_documents
  DROP COLUMN IF EXISTS company_ids,
  DROP COLUMN IF EXISTS company_names;

-- 2. Add single-company columns
ALTER TABLE summary_documents
  ADD COLUMN IF NOT EXISTS company_id   text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS company_name text NOT NULL DEFAULT '';

-- 3. One summary per company per month/year
ALTER TABLE summary_documents
  ADD CONSTRAINT summary_documents_company_month_year_uniq
  UNIQUE (company_id, month, year);

-- 4. Index for fast per-company lookups
CREATE INDEX IF NOT EXISTS summary_documents_company_id_idx
  ON summary_documents (company_id);
