'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  ReportRecord, ReportMetrics, accuracyPct, wrongTagRate, aiAuditedCalls, hasFullAiBreakdown, periodLabel, periodShort,
} from '@/lib/report-metrics'
import {
  CalendarDays, Building2, Printer, ArrowUpRight, ArrowDownRight, Minus, Search,
  ArrowUpDown, ChevronUp, ChevronDown, AlertTriangle, Info, ChevronRight, Trophy,
} from 'lucide-react'

type View = 'monthly' | 'practice'

interface Props {
  records: ReportRecord[]
  initialView: View
  initialCompany: string | null
  initialPeriod: string | null
  /** Rendered on the server so the print header never mismatches on hydration. */
  preparedAt: string
}

// ── Series colours ───────────────────────────────────────────────────────────
// Validated with the dataviz palette checker: blue ↔ brand orange clear the
// colour-vision separation floor; the "not audited" grey is a deliberate
// neutral (no AI judgement was made) and always ships with a legend + labels.
const SERIES = {
  accurate:   { color: '#1d4ed8', label: 'AI accurate' },
  wrong:      { color: '#E8431A', label: 'Wrong tagged by AI' },
  notAudited: { color: '#8a8580', label: 'Not audited by AI' },
} as const

// ── Formatting ───────────────────────────────────────────────────────────────
const fmt = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('en-US'))
const fmtPct = (n: number | null | undefined) => (n == null ? '—' : `${n.toFixed(1)}%`)

function pct(part: number | null, whole: number | null): number | null {
  if (part == null || !whole) return null
  return Math.round((part / whole) * 1000) / 10
}

// ── Aggregation ──────────────────────────────────────────────────────────────
// Rolls many practice reports up into one ReportMetrics-shaped total, so the
// same metric rows render for "all practices in June" and "this practice in
// June". A field is summed over the reports that carry it and stays `null`
// when none do, so "not reported" is never shown as 0.
const NUMERIC_KEYS = [
  'manually_audited', 'not_audited_by_ai', 'wrong_tagged_by_ai', 'ai_accurate', 'ai_total',
  'total_tagged_calls', 'total_local_calls',
  'np_scheduled', 'np_not_scheduled', 'np_not_scheduled_insurance',
  'missed_total', 'missed_office_hours', 'missed_after_hours',
  'src_facebook_ad', 'src_organic', 'src_ppc', 'src_number_pool', 'src_google_ad_extension',
  'src_ads_location_extension', 'src_social_media_number',
  'wrong_number_calls', 'form_submissions', 'form_google', 'form_facebook', 'form_website',
] as const satisfies readonly (keyof ReportMetrics)[]

function aggregateMetrics(records: ReportRecord[]): ReportMetrics {
  const out = {} as Record<(typeof NUMERIC_KEYS)[number], number | null>
  for (const key of NUMERIC_KEYS) {
    let sum: number | null = null
    for (const r of records) {
      const v = r.metrics[key]
      if (v != null) sum = (sum ?? 0) + v
    }
    out[key] = sum
  }
  // The three inputs to the accuracy formula must come from the same reports,
  // otherwise a report that gives a total but no split skews the fraction.
  // So the rolled-up total / wrong / not-audited only count reports carrying
  // all three; the plain "AI accurate" count still sums whatever is reported.
  const full = records.filter((r) => hasFullAiBreakdown(r.metrics))
  const sumOf = (key: 'ai_total' | 'wrong_tagged_by_ai' | 'not_audited_by_ai') =>
    full.length ? full.reduce((s, r) => s + (r.metrics[key] ?? 0), 0) : null
  out.ai_total           = sumOf('ai_total')
  out.wrong_tagged_by_ai = sumOf('wrong_tagged_by_ai')
  out.not_audited_by_ai  = sumOf('not_audited_by_ai')
  return { ...out, np_not_scheduled_reasons: [], auditor: null }
}

/** Reported split adds up to the reported total — flags typos in the source report. */
function isConsistent(m: ReportMetrics): boolean {
  if (!hasFullAiBreakdown(m)) return true
  return (m.ai_accurate ?? 0) + (m.wrong_tagged_by_ai ?? 0) + (m.not_audited_by_ai ?? 0) === m.ai_total
}

// ── Metric rows (shared by both views) ───────────────────────────────────────
interface MetricRow {
  label: string
  get: (m: ReportMetrics) => number | null
  format?: 'pct'
  /** Which direction counts as "best". Undefined → neutral, no highlight. */
  best?: 'high' | 'low'
  emphasis?: boolean
  hint?: string
}
interface MetricSection { title: string; rows: MetricRow[] }

const SECTIONS: MetricSection[] = [
  {
    title: 'AI audit accuracy',
    rows: [
      { label: 'Total tagged calls',  get: (m) => m.ai_total, emphasis: true, hint: 'Calls tagged this month' },
      { label: 'Not audited by AI',   get: (m) => m.not_audited_by_ai, best: 'low', hint: 'Calls the AI skipped; audited by hand' },
      { label: 'AI-audited calls',    get: (m) => aiAuditedCalls(m), hint: 'Total tagged − not audited by AI' },
      { label: 'Wrong tagged by AI',  get: (m) => m.wrong_tagged_by_ai, best: 'low', hint: 'Tags a team member had to correct' },
      { label: 'Wrong-tag rate',      get: (m) => wrongTagRate(m), format: 'pct', best: 'low', hint: 'Wrong tagged ÷ AI-audited calls' },
      { label: 'AI accuracy',         get: (m) => accuracyPct(m), format: 'pct', best: 'high', emphasis: true, hint: '100% − wrong-tag rate' },
      { label: 'AI accurate (as reported)', get: (m) => m.ai_accurate, best: 'high', hint: 'The "AI was accurate on X" count in the report' },
      { label: 'Manually audited',    get: (m) => m.manually_audited, best: 'low', hint: 'Wrong tagged + not audited' },
    ],
  },
  {
    title: 'Call volume',
    rows: [
      { label: 'Total local calls',   get: (m) => m.total_local_calls },
      { label: 'Wrong number calls',  get: (m) => m.wrong_number_calls, best: 'low' },
    ],
  },
  {
    title: 'New patients',
    rows: [
      { label: 'Scheduled',                 get: (m) => m.np_scheduled, best: 'high' },
      { label: 'Not scheduled',             get: (m) => m.np_not_scheduled, best: 'low' },
      { label: 'Not scheduled (insurance)', get: (m) => m.np_not_scheduled_insurance, best: 'low' },
    ],
  },
  {
    title: 'Missed calls',
    rows: [
      { label: 'Total missed',   get: (m) => m.missed_total, best: 'low' },
      { label: 'Office hours',   get: (m) => m.missed_office_hours, best: 'low' },
      { label: 'After hours',    get: (m) => m.missed_after_hours, best: 'low' },
    ],
  },
  {
    title: 'Call sources',
    rows: [
      { label: 'Number pool',             get: (m) => m.src_number_pool },
      { label: 'Ads location extension',  get: (m) => m.src_ads_location_extension },
      { label: 'Google ad extension',     get: (m) => m.src_google_ad_extension },
      { label: 'Facebook ad',             get: (m) => m.src_facebook_ad },
      { label: 'Social media number',     get: (m) => m.src_social_media_number },
      { label: 'Organic',                 get: (m) => m.src_organic },
      { label: 'PPC',                     get: (m) => m.src_ppc },
    ],
  },
  {
    title: 'Form submissions',
    rows: [
      { label: 'Total forms', get: (m) => m.form_submissions, best: 'high' },
      { label: 'Google',      get: (m) => m.form_google },
      { label: 'Facebook',    get: (m) => m.form_facebook },
      { label: 'Website',     get: (m) => m.form_website },
    ],
  },
]

