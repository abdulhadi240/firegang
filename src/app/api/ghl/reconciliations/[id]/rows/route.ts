import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticated } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { MERGED_COLUMNS, RowSource } from '@/types'

// Edits to the review grid: add a missing call by hand, correct a cell, or drop
// a row. Any edit knocks the reconciliation back to `draft` so a previously
// verified sheet can't be changed without re-verifying.
//
// Rows are never mutated after submission — see the guard in each handler.

async function assertEditable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reconciliationId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('ghl_reconciliations')
    .select('status')
    .eq('id', reconciliationId)
    .single()

  if (error || !data) return 'Reconciliation not found'
  if (data.status === 'submitted') return 'This reconciliation has already been submitted and can no longer be edited'
  return null
}

async function markDraft(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reconciliationId: string
) {
  await supabase
    .from('ghl_reconciliations')
    .update({ status: 'draft', updated_at: new Date().toISOString() })
    .eq('id', reconciliationId)
}

/** Keep only known columns, so a stray key can't be written into the grid. */
function sanitize(data: Record<string, unknown>): Record<string, string> {
  const clean: Record<string, string> = {}
  for (const col of MERGED_COLUMNS) {
    const v = data[col]
    clean[col] = v === null || v === undefined ? '' : String(v)
  }
  return clean
}

// ── Add a row by hand ────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const supabase = await createClient()

  const blocked = await assertEditable(supabase, id)
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 })

  const body = (await req.json()) as { data?: Record<string, unknown>; source?: RowSource }

  // Append to the end of the grid.
  const { data: last } = await supabase
    .from('ghl_reconciliation_rows')
    .select('position')
    .eq('reconciliation_id', id)
    .order('position', { ascending: false })
    .limit(1)

  const { data: row, error } = await supabase
    .from('ghl_reconciliation_rows')
    .insert({
      reconciliation_id: id,
      source:            body.source ?? 'manual',
      data:              sanitize(body.data ?? {}),
      excluded:          false,
      position:          (last?.[0]?.position ?? -1) + 1,
    })
    .select('id, reconciliation_id, source, data, excluded, position')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await markDraft(supabase, id)
  return NextResponse.json({ row })
}

// ── Edit a cell / toggle inclusion ───────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const supabase = await createClient()

  const blocked = await assertEditable(supabase, id)
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 })

  const body = (await req.json()) as {
    rowId?: string
    data?: Record<string, unknown>
    excluded?: boolean
  }
  if (!body.rowId) {
    return NextResponse.json({ error: 'rowId is required' }, { status: 400 })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.data !== undefined)     update.data = sanitize(body.data)
  if (body.excluded !== undefined) update.excluded = body.excluded

  const { data: row, error } = await supabase
    .from('ghl_reconciliation_rows')
    .update(update)
    .eq('id', body.rowId)
    .eq('reconciliation_id', id)
    .select('id, reconciliation_id, source, data, excluded, position')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await markDraft(supabase, id)
  return NextResponse.json({ row })
}

// ── Remove a row ─────────────────────────────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const rowId = req.nextUrl.searchParams.get('rowId')
  if (!rowId) return NextResponse.json({ error: 'rowId is required' }, { status: 400 })

  const supabase = await createClient()

  const blocked = await assertEditable(supabase, id)
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 })

  const { error } = await supabase
    .from('ghl_reconciliation_rows')
    .delete()
    .eq('id', rowId)
    .eq('reconciliation_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await markDraft(supabase, id)
  return NextResponse.json({ success: true })
}
