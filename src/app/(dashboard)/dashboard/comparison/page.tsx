import { createClient } from '@/lib/supabase/server'
import { parseReportMetrics, periodKey, ReportRecord } from '@/lib/report-metrics'
import { ComparisonClient } from './comparison-client'

// Every monthly report is parsed here, on the server, into a compact metrics
// object — the client never receives the raw HTML. ~330 reports at ~2 KB each
// parse in well under a second, so there is no need to persist the result.
export default async function ComparisonPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; company?: string; month?: string }>
}) {
  const supabase = await createClient()
  const sp = await searchParams

  const { data: docs } = await supabase
    .from('summary_documents')
    .select('id, company_id, company_name, month, year, html_content')
    .order('year', { ascending: true })
    .order('month', { ascending: true })

  const records: ReportRecord[] = (docs ?? [])
    // Rows reserved for a report still being generated carry no body yet.
    .filter((d) => d.html_content?.trim())
    .map((d) => ({
      id: d.id,
      company_id: d.company_id,
      company_name: d.company_name.trim(),
      month: d.month,
      year: d.year,
      period: periodKey(d.month, d.year),
      metrics: parseReportMetrics(d.html_content),
    }))
    .sort((a, b) => a.period.localeCompare(b.period) || a.company_name.localeCompare(b.company_name))

  return (
    <ComparisonClient
      records={records}
      initialView={sp.view === 'practice' ? 'practice' : 'monthly'}
      initialCompany={sp.company ?? null}
      initialPeriod={sp.month ?? null}
      preparedAt={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
    />
  )
}
