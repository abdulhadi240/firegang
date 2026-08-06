// Reconciliation between the Go High Level export and our own call sheet.
//
// Both sides share the same column schema — our sheet simply carries an extra
// `Recording` column. So the merge is: take every detail from the GHL row, and
// graft on the recording URL from the matching row in our sheet.
//
// Calls are matched on date + phone + duration, in that order of trust.

import type { GhlColumn, MatchedRow, ReconcileSummary, RowSource } from '@/types'
import { GHL_COLUMNS, OUR_RECORDING_COLUMN, isEligible, isMissedCall } from '@/types'

// ── Normalisation ────────────────────────────────────────────────────────────

/**
 * Reduce a phone number to its last 10 significant digits.
 *
 * The two systems disagree on formatting constantly — "(509) 315-4223",
 * "+15093154223" and "5093154223" are all the same call. Dropping to the last
 * 10 digits normalises past country codes and punctuation alike.
 */
export function normalizePhone(raw: string): string {
  const digits = (raw ?? '').replace(/\D/g, '')
  return digits.length > 10 ? digits.slice(-10) : digits
}

/**
 * Parse a duration into whole seconds.
 *
 * Handles "3:45", "1:02:33", a bare seconds count ("225"), and the
 * "2m 5s" / "5s" shapes that some exports use.
 */
export function normalizeDuration(raw: string): number | null {
  const value = (raw ?? '').trim()
  if (!value) return null

  // h:mm:ss or m:ss
  if (value.includes(':')) {
    const parts = value.split(':').map((p) => Number(p.trim()))
    if (parts.some((n) => Number.isNaN(n))) return null
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    return null
  }

  // "2m 5s" / "45s" / "3 min"
  const unitMatch = value.match(/(?:(\d+)\s*(?:m|min|mins|minutes?))?\s*(?:(\d+)\s*(?:s|sec|secs|seconds?))?/i)
  if (unitMatch && (unitMatch[1] || unitMatch[2])) {
    return Number(unitMatch[1] ?? 0) * 60 + Number(unitMatch[2] ?? 0)
  }

  // Bare seconds
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n) : null
}

export interface NormalizedDateTime {
  /** YYYY-MM-DD, or '' when the value could not be parsed. */
  date: string
  /** Minutes since midnight, or null when no time component was present. */
  minutes: number | null
}

/**
 * Parse a "Date & time" cell into a comparable date + minute-of-day.
 *
 * Deliberately hand-rolled instead of `new Date(str)`: the ambiguous
 * MM/DD vs DD/MM case must resolve as US-style (both CallRail and GHL export
 * US format), and `Date` parsing of those strings is engine-dependent.
 */
