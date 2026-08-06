import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticated } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ensureSummaryDocument } from '@/lib/ghl-document'

// Resolve the summary document for an approved month, promoting the report n8n
// wrote into `teamwork_document` if that hasn't happened yet.
//
// Backs the "Check again" control: n8n writes the report asynchronously, so it
// can land after the approval request has already returned.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const supabase = await createClient()

  const { data: recon, error } = await supabase
    .from('ghl_reconciliations')
    .select('id, month, year, status, teamwork_document, summary_document_id')
    .eq('id', id)
    .single()

  if (error || !recon) {
    return NextResponse.json({ error: 'Reconciliation not found' }, { status: 404 })
  }

  // Stores the pointer and moves the month to `audited` when it resolves.
  const summaryDocumentId = await ensureSummaryDocument(supabase, recon)

  return NextResponse.json({
    summary_document_id: summaryDocumentId,
    status: summaryDocumentId ? 'audited' : recon.status,
  })
}
