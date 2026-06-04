import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticated } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('test_calls')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { call_id, human_tags, company_id } = await req.json()
  const tags: string[] = Array.isArray(human_tags) ? human_tags.filter(Boolean) : []
  if (!call_id?.trim()) return NextResponse.json({ error: 'call_id is required' }, { status: 400 })
  if (tags.length === 0) return NextResponse.json({ error: 'At least one approved tag is required' }, { status: 400 })
  if (!company_id) return NextResponse.json({ error: 'company_id is required' }, { status: 400 })
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('test_calls')
    .insert({ call_id: call_id.trim(), human_tags: tags, company_id })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
