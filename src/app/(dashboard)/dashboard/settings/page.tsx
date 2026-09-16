import { createClient } from '@/lib/supabase/server'
import { periodKey } from '@/lib/report-metrics'
import { fetchComparisonExclusions, isExcludedPractice } from '@/lib/comparison-settings'
import { SettingsClient, PracticeSetting } from './settings-client'

// Admin settings. For now: which practices are switched out of the
// all-practices totals on the Comparison page. The list is every practice that
// has a monthly report, because those are the only ones the roll-up can contain.
export default async function SettingsPage() {
  const supabase = await createClient()

  const [{ data: docs }, exclusions] = await Promise.all([
    supabase
      .from('summary_documents')
      .select('company_id, company_name, month, year, html_content')
      .order('year', { ascending: true })
      .order('month', { ascending: true }),
    fetchComparisonExclusions(supabase),
  ])

  const byId = new Map<string, { id: string; name: string; periods: Set<string> }>()
  for (const d of docs ?? []) {
    if (!d.html_content?.trim()) continue   // report still being generated
    const entry = byId.get(d.company_id) ?? { id: d.company_id, name: d.company_name.trim(), periods: new Set<string>() }
    entry.name = d.company_name.trim()
    entry.periods.add(periodKey(d.month, d.year))
    byId.set(d.company_id, entry)
  }

  const practices: PracticeSetting[] = Array.from(byId.values())
    .map((p) => ({
      id: p.id,
      name: p.name,
      months: p.periods.size,
      excluded: isExcludedPractice(p, exclusions.rows),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Choices that change how the dashboard reads the monthly reports.
        </p>
      </div>
      <SettingsClient practices={practices} available={exclusions.available} />
    </div>
  )
}
