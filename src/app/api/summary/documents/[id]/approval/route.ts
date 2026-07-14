import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ApprovalStatus } from '@/types'

// Approve / disapprove a summary document.
// This ONLY records the decision — it does not push to Teamwork. Publishing to
// Teamwork is a separate, explicit step (see the resubmit route), so an approved
// summary stays "approved but not published" until the user submits it.
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

  const now = new Date().toISOString()
  const { data: updated, error } = await supabase
    .from('summary_documents')
    .update({
      approval_status:     decision,
      approval_decided_at: now,
      updated_at:          now,
    })
    .eq('id', id)
    .select('id, approval_status, approval_decided_at, teamwork_inserted_at, teamwork_ref')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, ...updated })
}
