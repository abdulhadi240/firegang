import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { GhlReconciliation, GhlReconciliationRow } from '@/types'
import { ReconciliationClient } from './reconciliation-client'

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
