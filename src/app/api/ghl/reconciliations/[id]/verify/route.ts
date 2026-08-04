import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticated, ADMIN_USER_ID } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { MERGED_COLUMNS, monthDateRange, GhlReconciliationRow } from '@/types'

// The admin has reviewed the merged sheet and confirmed the figures — ship it to
// n8n, which runs the audit and produces the output sheet.
//
// Excluded rows are dropped here rather than deleted in the UI, so the record of
// what was reviewed stays intact.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const webhookUrl = process.env.N8N_WEBHOOK_GHL_VERIFIED
  if (!webhookUrl) {
    return NextResponse.json(
      { error: 'Verification webhook not configured — set N8N_WEBHOOK_GHL_VERIFIED' },
      { status: 500 }
    )
  }

  const supabase = await createClient()

  const [{ data: recon, error: reconErr }, { data: allRows, error: rowsErr }] =
    await Promise.all([
      supabase.from('ghl_reconciliations').select('*').eq('id', id).single(),
      supabase
        .from('ghl_reconciliation_rows')
        .select('id, reconciliation_id, source, data, excluded, position')
        .eq('reconciliation_id', id)
        .order('position', { ascending: true }),
    ])

  if (reconErr || !recon) return NextResponse.json({ error: 'Reconciliation not found' }, { status: 404 })
  if (rowsErr)            return NextResponse.json({ error: rowsErr.message }, { status: 500 })

  if (recon.status === 'submitted') {
    return NextResponse.json({ error: 'This reconciliation has already been submitted' }, { status: 409 })
  }

  const included = (allRows ?? []).filter((r: GhlReconciliationRow) => !r.excluded)
  if (included.length === 0) {
    return NextResponse.json({ error: 'There are no rows to submit' }, { status: 400 })
  }

  const { start_date, end_date } = monthDateRange(recon.month, recon.year)

  const payload = {
    reconciliation_id: recon.id,
    // Presentational only — this flow isn't tied to the companies table.
    practice:          process.env.GHL_PRACTICE_NAME ?? 'Gillespie Dentistry',
    month:             recon.month,
    year:              recon.year,
    start_date,
    end_date,
    verified_by:       ADMIN_USER_ID,
    verified_at:       new Date().toISOString(),
    columns:           MERGED_COLUMNS,
    total_rows:        included.length,
    rows: included.map((r: GhlReconciliationRow) => ({
      source: r.source,
      ...r.data,
    })),
  }

  let webhookRef: string | null = null
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(`n8n responded with status ${res.status}`)

    // n8n may echo back an identifier for the run; keep it if so.
    const text = await res.text()
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>
      const ref = parsed.execution_id ?? parsed.id ?? parsed.ref
      if (ref) webhookRef = String(ref)
    } catch {
      // Non-JSON response is fine — the POST succeeded, which is what matters.
    }
  } catch (err: unknown) {
    console.error('[ghl/verify]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to reach the n8n webhook' },
      { status: 502 }
    )
  }

  const now = new Date().toISOString()
  const { data: updated, error: updateErr } = await supabase
    .from('ghl_reconciliations')
    .update({
      status:       'submitted',
      submitted_at: now,
      webhook_ref:  webhookRef,
      updated_at:   now,
    })
    .eq('id', id)
    .select('id, status, submitted_at, webhook_ref')
    .single()

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ success: true, submitted_rows: included.length, ...updated })
}
