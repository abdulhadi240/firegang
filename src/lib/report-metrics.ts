// Every monthly report in `summary_documents.html_content` is a short block of
// "Label: value" lines (see the Diana T Rose / August sample in the repo
// history). The markup around those lines varies — plain `<br>`-separated
// text, Google-Docs paste with nested spans, `<p>` per line — so we flatten the
// HTML to text lines first and then read each metric by its label.
//
// Older reports (June 2026) sometimes omit the "Call Not Audited by AI" and
// "Wrong tagged by AI" lines; those fields come back `null` rather than 0 so the
// comparison page can say "not reported" instead of inventing a number.

import { MONTH_NAMES } from '@/types'

export interface ReportMetrics {
  // ── AI audit accuracy ──────────────────────────────────────────────
  /** "Manually Audited Calls: 04 of 38" → 4 (calls a human had to correct or audit). */
  manually_audited: number | null
  /** "Call Not Audited by AI: 00" */
  not_audited_by_ai: number | null
  /** "Wrong tagged by AI: 04" */
  wrong_tagged_by_ai: number | null
  /** "AI was accurate on 34 of 38." → 34 */
  ai_accurate: number | null
  /** The "of 38" in the line above; falls back to Total Tagged Calls. */
  ai_total: number | null

  // ── Volume ─────────────────────────────────────────────────────────
  total_tagged_calls: number | null
  total_local_calls: number | null

  // ── New patients ───────────────────────────────────────────────────
  np_scheduled: number | null
  np_not_scheduled: number | null
  np_not_scheduled_insurance: number | null

  // ── Missed calls ───────────────────────────────────────────────────
  missed_total: number | null
  missed_office_hours: number | null
  missed_after_hours: number | null

  // ── Call sources ───────────────────────────────────────────────────
  src_facebook_ad: number | null
  src_organic: number | null
  src_ppc: number | null
  src_number_pool: number | null
  src_google_ad_extension: number | null
  src_ads_location_extension: number | null
  src_social_media_number: number | null

  // ── Quality / forms ────────────────────────────────────────────────
  wrong_number_calls: number | null
  form_submissions: number | null
  form_google: number | null
  form_facebook: number | null
  form_website: number | null

  /** Bullet reasons under "New Patient not Scheduled". */
  np_not_scheduled_reasons: string[]
  /** Sign-off name after "Cheers," if present. */
  auditor: string | null
}

/** One parsed report, with enough identity to group by practice and month. */
export interface ReportRecord {
  id: string
  company_id: string
  company_name: string
  month: string
  year: number
  /** Sortable YYYY-MM key, e.g. "2026-08". */
  period: string
  metrics: ReportMetrics
}

// ── HTML → text lines ─────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&#39;': "'", '&apos;': "'", '&#160;': ' ',
}

