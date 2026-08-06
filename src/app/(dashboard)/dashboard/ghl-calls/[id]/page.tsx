import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { GhlReconciliation, GhlReconciliationRow } from '@/types'
import { ReconciliationClient } from './reconciliation-client'
import { ensureSummaryDocument } from '@/lib/ghl-document'

const PRACTICE_NAME = process.env.GHL_PRACTICE_NAME ?? 'Gillespie Dentistry'

export default async function ReconciliationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: recon } = await supabase
    .from('ghl_reconciliations')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!recon) notFound()

  const { data: rows } = await supabase
    .from('ghl_reconciliation_rows')
    .select('id, reconciliation_id, source, data, excluded, position')
    .eq('reconciliation_id', id)
    .order('position', { ascending: true })

  // n8n writes the approved month's report into `teamwork_document`. Promote it
  // into a summary document so the hand-off link is never a dead end — the
  // admin reviews and publishes it through the normal summary flow from there.
  if (recon.sheet_approval_status === 'approved' && !recon.summary_document_id) {
    recon.summary_document_id = await ensureSummaryDocument(supabase, recon)
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
          {recon.month} {recon.year}
        </h1>
        <p className="text-gray-500 mt-1 text-sm">
          Review the reconciled call list, fill any gaps, then send it for auditing.
        </p>
      </div>

      <ReconciliationClient
        practiceName={PRACTICE_NAME}
        reconciliation={recon as GhlReconciliation}
        initialRows={(rows ?? []) as GhlReconciliationRow[]}
      />
    </div>
  )
}
