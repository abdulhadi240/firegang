import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  const { companyIds } = await req.json() as { companyIds: string[] }

  if (!companyIds || companyIds.length === 0) {
    return NextResponse.json({ error: 'No companies selected' }, { status: 400 })
  }

  const supabase = await createClient()

  const [{ data: companies }, { data: results }] = await Promise.all([
    supabase.from('companies').select('id, name, status').in('id', companyIds),
    supabase
      .from('audit_results')
      .select('company_id, call_tags, notes, created_at')
      .in('company_id', companyIds)
      .order('created_at', { ascending: false }),
  ])

  if (!companies || companies.length === 0) {
    return NextResponse.json({ error: 'No companies found' }, { status: 404 })
  }

  // Build per-company stat blocks for the prompt
  const companyBlocks = companies.map((company) => {
    const companyResults = (results ?? []).filter((r) => r.company_id === company.id)
    const tagCount: Record<string, number> = {}
    const noteList: string[] = []

    for (const r of companyResults) {
      for (const tag of r.call_tags ?? []) {
        tagCount[tag] = (tagCount[tag] ?? 0) + 1
      }
      if (r.notes) noteList.push(r.notes)
    }

    const topTags = Object.entries(tagCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => `  • ${tag} (${count}x)`)
      .join('\n')

    const notes = noteList
      .slice(0, 5)
      .map((n) => `  - "${n}"`)
      .join('\n')

    return `### ${company.name} [${company.status}]
Total audited calls: ${companyResults.length}
Top issue tags:
${topTags || '  (no tags recorded)'}
Auditor notes (recent):
${notes || '  (none)'}`
  }).join('\n\n')

  const isMultiple = companies.length > 1

  const prompt = `You are a call quality analyst for Firegang Dental Marketing, a dental practice marketing agency. You have been given call audit data showing the most common issues flagged in patient/lead calls for ${isMultiple ? 'several dental practices' : 'a dental practice'}.

${companyBlocks}

Write a professional audit summary report. Structure it exactly like this:

## Overview
2-3 sentences summarising the overall state of the audited calls.

## Key Issues Found
Bullet points listing the most frequent problems across all audited calls, in order of severity/frequency.

${isMultiple ? `## Per-Company Highlights
Brief (1-2 sentence) note on each company's specific situation.

` : ''}## Recommendations
3-4 specific, actionable improvements the team should implement based on the data.

Keep it concise and use plain language. Do not include preamble or closing remarks.`

  // Stream the response back to the client
  const stream = await client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
    messages: [{ role: 'user', content: prompt }],
  })

  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (
          chunk.type === 'content_block_delta' &&
          chunk.delta.type === 'text_delta'
        ) {
          controller.enqueue(new TextEncoder().encode(chunk.delta.text))
        }
      }
      controller.close()
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  })
}
