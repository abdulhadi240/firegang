import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticated } from '@/lib/auth'

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { company_id } = await req.json()
  if (!company_id) return NextResponse.json({ success: false, error: 'Missing company_id' }, { status: 400 })

  const webhookUrl = process.env.N8N_WEBHOOK_GET_CALLS
  if (!webhookUrl) return NextResponse.json({ success: false, error: 'Webhook not configured' }, { status: 500 })

  try {
    const n8nRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_id }),
    })

    if (!n8nRes.ok) throw new Error(`n8n responded with status ${n8nRes.status}`)

    const data = await n8nRes.json()

    const payload = Array.isArray(data) ? data[0] : data
    const pendingCount = payload?.unique_count_id ?? payload?.pending_count ?? 0

    return NextResponse.json({
      success: true,
      pending_count: pendingCount,
      n8n_session_id: payload?.session_id ?? crypto.randomUUID(),
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 502 })
  }
}
