import { createClient } from '@/lib/supabase/server'
import { parseReportMetrics, periodKey, ReportRecord } from '@/lib/report-metrics'
import { fetchComparisonExclusions, isExcludedPractice } from '@/lib/comparison-settings'
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

  const [{ data: docs }, exclusions] = await Promise.all([
    supabase
      .from('summary_documents')
      .select('id, company_id, company_name, month, year, html_content')
      .order('year', { ascending: true })
      .order('month', { ascending: true }),
    fetchComparisonExclusions(supabase),
  ])

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

  // Practices switched out of the all-practices roll-up in Settings, resolved
  // against the ids on the reports so the client only has to match ids.
  const practices = new Map<string, { id: string; name: string }>()
  for (const r of records) practices.set(r.company_id, { id: r.company_id, name: r.company_name })
  const excluded = Array.from(practices.values())
    .filter((p) => isExcludedPractice(p, exclusions.rows))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <ComparisonClient
      records={records}
      initialView={sp.view === 'practice' ? 'practice' : 'monthly'}
      initialCompany={sp.company ?? null}
      initialPeriod={sp.month ?? null}
      excluded={excluded}
      preparedAt={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
    />
  )
}
