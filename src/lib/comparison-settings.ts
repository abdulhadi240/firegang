// Which practices are switched out of the all-practices roll-up on the
// Comparison page. Managed from Dashboard → Settings and stored in
// `comparison_exclusions` (see supabase-comparison-settings-migration.sql).
//
// A practice is matched by id first and by name second: the reports carry the
// practice id, but a practice can be re-created under a new id, and the name
// is what the admin recognises. Names are compared trimmed and lower-cased.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ComparisonExclusion } from '@/types'

export const normalisePracticeName = (name: string) => name.trim().toLowerCase()

/** The exclusions table has not been created yet (migration not run). */
export function isMissingExclusionsTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === '42P01' || error.code === 'PGRST205' || /comparison_exclusions/.test(error.message ?? '')
}

export interface ExclusionsResult {
  rows: ComparisonExclusion[]
  /** False when the table is missing, so callers can prompt to run the migration. */
  available: boolean
}

export async function fetchComparisonExclusions(supabase: SupabaseClient): Promise<ExclusionsResult> {
  const { data, error } = await supabase
    .from('comparison_exclusions')
    .select('company_id, company_name, created_at')
    .order('company_name', { ascending: true })
  if (error) {
    if (isMissingExclusionsTable(error)) return { rows: [], available: false }
    throw new Error(error.message)
  }
  return { rows: (data ?? []) as ComparisonExclusion[], available: true }
}

/** True when a practice (by id or name) is on the exclusion list. */
export function isExcludedPractice(
  practice: { id: string; name: string },
  exclusions: ComparisonExclusion[]
): boolean {
  const name = normalisePracticeName(practice.name)
  return exclusions.some((e) => e.company_id === practice.id || normalisePracticeName(e.company_name) === name)
}