/** Index(es) of the best value in a row; empty when nothing to compare. */
function bestIndexes(values: (number | null)[], best?: 'high' | 'low'): Set<number> {
  const out = new Set<number>()
  if (!best) return out
  const present = values.filter((v): v is number => v != null)
  if (present.length < 2) return out
  const target = best === 'high' ? Math.max(...present) : Math.min(...present)
  if (present.every((v) => v === target)) return out   // all tied: nothing stands out
  values.forEach((v, i) => { if (v === target) out.add(i) })
  return out
}

// ── Small UI pieces ──────────────────────────────────────────────────────────

/**
 * Change between two values. `lowerIsBetter` flips the colouring for metrics
 * like wrong tags, where a drop is the good news; neutral metrics stay grey.
 */
function Delta({
  current, previous, unit = '', best, decimals = 0,
}: {
  current: number | null
  previous: number | null
  unit?: string
  best?: 'high' | 'low'
  decimals?: number
}) {
  if (current == null || previous == null) {
    return <span className="text-xs text-gray-400">—</span>
  }
  const diff = current - previous
  if (Math.abs(diff) < 0.05) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-500">
        <Minus className="w-3 h-3" /> no change
      </span>
    )
  }
  const tone = !best ? 'text-gray-600' : (best === 'low' ? diff < 0 : diff > 0) ? 'text-green-700' : 'text-red-600'
  const Icon = diff > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium tabular-nums', tone)}>
      <Icon className="w-3.5 h-3.5" />
      {diff > 0 ? '+' : '−'}{Math.abs(diff).toFixed(decimals)}{unit}
    </span>
  )
}

