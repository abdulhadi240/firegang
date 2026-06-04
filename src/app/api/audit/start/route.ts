import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticated, ADMIN_USER_ID } from '@/lib/auth'

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { company_id, n8n_session_id, pending_count } = await req.json()
  if (!company_id || !n8n_session_id) {
    return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
  }

  const webhookUrl = process.env.N8N_WEBHOOK_START_AUDIT
  if (!webhookUrl) return NextResponse.json({ success: false, error: 'Audit webhook not configured' }, { status: 500 })

  try {
    const n8nRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id,
        n8n_session_id,
        pending_count,
        initiated_by: ADMIN_USER_ID,
        callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/audit/log-call`,
      }),
    })

    if (!n8nRes.ok) throw new Error(`n8n responded with status ${n8nRes.status}`)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 502 })
  }
}
