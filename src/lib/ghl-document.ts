import type { createClient } from '@/lib/supabase/server'
import { extractSummaryHtml } from '@/lib/summary-content'

// Once a month's audit sheet is approved, n8n writes the finished report back
// into `ghl_reconciliations.teamwork_document`. The admin reviews and publishes
// it through the normal summary flow, so the HTML is promoted into a
// `summary_documents` row and everything downstream — the editor, approval,
// Teamwork publishing — works unchanged.

type Supabase = Awaited<ReturnType<typeof createClient>>

export interface ReconciliationDocumentSource {
  id: string
  month: string
  year: number
  status?: string
  teamwork_document?: string | null
  summary_document_id?: string | null
}

export function ghlPracticeName(): string {
  return process.env.GHL_PRACTICE_NAME ?? 'Gillespie Dentistry'
}

/**
 * This practice isn't in the companies table, so it has no real id. A stable
 * synthetic one keeps the (company_id, month, year) uniqueness working, which
 * is what stops a re-run creating a second document for the same month.
 */
export function ghlCompanyId(): string {
  return `ghl:${ghlPracticeName()}`
}

/**
 * Find the summary document for a reconciliation's month, creating it from
 * `teamwork_document` when n8n has written the report but nothing has promoted
 * it yet. Returns null while there's still nothing to show.
 *
 * Resolving one also settles the reconciliation: its pointer is stored and the
 * month moves to `audited`, its terminal state.
 */
export async function ensureSummaryDocument(
  supabase: Supabase,
  recon: ReconciliationDocumentSource
): Promise<string | null> {
  const documentId = await findOrCreateDocument(supabase, recon)
  if (!documentId) return null

  const patch: Record<string, unknown> = {}
  if (recon.summary_document_id !== documentId) patch.summary_document_id = documentId
  // The audit is done once there's a report to read.
  if (recon.status !== 'audited') patch.status = 'audited'

  if (Object.keys(patch).length > 0) {
    patch.updated_at = new Date().toISOString()
    const { error } = await supabase
      .from('ghl_reconciliations')
      .update(patch)
      .eq('id', recon.id)
    if (error) console.error('[ghl/document] could not settle the reconciliation:', error.message)
  }

  return documentId
}

async function findOrCreateDocument(
  supabase: Supabase,
  recon: ReconciliationDocumentSource
): Promise<string | null> {
  const practice = ghlPracticeName()

  const { data: found } = await supabase
    .from('summary_documents')
    .select('id, html_content')
    .eq('company_id', ghlCompanyId())
    .eq('month', recon.month)
    .eq('year', recon.year)
    .order('created_at', { ascending: false })
    .limit(1)

  const html = extractSummaryHtml(recon.teamwork_document).trim()
  const existing = found?.[0]

  if (existing) {
    // Backfill a row that was created before n8n returned the report.
    if (!existing.html_content?.trim() && html) {
      await supabase
        .from('summary_documents')
        .update({ html_content: html, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
    }
    return existing.id
  }

  if (!html) return null

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('summary_documents')
    .insert({
      company_id:   ghlCompanyId(),
      company_name: practice,
      title:        `${practice} — ${recon.month} ${recon.year}`,
      html_content: html,
      month:        recon.month,
      year:         recon.year,
      status:       'draft',
      updated_at:   now,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[ghl/document] could not create the summary document:', error.message)
    return null
  }
  return data.id
}
