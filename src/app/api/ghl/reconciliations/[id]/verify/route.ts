import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticated, ADMIN_USER_ID } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import {
  MERGED_COLUMNS, monthDateRange, GhlReconciliationRow, isEligible, isMissedCall,
} from '@/types'

// The admin has reviewed the merged sheet and confirmed the figures — ship it to
// n8n, which runs the audit and produces the output sheet.
//
// Only eligible calls go: one with a recording to listen to, or a missed call,
// where the absence of a recording is itself the finding. Anything else has
// nothing for the auditor to work from and is held back.
//
// Excluded rows are dropped here rather than deleted in the UI, so the record of
// what was reviewed stays intact.
/**
 * Pull the first of `keys` that carries a value out of the webhook's reply.
 *
 * n8n answers with either a bare object or a single-item array, and routinely
 * nests the useful part under `data` / `json` / `body`, so look through all of
 * those rather than assuming one shape.
 */
function pickString(payload: unknown, keys: string[]): string | null {
  const roots = Array.isArray(payload) ? payload.slice(0, 1) : [payload]
  for (const root of roots) {
    if (!root || typeof root !== 'object') continue
    const obj = root as Record<string, unknown>

    for (const key of keys) {
      const v = obj[key]
      if (typeof v === 'string' && v.trim()) return v.trim()
      if (typeof v === 'number') return String(v)
    }
    for (const nested of ['data', 'json', 'body', 'result']) {
      const found = pickString(obj[nested], keys)
      if (found) return found
    }
  }
  return null
}

const SHEET_URL_KEYS = ['google_sheet_url', 'googleSheetUrl', 'sheet_url', 'sheetUrl']
const REF_KEYS       = ['execution_id', 'executionId', 'id', 'ref']

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

  const active = (allRows ?? []).filter((r: GhlReconciliationRow) => !r.excluded)
  if (active.length === 0) {
    return NextResponse.json({ error: 'There are no rows to submit' }, { status: 400 })
  }

  const included = active.filter(isEligible)
  const skippedIneligible = active.length - included.length
  if (included.length === 0) {
    return NextResponse.json(
      {
        error:
          'None of these calls are eligible for auditing. Add a recording URL, ' +
          'or mark the calls that were never picked up as missed calls.',
      },
      { status: 400 }
    )
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
    // Held back for want of a recording URL — reported so the count is
    // reconcilable against what the admin saw on screen.
    skipped_ineligible: skippedIneligible,
    rows: included.map((r: GhlReconciliationRow) => ({
      source: r.source,
      // No recording to audit — the auditor scores these as a missed call.
      missed_call: isMissedCall(r),
      ...r.data,
    })),
  }

  let webhookRef: string | null = null
  let googleSheetUrl: string | null = null
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(`n8n responded with status ${res.status}`)

    // n8n echoes back an identifier for the run and the audit sheet it built.
    const text = await res.text()
    try {
      const parsed = JSON.parse(text) as unknown
      webhookRef     = pickString(parsed, REF_KEYS)
      googleSheetUrl = pickString(parsed, SHEET_URL_KEYS)
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

  // Stored separately: n8n has already run by this point, so failing to save the
  // sheet link (e.g. before supabase-ghl-sheet-url-migration.sql has been run)
  // must not cost us the submitted state.
  if (googleSheetUrl) {
    const { error } = await supabase
      .from('ghl_reconciliations')
      .update({ google_sheet_url: googleSheetUrl })
      .eq('id', id)
    if (error) console.error('[ghl/verify] could not store google_sheet_url:', error.message)
  }

  return NextResponse.json({
    success: true,
    submitted_rows: included.length,
    skipped_ineligible: skippedIneligible,
    google_sheet_url: googleSheetUrl,
    ...updated,
  })
}
