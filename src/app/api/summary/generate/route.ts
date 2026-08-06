import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { MONTH_NAMES, monthDateRange } from '@/types'
import { extractSummaryHtml } from '@/lib/summary-content'

const anthropic = new Anthropic()

interface AuditRow {
  company_id: string
  call_tags: string[]
  notes: string | null
}

async function generateHtmlForCompany(
  company: { id: string; name: string; status: string },
  results: AuditRow[],
  monthName: string,
  year: number,
  startDate: string,
  endDate: string,
  documentId: string
): Promise<string | null> {
  // The external API pulls the calls itself — it only needs to know which
  // company and which window, plus the row to write the result back to.
  const externalUrl = process.env.SUMMARY_API_URL
  if (externalUrl) {
    const res = await fetch(externalUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // summary_documents.id — the row reserved for this month's report.
        summary_document_id: documentId,
        company_id:   company.id,
        company_name: company.name,
        month:        monthName,
        // Inclusive ISO-8601 range covering the selected month, e.g.
        // start_date "2026-07-01" / end_date "2026-07-31".
        start_date:   startDate,
        end_date:     endDate,
      }),
    })
    if (!res.ok) throw new Error(`External API returned ${res.status}`)

    // The workflow writes the finished report into the reserved row itself and
    // publishes it to Teamwork. If it also echoes the HTML back, take it;
    // otherwise return null so we leave `html_content` alone rather than
    // racing that write with an empty value.
    return extractSummaryHtml(await res.text()) || null
  }

  // ── Claude fallback ────────────────────────────────────────────────────────
  // Only this path needs the local audit rows summarised.
  const tagCount: Record<string, number> = {}
  const notes: string[] = []
  for (const r of results) {
    for (const tag of r.call_tags ?? []) tagCount[tag] = (tagCount[tag] ?? 0) + 1
    if (r.notes) notes.push(r.notes)
  }

  const topTags = Object.entries(tagCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([t, n]) => `<li>${t} — ${n}×</li>`)
    .join('')

  const notesList = notes
    .slice(0, 5)
    .map((n) => `<li>"${n}"</li>`)
    .join('')

  const prompt = `You are a professional call quality analyst for Firegang Dental Marketing.
Write a ${monthName} ${year} monthly call audit report for the dental practice: ${company.name} [status: ${company.status}].

Audit data:
- Total audited calls: ${results.length}
- Top issue tags:
  ${topTags || '<li>No tags recorded</li>'}
${notesList ? `- Auditor notes:\n  ${notesList}` : ''}

Return ONLY a valid HTML fragment (no <!DOCTYPE>, <html>, <head>, or <body> tags).
Use exactly this structure:

<h1>${monthName} ${year} — ${company.name}</h1>

<section>
  <h2>Executive Overview</h2>
  <p>[2-3 sentences on overall call quality this month.]</p>
</section>

<section>
  <h2>Key Issues Identified</h2>
  <ul>
    <li>[Most frequent issue and its business impact]</li>
  </ul>
</section>

<section>
  <h2>Recommendations</h2>
  <ol>
    <li>[Actionable recommendation 1]</li>
    <li>[Actionable recommendation 2]</li>
    <li>[Actionable recommendation 3]</li>
  </ol>
</section>

<section>
  <h2>Next Steps</h2>
  <ul>
    <li>[Immediate action]</li>
    <li>[Follow-up]</li>
  </ul>
</section>

Write professional, dense business language. Return raw HTML only — no markdown, no code fences.`

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
  return raw.replace(/^```html?\n?/, '').replace(/\n?```$/, '').trim()
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      companyIds: string[]
      month?: number | string   // month name ("June") or 1-12
      year?: number
      start_date?: string        // ISO-8601 (YYYY-MM-DD), inclusive
      end_date?: string          // ISO-8601 (YYYY-MM-DD), inclusive
    }

    const { companyIds } = body
    const now = new Date()

    // Normalise month to a name (matches how it's stored in the DB).
    // Defaults to the *previous* month.
    let monthName: string
    if (typeof body.month === 'string') {
      monthName = body.month
    } else if (typeof body.month === 'number') {
      monthName = MONTH_NAMES[body.month - 1]
    } else {
      monthName = now.getMonth() === 0 ? 'December' : MONTH_NAMES[now.getMonth() - 1]
    }

    const year = body.year
      ?? (now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear())

    // Inclusive ISO-8601 date range for the selected month. Trust the client's
    // values when provided, otherwise derive them from month/year so the
    // downstream call-audit API always receives a range.
    const { start_date, end_date } =
      body.start_date && body.end_date
        ? { start_date: body.start_date, end_date: body.end_date }
        : monthDateRange(monthName, year)

    if (!companyIds || companyIds.length === 0) {
      return NextResponse.json({ error: 'No companies selected' }, { status: 400 })
    }

    const supabase = await createClient()

    const [{ data: companies }, { data: allResults }] = await Promise.all([
      supabase.from('companies').select('id, name, status').in('id', companyIds),
      supabase
        .from('audit_results')
        .select('company_id, call_tags, notes')
        .in('company_id', companyIds),
    ])

    if (!companies || companies.length === 0) {
      return NextResponse.json({ error: 'Companies not found' }, { status: 404 })
    }

    // Generate one document per company (in parallel)
    const generated = await Promise.all(
      companies.map(async (company) => {
        const results = (allResults ?? []).filter((r) => r.company_id === company.id)
        const title = `${company.name} — ${monthName} ${year}`
        const now = new Date().toISOString()

        // Reserve the row *before* generating, so its id can travel with the
        // request — the downstream workflow writes the finished report back
        // against it. One summary per company + month + year: reuse the
        // existing row when there is one, tolerating pre-existing duplicates
        // by taking the most recent.
        const { data: matches } = await supabase
          .from('summary_documents')
          .select('id')
          .eq('company_id', company.id)
          .eq('month', monthName)
          .eq('year', year)
          .order('updated_at', { ascending: false })
          .limit(1)

        let documentId = matches?.[0]?.id as string | undefined
        const reserved = !documentId
        if (!documentId) {
          const { data, error } = await supabase
            .from('summary_documents')
            .insert({
              company_id:   company.id,
              company_name: company.name,
              title,
              html_content: '',
              month:        monthName,
              year,
              status: 'draft',
              updated_at: now,
            })
            .select('id')
            .single()
          if (error) throw error
          documentId = data.id
        }

        let htmlContent: string | null
        try {
          htmlContent = await generateHtmlForCompany(
            company, results, monthName, year, start_date, end_date, documentId!
          )
        } catch (err) {
          // Don't leave an empty placeholder behind for a report that never
          // generated — but never delete a row that already had content.
          if (reserved) {
            await supabase.from('summary_documents').delete().eq('id', documentId!)
          }
          throw err
        }

        const update: Record<string, unknown> = {
          company_name: company.name,
          title,
          status: 'draft',
          updated_at: new Date().toISOString(),
        }
        // Only write the body when we produced it ourselves. When the external
        // workflow owns the row, it has already stored `html_content` — writing
        // it again here would race that.
        if (htmlContent !== null) update.html_content = htmlContent

        const { data: doc, error } = await supabase
          .from('summary_documents')
          .update(update)
          .eq('id', documentId!)
          .select('id, title')
          .single()
        if (error) throw error

        return { id: doc.id, title: doc.title, companyId: company.id, companyName: company.name }
      })
    )

    return NextResponse.json({ documents: generated })
  } catch (err: unknown) {
    console.error('[summary/generate]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Generation failed' },
      { status: 500 }
    )
  }
}
