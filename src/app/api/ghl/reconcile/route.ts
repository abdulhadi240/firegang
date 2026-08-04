import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticated } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { parseCsv } from '@/lib/csv'
import { extractSpreadsheetId, fetchSheetRows } from '@/lib/google-sheets'
import { reconcile, filterRowsToMonth } from '@/lib/ghl-match'
import { GHL_COLUMNS, MONTH_NAMES, OUR_RECORDING_COLUMN } from '@/types'

// Take an uploaded GHL export, join it against our own sheet, and persist the
// merged result as a reviewable draft.
//
// Re-running a month replaces that month's draft outright — the admin's edits
// only become meaningful once they've verified, and re-uploading is how you
// start over.
export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await req.json()) as {
      csv?: string
      month?: string
      year?: number
      tab?: string
    }

    const { csv, tab } = body
    if (!csv?.trim())  return NextResponse.json({ error: 'No CSV content received' }, { status: 400 })
    if (!tab)          return NextResponse.json({ error: 'No source sheet tab selected' }, { status: 400 })

    const month = body.month && MONTH_NAMES.includes(body.month) ? body.month : null
    const year  = typeof body.year === 'number' ? body.year : null
    if (!month || !year) {
      return NextResponse.json({ error: 'A valid month and year are required' }, { status: 400 })
    }

    // ── Parse the uploaded GHL export ────────────────────────────────────────
    const parsed = parseCsv(csv)
    if (parsed.rows.length === 0) {
      return NextResponse.json({ error: 'The uploaded CSV has no data rows' }, { status: 400 })
    }

    // The join keys must be present or the merge is meaningless — fail loudly
    // rather than silently reporting every row as unmatched.
    const required = ['Date & time', 'Duration']
    const missing = required.filter((c) => !parsed.headers.includes(c))
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error:
            `The GHL CSV is missing required column(s): ${missing.join(', ')}. ` +
            `Found: ${parsed.headers.join(', ')}`,
        },
        { status: 400 }
      )
    }

    // The admin picks the month explicitly after uploading, and only that
    // month's calls are reconciled — on both sides. A GHL export spanning two
    // months would otherwise drag the neighbouring month's calls in as
    // "missing from our sheet".
    const ghlScoped = filterRowsToMonth(parsed.rows, month, year, MONTH_NAMES)
    if (ghlScoped.rows.length === 0) {
      return NextResponse.json(
        {
          error:
            `The uploaded CSV has no calls dated ${month} ${year} ` +
            `(${parsed.rows.length} rows scanned). Pick a different month.`,
        },
        { status: 400 }
      )
    }

    // ── Read our sheet ───────────────────────────────────────────────────────
    const sheetRef = process.env.GHL_SOURCE_SHEET_ID
    if (!sheetRef) {
      return NextResponse.json(
        { error: 'Source sheet not configured — set GHL_SOURCE_SHEET_ID' },
        { status: 500 }
      )
    }
    const ourSheet = await fetchSheetRows(extractSpreadsheetId(sheetRef), tab)
    if (ourSheet.rows.length === 0) {
      return NextResponse.json(
        { error: `Our sheet tab "${tab}" is empty` },
        { status: 400 }
      )
    }

    if (!ourSheet.headers.includes(OUR_RECORDING_COLUMN)) {
      return NextResponse.json(
        {
          error:
            `Our sheet tab "${tab}" has no "${OUR_RECORDING_COLUMN}" column, so there are ` +
            `no recording URLs to merge. Found: ${ourSheet.headers.join(', ')}`,
        },
        { status: 400 }
      )
    }

    // Our log is one continuous tab spanning many months — restrict it to the
    // month being reconciled, or every other month's calls would surface as
    // "missing from GHL".
    const scoped = filterRowsToMonth(ourSheet.rows, month, year, MONTH_NAMES)
    if (scoped.rows.length === 0) {
      return NextResponse.json(
        {
          error:
            `Our sheet tab "${tab}" has no calls dated ${month} ${year} ` +
            `(${ourSheet.rows.length} rows scanned). Check the month or the tab.`,
        },
        { status: 400 }
      )
    }

    const { rows: mergedRows, summary } = reconcile(ghlScoped.rows, scoped.rows)

    // ── Persist ──────────────────────────────────────────────────────────────
    const supabase = await createClient()

    const now = new Date().toISOString()

    // Upsert on the (month, year) unique index so a re-upload reuses the same
    // reconciliation id.
    const { data: recon, error: reconErr } = await supabase
      .from('ghl_reconciliations')
      .upsert(
        {
          month,
          year,
          status:       'draft',
          summary,
          source_tab:   tab,
          submitted_at: null,
          webhook_ref:  null,
          updated_at:   now,
        },
        { onConflict: 'month,year' }
      )
      .select('id')
      .single()
    if (reconErr) throw reconErr

    // Replace the previous draft's rows wholesale.
    const { error: clearErr } = await supabase
      .from('ghl_reconciliation_rows')
      .delete()
      .eq('reconciliation_id', recon.id)
    if (clearErr) throw clearErr

    const payload = mergedRows.map((r, i) => ({
      reconciliation_id: recon.id,
      source:            r.source,
      data:              r.data,
      excluded:          false,
      position:          i,
      updated_at:        now,
    }))

    // Chunked so a busy month doesn't hit the request size ceiling.
    const CHUNK = 500
    for (let i = 0; i < payload.length; i += CHUNK) {
      const { error } = await supabase
        .from('ghl_reconciliation_rows')
        .insert(payload.slice(i, i + CHUNK))
      if (error) throw error
    }

    return NextResponse.json({
      reconciliation_id: recon.id,
      summary,
      month,
      year,
      // How much of each side was set aside, so a wrong tab/month is obvious.
      ghl_rows_scanned:       parsed.rows.length,
      ghl_rows_in_month:      ghlScoped.rows.length,
      ghl_rows_other_month:   ghlScoped.skipped,
      ghl_rows_bad_date:      ghlScoped.unparseable,
      sheet_rows_scanned:     ourSheet.rows.length,
      sheet_rows_in_month:    scoped.rows.length,
      sheet_rows_other_month: scoped.skipped,
      sheet_rows_bad_date:    scoped.unparseable,
      ghl_headers: parsed.headers,
      // Surface columns the GHL export carried that we don't map, so an export
      // format change is visible instead of silently dropped.
      unmapped_columns: parsed.headers.filter(
        (h) => !(GHL_COLUMNS as readonly string[]).includes(h)
      ),
    })
  } catch (err: unknown) {
    console.error('[ghl/reconcile]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Reconciliation failed' },
      { status: 500 }
    )
  }
}
