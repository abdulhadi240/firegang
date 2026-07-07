import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { pushSummaryToTeamwork } from '@/lib/teamwork'

// Retry pushing an approved summary to Teamwork.
// Used when the original approval-time push failed (e.g. Teamwork was down):
// the doc is "approved" but not yet published, and the user can resubmit it.
// Already-published docs are rejected so we never double-post to Teamwork.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: doc } = await supabase
    .from('summary_documents')
    .select('*')
    .eq('id', id)
    .single()

  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (doc.approval_status !== 'approved') {
    return NextResponse.json(
      { error: 'Only approved summaries can be resubmitted' },
      { status: 400 }
    )
  }

  if (doc.teamwork_inserted_at) {
    return NextResponse.json(
      { error: 'Summary is already published to Teamwork' },
      { status: 409 }
    )
  }

  const result = await pushSummaryToTeamwork(doc)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  const now = new Date().toISOString()
  const { data: updated, error } = await supabase
    .from('summary_documents')
    .update({
      teamwork_inserted_at: now,
      teamwork_ref:         result.ref,
      updated_at:           now,
    })
    .eq('id', id)
    .select('id, approval_status, teamwork_inserted_at, teamwork_ref')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, ...updated })
}
