import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { MONTH_NAMES, SummaryDocument } from '@/types'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const companyId = req.nextUrl.searchParams.get('company_id')

  // Newest month first. `month` is stored as a name, so SQL would sort it
  // alphabetically (June before July) — order by recency here, then fix the
  // month order below.
  let query = supabase
    .from('summary_documents')
    .select('id, title, company_id, company_name, month, year, status, approval_status, teamwork_inserted_at, teamwork_ref, created_at, updated_at')
    .order('year',  { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100)

  if (companyId) query = query.eq('company_id', companyId)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const documents = ((data ?? []) as SummaryDocument[]).sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year
    const byMonth = MONTH_NAMES.indexOf(b.month) - MONTH_NAMES.indexOf(a.month)
    if (byMonth !== 0) return byMonth
    return a.company_name.localeCompare(b.company_name)
  })

  return NextResponse.json({ documents })
}
