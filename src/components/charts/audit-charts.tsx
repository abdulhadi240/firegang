'use client'

// Shared audit charts: the accuracy line and the stacked calls-by-outcome bars
// used on the dashboard home and the Comparison page. Both animate in on
// mount, follow the mouse with a tooltip, and can hand a clicked month back to
// the page. Colours, number formatting and the Delta chip live here too so
// every page reads the same numbers the same way.

import { Fragment, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { ArrowUpRight, ArrowDownRight, Minus, Trophy } from 'lucide-react'

// ── Series colours ───────────────────────────────────────────────────────────
// Validated with the dataviz palette checker: blue ↔ brand orange clear the
// colour-vision separation floor; the "not audited" grey is a deliberate
// neutral (no AI judgement was made) and always ships with a legend + labels.
export const SERIES = {
  accurate:   { color: '#1d4ed8', label: 'AI accurate' },
  wrong:      { color: '#E8431A', label: 'Wrong tagged by AI' },
  notAudited: { color: '#8a8580', label: 'Not audited by AI' },
} as const

// ── Formatting ───────────────────────────────────────────────────────────────
export const fmt = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('en-US'))
export const fmtPct = (n: number | null | undefined) => (n == null ? '—' : `${n.toFixed(1)}%`)

export function pct(part: number | null, whole: number | null): number | null {
  if (part == null || !whole) return null
  return Math.round((part / whole) * 1000) / 10
}

// ── Small UI pieces ──────────────────────────────────────────────────────────

/**
 * Change between two values. `lowerIsBetter` flips the colouring for metrics
 * like wrong tags, where a drop is the good news; neutral metrics stay grey.
 */
export function Delta({
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

// ── Charts ───────────────────────────────────────────────────────────────────
// Both charts animate in on mount (bars grow from the baseline, the line draws
// itself) and answer to the mouse: hover for a tooltip, click a month to select
// it, click a legend entry to hide that series. Remount (via `key`) to replay.

/** True one frame after mount, so CSS transitions run from the empty state. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])
  return mounted
}

export interface BarRow {
  key: string
  label: string
  accurate: number
  wrong: number
  notAudited: number
  accuracy: number | null
  caption?: string
}

export type SeriesKey = keyof typeof SERIES
export const SERIES_ORDER: SeriesKey[] = ['accurate', 'wrong', 'notAudited']

export function StackedBars({
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
export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
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
export function niceDomain(values: number[]): { lo: number; hi: number; ticks: number[] } {
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
export function AccuracyLine({
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
