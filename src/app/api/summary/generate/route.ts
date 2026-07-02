import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { MONTH_NAMES } from '@/types'
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
  year: number
): Promise<string> {
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

  const externalUrl = process.env.SUMMARY_API_URL
  if (externalUrl) {
    const res = await fetch(externalUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id:   company.id,
        company_name: company.name,
        company_status: company.status,
        total_calls:  results.length,
        top_tags:     Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 10),
        notes:        notes.slice(0, 5),
        month:        monthName,
        year,
      }),
    })
    if (!res.ok) throw new Error(`External API returned ${res.status}`)
    return extractSummaryHtml(await res.text())
  }

  // ── Claude fallback ────────────────────────────────────────────────────────
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

        const htmlContent = await generateHtmlForCompany(company, results, monthName, year)

        // Upsert: if a summary already exists for this company+month+year, update it
        const { data: doc, error } = await supabase
          .from('summary_documents')
          .upsert(
            {
              company_id:   company.id,
              company_name: company.name,
              title,
              html_content: htmlContent,
              month:        monthName,
              year,
              status: 'draft',
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'company_id,month,year' }
          )
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
