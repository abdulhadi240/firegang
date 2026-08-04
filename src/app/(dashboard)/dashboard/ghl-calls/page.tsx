import { createClient } from '@/lib/supabase/server'
import { MONTH_NAMES, GhlReconciliation } from '@/types'
import { GhlCallsClient } from './ghl-calls-client'

// This flow runs for a single practice that isn't in the companies table, so
// the name is presentational only — nothing is keyed on it.
const PRACTICE_NAME = process.env.GHL_PRACTICE_NAME ?? 'Gillespie Dentistry'

export default async function GhlCallsPage() {
  const supabase = await createClient()

  // Newest month first. Sorting on (year, month-name) can't be done in SQL
  // because month is stored as a name, so order by recency of work instead.
  const { data } = await supabase
    .from('ghl_reconciliations')
    .select('*')
    .order('year', { ascending: false })
    .order('updated_at', { ascending: false })

  const reconciliations = ((data ?? []) as GhlReconciliation[]).sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year
    return MONTH_NAMES.indexOf(b.month) - MONTH_NAMES.indexOf(a.month)
  })

  // Default target for a new reconciliation: the previous month.
  const now = new Date()
  const defaultMonth = now.getMonth() === 0 ? 'December' : MONTH_NAMES[now.getMonth() - 1]
  const defaultYear  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">GHL Calls</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Reconcile each month&rsquo;s Go High Level export against our call sheet, then send the
          verified list for auditing.
        </p>
      </div>

      <GhlCallsClient
        practiceName={PRACTICE_NAME}
        reconciliations={reconciliations}
        defaultMonth={defaultMonth}
        defaultYear={defaultYear}
      />
    </div>
  )
}
