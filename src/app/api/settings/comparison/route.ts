import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchComparisonExclusions, isMissingExclusionsTable } from '@/lib/comparison-settings'

const MIGRATION_HINT =
  'The comparison_exclusions table does not exist yet. Run supabase-comparison-settings-migration.sql in the Supabase SQL editor.'

// The practices switched out of the Comparison page's all-practices totals.
export async function GET() {
  const supabase = await createClient()
  try {
    const { rows, available } = await fetchComparisonExclusions(supabase)
    return NextResponse.json({ exclusions: rows, available })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

// Switch one practice in or out of the totals.
// Body: { company_id, company_name, excluded: boolean }
export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { company_id?: unknown; company_name?: unknown; excluded?: unknown }
    | null

  const companyId = typeof body?.company_id === 'string' ? body.company_id.trim() : ''
  const companyName = typeof body?.company_name === 'string' ? body.company_name.trim() : ''
  if (!companyId || !companyName || typeof body?.excluded !== 'boolean') {
    return NextResponse.json({ error: 'company_id, company_name and excluded are required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { error } = body.excluded
    ? await supabase
        .from('comparison_exclusions')
        .upsert({ company_id: companyId, company_name: companyName }, { onConflict: 'company_id' })
    : await supabase.from('comparison_exclusions').delete().eq('company_id', companyId)

  if (error) {
    if (isMissingExclusionsTable(error)) return NextResponse.json({ error: MIGRATION_HINT }, { status: 503 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true, company_id: companyId, excluded: body.excluded })
}
