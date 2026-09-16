// The dashboard home is a read-out of the monthly audit reports: how many calls
// were audited, how many the AI tagged correctly, and whether that is getting
// better month over month. Everything here is derived from the same parsed
// report metrics the Comparison page uses, so the two never disagree.

import {
  ReportRecord, ReportMetrics, aggregateMetrics, accuracyPct, aiAuditedCalls, wrongTagRate, notAuditedRate,
  hasFullAiBreakdown, periodShort, periodLabel,
} from '@/lib/report-metrics'

export interface MonthPoint {
  period: string          // "2026-08"
  label: string           // "Aug ’26"
  longLabel: string       // "August 2026"
  practices: number       // reports carrying the full AI breakdown
  reports: number         // all reports for the month
  totalCalls: number      // calls tagged across those reports
  aiAudited: number       // calls the AI actually audited
  accurate: number        // AI-audited − wrong tagged
  wrong: number
  notAudited: number
  accuracy: number | null
  wrongRate: number | null
  /** Not audited ÷ total tagged, in percent. */
  notAuditedRate: number | null
}

export interface PracticeMove {
  company_id: string
  company_name: string
  current: number
  previous: number
  delta: number           // in accuracy points
  calls: number
}

export interface PracticeAttention {
  company_id: string
  company_name: string
  accuracy: number
  wrong: number
  calls: number
}

export type Trend = 'improving' | 'declining' | 'flat' | 'unknown'

export interface AuditOverview {
  months: MonthPoint[]
  latest: MonthPoint | null
  previous: MonthPoint | null
  /** All months rolled up. */
  totals: {
    totalCalls: number
    aiAudited: number
    accurate: number
    wrong: number
    notAudited: number
    notAuditedRate: number | null
    accuracy: number | null
    reports: number
    practices: number
  }
  trend: {
    direction: Trend
    /** Latest month accuracy minus previous month, in points. */
    delta: number | null
    /** First month accuracy to latest month, in points. */
    sinceStart: number | null
    bestPeriod: string | null
  }
  improved: PracticeMove[]
  slipped: PracticeMove[]
  attention: PracticeAttention[]
}

const round1 = (n: number) => Math.round(n * 10) / 10

function pointFor(period: string, records: ReportRecord[]): MonthPoint {
  const m = aggregateMetrics(records)
  const audited = aiAuditedCalls(m) ?? 0
  const wrong = m.wrong_tagged_by_ai ?? 0
  return {
    period,
    label: periodShort(period),
    longLabel: periodLabel(period),
    practices: records.filter((r) => hasFullAiBreakdown(r.metrics)).length,
    reports: records.length,
    totalCalls: m.ai_total ?? 0,
    aiAudited: audited,
    accurate: Math.max(0, audited - wrong),
    wrong,
    notAudited: m.not_audited_by_ai ?? 0,
    accuracy: accuracyPct(m),
    wrongRate: wrongTagRate(m),
    notAuditedRate: notAuditedRate(m),
  }
}

function accuracyOf(m: ReportMetrics): number | null {
  return hasFullAiBreakdown(m) ? accuracyPct(m) : null
}

export function buildAuditOverview(records: ReportRecord[]): AuditOverview {
  const byPeriod = new Map<string, ReportRecord[]>()
  for (const r of records) {
    const list = byPeriod.get(r.period) ?? []
    list.push(r)
    byPeriod.set(r.period, list)
  }
  const months = [...byPeriod.keys()].sort().map((p) => pointFor(p, byPeriod.get(p)!))

  const latest = months.at(-1) ?? null
  const previous = months.length > 1 ? months[months.length - 2] : null

  const all = aggregateMetrics(records)
  const allAudited = aiAuditedCalls(all) ?? 0
  const allWrong = all.wrong_tagged_by_ai ?? 0
  const totals = {
    totalCalls: all.ai_total ?? 0,
    aiAudited: allAudited,
    accurate: Math.max(0, allAudited - allWrong),
    wrong: allWrong,
    notAudited: all.not_audited_by_ai ?? 0,
    notAuditedRate: notAuditedRate(all),
    accuracy: accuracyPct(all),
    reports: records.length,
    practices: new Set(records.map((r) => r.company_name.toLowerCase())).size,
  }

  // ── Trend ──
  const withAcc = months.filter((m) => m.accuracy != null)
  const delta = latest?.accuracy != null && previous?.accuracy != null
    ? round1(latest.accuracy - previous.accuracy)
    : null
  const sinceStart = withAcc.length > 1
    ? round1(withAcc[withAcc.length - 1].accuracy! - withAcc[0].accuracy!)
    : null
  let direction: Trend = 'unknown'
  if (delta != null) direction = delta > 0.2 ? 'improving' : delta < -0.2 ? 'declining' : 'flat'
  const best = withAcc.length
    ? withAcc.reduce((a, b) => (b.accuracy! > a.accuracy! ? b : a))
    : null

  // ── Practice movers between the two latest months ──
  const improved: PracticeMove[] = []
  const slipped: PracticeMove[] = []
  const attention: PracticeAttention[] = []
  if (latest) {
    const cur = new Map<string, ReportRecord>()
    for (const r of byPeriod.get(latest.period) ?? []) cur.set(r.company_name.toLowerCase(), r)
    const prev = new Map<string, ReportRecord>()
    if (previous) for (const r of byPeriod.get(previous.period) ?? []) prev.set(r.company_name.toLowerCase(), r)

    const moves: PracticeMove[] = []
    for (const [key, r] of cur) {
      const a = accuracyOf(r.metrics)
      if (a == null) continue
      const calls = r.metrics.ai_total ?? 0
      attention.push({
        company_id: r.company_id, company_name: r.company_name,
        accuracy: a, wrong: r.metrics.wrong_tagged_by_ai ?? 0, calls,
      })
      const p = prev.get(key)
      const b = p ? accuracyOf(p.metrics) : null
      if (b == null) continue
      moves.push({
        company_id: r.company_id, company_name: r.company_name,
        current: a, previous: b, delta: round1(a - b), calls,
      })
    }
    // Only meaningful swings, on practices with enough calls to matter.
    const material = moves.filter((m) => Math.abs(m.delta) >= 1 && m.calls >= 10)
    improved.push(...material.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 5))
    slipped.push(...material.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 5))
    attention.sort((a, b) => a.accuracy - b.accuracy || b.wrong - a.wrong)
    attention.splice(5)
  }

  return {
    months, latest, previous, totals,
    trend: { direction, delta, sinceStart, bestPeriod: best?.period ?? null },
    improved, slipped, attention,
  }
}