export function htmlToLines(html: string): string[] {
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n* ')
    .replace(/<[^>]+>/g, '')
    .replace(/&[#a-z0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? ' ')
    .replace(/ /g, ' ')
  return text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

// ── Label lookup ──────────────────────────────────────────────────────────────

function toNumber(raw: string | undefined): number | null {
  if (raw == null) return null
  const s = raw.trim()
  if (!s || /^n\/?a$/i.test(s)) return null
  const n = Number(s.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

/** First line whose label matches, returning the captured value text. */
function valueFor(lines: string[], label: RegExp): string | undefined {
  for (const line of lines) {
    const m = line.match(label)
    if (m) return m[1]
  }
  return undefined
}

const VALUE = String.raw`\s*:?\s*([0-9][0-9,]*|N/?A)\b`
function labelRe(label: string): RegExp {
  return new RegExp(`^${label}${VALUE}`, 'i')
}

export function parseReportMetrics(html: string | null | undefined): ReportMetrics {
  const lines = htmlToLines(html ?? '')
  const num = (label: string) => toNumber(valueFor(lines, labelRe(label)))

  // "Manually Audited Calls: 04 of 38" — the "of N" is optional in older reports.
  let manually_audited: number | null = null
  let manual_of: number | null = null
  for (const line of lines) {
    const m = line.match(/^Manually Audited Calls\s*:?\s*(\d+)(?:\s*(?:of|\/)\s*(\d+))?/i)
    if (m) { manually_audited = toNumber(m[1]); manual_of = toNumber(m[2]); break }
  }

  // "AI was accurate on 34 of 38." Tolerates the typos seen in real reports
  // ("accurate 95 of 99", "accurate onv61 of 62", "11 of XX") — an unfilled
  // "XX" total falls back to Total Tagged Calls below.
  let ai_accurate: number | null = null
  let ai_of: number | null = null
  for (const line of lines) {
    const m = line.match(/AI was accurate\s*(?:on)?\s*[a-z]?\s*(\d+)\s*(?:of|\/)\s*(\d+)?/i)
    if (m) { ai_accurate = toNumber(m[1]); ai_of = toNumber(m[2]); break }
  }

  const total_tagged_calls = num('Total Tagged Calls')
  const ai_total = ai_of ?? total_tagged_calls ?? manual_of

  // Reasons: bullet lines ("* …") that follow the "New Patient not Scheduled" heading.
  const reasons: string[] = []
  const headingIdx = lines.findIndex((l) => /^New Patients? not Scheduled\s*:?\s*$/i.test(l))
  if (headingIdx !== -1) {
    for (const line of lines.slice(headingIdx + 1)) {
      if (/^cheers/i.test(line)) break
      const m = line.match(/^[*•\-–]\s*(.+)$/)
      if (m) reasons.push(m[1].trim())
    }
  }

  let auditor: string | null = null
  const cheersIdx = lines.findIndex((l) => /^cheers[,!.]?\s*$/i.test(l))
  if (cheersIdx !== -1 && lines[cheersIdx + 1]) auditor = lines[cheersIdx + 1].replace(/[.,!]+$/, '').trim()
  else {
    const inline = lines.find((l) => /^cheers[,!.]?\s+\S/i.test(l))
    if (inline) auditor = inline.replace(/^cheers[,!.]?\s*/i, '').trim()
  }

  return {
    manually_audited,
    not_audited_by_ai:  num('Calls? Not Audited by AI'),
    wrong_tagged_by_ai: num('Wrong(?:ly)? tagged by AI'),
    ai_accurate,
    ai_total,

    total_tagged_calls,
    total_local_calls: num('Total Local Calls'),

    np_scheduled:               num('New Patients? Scheduled'),
    np_not_scheduled:           num('New Patients? Not Scheduled'),
    np_not_scheduled_insurance: num('New Patients? Not Scheduled Insurance'),

    missed_total:        num('Total Missed Calls'),
    missed_office_hours: num('Missed Calls Office Hours'),
    missed_after_hours:  num('Missed Calls After Hours'),

    src_facebook_ad:            num('Facebook Ad'),
    src_organic:                num('Organic'),
    src_ppc:                    num('PPC'),
    src_number_pool:            num('Number Pool'),
    src_google_ad_extension:    num('Google Ad Extension'),
    src_ads_location_extension: num('Ads Location Extension'),
    src_social_media_number:    num('Social Media Number(?: \\(Facebook\\))?'),

    wrong_number_calls: num('Wrong Number Calls'),
    form_submissions:   num('Form Submissions'),
    form_google:        num('Google'),
    form_facebook:      num('Facebook'),
    form_website:       num('Website'),

    np_not_scheduled_reasons: reasons,
    auditor,
  }
}

// ── Derived figures ───────────────────────────────────────────────────────────

/** Sortable "YYYY-MM" from the stored month name + year. */
export function periodKey(month: string, year: number): string {
  const idx = MONTH_NAMES.indexOf(month)
  return `${year}-${String(idx + 1).padStart(2, '0')}`
}

export function periodLabel(period: string): string {
  const [y, m] = period.split('-')
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`
}

/** Short label for chart axes, e.g. "Aug 26". */
export function periodShort(period: string): string {
  const [y, m] = period.split('-')
  return `${MONTH_NAMES[Number(m) - 1].slice(0, 3)} ’${y.slice(2)}`
}

// ── The accuracy formula ──────────────────────────────────────────────────────
// The AI is only judged on the calls it actually audited. Calls it skipped
// ("Not audited by AI") are taken out of the denominator first:
//
//   AI-audited calls = total tagged calls − not audited by AI
//   wrong-tag rate   = wrong tagged by AI ÷ AI-audited calls
//   accuracy         = 100% − wrong-tag rate
//
// Reports that leave the wrong / not-audited split blank get `null` here, not
// a guess, so the comparison page shows "—" for them.

type AiFields = Pick<ReportMetrics, 'ai_total' | 'not_audited_by_ai' | 'wrong_tagged_by_ai'>

export function aiAuditedCalls(m: AiFields): number | null {
  if (m.ai_total == null || m.not_audited_by_ai == null) return null
  return Math.max(0, m.ai_total - m.not_audited_by_ai)
}

export function wrongTagRate(m: AiFields): number | null {
  const audited = aiAuditedCalls(m)
  if (!audited || m.wrong_tagged_by_ai == null) return null
  return Math.round((m.wrong_tagged_by_ai / audited) * 1000) / 10
}

export function accuracyPct(m: AiFields): number | null {
  const rate = wrongTagRate(m)
  return rate == null ? null : Math.round((100 - rate) * 10) / 10
}

/**
 * True when the report carries the full AI breakdown. Older reports only give
 * "AI was accurate on X of Y" and skip the not-audited / wrong-tagged split.
 */
export function hasFullAiBreakdown(m: ReportMetrics): boolean {
  return m.ai_accurate != null && m.not_audited_by_ai != null && m.wrong_tagged_by_ai != null
}
