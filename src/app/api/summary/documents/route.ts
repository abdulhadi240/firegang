import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const companyId = req.nextUrl.searchParams.get('company_id')

  let query = supabase
    .from('summary_documents')
    .select('id, title, company_id, company_name, month, year, status, approval_status, teamwork_inserted_at, teamwork_ref, created_at, updated_at')
    .order('year',  { ascending: false })
    .order('month', { ascending: false })
    .order('company_name', { ascending: true })
    .limit(100)

  if (companyId) query = query.eq('company_id', companyId)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ documents: data })
}
