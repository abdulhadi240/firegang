import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticated } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

// Load a reconciliation together with its full row grid.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const supabase = await createClient()

  const [{ data: reconciliation, error: reconErr }, { data: rows, error: rowsErr }] =
    await Promise.all([
      supabase.from('ghl_reconciliations').select('*').eq('id', id).single(),
      supabase
        .from('ghl_reconciliation_rows')
        .select('id, reconciliation_id, source, data, excluded, position')
        .eq('reconciliation_id', id)
        .order('position', { ascending: true }),
    ])

  if (reconErr) return NextResponse.json({ error: reconErr.message }, { status: 404 })
  if (rowsErr)  return NextResponse.json({ error: rowsErr.message },  { status: 500 })

  return NextResponse.json({ reconciliation, rows: rows ?? [] })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const supabase = await createClient()

  // Rows cascade via the FK (see supabase-ghl-migration.sql).
  const { error } = await supabase.from('ghl_reconciliations').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
