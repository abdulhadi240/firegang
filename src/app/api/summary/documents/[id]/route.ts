import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('summary_documents')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ document: data })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json() as {
    html_content?: string
    title?: string
    status?: 'draft' | 'saved'
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('summary_documents')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, title, status, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ document: data })
}

// Insert into Teamwork
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

  const teamworkUrl = process.env.TEAMWORK_API_URL
  let teamworkRef: string | null = null

  if (teamworkUrl) {
    try {
      const res = await fetch(teamworkUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:        doc.title,
          html_content: doc.html_content,
          company_id:   doc.company_id,
          company_name: doc.company_name,
          month:        doc.month,
          year:         doc.year,
        }),
      })
      if (!res.ok) throw new Error(`Teamwork API returned ${res.status}`)
      const result = await res.json()
      teamworkRef = result.id ?? result.ref ?? null
    } catch (err) {
      console.error('[teamwork insert]', err)
      return NextResponse.json({ error: 'Teamwork API call failed' }, { status: 502 })
    }
  }

  const { data: updated, error } = await supabase
    .from('summary_documents')
    .update({
      teamwork_inserted_at: new Date().toISOString(),
      teamwork_ref:         teamworkRef,
      updated_at:           new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, teamwork_inserted_at, teamwork_ref')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, ...updated })
}