export function normalizeDateTime(raw: string): NormalizedDateTime {
  const value = (raw ?? '').trim()
  if (!value) return { date: '', minutes: null }

  // Pull off a trailing time component, with optional AM/PM.
  const timeMatch = value.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?/)
  let minutes: number | null = null
  if (timeMatch) {
    let hour = Number(timeMatch[1])
    const minute = Number(timeMatch[2])
    const meridiem = timeMatch[4]?.toLowerCase()
    if (meridiem === 'pm' && hour < 12) hour += 12
    if (meridiem === 'am' && hour === 12) hour = 0
    minutes = hour * 60 + minute
  }

  const pad = (n: number) => String(n).padStart(2, '0')

  // ISO first: 2026-07-14
  const iso = value.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return { date: `${iso[1]}-${iso[2]}-${iso[3]}`, minutes }

  // US slash/dash: 7/14/2026 or 07-14-26
  const us = value.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
  if (us) {
    const month = Number(us[1])
    const day = Number(us[2])
    let year = Number(us[3])
    if (year < 100) year += 2000
    return { date: `${year}-${pad(month)}-${pad(day)}`, minutes }
  }

  // Textual: "Jul 14, 2026" / "14 July 2026"
  const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
  const textual = value.match(/([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/)
  if (textual) {
    const monthIdx = MONTHS.indexOf(textual[1].slice(0, 3).toLowerCase())
    if (monthIdx >= 0) {
      return { date: `${textual[3]}-${pad(monthIdx + 1)}-${pad(Number(textual[2]))}`, minutes }
    }
  }
  const textualDayFirst = value.match(/(\d{1,2})\s+([A-Za-z]{3,9}),?\s+(\d{4})/)
  if (textualDayFirst) {
    const monthIdx = MONTHS.indexOf(textualDayFirst[2].slice(0, 3).toLowerCase())
    if (monthIdx >= 0) {
      return { date: `${textualDayFirst[3]}-${pad(monthIdx + 1)}-${pad(Number(textualDayFirst[1]))}`, minutes }
    }
  }

  return { date: '', minutes }
}

// ── Matching ─────────────────────────────────────────────────────────────────

/** How far apart two records may be and still be considered the same call. */
export const DURATION_TOLERANCE_SECONDS = 2
export const TIME_TOLERANCE_MINUTES = 2

interface Indexed {
  row: Record<string, string>
  index: number
  date: string
  minutes: number | null
  phone: string
  duration: number | null
}

/** The caller's number, falling back to `From` when `Contact phone` is blank. */
function callerPhone(row: Record<string, string>): string {
  const contact = normalizePhone(row['Contact phone'] ?? '')
  if (contact) return contact
  return normalizePhone(row['From'] ?? '')
}

function index(row: Record<string, string>, i: number): Indexed {
  const { date, minutes } = normalizeDateTime(row['Date & time'] ?? '')
  return {
    row,
    index: i,
    date,
    minutes,
    phone: callerPhone(row),
    duration: normalizeDuration(row['Duration'] ?? ''),
  }
}

/** Strict key: same day, same caller, same duration to the second. */
function strictKey(r: Indexed): string {
  return `${r.date}|${r.phone}|${r.duration ?? 'x'}`
}

function withinTolerance(a: Indexed, b: Indexed): boolean {
  if (a.date !== b.date || !a.date) return false
  if (a.phone !== b.phone || !a.phone) return false

  if (a.duration !== null && b.duration !== null) {
    if (Math.abs(a.duration - b.duration) > DURATION_TOLERANCE_SECONDS) return false
  }
  if (a.minutes !== null && b.minutes !== null) {
    if (Math.abs(a.minutes - b.minutes) > TIME_TOLERANCE_MINUTES) return false
  }
  return true
}

/**
 * Narrow our sheet's rows to a single month.
 *
 * Our call log is one continuous tab covering many months, not a tab per month.
 * Without this filter, reconciling July would report every August row as
 * `sheet_only` — hundreds of phantom "missing from GHL" rows.
 *
 * Rows whose date can't be parsed are excluded: they can never match anyway, and
 * carrying them would just add noise. The count is returned so the caller can
 * surface it rather than silently swallowing rows.
 */
export function filterRowsToMonth(
  rows: Record<string, string>[],
  monthName: string,
  year: number,
  monthNames: readonly string[]
): { rows: Record<string, string>[]; skipped: number; unparseable: number } {
  const monthIndex = monthNames.indexOf(monthName)
  if (monthIndex === -1) return { rows, skipped: 0, unparseable: 0 }

  const prefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}`
  let skipped = 0
  let unparseable = 0

  const kept = rows.filter((r) => {
    const { date } = normalizeDateTime(r['Date & time'] ?? '')
    if (!date) { unparseable++; return false }
    if (!date.startsWith(prefix)) { skipped++; return false }
    return true
  })

  return { rows: kept, skipped, unparseable }
}

export interface ReconcileResult {
  rows: MatchedRow[]
  summary: ReconcileSummary
}

/**
 * Merge the GHL export against our sheet.
 *
 * Runs two passes: an exact date+phone+duration join, then a tolerance pass over
 * whatever is left over (clock skew between the two systems routinely shifts a
 * call by a second or two). Every row is consumed at most once.
 *
 * Returns one row per call, tagged by provenance:
 *   - `matched`    present in both; GHL detail + our recording URL
 *   - `ghl_only`   in GHL but not our sheet — needs a recording URL added by hand
 *   - `sheet_only` in our sheet but not GHL — surfaced so it isn't silently lost
 */
export function reconcile(
  ghlRows: Record<string, string>[],
  ourRows: Record<string, string>[]
): ReconcileResult {
  const ghl = ghlRows.map(index)
  const ours = ourRows.map(index)

  const usedOurs = new Set<number>()
  const matchedByGhl = new Map<number, Indexed>()

  // Pass 1 — exact key. Bucket our rows so repeated keys are consumed in order.
  const buckets = new Map<string, Indexed[]>()
  for (const r of ours) {
    if (!r.date || !r.phone) continue
    const key = strictKey(r)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(r)
    else buckets.set(key, [r])
  }
  for (const g of ghl) {
    if (!g.date || !g.phone) continue
    const bucket = buckets.get(strictKey(g))
    if (!bucket) continue
    const hit = bucket.find((c) => !usedOurs.has(c.index))
    if (hit) {
      usedOurs.add(hit.index)
      matchedByGhl.set(g.index, hit)
    }
  }

  // Pass 2 — tolerance sweep over the remainder.
  for (const g of ghl) {
    if (matchedByGhl.has(g.index)) continue
    const hit = ours.find((c) => !usedOurs.has(c.index) && withinTolerance(g, c))
    if (hit) {
      usedOurs.add(hit.index)
      matchedByGhl.set(g.index, hit)
    }
  }

  const rows: MatchedRow[] = []

  // GHL-driven rows, preserving the order of the uploaded file.
  for (const g of ghl) {
    const ourMatch = matchedByGhl.get(g.index)
    const source: RowSource = ourMatch ? 'matched' : 'ghl_only'
    const data: Record<string, string> = {}
    for (const col of GHL_COLUMNS) data[col] = g.row[col] ?? ''
    data[OUR_RECORDING_COLUMN] = ourMatch?.row[OUR_RECORDING_COLUMN] ?? ''
    rows.push({ source, data })
  }

  // Anything of ours GHL never reported.
  for (const c of ours) {
    if (usedOurs.has(c.index)) continue
    const data: Record<string, string> = {}
    for (const col of GHL_COLUMNS) data[col] = c.row[col] ?? ''
    data[OUR_RECORDING_COLUMN] = c.row[OUR_RECORDING_COLUMN] ?? ''
    rows.push({ source: 'sheet_only', data })
  }

  const matched = rows.filter((r) => r.source === 'matched').length
  const ghlOnly = rows.filter((r) => r.source === 'ghl_only').length
  const sheetOnly = rows.filter((r) => r.source === 'sheet_only').length

  return {
    rows,
    summary: {
      ghl_total: ghlRows.length,
      sheet_total: ourRows.length,
      matched,
      ghl_only: ghlOnly,
      sheet_only: sheetOnly,
      missing_recording: rows.filter((r) => !r.data[OUR_RECORDING_COLUMN]).length,
      // A matched call with no recording is already a missed call at this point;
      // an unmatched one needs a URL or a mark before it can be audited.
      missed_calls: rows.filter(isMissedCall).length,
      ineligible:   rows.filter((r) => !isEligible(r)).length,
    },
  }
}

export type { GhlColumn }
