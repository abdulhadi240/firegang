import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ApprovalStatus } from '@/types'
import { pushSummaryToTeamwork } from '@/lib/teamwork'

// Approve / disapprove a summary document.
// On "approved" we record the decision AND attempt to push the summary to the
// Teamwork webhook. If that push fails the document stays "approved" but
// unpublished (teamwork_inserted_at null) so it can be resubmitted later.
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

  const now = new Date().toISOString()
  const update: Record<string, unknown> = {
    approval_status:     decision,
    approval_decided_at: now,
    updated_at:          now,
  }

  // On approval, attempt to push the summary to Teamwork. A failure here does
  // NOT roll back the approval — the doc remains approved-but-unpublished and
  // can be resubmitted from the UI.
  let teamworkFailed = false
  if (decision === 'approved') {
    const result = await pushSummaryToTeamwork(doc)
    if (result.ok) {
      update.teamwork_inserted_at = now
      update.teamwork_ref         = result.ref
    } else {
      teamworkFailed = true
    }
  }

  const { data: updated, error } = await supabase
    .from('summary_documents')
    .update(update)
    .eq('id', id)
    .select('id, approval_status, approval_decided_at, teamwork_inserted_at, teamwork_ref')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, teamwork_failed: teamworkFailed, ...updated })
}
