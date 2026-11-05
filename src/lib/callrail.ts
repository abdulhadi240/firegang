// Wrong-tag breakdown straight from CallRail. When an auditor finds the AI
// tagged a call wrong, they fix the tags in CallRail and add the
// "Wrong tagged by AI" tag, so the calls carrying that tag are exactly the
// AI's mistakes, and their other tags say what kind of call each one was.
//
// The dashboard always reads the previous calendar month: in November it shows
// October, because that is the month the auditors have finished tagging.

import { MONTH_NAMES, monthDateRange } from '@/types'

// Each practice has its own copy of the tag, and the capitalisation drifted
// between them. CallRail's tag filter is exact-match, so ask for every spelling.
export const WRONG_TAG_SPELLINGS = ['Wrong tagged by AI', 'Wrong Tagged by AI', 'Wrong Tagged']

// The outcome tags worth breaking down by. Agent, service, timing and language
// tags ride along on the same calls but say nothing about what the AI got
// wrong, so anything not listed here is left out. Patterns absorb the spelling
// drift between practices ("Missed Call: Office Hours" / "Missed Calls: …").
const OUTCOME_TAGS: { label: string; re: RegExp }[] = [
  { label: 'Missed Call: Office Hours', re: /^missed calls?:?\s*office hours/i },
  { label: 'Missed Call: After Hours',  re: /^missed calls?:?\s*after hours/i },
  { label: 'New Patient Scheduled',     re: /^new patients? scheduled/i },
  { label: 'New Patient Not Scheduled', re: /^new patients? not scheduled/i },
  { label: 'Existing Patient',          re: /^existing patients?$/i },
  { label: 'Opportunity',               re: /^opportunit(y|ies)$/i },
  { label: 'Wrong Number',              re: /^wrong number/i },
  { label: 'No Caller',                 re: /^no caller$/i },
  { label: 'AI Answered',               re: /^ai answered$/i },
  { label: 'Other',                     re: /^other$/i },
]

const FALLBACK_TAGS = ['Other', 'Opportunity']

// Language tags come as "Call in Spanish" or, at some practices, "Ukrainian
// call". Returns the language with a capital first letter, or null.
function languageOf(tag: string): string | null {
  const m = tag.match(/^call in ([a-z]+)$/i) ?? tag.match(/^([a-z]+(?:ian|ish|ese|ic|ean))\s+call$/i)
  return m ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() : null
}

export interface WrongTagRow {
  label: string
  count: number
  /** How many of those calls were in another language, most frequent first. */
  languages: { language: string; count: number }[]
}

export interface WrongTagBreakdown {
  /** "October 2026" */
  monthLabel: string
  /** Calls carrying "Wrong tagged by AI" that month. */
  total: number
  practices: number
  /** Outcome tags on those calls, most frequent first. A call can carry several. */
  tags: WrongTagRow[]
}

interface CallRailCall {
  id: string
  company_id: string
  tags: { name: string }[]
}

/** The calendar month before `now`, as stored month name + year. */
export function previousMonth(now = new Date()): { month: string; year: number } {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  return { month: MONTH_NAMES[d.getUTCMonth()], year: d.getUTCFullYear() }
}

/** Cache tag on the CallRail fetches, so the dashboard can force a re-pull. */
export const WRONG_TAGS_CACHE_TAG = 'callrail-wrong-tags'

/**
 * Null when CallRail isn't configured or the request fails, so the dashboard
 * can hide the card instead of showing a misleading zero.
 */
export async function fetchWrongTagBreakdown(month: string, year: number): Promise<WrongTagBreakdown | null> {
  const token = process.env.CALLRAIL_API_TOKEN
  const account = process.env.CALLRAIL_ACCOUNT_ID
  if (!token || !account) return null

  const { start_date, end_date } = monthDateRange(month, year)
  const calls: CallRailCall[] = []
  try {
    for (let page = 1; ; page++) {
      const url = new URL(`https://api.callrail.com/v3/a/${account}/calls.json`)
      url.searchParams.set('start_date', start_date)
      url.searchParams.set('end_date', end_date)
      for (const tag of WRONG_TAG_SPELLINGS) url.searchParams.append('tags[]', tag)
      url.searchParams.set('fields', 'tags,company_id')
      url.searchParams.set('per_page', '250')
      url.searchParams.set('page', String(page))
      // A finished month barely changes; an hour keeps late re-tags in view
      // without hitting CallRail on every dashboard load.
      const res = await fetch(url, {
        headers: { Authorization: `Token token=${token}` },
        next: { revalidate: 3600, tags: [WRONG_TAGS_CACHE_TAG] },
      })
      if (!res.ok) throw new Error(`CallRail ${res.status}`)
      const json = await res.json() as { calls: CallRailCall[]; total_pages: number }
      calls.push(...json.calls)
      if (page >= (json.total_pages ?? 1)) break
    }
  } catch (err) {
    console.error('[callrail] wrong-tag breakdown', err)
    return null
  }

  // A call carrying two spellings comes back once per match; count it once.
  const unique = [...new Map(calls.map((c) => [c.id, c])).values()]

  const counts = new Map<string, { count: number; languages: Map<string, number> }>()
  for (const call of unique) {
    // Count each outcome once per call, even if two spellings of it are tagged.
    const seen = new Set<string>()
    const langs = new Set<string>()
    for (const t of call.tags ?? []) {
      const name = t.name.trim()
      const hit = OUTCOME_TAGS.find((o) => o.re.test(name))
      if (hit) seen.add(hit.label)
      const lang = languageOf(name)
      if (lang) langs.add(lang)
    }
    // "Other" and "Opportunity" are catch-alls, usually the AI's original guess
    // left on beside the corrected tag, so they only count when the call has no
    // more specific outcome tag. Between the two, Opportunity says more.
    const specific = [...seen].filter((l) => !FALLBACK_TAGS.includes(l))
    if (specific.length) for (const l of FALLBACK_TAGS) seen.delete(l)
    else if (seen.has('Opportunity')) seen.delete('Other')
    for (const label of seen) {
      const row = counts.get(label) ?? { count: 0, languages: new Map<string, number>() }
      row.count++
      for (const lang of langs) row.languages.set(lang, (row.languages.get(lang) ?? 0) + 1)
      counts.set(label, row)
    }
  }

  return {
    monthLabel: `${month} ${year}`,
    total: unique.length,
    practices: new Set(unique.map((c) => c.company_id)).size,
    tags: [...counts]
      .map(([label, { count, languages }]) => ({
        label,
        count,
        languages: [...languages].map(([language, n]) => ({ language, count: n })).sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.count - a.count),
  }
}
