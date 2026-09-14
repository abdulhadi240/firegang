import { createClient } from '@/lib/supabase/server'
import { parseReportMetrics, periodKey, ReportRecord } from '@/lib/report-metrics'
import { buildAuditOverview } from '@/lib/audit-overview'
import { DashboardClient } from './dashboard-client'

// The home page is a read-out of the monthly audit reports. Every report is
// parsed on the server into a compact metrics object (the same parser the
// Comparison page uses) and rolled up into totals, a month-by-month trend and
// the practices that moved most. The client never sees the report HTML.
export default async function DashboardPage() {
  const supabase = await createClient()

  const [{ data: docs }, { count: companiesCount }] = await Promise.all([
    supabase
      .from('summary_documents')
      .select('id, company_id, company_name, month, year, html_content, approval_status, teamwork_inserted_at')
      .order('year', { ascending: true })
      .order('month', { ascending: true }),
    supabase.from('companies').select('*', { count: 'exact', head: true }).eq('status', 'active'),
  ])

  const withBody = (docs ?? []).filter((d) => d.html_content?.trim())

  const records: ReportRecord[] = withBody.map((d) => ({
    id: d.id,
    company_id: d.company_id,
    company_name: d.company_name.trim(),
    month: d.month,
    year: d.year,
    period: periodKey(d.month, d.year),
    metrics: parseReportMetrics(d.html_content),
  }))

  const overview = buildAuditOverview(records)

  // Work still waiting on the admin, scoped to the latest reported month.
  const latestPeriod = overview.latest?.period
  const latestDocs = latestPeriod
    ? withBody.filter((d) => periodKey(d.month, d.year) === latestPeriod)
    : []
  const queue = {
    pendingReview: latestDocs.filter((d) => d.approval_status === 'pending').length,
    approvedNotPublished: latestDocs.filter((d) => d.approval_status === 'approved' && !d.teamwork_inserted_at).length,
    published: latestDocs.filter((d) => d.teamwork_inserted_at).length,
    generating: (docs ?? []).filter((d) => !d.html_content?.trim()).length,
  }

  return (
    <DashboardClient
      overview={overview}
      activeCompanies={companiesCount ?? 0}
      queue={queue}
    />
  )
}
