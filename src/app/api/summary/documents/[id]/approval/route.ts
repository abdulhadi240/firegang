import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ApprovalStatus } from '@/types'
import { extractSummaryHtml } from '@/lib/summary-content'

// Approve / disapprove a summary document.
// On "approved" we push the summary to the Teamwork webhook and mark it
// published; on "disapproved" we simply record the status.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { decision } = (await req.json()) as { decision?: ApprovalStatus }

  if (decision !== 'approved' && decision !== 'disapproved') {
    return NextResponse.json({ error: 'Invalid decision' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: doc } = await supabase
    .from('summary_documents')
    .select('*')
    .eq('id', id)
    .single()

  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const cleanHtml = extractSummaryHtml(doc.html_content)
  const now = new Date().toISOString()
  const update: Record<string, unknown> = {
    approval_status:     decision,
    approval_decided_at: now,
    updated_at:          now,
  }

  // On approval, push the full summary to the Teamwork webhook.
  if (decision === 'approved') {
    const webhookUrl = process.env.APPROVE_WEBHOOK_URL
    if (webhookUrl) {
      try {
        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id:           doc.id,
            title:        doc.title,
            summary:      cleanHtml,   // the full summary content (unwrapped)
            html_content: cleanHtml,
            company_id:   doc.company_id,
            company_name: doc.company_name,
            month:        doc.month,
            year:         doc.year,
          }),
        })
        if (!res.ok) throw new Error(`Teamwork webhook returned ${res.status}`)

        // Capture a reference id from the webhook response if it returns one.
        try {
          const result = await res.json()
          update.teamwork_ref = result?.id ?? result?.ref ?? null
        } catch {
          update.teamwork_ref = null
        }
      } catch (err) {
        console.error('[summary approval webhook]', err)
        return NextResponse.json({ error: 'Teamwork webhook failed' }, { status: 502 })
      }
    }
    // Approval publishes the summary to Teamwork.
    update.teamwork_inserted_at = now
  }

  const { data: updated, error } = await supabase
    .from('summary_documents')
    .update(update)
    .eq('id', id)
    .select('id, approval_status, approval_decided_at, teamwork_inserted_at, teamwork_ref')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, ...updated })
}
