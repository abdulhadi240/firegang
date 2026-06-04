import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Called by n8n for each audited call — uses service role key

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('x-n8n-secret')
  const expectedSecret = process.env.N8N_WEBHOOK_SECRET
  if (expectedSecret && authHeader !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const body = await req.json()
  const { company_id, call_id, call_tags, notes, user_id } = body

  if (!company_id || !call_id) {
    return NextResponse.json({ error: 'Missing company_id or call_id' }, { status: 400 })
  }

  const { error } = await supabase.from('audit_results').insert({
    company_id,
    call_id,
    call_tags: call_tags ?? [],
    notes: notes ?? null,
    user_id: user_id ?? null,
    created_at: new Date().toISOString(),
  })

  if (error) {
    console.error('[log-call]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
