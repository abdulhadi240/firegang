import { createClient } from '@/lib/supabase/server'
import { SummaryDocument, MONTH_NAMES } from '@/types'
import { SummaryClient } from './summary-client'

export default async function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>
}) {
  const supabase = await createClient()

  // Default to the *previous* month (the usual audit target), but let the user
  // navigate to any month via ?month=July&year=2026. `month` is stored as a
  // name (e.g. "June"), so we filter by name.
  const now = new Date()
  const defaultMonth = now.getMonth() === 0 ? 'December' : MONTH_NAMES[now.getMonth() - 1]
  const defaultYear  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()

  const sp = await searchParams
  const monthName = sp.month && MONTH_NAMES.includes(sp.month) ? sp.month : defaultMonth
  const year      = sp.year && /^\d{4}$/.test(sp.year) ? Number(sp.year) : defaultYear

  const [{ data: companies }, { data: monthDocs }] = await Promise.all([
    supabase
      .from('companies')
      .select('id, name, status, created_at')
      .order('name', { ascending: true }),
    supabase
      .from('summary_documents')
      .select('id, title, company_id, company_name, month, year, status, approval_status, teamwork_inserted_at, teamwork_ref, created_at, updated_at')
      .eq('month', monthName)
      .eq('year', year)
      .order('company_name', { ascending: true }),
  ])

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Summary</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Review {monthName} {year} monthly audit reports, approve them, and track Teamwork publishing.
        </p>
      </div>
      <SummaryClient
        companies={companies ?? []}
        monthDocuments={(monthDocs ?? []) as SummaryDocument[]}
        month={monthName}
        year={year}
      />
    </div>
  )
}
