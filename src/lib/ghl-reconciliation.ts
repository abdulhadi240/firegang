import { createClient } from '@/lib/supabase/server'
import { isReconciliationLocked } from '@/types'

type Supabase = Awaited<ReturnType<typeof createClient>>

/**
 * Every write to a reconciliation goes through this first: rows are frozen once
 * the month has been sent for auditing. Returns the reason to refuse, or null
 * when the edit may proceed.
 */
export async function assertEditable(
  supabase: Supabase,
  reconciliationId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('ghl_reconciliations')
    .select('status')
    .eq('id', reconciliationId)
    .single()

  if (error || !data) return 'Reconciliation not found'
  if (isReconciliationLocked(data.status)) {
    return 'This reconciliation has already been submitted and can no longer be edited'
  }
  return null
}

/** Any edit invalidates a previous verification, so the month must be re-verified. */
export async function markDraft(supabase: Supabase, reconciliationId: string) {
  await supabase
    .from('ghl_reconciliations')
    .update({ status: 'draft', updated_at: new Date().toISOString() })
    .eq('id', reconciliationId)
}
