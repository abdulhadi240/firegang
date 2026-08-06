import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticated } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ApprovalStatus } from '@/types'
import { pickString } from '@/lib/n8n'
import { ensureSummaryDocument } from '@/lib/ghl-document'

// Where an approved sheet goes next. Overridable per-environment, but defaulted
// so the flow works without extra configuration.
const SHEET_APPROVED_WEBHOOK =
  process.env.N8N_WEBHOOK_GHL_SHEET_APPROVED ??
  'https://n8n.srv946009.hstgr.cloud/webhook/ghl_to_teamwork'

// Sign off on the audit sheet n8n produced for a submitted month.
//
// Approving is the point of this route: it hands the finished sheet to n8n,
// which writes the report into `summary_documents` and answers with that row's
// id. From there the admin reviews, approves and publishes it through the
// normal summary flow — this route only records the pointer.
//
// Disapproving records the decision and sends nothing; the admin can approve
// later once the sheet is fixed.

/** Keys n8n might return the created summary_documents row under. */
const DOCUMENT_ID_KEYS = [
  'summary_document_id', 'summaryDocumentId', 'document_id', 'documentId', 'summary_id',
]
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const { decision } = (await req.json()) as { decision?: ApprovalStatus }

  if (decision !== 'approved' && decision !== 'disapproved') {
    return NextResponse.json({ error: 'Invalid decision' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: recon, error: reconErr } = await supabase
    .from('ghl_reconciliations')
    .select('id, month, year, google_sheet_url')
    .eq('id', id)
    .single()

  if (reconErr || !recon) {
    return NextResponse.json({ error: 'Reconciliation not found' }, { status: 404 })
  }
  if (!recon.google_sheet_url) {
    return NextResponse.json(
      { error: 'There is no audit sheet to approve yet' },
      { status: 409 }
    )
  }

  // Send first, record second: if n8n can't be reached the sheet is still
  // pending, so the admin can retry rather than being told it went through.
  let summaryDocumentId: string | null = null
  if (decision === 'approved') {
    try {
      const res = await fetch(SHEET_APPROVED_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // ghl_reconciliations.id — the Supabase row this sheet belongs to.
          reconciliation_id: recon.id,
          google_sheet_url: recon.google_sheet_url,
          // This flow runs for a single practice that isn't in the companies
          // table, so the name comes from the environment.
          company_name: process.env.GHL_PRACTICE_NAME ?? 'Gillespie Dentistry',
          month: recon.month,
          // A month name alone can't key a row — send the year with it.
          year: recon.year,
        }),
      })
      if (!res.ok) {
        // Include what n8n actually said — a 404 here almost always means the
        // workflow isn't active, which is otherwise invisible from the app.
        const detail = (await res.text().catch(() => '')).trim().slice(0, 200)
        throw new Error(
          `n8n responded with ${res.status}${detail ? ` — ${detail}` : ''}. ` +
          `Check that the ghl_to_teamwork workflow is active.`
        )
      }

      // The workflow answers with the summary_documents row it created, which
      // is what the admin reviews next.
      try {
        summaryDocumentId = pickString(JSON.parse(await res.text()), DOCUMENT_ID_KEYS)
      } catch {
        // Non-JSON reply is fine; the hand-off itself succeeded.
      }
    } catch (err: unknown) {
      console.error('[ghl/sheet-approval]', err)
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to reach the n8n webhook' },
        { status: 502 }
      )
    }
  }

  // n8n usually writes the report into `teamwork_document` rather than echoing
  // a row id back, so re-read the reconciliation and promote whatever it left
  // there. Either way the admin ends up with a direct link to the document.
  if (decision === 'approved' && !summaryDocumentId) {
    const { data: fresh } = await supabase
      .from('ghl_reconciliations')
      .select('id, month, year, status, teamwork_document, summary_document_id')
      .eq('id', id)
      .single()
    if (fresh) summaryDocumentId = await ensureSummaryDocument(supabase, fresh)
  }

  const now = new Date().toISOString()
  const update: Record<string, unknown> = {
    sheet_approval_status:     decision,
    sheet_approval_decided_at: now,
    updated_at:                now,
  }
  // Keep a previously captured pointer if this run didn't return one.
  if (summaryDocumentId) update.summary_document_id = summaryDocumentId

  const { data: updated, error } = await supabase
    .from('ghl_reconciliations')
    .update(update)
    .eq('id', id)
    .select('id, status, sheet_approval_status, sheet_approval_decided_at, summary_document_id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, ...updated })
}
