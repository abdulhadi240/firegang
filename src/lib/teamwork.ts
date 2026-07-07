import { extractSummaryHtml } from '@/lib/summary-content'

// Minimal shape of a summary_documents row needed to push to Teamwork.
export interface TeamworkPushDoc {
  id: string
  title: string
  html_content: string
  company_id: string
  company_name: string
  month: string
  year: number
}

export type TeamworkPushResult =
  | { ok: true; ref: string | null }
  | { ok: false; error: string }

// Push a summary to the Teamwork webhook. Returns a result object instead of
// throwing so callers can decide how to surface a failure (e.g. keep the doc
// "approved" but unpublished so it can be resubmitted).
export async function pushSummaryToTeamwork(
  doc: TeamworkPushDoc
): Promise<TeamworkPushResult> {
  const webhookUrl = process.env.APPROVE_WEBHOOK_URL
  // No webhook configured → treat as a no-op success so local/dev flows still work.
  if (!webhookUrl) return { ok: true, ref: null }

  const cleanHtml = extractSummaryHtml(doc.html_content)

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id:           doc.id,
        title:        doc.title,
        summary:      cleanHtml,   // the full summary content (unwrapped)
        html_content: cleanHtml,
        company_id:   doc.company_id,
        company_name: doc.company_name,
        month:        doc.month,
        year:         doc.year,
      }),
    })
    if (!res.ok) throw new Error(`Teamwork webhook returned ${res.status}`)

    // Capture a reference id from the webhook response if it returns one.
    let ref: string | null = null
    try {
      const result = await res.json()
      ref = result?.id ?? result?.ref ?? null
    } catch {
      ref = null
    }
    return { ok: true, ref }
  } catch (err) {
    console.error('[teamwork push]', err)
    return { ok: false, error: 'Teamwork webhook failed' }
  }
}