function SectionTitle({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function SelectField({
  label, value, onChange, options, icon: Icon,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
      {label}
      <span className="relative">
        <Icon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 pl-9 pr-8 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 font-normal focus:outline-none focus:ring-2 focus:ring-[#E8431A]/40 focus:border-[#E8431A] appearance-none min-w-[12rem]"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      </span>
    </label>
  )
}

/** The headline the owner reads first: which month the AI did best in. */
function BestMonthCallout({
  columns, metrics,
}: {
  columns: { key: string; label: string }[]
  metrics: ReportMetrics[]
}) {
  const accuracies = metrics.map(accuracyPct)
  const present = accuracies.filter((a): a is number => a != null)
  const best = bestIndexes(accuracies, 'high')
  const bestIdx = best.size ? Math.max(...best) : -1   // latest of any tie
  const allTied = bestIdx === -1 && present.length >= 2
  const lastIdx = metrics.length - 1
  const last = metrics[lastIdx]
  const prev = lastIdx > 0 ? metrics[lastIdx - 1] : null

  return (
    <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
      <div className="rounded-xl border border-green-200 bg-green-50 p-4 sm:p-5 flex gap-4 items-start">
        <span className="w-10 h-10 rounded-full bg-white border border-green-200 flex items-center justify-center shrink-0">
          <Trophy className="w-5 h-5 text-green-700" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-green-800 font-medium">Best month for AI accuracy</p>
          {allTied ? (
            <>
              <p className="text-xl sm:text-2xl font-bold text-green-900 mt-0.5">All months tied</p>
              <p className="text-sm text-green-900/80 mt-0.5">{fmtPct(present[0])} accurate in every month on record</p>
            </>
          ) : bestIdx === -1 ? (
            <p className="text-sm text-green-900 mt-1">Not enough months to compare yet.</p>
          ) : (
            <>
              <p className="text-xl sm:text-2xl font-bold text-green-900 mt-0.5">{columns[bestIdx].label}</p>
              <p className="text-sm text-green-900/80 mt-0.5">
                {fmtPct(accuracies[bestIdx])} accurate · only {fmt(metrics[bestIdx].wrong_tagged_by_ai)} wrong of {fmt(aiAuditedCalls(metrics[bestIdx]))} AI-audited calls
              </p>
            </>
          )}
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm flex gap-4 items-start">
        <span className="w-10 h-10 rounded-full bg-orange-50 border border-orange-200 flex items-center justify-center shrink-0">
          <CalendarDays className="w-5 h-5 text-[#E8431A]" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-gray-500 font-medium">Latest month · {columns[lastIdx].label}</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-0.5">{fmtPct(accuracies[lastIdx])} accurate</p>
          <p className="text-sm text-gray-600 mt-0.5 flex flex-wrap items-center gap-x-2">
            <span>{fmt(last.wrong_tagged_by_ai)} wrong of {fmt(aiAuditedCalls(last))} AI-audited calls</span>
            {prev && (
              <span className="inline-flex items-center gap-1">
                · <Delta current={accuracies[lastIdx]} previous={accuracyPct(prev)} unit=" pts" decimals={1} best="high" /> vs {columns[lastIdx - 1].label}
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Comparison matrix ────────────────────────────────────────────────────────
// Months across, metrics down. The best month in each row is highlighted, and
// the last column shows the change from the previous month to the latest one.
function ComparisonMatrix({
  columns, metrics, topRows, footerRows, ratesOnly = false,
}: {
  columns: { key: string; label: string; sublabel?: string }[]
  metrics: ReportMetrics[]
  /**
   * Only judge percentage rows. Used for the all-practices roll-up, where a
   * month with fewer reports would otherwise "win" every count-based row.
   */
  ratesOnly?: boolean
  /** Rows above the metric sections, e.g. how many reports fed each column. */
  topRows?: { label: string; values: (string | number | null)[] }[]
  footerRows?: { label: string; values: (string | null)[] }[]
}) {
  const n = columns.length
  const lastIdx = n - 1

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500">
          <tr>
            <th className="px-4 py-3 text-left font-medium w-56">Metric</th>
            {columns.map((c, i) => (
              <th key={c.key} className={cn('px-4 py-3 text-right font-medium whitespace-nowrap', i === lastIdx && 'text-gray-900')}>
                <span className="block text-xs normal-case tracking-normal">{c.label}</span>
                {c.sublabel && <span className="block text-[10px] font-normal normal-case tracking-normal text-gray-400">{c.sublabel}</span>}
              </th>
            ))}
            <th className="px-4 py-3 text-right font-medium whitespace-nowrap">
              <span className="block text-xs normal-case tracking-normal">Change</span>
              {n > 1 && <span className="block text-[10px] font-normal normal-case tracking-normal text-gray-400">{columns[lastIdx - 1].label} → {columns[lastIdx].label}</span>}
            </th>
          </tr>
          {topRows?.map((row) => (
            <tr key={row.label} className="bg-gray-50 text-[11px] normal-case tracking-normal text-gray-500 border-t border-gray-100">
              <td className="px-4 py-1.5 font-medium">{row.label}</td>
              {row.values.map((v, i) => <td key={columns[i].key} className="px-4 py-1.5 text-right tabular-nums">{v ?? '—'}</td>)}
              <td />
            </tr>
          ))}
        </thead>

        {SECTIONS.map((section) => (
          <tbody key={section.title} className="divide-y divide-gray-100 border-t border-gray-200">
            <tr className="bg-gray-50/70">
              <td colSpan={n + 2} className="px-4 py-1.5 text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
                {section.title}
              </td>
            </tr>
            {section.rows.map((row) => {
              const values = metrics.map(row.get)
              if (values.every((v) => v == null)) return null   // nobody reports it: drop the row
              const judge = ratesOnly && row.format !== 'pct' ? undefined : row.best
              const best = bestIndexes(values, judge)
              const show = row.format === 'pct' ? fmtPct : fmt
              return (
                <tr key={row.label} className={cn(row.emphasis && 'bg-orange-50/30')}>
                  <td className={cn('px-4 py-2.5 whitespace-nowrap', row.emphasis ? 'font-semibold text-gray-900' : 'text-gray-700')}>
                    {row.label}
                    {row.hint && <span className="block text-[10px] font-normal text-gray-400 whitespace-normal">{row.hint}</span>}
                  </td>
                  {values.map((v, i) => {
                    const isBest = best.has(i)
                    return (
                      <td
                        key={columns[i].key}
                        className={cn(
                          'px-4 py-2.5 text-right tabular-nums whitespace-nowrap',
                          v == null ? 'text-gray-400' : 'text-gray-900',
                          row.emphasis && 'font-semibold',
                          isBest && 'bg-green-50 text-green-900 font-semibold'
                        )}
                      >
                        {isBest && (
                          <span className="inline-flex items-center gap-1 mr-2 align-middle text-[10px] uppercase tracking-wider text-green-700 font-semibold">
                            <Trophy className="w-3 h-3" /> Best
                          </span>
                        )}
                        {show(v)}
                      </td>
                    )
                  })}
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {n > 1
                      ? <Delta current={values[lastIdx]} previous={values[lastIdx - 1]} best={judge} unit={row.format === 'pct' ? ' pts' : ''} decimals={row.format === 'pct' ? 1 : 0} />
                      : <span className="text-xs text-gray-400">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        ))}

        {footerRows && (
          <tfoot className="border-t border-gray-200 text-xs text-gray-500">
            {footerRows.map((row) => (
              <tr key={row.label}>
                <td className="px-4 py-2">{row.label}</td>
                {row.values.map((v, i) => <td key={columns[i].key} className="px-4 py-2 text-right">{v ?? '—'}</td>)}
                <td />
              </tr>
            ))}
          </tfoot>
        )}
      </table>
    </div>
  )
}

// ── Charts ───────────────────────────────────────────────────────────────────
// Both charts animate in on mount (bars grow from the baseline, the line draws
// itself) and answer to the mouse: hover for a tooltip, click a month to select
// it, click a legend entry to hide that series. Remount (via `key`) to replay.

/** True one frame after mount, so CSS transitions run from the empty state. */
function useMounted(): boolean {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])
  return mounted
}

interface BarRow {
  key: string
  label: string
  accurate: number
  wrong: number
  notAudited: number
  accuracy: number | null
  caption?: string
}

type SeriesKey = keyof typeof SERIES
const SERIES_ORDER: SeriesKey[] = ['accurate', 'wrong', 'notAudited']

function StackedBars({
  rows, highlight, selected, onSelect,
}: {
  rows: BarRow[]
  /** The best month — its label is drawn in green. */
  highlight?: string
  /** The month the user clicked — outlined in brand orange. */
  selected?: string
  onSelect?: (key: string) => void
}) {
  const mounted = useMounted()
  const [hover, setHover] = useState<string | null>(null)
  // Where to put the tooltip, in px from the card's left edge. It renders
  // outside the horizontally-scrolling plot so it can never be clipped by it
  // or push the plot wider.
  const [tipX, setTipX] = useState(0)
  const [wrapRef, wrapWidth] = useWidth<HTMLDivElement>()
  const [hidden, setHidden] = useState<Set<SeriesKey>>(new Set())
  const [mode, setMode] = useState<'count' | 'share'>('count')
  const PLOT_H = 190
  const TIP_W = 224

  const visible = (r: BarRow) => ({
    accurate:   hidden.has('accurate')   ? 0 : r.accurate,
    wrong:      hidden.has('wrong')      ? 0 : r.wrong,
    notAudited: hidden.has('notAudited') ? 0 : r.notAudited,
  })
  const max = Math.max(1, ...rows.map((r) => { const v = visible(r); return v.accurate + v.wrong + v.notAudited }))

  const toggle = (k: SeriesKey) =>
    setHidden((h) => {
      const next = new Set(h)
      if (next.has(k)) next.delete(k)
      else if (next.size < SERIES_ORDER.length - 1) next.add(k)   // always keep one series visible
      return next
    })

  const hoveredRow = hover ? rows.find((r) => r.key === hover) : null

  return (
    <div ref={wrapRef} className="relative">
      {hoveredRow && (() => {
        const total = hoveredRow.accurate + hoveredRow.wrong + hoveredRow.notAudited
        const SHORT: Record<SeriesKey, string> = { accurate: 'Accurate', wrong: 'Wrong tagged', notAudited: 'Not audited' }
        return (
          <div
            className="absolute z-10 rounded-lg border border-gray-200 bg-white shadow-lg px-3 py-2 text-[11px] leading-5 pointer-events-none animate-[scale-in_120ms_ease-out] whitespace-nowrap"
            style={{ width: TIP_W, top: 48, left: Math.min(Math.max(0, tipX - TIP_W / 2), Math.max(0, wrapWidth - TIP_W)) }}
          >
            <div className="flex justify-between font-semibold text-gray-900 mb-1">
              <span>{hoveredRow.label}</span>
              <span className="tabular-nums">{fmt(total)} calls</span>
            </div>
            <div className="grid grid-cols-[auto_1fr_auto_3.25rem] items-center gap-x-2 text-gray-600">
              {SERIES_ORDER.map((k) => (
                <Fragment key={k}>
                  <span className="w-2 h-2 rounded-sm" style={{ background: SERIES[k].color }} />
                  <span>{SHORT[k]}</span>
                  <span className="tabular-nums font-medium text-gray-900 text-right">{fmt(hoveredRow[k])}</span>
                  <span className="tabular-nums text-gray-400 text-right">{total > 0 ? fmtPct(pct(hoveredRow[k], total)) : '—'}</span>
                </Fragment>
              ))}
            </div>
            <div className="flex justify-between border-t border-gray-100 mt-1 pt-1">
              <span className="text-gray-600">AI accuracy</span>
              <span className="tabular-nums font-semibold text-gray-900">{fmtPct(hoveredRow.accuracy)}</span>
            </div>
          </div>
        )
      })()}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap gap-2 text-xs">
          {SERIES_ORDER.map((k) => {
            const off = hidden.has(k)
            return (
              <button
                key={k}
                onClick={() => toggle(k)}
                aria-pressed={!off}
                title={off ? 'Show this series' : 'Hide this series'}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full border transition-colors',
                  off ? 'border-gray-200 text-gray-400 line-through bg-gray-50' : 'border-gray-200 text-gray-700 bg-white hover:bg-gray-50'
                )}
              >
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: off ? '#d1d5db' : SERIES[k].color }} />
                {SERIES[k].label}
              </button>
            )
          })}
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs print:hidden">
          {([['count', 'Calls'], ['share', '% of month']] as const).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn('px-2.5 h-6 rounded-md font-medium transition-colors', mode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="flex items-end gap-3 sm:gap-6 min-w-fit px-1" style={{ height: PLOT_H + 24 }}>
          {rows.map((r, i) => {
            const v = visible(r)
            const total = v.accurate + v.wrong + v.notAudited
            const scale = mode === 'share' ? (total ? PLOT_H / total : 0) : PLOT_H / max
            const h = (n: number) => (mounted ? Math.round(n * scale) : 0)
            const dim = hover !== null && hover !== r.key
            const isSelected = selected === r.key
            return (
              <div
                key={r.key}
                className={cn('relative flex flex-col items-center justify-end flex-1 min-w-[3.5rem] max-w-[7rem] h-full', onSelect && 'cursor-pointer')}
                onMouseEnter={(e) => {
                  setHover(r.key)
                  const col = e.currentTarget.getBoundingClientRect()
                  const wrap = wrapRef.current?.getBoundingClientRect()
                  if (wrap) setTipX(col.left + col.width / 2 - wrap.left)
                }}
                onMouseLeave={() => setHover(null)}
                onClick={() => onSelect?.(r.key)}
                role={onSelect ? 'button' : undefined}
                aria-pressed={onSelect ? isSelected : undefined}
                aria-label={`${r.label}: ${r.accurate + r.wrong + r.notAudited} calls, ${fmtPct(r.accuracy)} accurate`}
              >
                <span className={cn('text-[11px] font-medium tabular-nums mb-1 transition-opacity duration-500', mounted ? 'opacity-100' : 'opacity-0', dim ? 'text-gray-400' : 'text-gray-700')} style={{ transitionDelay: `${300 + i * 80}ms` }}>
                  {mode === 'share' ? (total ? '100%' : '—') : fmt(total)}
                </span>
                <div
                  className={cn(
                    'w-full flex flex-col-reverse gap-[2px] rounded-t-[4px] transition-[height,opacity] duration-700 ease-out',
                    dim && 'opacity-40',
                    isSelected && 'ring-2 ring-[#E8431A] ring-offset-2 ring-offset-white'
                  )}
                  style={{ height: h(total), transitionDelay: `${i * 80}ms` }}
                >
                  {SERIES_ORDER.map((k) => v[k] > 0 && (
                    <div
                      key={k}
                      className="rounded-t-[4px] transition-[height] duration-700 ease-out"
                      style={{ height: h(v[k]), background: SERIES[k].color, transitionDelay: `${i * 80}ms` }}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
        <div className="border-t border-gray-200 mt-0.5 flex gap-3 sm:gap-6 min-w-fit px-1">
          {rows.map((r) => (
            <div key={r.key} className="flex-1 min-w-[3.5rem] max-w-[7rem] pt-2 text-center">
              <p className={cn('text-xs font-medium inline-flex items-center gap-1', highlight === r.key ? 'text-green-700' : selected === r.key ? 'text-[#E8431A]' : 'text-gray-700')}>
                {highlight === r.key && <Trophy className="w-3 h-3" />}{r.label}
              </p>
              <p className="text-[11px] text-gray-500 tabular-nums">{fmtPct(r.accuracy)}</p>
              {r.caption && <p className="text-[10px] text-gray-400">{r.caption}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Width of an element, tracked live so the chart can fill its card. */
function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

/**
 * Y-axis that zooms to the data. Accuracy lives in the 85–100 % band, so a
 * fixed 0–100 axis would flatten every month into one line. Ticks land on
 * round numbers with a step chosen to give 4–6 gridlines.
 */
function niceDomain(values: number[]): { lo: number; hi: number; ticks: number[] } {
  if (values.length === 0) return { lo: 0, hi: 100, ticks: [0, 25, 50, 75, 100] }
  const min = Math.min(...values), max = Math.max(...values)
  const span = Math.max(max - min, 2)
  const step = [1, 2, 5, 10, 20, 25][[1, 2, 5, 10, 20, 25].findIndex((s) => span / s <= 5)] ?? 25
  let lo = Math.floor((min - span * 0.25) / step) * step
  let hi = Math.ceil((max + span * 0.25) / step) * step
  lo = Math.max(0, lo)
  hi = Math.min(100, hi)
  if (hi - lo < step * 2) { lo = Math.max(0, hi - step * 2) }
  if (hi - lo < step * 2) { hi = Math.min(100, lo + step * 2) }
  const ticks: number[] = []
  for (let t = lo; t <= hi + 1e-9; t += step) ticks.push(Math.round(t * 100) / 100)
  return { lo, hi, ticks }
}

/** Accuracy over time: fills its card, draws itself in, and follows the mouse. */
function AccuracyLine({
  points, highlight, selected, onSelect,
}: {
  /** `rows` are short label/value pairs shown one per line in the tooltip. */
  points: { key: string; label: string; value: number | null; rows?: [string, string][] }[]
  highlight?: string
  selected?: string
  onSelect?: (key: string) => void
}) {
  const mounted = useMounted()
  const [hover, setHover] = useState<number | null>(null)
  const [wrapRef, wrapWidth] = useWidth<HTMLDivElement>()
  const TIP_W = 200

  const n = points.length
  const PAD_L = 52, PAD_R = 28, PAD_T = 30, PAD_B = 34, H = 240
  // Fill the card, but never squeeze months closer than 72px together.
  const W = Math.max(wrapWidth || 480, PAD_L + PAD_R + Math.max(1, n - 1) * 72)
  const plotW = W - PAD_L - PAD_R
  const plotH = H - PAD_T - PAD_B
  const x = (i: number) => PAD_L + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW)

  const present = points.map((p, i) => ({ ...p, i })).filter((p): p is typeof p & { value: number } => p.value != null)
  const { lo, hi, ticks } = niceDomain(present.map((p) => p.value))
  const y = (v: number) => PAD_T + plotH - ((v - lo) / (hi - lo)) * plotH

  const path = present.map((p, j) => `${j === 0 ? 'M' : 'L'} ${x(p.i)} ${y(p.value)}`).join(' ')
  const area = present.length > 1
    ? `${path} L ${x(present[present.length - 1].i)} ${y(lo)} L ${x(present[0].i)} ${y(lo)} Z`
    : ''
  const hovered = hover != null ? points[hover] : null
  const zoomed = lo > 0 || hi < 100

  return (
    <div ref={wrapRef} className="relative overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="block max-w-none"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const px = ((e.clientX - rect.left) / rect.width) * W
          let best = 0
          for (let i = 1; i < n; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i
          setHover(best)
        }}
        onClick={() => { if (hover != null) onSelect?.(points[hover].key) }}
        role="img"
        aria-label={`Accuracy by month: ${points.map((p) => `${p.label} ${fmtPct(p.value)}`).join(', ')}`}
      >
        {/* Recessive grid on round ticks */}
        {ticks.map((g, gi) => (
          <g key={g}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(g)} y2={y(g)} stroke="#e5e7eb" strokeWidth={1} strokeDasharray={gi === 0 ? undefined : '2 4'} />
            <text x={PAD_L - 8} y={y(g) + 3.5} textAnchor="end" fontSize={10} fill="#9ca3af">{g}%</text>
          </g>
        ))}

        {/* Area under the line, fading in once the line has drawn */}
        {area && (
          <path d={area} fill={SERIES.accurate.color} style={{ opacity: mounted ? 0.08 : 0, transition: 'opacity 600ms ease 900ms' }} />
        )}

        {/* The line draws itself: pathLength=1 keeps the dash maths unit-free */}
        {present.length > 1 && (
          <path
            d={path}
            fill="none"
            stroke={SERIES.accurate.color}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={1}
            style={{ strokeDashoffset: mounted ? 0 : 1, transition: 'stroke-dashoffset 1100ms cubic-bezier(.4,0,.2,1)' }}
          />
        )}

        {/* Hover crosshair */}
        {hover != null && points[hover].value != null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD_T} y2={y(lo)} stroke="#9ca3af" strokeWidth={1} strokeDasharray="3 3" />
        )}

        {/* Points + direct labels (label sits below the point when it is near the top) */}
        {present.map((p, j) => {
          const isBest = highlight === p.key
          const isSel = selected === p.key
          const isHover = hover === p.i
          const color = isBest ? '#15803d' : SERIES.accurate.color
          const labelAbove = y(p.value) - PAD_T > 18
          return (
            <g key={p.key} style={{ opacity: mounted ? 1 : 0, transition: `opacity 300ms ease ${400 + j * 150}ms` }}>
              {(isSel || isHover) && <circle cx={x(p.i)} cy={y(p.value)} r={12} fill={isSel ? '#E8431A' : color} opacity={0.15} />}
              <circle cx={x(p.i)} cy={y(p.value)} r={isHover ? 6.5 : 5} fill={color} stroke="#fff" strokeWidth={2} style={{ transition: 'r 120ms' }} />
              <text
                x={x(p.i)}
                y={labelAbove ? y(p.value) - 13 : y(p.value) + 20}
                textAnchor="middle"
                fontSize={11.5}
                fontWeight={600}
                fill={isBest ? '#15803d' : '#374151'}
              >
                {fmtPct(p.value)}
              </text>
            </g>
          )
        })}

        {/* X labels */}
        {points.map((p, i) => (
          <text key={p.key} x={x(i)} y={H - 12} textAnchor="middle" fontSize={11} fontWeight={highlight === p.key || selected === p.key ? 600 : 400} fill={highlight === p.key ? '#15803d' : selected === p.key ? '#E8431A' : '#6b7280'}>
            {p.label}
          </text>
        ))}

        {/* Wide hit targets, one per month */}
        {points.map((p, i) => {
          const half = n > 1 ? plotW / (n - 1) / 2 : plotW / 2
          return (
            <rect key={p.key} x={x(i) - half} y={0} width={half * 2} height={H} fill="transparent" onMouseEnter={() => setHover(i)} style={{ cursor: onSelect ? 'pointer' : 'default' }} />
          )
        })}
      </svg>

      {hovered && (
        <div
          className="absolute top-2 z-10 rounded-lg border border-gray-200 bg-white shadow-lg px-3 py-2 text-[11px] leading-5 pointer-events-none animate-[scale-in_120ms_ease-out] whitespace-nowrap"
          style={{ width: TIP_W, left: Math.min(Math.max(0, x(hover!) - TIP_W / 2), Math.max(0, W - TIP_W)) }}
        >
          <div className="flex justify-between font-semibold text-gray-900 mb-1">
            <span>{hovered.label}</span>
            <span className="tabular-nums">{fmtPct(hovered.value)}</span>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-x-3 text-gray-600">
            {hovered.rows?.map(([k, v]) => (
              <Fragment key={k}>
                <span>{k}</span>
                <span className="tabular-nums font-medium text-gray-900 text-right">{v}</span>
              </Fragment>
            ))}
            {hover! > 0 && points[hover! - 1].value != null && hovered.value != null && (
              <>
                <span>vs {points[hover! - 1].label}</span>
                <span className="text-right"><Delta current={hovered.value} previous={points[hover! - 1].value} unit=" pts" decimals={1} best="high" /></span>
              </>
            )}
          </div>
        </div>
      )}
      {zoomed && (
        <p className="text-[10px] text-gray-400 text-right mt-1">Axis zoomed to {lo}–{hi}% so small changes stay visible.</p>
      )}
    </div>
  )
}

function Definitions() {
  const rows = [
    ['Total tagged calls', 'Calls tagged for the month (the "of N" in the report).'],
    ['Not audited by AI', 'Calls the AI did not audit at all, so a team member audited them by hand.'],
    ['AI-audited calls', 'Total tagged calls minus the calls not audited by AI — the calls the AI is judged on.'],
    ['Wrong tagged by AI', 'Calls the AI tagged incorrectly and a team member re-tagged.'],
    ['Wrong-tag rate', 'Wrong tagged by AI ÷ AI-audited calls.'],
    ['AI accuracy', '100% minus the wrong-tag rate.'],
    ['Manually audited', 'Calls a team member reviewed by hand — the wrong-tagged and not-audited calls together.'],
    ['Best', 'The strongest month in that row: highest for accuracy and scheduled patients, lowest for errors and missed calls.'],
  ]
  return (
    <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <dt className="font-medium text-gray-900 shrink-0 w-40">{k}</dt>
          <dd className="text-gray-600">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

// ── Main component ───────────────────────────────────────────────────────────
export function ComparisonClient({
  records, initialView, initialCompany, initialPeriod, preparedAt,
}: Props) {
  const router = useRouter()

  const periods = useMemo(
    () => Array.from(new Set(records.map((r) => r.period))).sort(),
    [records]
  )
  const companies = useMemo(() => {
    const map = new Map<string, { id: string; name: string; periods: string[] }>()
    for (const r of records) {
      const c = map.get(r.company_id) ?? { id: r.company_id, name: r.company_name, periods: [] }
      c.name = r.company_name
      c.periods.push(r.period)
      map.set(r.company_id, c)
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [records])

  const latest = periods[periods.length - 1] ?? ''
  const [view, setView] = useState<View>(initialView)
  const [period, setPeriod] = useState<string>(
    initialPeriod && periods.includes(initialPeriod) ? initialPeriod : latest
  )
  const [companyId, setCompanyId] = useState<string>(
    initialCompany && companies.some((c) => c.id === initialCompany)
      ? initialCompany
      : (companies[0]?.id ?? '')
  )

  // Keep the URL shareable: the owner can be sent a link straight to a view.
  useEffect(() => {
    const q = new URLSearchParams()
    q.set('view', view)
    if (view === 'monthly') q.set('month', period)
    else if (companyId) q.set('company', companyId)
    router.replace(`/dashboard/comparison?${q.toString()}`, { scroll: false })
  }, [view, period, companyId, router])

  const company = companies.find((c) => c.id === companyId) ?? null

  if (records.length === 0) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">AI Audit Comparison</h1>
        <div className="mt-8 rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
          No monthly reports found yet. Generate reports on the Summary page and they will appear here.
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 print:p-0">
      {/* ── Print header (owner-facing) ── */}
      <div className="hidden print:flex items-center justify-between border-b border-gray-300 pb-4 mb-6">
        <div className="flex items-center gap-4">
          <Image src="/logo.png" alt="Firegang" width={120} height={36} />
          <div>
            <p className="text-lg font-bold text-gray-900">AI Call Audit — Accuracy Report</p>
            <p className="text-xs text-gray-500">
              {view === 'monthly'
                ? `All practices · ${periods.map(periodLabel).join(' · ')}`
                : `${company?.name ?? ''} · ${company ? company.periods.map(periodLabel).join(' · ') : ''}`}
            </p>
          </div>
        </div>
        <p className="text-xs text-gray-500">Prepared {preparedAt}</p>
      </div>

      {/* ── Screen header ── */}
      <div className="mb-6 sm:mb-8 flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">AI Audit Comparison</h1>
          <p className="text-gray-500 mt-1 text-sm">
            How the AI audit performed against the manual audit — month over month, or practice by practice.
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-[#E8431A] text-white text-sm font-medium hover:bg-[#D03A14] shadow-sm shadow-[#E8431A]/20 transition-colors"
        >
          <Printer className="w-4 h-4" /> Print / Save as PDF
        </button>
      </div>

      {/* ── View switch ── */}
      <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 mb-6 print:hidden">
        {([
          { key: 'monthly',  label: 'Monthly overview',    icon: CalendarDays },
          { key: 'practice', label: 'Practice comparison', icon: Building2 },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            className={cn(
              'inline-flex items-center gap-2 px-3.5 h-8 rounded-md text-sm font-medium transition-all',
              view === t.key ? 'bg-[#E8431A] text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            )}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {view === 'monthly' ? (
        <MonthlyView
          records={records}
          periods={periods}
          period={period}
          onPeriod={setPeriod}
          onOpenPractice={(id) => { setCompanyId(id); setView('practice') }}
        />
      ) : (
        <PracticeView
          records={records}
          companies={companies}
          companyId={companyId}
          onCompany={setCompanyId}
        />
      )}

      {/* ── Definitions + sign-off (print only) ── */}
      <div className="hidden print:block mt-10 text-xs text-gray-600 break-inside-avoid">
        <Definitions />
        <div className="grid grid-cols-2 gap-10 mt-10">
          {['Prepared by (Firegang Dental Marketing)', 'Acknowledged by (Practice owner)'].map((who) => (
            <div key={who}>
              <p className="font-semibold text-gray-900 mb-6">{who}</p>
              <p className="border-b border-gray-400 pb-1 mb-4">Name:</p>
              <p className="border-b border-gray-400 pb-1 mb-4">Signature:</p>
              <p className="border-b border-gray-400 pb-1">Date:</p>
            </div>
          ))}
        </div>
      </div>

      <details className="mt-8 print:hidden rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
        <summary className="inline-flex items-center gap-2 font-medium text-gray-800 select-none">
          <Info className="w-4 h-4 text-gray-400" /> How to read these figures
        </summary>
        <div className="mt-3"><Definitions /></div>
      </details>
    </div>
  )
}

// ── Monthly overview ─────────────────────────────────────────────────────────
// One column per month, all practices rolled up. The practice-level breakdown
// for a chosen month sits underneath as the drill-down.
type SortKey = 'name' | 'tagged' | 'audited' | 'accuracy' | 'wrong' | 'notAudited' | 'manual' | 'delta'

function MonthlyView({
  records, periods, period, onPeriod, onOpenPractice,
}: {
  records: ReportRecord[]
  periods: string[]
  period: string
  onPeriod: (p: string) => void
  onOpenPractice: (companyId: string) => void
}) {
  const byPeriod = useMemo(
    () => periods.map((p) => records.filter((r) => r.period === p)),
    [records, periods]
  )
  const totals = useMemo(() => byPeriod.map(aggregateMetrics), [byPeriod])
  const columns = periods.map((p, i) => ({
    key: p,
    label: periodLabel(p),
    sublabel: `${byPeriod[i].length} practice${byPeriod[i].length === 1 ? '' : 's'}`,
  }))

  const incomplete = byPeriod.map((rs) => rs.filter((r) => !hasFullAiBreakdown(r.metrics)).length)
  const totalIncomplete = incomplete.reduce((a, b) => a + b, 0)

  const bars: BarRow[] = totals.map((t, i) => ({
    key: periods[i],
    label: periodShort(periods[i]),
    accurate: t.ai_accurate ?? 0,
    wrong: t.wrong_tagged_by_ai ?? 0,
    notAudited: t.not_audited_by_ai ?? 0,
    accuracy: accuracyPct(t),
  }))
  const bestAcc = bestIndexes(totals.map(accuracyPct), 'high')
  const bestPeriod = bestAcc.size ? periods[Math.max(...bestAcc)] : undefined

  return (
    <div className="space-y-6">
      <BestMonthCallout columns={columns} metrics={totals} />

      {/* The comparison table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden break-inside-avoid">
        <div className="p-4 sm:p-6 pb-3 sm:pb-4">
          <SectionTitle
            title="Month-by-month comparison — all practices"
            subtitle="Each column adds up every practice report for that month. Months hold different numbers of reports, so the best month is judged on the percentage rows; the counts are shown for reference."
          />
        </div>
        <ComparisonMatrix
          columns={columns}
          metrics={totals}
          ratesOnly
          topRows={[
            { label: 'Practice reports included', values: byPeriod.map((rs) => rs.length) },
            ...(totalIncomplete > 0
              ? [{ label: 'Reports missing the wrong / not-audited split', values: incomplete.map((n) => (n ? n : '0')) }]
              : []),
          ]}
        />
        {totalIncomplete > 0 && (
          <p className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border-t border-amber-200 px-4 py-2.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              Some reports leave the “Wrong tagged” / “Not audited” lines blank or unfilled. Accuracy needs both, so those
              reports are left out of the accuracy rows (total tagged, not audited, AI-audited, wrong tagged, rates) for that month.
            </span>
          </p>
        )}
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm break-inside-avoid">
          <SectionTitle title="Accuracy trend" subtitle="All practices combined. Hover for details; click a month to open its practice breakdown below." />
          <AccuracyLine
            points={totals.map((t, i) => ({
              key: periods[i], label: periodShort(periods[i]), value: accuracyPct(t),
              rows: [
                ['AI-audited calls', fmt(aiAuditedCalls(t))],
                ['Wrong tagged', fmt(t.wrong_tagged_by_ai)],
                ['Practices', String(byPeriod[i].length)],
              ],
            }))}
            highlight={bestPeriod}
            selected={period}
            onSelect={onPeriod}
          />
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm break-inside-avoid">
          <SectionTitle title="Tagged calls by outcome" subtitle="Toggle a series in the legend, or switch to % to compare months of different size." />
          <StackedBars rows={bars} highlight={bestPeriod} selected={period} onSelect={onPeriod} />
        </div>
      </div>

      <PracticeBreakdown
        records={records}
        periods={periods}
        period={period}
        onPeriod={onPeriod}
        onOpenPractice={onOpenPractice}
      />
    </div>
  )
}

/** Drill-down: every practice for one month, lowest accuracy first. */
function PracticeBreakdown({
  records, periods, period, onPeriod, onOpenPractice,
}: {
  records: ReportRecord[]
  periods: string[]
  period: string
  onPeriod: (p: string) => void
  onOpenPractice: (companyId: string) => void
}) {
  const idx = periods.indexOf(period)
  const compare = idx > 0 ? periods[idx - 1] : null
  const current  = useMemo(() => records.filter((r) => r.period === period), [records, period])
  const previous = useMemo(() => (compare ? records.filter((r) => r.period === compare) : []), [records, compare])
  const prevByCompany = useMemo(() => new Map(previous.map((r) => [r.company_id, r])), [previous])

  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'accuracy', dir: 'asc' })

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return current
      .filter((r) => !q || r.company_name.toLowerCase().includes(q))
      .map((r) => {
        const m = r.metrics
        const p = prevByCompany.get(r.company_id)?.metrics
        const accuracy = accuracyPct(m)
        const prevAccuracy = p ? accuracyPct(p) : null
        return {
          id: r.company_id,
          name: r.company_name,
          tagged: m.ai_total,
          audited: aiAuditedCalls(m),
          accuracy,
          wrong: m.wrong_tagged_by_ai,
          notAudited: m.not_audited_by_ai,
          manual: m.manually_audited,
          prevAccuracy,
          delta: accuracy != null && prevAccuracy != null ? accuracy - prevAccuracy : null,
          incomplete: !hasFullAiBreakdown(m),
          inconsistent: !isConsistent(m),
        }
      })
      .sort((a, b) => {
        const dir = sort.dir === 'asc' ? 1 : -1
        if (sort.key === 'name') return a.name.localeCompare(b.name) * dir
        const av = a[sort.key], bv = b[sort.key]
        if (av == null && bv == null) return 0
        if (av == null) return 1   // unreported always sinks to the bottom
        if (bv == null) return -1
        return (av - bv) * dir || a.name.localeCompare(b.name)
      })
  }, [current, prevByCompany, query, sort])

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }))

  const total = aggregateMetrics(current)
  const prevTotal = compare ? aggregateMetrics(previous) : null

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="p-4 sm:p-6 pb-3 sm:pb-4">
        <SectionTitle
          title="Practice breakdown"
          subtitle="One month at a time, lowest accuracy first so the practices needing attention are on top. Click a practice for its own history."
        >
          <div className="flex flex-wrap items-end gap-3 print:hidden">
            <label className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search practices…"
                className="h-10 pl-9 pr-3 rounded-lg border border-gray-200 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-[#E8431A]/40 focus:border-[#E8431A]"
              />
            </label>
            <SelectField
              label=""
              value={period}
              onChange={onPeriod}
              options={[...periods].reverse().map((p) => ({ value: p, label: periodLabel(p) }))}
              icon={CalendarDays}
            />
          </div>
        </SectionTitle>
        <p className="hidden print:block text-sm font-medium text-gray-800">{periodLabel(period)}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500">
            <tr>
              {([
                ['name', 'Practice', 'text-left'],
                ['tagged', 'Tagged calls', 'text-right'],
                ['notAudited', 'Not audited', 'text-right'],
                ['audited', 'AI-audited', 'text-right'],
                ['wrong', 'Wrong tagged', 'text-right'],
                ['accuracy', 'AI accuracy', 'text-right'],
                ['manual', 'Manual', 'text-right'],
                ['delta', compare ? `vs ${periodShort(compare)}` : 'Change', 'text-right'],
              ] as [SortKey, string, string][]).map(([key, label, align]) => (
                <th key={key} className={cn('px-4 py-2.5 font-medium whitespace-nowrap', align)}>
                  <button
                    onClick={() => toggleSort(key)}
                    className={cn('inline-flex items-center gap-1 hover:text-gray-900', sort.key === key && 'text-gray-900')}
                  >
                    {label}
                    {sort.key === key
                      ? (sort.dir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)
                      : <ArrowUpDown className="w-3 h-3 opacity-40 print:hidden" />}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No practices match.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} onClick={() => onOpenPractice(r.id)} className="hover:bg-orange-50/40 cursor-pointer transition-colors">
                <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    {r.name}
                    {r.incomplete && (
                      <span title="Full AI breakdown not reported for this month" className="text-amber-500"><AlertTriangle className="w-3.5 h-3.5" /></span>
                    )}
                    {r.inconsistent && (
                      <span title="Reported figures do not add up to the total — check the source report" className="text-amber-500"><AlertTriangle className="w-3.5 h-3.5" /></span>
                    )}
                    <ChevronRight className="w-3.5 h-3.5 text-gray-300 print:hidden" />
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{fmt(r.tagged)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{fmt(r.notAudited)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{fmt(r.audited)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{fmt(r.wrong)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums"><AccuracyCell value={r.accuracy} /></td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{fmt(r.manual)}</td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  {compare ? <Delta current={r.accuracy} previous={r.prevAccuracy} unit=" pts" decimals={1} best="high" /> : <span className="text-xs text-gray-400">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 font-semibold text-gray-900 border-t border-gray-200">
            <tr>
              <td className="px-4 py-2.5">All practices ({current.length})</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{fmt(total.ai_total)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{fmt(total.not_audited_by_ai)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{fmt(aiAuditedCalls(total))}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{fmt(total.wrong_tagged_by_ai)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{fmtPct(accuracyPct(total))}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{fmt(total.manually_audited)}</td>
              <td className="px-4 py-2.5 text-right">
                {prevTotal ? <Delta current={accuracyPct(total)} previous={accuracyPct(prevTotal)} unit=" pts" decimals={1} best="high" /> : null}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

/** Accuracy with a small inline bar so the column scans at a glance. */
function AccuracyCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-gray-400">—</span>
  return (
    <span className="inline-flex items-center gap-2 justify-end">
      <span className="w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden hidden sm:block">
        <span className="block h-full rounded-full" style={{ width: `${value}%`, background: SERIES.accurate.color }} />
      </span>
      <span className="font-medium text-gray-900 w-12 text-right">{fmtPct(value)}</span>
    </span>
  )
}

// ── Practice comparison ──────────────────────────────────────────────────────
function PracticeView({
  records, companies, companyId, onCompany,
}: {
  records: ReportRecord[]
  companies: { id: string; name: string; periods: string[] }[]
  companyId: string
  onCompany: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? companies.filter((c) => c.name.toLowerCase().includes(q)) : companies
  }, [companies, query])

  const history = useMemo(
    () => records.filter((r) => r.company_id === companyId).sort((a, b) => a.period.localeCompare(b.period)),
    [records, companyId]
  )
  const company = companies.find((c) => c.id === companyId)

  const columns = history.map((r) => ({ key: r.period, label: periodLabel(r.period) }))
  const metrics = history.map((r) => r.metrics)
  const bars: BarRow[] = history.map((r) => ({
    key: r.period,
    label: periodShort(r.period),
    accurate: r.metrics.ai_accurate ?? 0,
    wrong: r.metrics.wrong_tagged_by_ai ?? 0,
    notAudited: r.metrics.not_audited_by_ai ?? 0,
    accuracy: accuracyPct(r.metrics),
  }))
  const bestAcc = bestIndexes(metrics.map(accuracyPct), 'high')
  const bestPeriod = bestAcc.size ? history[Math.max(...bestAcc)].period : undefined

  return (
    <div className="space-y-6">
      {/* Practice picker */}
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          Find a practice
          <span className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to filter…"
              className="h-10 pl-9 pr-3 rounded-lg border border-gray-200 text-sm font-normal w-56 focus:outline-none focus:ring-2 focus:ring-[#E8431A]/40 focus:border-[#E8431A]"
            />
          </span>
        </label>
        <SelectField
          label={`Practice (${filtered.length})`}
          value={filtered.some((c) => c.id === companyId) ? companyId : ''}
          onChange={onCompany}
          icon={Building2}
          options={[
            ...(filtered.some((c) => c.id === companyId) ? [] : [{ value: '', label: 'Select a practice…' }]),
            ...filtered.map((c) => ({ value: c.id, label: `${c.name} (${c.periods.length} mo)` })),
          ]}
        />
      </div>

      {!company || history.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
          Select a practice to see its month-by-month record.
        </div>
      ) : (
        <>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{company.name}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {history.length} month{history.length === 1 ? '' : 's'} on record · {history.map((r) => periodLabel(r.period)).join(' · ')}
            </p>
          </div>

          <BestMonthCallout columns={columns} metrics={metrics} />

          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden break-inside-avoid">
            <div className="p-4 sm:p-6 pb-3 sm:pb-4">
              <SectionTitle
                title={`Month-by-month comparison — ${company.name}`}
                subtitle={history.length > 1 ? 'The best month in each row is marked. The change column compares the two most recent months.' : 'Only one month on record so far.'}
              />
            </div>
            <ComparisonMatrix
              columns={columns}
              metrics={metrics}
              footerRows={[{ label: 'Audited by', values: history.map((r) => r.metrics.auditor) }]}
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-6" key={company.id}>
            <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm break-inside-avoid">
              <SectionTitle title="Accuracy trend" subtitle="Hover a month for details." />
              <AccuracyLine
                points={history.map((r) => ({
                  key: r.period, label: periodShort(r.period), value: accuracyPct(r.metrics),
                  rows: [
                    ['AI-audited calls', fmt(aiAuditedCalls(r.metrics))],
                    ['Wrong tagged', fmt(r.metrics.wrong_tagged_by_ai)],
                  ],
                }))}
                highlight={bestPeriod}
              />
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm break-inside-avoid">
              <SectionTitle title="Tagged calls by outcome" subtitle="Toggle a series in the legend, or switch to % to compare months of different size." />
              <StackedBars rows={bars} highlight={bestPeriod} />
            </div>
          </div>

          {history.some((r) => r.metrics.np_not_scheduled_reasons.length > 0) && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm break-inside-avoid">
              <SectionTitle title="Why new patients were not scheduled" subtitle="As noted by the auditor in each monthly report." />
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {history.map((r) => (
                  <div key={r.period} className="rounded-lg border border-gray-100 bg-gray-50/50 p-4">
                    <p className="text-sm font-semibold text-gray-900 mb-2">
                      {periodLabel(r.period)}
                      <span className="ml-2 text-xs font-normal text-gray-500">{fmt(r.metrics.np_not_scheduled)} not scheduled</span>
                    </p>
                    {r.metrics.np_not_scheduled_reasons.length === 0 ? (
                      <p className="text-xs text-gray-400">No reasons recorded.</p>
                    ) : (
                      <ul className="space-y-1.5 text-xs text-gray-700 list-disc pl-4">
                        {r.metrics.np_not_scheduled_reasons.map((reason, i) => <li key={i}>{reason}</li>)}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
