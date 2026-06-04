import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticated } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { LLM_MODELS } from '@/types'

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('test_runs')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { name } = await req.json()
  const supabase = await createClient()

  // Load all test calls
  const { data: testCalls, error: callsErr } = await supabase
    .from('test_calls')
    .select('*')
    .order('created_at', { ascending: true })
  if (callsErr) return NextResponse.json({ error: callsErr.message }, { status: 500 })
  if (!testCalls?.length) return NextResponse.json({ error: 'No test calls found. Add calls first.' }, { status: 400 })

  // Create run record
  const { data: run, error: runErr } = await supabase
    .from('test_runs')
    .insert({
      name: name || `Run ${new Date().toLocaleString()}`,
      status: 'running',
      total_calls: testCalls.length,
    })
    .select()
    .single()
  if (runErr) return NextResponse.json({ error: runErr.message }, { status: 500 })

  // Fire n8n webhook with all calls
  const webhookUrl = process.env.N8N_WEBHOOK_TEST_RUN
  if (!webhookUrl) return NextResponse.json({ error: 'N8N_WEBHOOK_TEST_RUN not configured' }, { status: 500 })

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        run_id:   run.id,
        run_name: run.name,
        models:   LLM_MODELS,
        calls: testCalls.map(c => ({
          id:         c.id,
          call_id:    c.call_id,
          company_id: c.company_id,
          human_tags: c.human_tags,
        })),
      }),
    })

    if (!res.ok) throw new Error(`n8n responded with ${res.status}`)
  } catch (err: any) {
    // Mark run failed if n8n unreachable
    await supabase.from('test_runs').update({ status: 'failed' }).eq('id', run.id)
    return NextResponse.json({ error: err.message }, { status: 502 })
  }

  return NextResponse.json({ success: true, run_id: run.id })
}
