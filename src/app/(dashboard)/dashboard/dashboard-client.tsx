'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { AuditOverview, MonthPoint, PracticeMove, Trend } from '@/lib/audit-overview'
import {
  SERIES, fmt, fmtPct, Delta, BarRow, StackedBars, AccuracyLine,
} from '@/components/charts/audit-charts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  PhoneCall, ShieldCheck, TriangleAlert, TrendingUp, TrendingDown, MoveRight,
  ArrowRight, Building2, PieChart, GitCompareArrows, FileClock, Send, Sparkles,
  ArrowUpRight, ArrowDownRight, ClipboardCheck,
} from 'lucide-react'

interface Queue {
  pendingReview: number
  approvedNotPublished: number
  published: number
  generating: number
}

interface Props {
  overview: AuditOverview
  activeCompanies: number
  queue: Queue
}

// ── Trend wording ────────────────────────────────────────────────────────────
const TREND: Record<Trend, { label: string; tone: string; chip: string; Icon: typeof TrendingUp }> = {
  improving: { label: 'Improving', tone: 'text-green-700', chip: 'bg-green-50 border-green-200 text-green-700', Icon: TrendingUp },
  declining: { label: 'Declining', tone: 'text-red-600',   chip: 'bg-red-50 border-red-200 text-red-600',       Icon: TrendingDown },
  flat:      { label: 'Holding steady', tone: 'text-gray-600', chip: 'bg-gray-50 border-gray-200 text-gray-600', Icon: MoveRight },
  unknown:   { label: 'Not enough data', tone: 'text-gray-500', chip: 'bg-gray-50 border-gray-200 text-gray-500', Icon: MoveRight },
}

function greeting(): string {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

// ── Hero tiles ───────────────────────────────────────────────────────────────
function StatTile({
  label, value, sub, icon: Icon, color, bg, border, foot,
}: {
  label: string
  value: string
  sub?: React.ReactNode
  icon: typeof PhoneCall
  color: string
  bg: string
  border: string
  foot?: React.ReactNode
}) {
  return (
    <Card className="animate-[fade-in-up_400ms_ease-out_both]">
      <CardContent className="p-4 lg:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs sm:text-sm text-gray-500 leading-tight">{label}</p>
            <p className="text-2xl lg:text-3xl font-bold text-gray-900 mt-1 tabular-nums">{value}</p>
            {sub && <p className="text-xs text-gray-500 mt-1 leading-snug">{sub}</p>}
          </div>
          <div className={cn('w-9 h-9 rounded-xl border flex items-center justify-center shrink-0', bg, border)}>
            <Icon className={cn('w-4 h-4', color)} />
          </div>
        </div>
        {foot && <div className="mt-3 pt-3 border-t border-gray-100">{foot}</div>}
      </CardContent>
    </Card>
  )
}

/** Share of AI-audited calls that were correct, as a thin bar. */
function AccuracyBar({ value }: { value: number | null }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-1000 ease-out"
          style={{ width: `${value ?? 0}%`, background: SERIES.accurate.color }}
        />
      </div>
      <span className="text-xs font-semibold text-gray-900 tabular-nums w-12 text-right">{fmtPct(value)}</span>
    </div>
  )
}

// ── Month list (sits next to the accuracy line) ──────────────────────────────
function MonthList({ months, bestPeriod, onSelect }: { months: MonthPoint[]; bestPeriod: string | null; onSelect: (p: string) => void }) {
  const rows = [...months].reverse()
  return (
    <ul className="divide-y divide-gray-100">
      {rows.map((m, i) => {
        const prev = rows[i + 1]
        return (
          <li key={m.period}>
            <button
              onClick={() => onSelect(m.period)}
              className="w-full text-left px-4 sm:px-5 py-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <span className={cn('text-sm font-medium', m.period === bestPeriod ? 'text-green-700' : 'text-gray-900')}>
                  {m.longLabel}
                  {m.period === bestPeriod && <span className="ml-2 text-[10px] uppercase tracking-wide text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">Best</span>}
                </span>
                <span className="text-sm font-semibold tabular-nums text-gray-900">{fmtPct(m.accuracy)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 mt-1">
                <span className="text-[11px] text-gray-500 tabular-nums">
                  {fmt(m.totalCalls)} calls · {m.practices} practices
                </span>
                {prev
                  ? <Delta current={m.accuracy} previous={prev.accuracy} unit=" pts" decimals={1} best="high" />
                  : <span className="text-[11px] text-gray-400">first month</span>}
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// ── Practice movers ──────────────────────────────────────────────────────────
function MoverList({ items, empty }: { items: PracticeMove[]; empty: string }) {
  if (items.length === 0) return <p className="px-4 sm:px-5 py-4 text-xs text-gray-400">{empty}</p>
  return (
    <ul className="divide-y divide-gray-100">
      {items.map((p) => {
        const up = p.delta > 0
        const Icon = up ? ArrowUpRight : ArrowDownRight
        return (
          <li key={p.company_id}>
            <Link
              href={`/dashboard/comparison?view=practice&company=${encodeURIComponent(p.company_id)}`}
              className="flex items-center justify-between gap-3 px-4 sm:px-5 py-2.5 hover:bg-gray-50 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{p.company_name}</p>
                <p className="text-[11px] text-gray-500 tabular-nums">{fmtPct(p.previous)} → {fmtPct(p.current)} · {fmt(p.calls)} calls</p>
              </div>
              <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums shrink-0', up ? 'text-green-700' : 'text-red-600')}>
                <Icon className="w-3.5 h-3.5" />{up ? '+' : '−'}{Math.abs(p.delta).toFixed(1)} pts
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export function DashboardClient({ overview, activeCompanies, queue }: Props) {
  const router = useRouter()
  const { months, latest, previous, totals, trend, improved, slipped, attention } = overview
  const t = TREND[trend.direction]
  const TrendIcon = t.Icon

  const goToMonth = (period: string) => router.push(`/dashboard/comparison?month=${period}`)

  const linePoints = months.map((m) => ({
    key: m.period,
    label: m.label,
    value: m.accuracy,
    rows: [
      ['Calls audited', fmt(m.totalCalls)],
      ['AI accurate', fmt(m.accurate)],
      ['Wrong tagged', fmt(m.wrong)],
      ['Practices', String(m.practices)],
    ] as [string, string][],
  }))

  const bars: BarRow[] = months.map((m) => ({
    key: m.period,
    label: m.label,
    accurate: m.accurate,
    wrong: m.wrong,
    notAudited: m.notAudited,
    accuracy: m.accuracy,
    caption: `${m.practices} practices`,
  }))

  const span = months.length
    ? months.length === 1 ? months[0].longLabel : `${months[0].longLabel} – ${months[months.length - 1].longLabel}`
    : null

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 lg:mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{greeting()}, Admin 👋</h1>
          <p className="text-gray-500 mt-1 text-sm">
            {span
              ? <>AI call-audit performance across {totals.practices} practices, {span}.</>
              : <>Here&apos;s your call audit overview.</>}
          </p>
        </div>
        {latest && (
          <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold', t.chip)}>
            <TrendIcon className="w-3.5 h-3.5" />
            {t.label}
            {trend.delta != null && <span className="tabular-nums font-medium opacity-80">· {trend.delta > 0 ? '+' : ''}{trend.delta.toFixed(1)} pts vs {previous?.label}</span>}
          </span>
        )}
      </div>

      {months.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center text-gray-400">
            <ClipboardCheck className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No monthly reports yet. Generate one from the Summary page and the trend will appear here.</p>
            <Link href="/dashboard/summary" className="inline-flex items-center gap-1.5 mt-4 text-sm font-medium text-[#E8431A] hover:underline">
              Go to Summary <ArrowRight className="w-4 h-4" />
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Hero tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6 lg:mb-8">
            <StatTile
              label="Total calls audited"
              value={fmt(totals.totalCalls)}
              sub={latest && <>{fmt(latest.totalCalls)} in {latest.longLabel} · {fmt(totals.reports)} reports</>}
              icon={PhoneCall} color="text-blue-700" bg="bg-blue-50" border="border-blue-100"
            />
            <StatTile
              label="AI tagged correctly"
              value={fmt(totals.accurate)}
              sub={<>of {fmt(totals.aiAudited)} calls the AI audited</>}
              icon={ShieldCheck} color="text-green-600" bg="bg-green-50" border="border-green-100"
              foot={<AccuracyBar value={totals.accuracy} />}
            />
            <StatTile
              label="Wrong tagged by AI"
              value={fmt(totals.wrong)}
              sub={latest && <>{fmt(latest.wrong)} in {latest.longLabel} · {fmtPct(latest.wrongRate)} wrong-tag rate</>}
              icon={TriangleAlert} color="text-[#E8431A]" bg="bg-orange-50" border="border-orange-100"
            />
            <StatTile
              label={latest ? `Accuracy · ${latest.longLabel}` : 'Accuracy'}
              value={fmtPct(latest?.accuracy)}
              sub={
                trend.sinceStart != null
                  ? <span className={cn('font-medium', trend.sinceStart > 0 ? 'text-green-700' : trend.sinceStart < 0 ? 'text-red-600' : 'text-gray-600')}>
                      {trend.sinceStart > 0 ? '+' : ''}{trend.sinceStart.toFixed(1)} pts since {months[0].label}
                    </span>
                  : 'First reported month'
              }
              icon={TrendIcon} color={t.tone} bg={trend.direction === 'improving' ? 'bg-green-50' : trend.direction === 'declining' ? 'bg-red-50' : 'bg-gray-50'} border={trend.direction === 'improving' ? 'border-green-100' : trend.direction === 'declining' ? 'border-red-100' : 'border-gray-200'}
              foot={
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>vs {previous ? previous.longLabel : 'previous'}</span>
                  <Delta current={latest?.accuracy ?? null} previous={previous?.accuracy ?? null} unit=" pts" decimals={1} best="high" />
                </div>
              }
            />
          </div>

          {/* Accuracy trend */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 mb-6 lg:mb-8">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2 px-4 sm:px-6">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">AI accuracy by month</CardTitle>
                    <p className="text-xs text-gray-500 mt-0.5">100% minus the wrong-tag rate, across all practices reporting a full AI breakdown. Click a month to open it in Comparison.</p>
                  </div>
                  <Link href="/dashboard/comparison" className="text-xs font-medium text-[#E8431A] hover:underline inline-flex items-center gap-1">
                    Full comparison <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="px-4 sm:px-6 pb-4">
                <AccuracyLine points={linePoints} highlight={trend.bestPeriod ?? undefined} onSelect={goToMonth} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 px-4 sm:px-5">
                <CardTitle className="text-base">Month by month</CardTitle>
                <p className="text-xs text-gray-500 mt-0.5">Newest first, with the change from the month before.</p>
              </CardHeader>
              <CardContent className="p-0">
                <MonthList months={months} bestPeriod={trend.bestPeriod} onSelect={goToMonth} />
              </CardContent>
            </Card>
          </div>

          {/* Volume by outcome + movers */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 mb-6 lg:mb-8">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2 px-4 sm:px-6">
                <CardTitle className="text-base">Calls audited, by outcome</CardTitle>
                <p className="text-xs text-gray-500 mt-0.5">Every tagged call is either AI-accurate, wrong-tagged by the AI, or skipped by the AI and audited by hand.</p>
              </CardHeader>
              <CardContent className="px-4 sm:px-6 pb-4">
                <StackedBars rows={bars} highlight={trend.bestPeriod ?? undefined} onSelect={goToMonth} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 px-4 sm:px-5">
                <CardTitle className="text-base">Biggest movers</CardTitle>
                <p className="text-xs text-gray-500 mt-0.5">
                  {previous && latest ? <>{previous.label} → {latest.label}, practices with 10+ calls.</> : 'Needs two reported months.'}
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <p className="px-4 sm:px-5 pt-2 pb-1 text-[10px] uppercase tracking-widest font-semibold text-green-700 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Improved</p>
                <MoverList items={improved} empty="No practice improved by a point or more." />
                <p className="px-4 sm:px-5 pt-3 pb-1 text-[10px] uppercase tracking-widest font-semibold text-red-600 flex items-center gap-1 border-t border-gray-100"><TrendingDown className="w-3 h-3" /> Slipped</p>
                <MoverList items={slipped} empty="No practice slipped by a point or more." />
              </CardContent>
            </Card>
          </div>

          {/* Attention + queue + quick links */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
            <Card>
              <CardHeader className="pb-2 px-4 sm:px-5">
                <CardTitle className="text-base">Lowest accuracy{latest ? ` · ${latest.label}` : ''}</CardTitle>
                <p className="text-xs text-gray-500 mt-0.5">Practices where the AI needs the most correcting.</p>
              </CardHeader>
              <CardContent className="p-0">
                {attention.length === 0 ? (
                  <p className="px-4 sm:px-5 py-4 text-xs text-gray-400">Nothing to flag.</p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {attention.map((p) => (
                      <li key={p.company_id}>
                        <Link
                          href={`/dashboard/comparison?view=practice&company=${encodeURIComponent(p.company_id)}`}
                          className="block px-4 sm:px-5 py-2.5 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium text-gray-900 truncate">{p.company_name}</p>
                            <span className="text-[11px] text-gray-500 tabular-nums shrink-0">{fmt(p.wrong)} wrong of {fmt(p.calls)}</span>
                          </div>
                          <div className="mt-1.5"><AccuracyBar value={p.accuracy} /></div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 px-4 sm:px-5">
                <CardTitle className="text-base">Report queue{latest ? ` · ${latest.label}` : ''}</CardTitle>
                <p className="text-xs text-gray-500 mt-0.5">Where this month&apos;s reports stand.</p>
              </CardHeader>
              <CardContent className="px-4 sm:px-5 pb-4 space-y-2">
                {[
                  { label: 'Awaiting your review', value: queue.pendingReview, Icon: FileClock, tone: queue.pendingReview ? 'text-amber-600 bg-amber-50 border-amber-100' : 'text-gray-400 bg-gray-50 border-gray-100' },
                  { label: 'Approved, not yet in Teamwork', value: queue.approvedNotPublished, Icon: Send, tone: queue.approvedNotPublished ? 'text-blue-700 bg-blue-50 border-blue-100' : 'text-gray-400 bg-gray-50 border-gray-100' },
                  { label: 'Published to Teamwork', value: queue.published, Icon: ClipboardCheck, tone: 'text-green-600 bg-green-50 border-green-100' },
                  { label: 'Still generating', value: queue.generating, Icon: Sparkles, tone: queue.generating ? 'text-purple-600 bg-purple-50 border-purple-100' : 'text-gray-400 bg-gray-50 border-gray-100' },
                ].map(({ label, value, Icon, tone }) => (
                  <div key={label} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={cn('w-7 h-7 rounded-lg border flex items-center justify-center shrink-0', tone)}><Icon className="w-3.5 h-3.5" /></span>
                      <span className="text-sm text-gray-700 truncate">{label}</span>
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-gray-900">{fmt(value)}</span>
                  </div>
                ))}
                {latest && (
                  <Link
                    href={`/dashboard/summary?month=${encodeURIComponent(latest.longLabel.split(' ')[0])}&year=${latest.period.slice(0, 4)}`}
                    className="flex items-center justify-center gap-1.5 mt-1 h-9 rounded-lg bg-[#E8431A] text-white text-sm font-medium hover:bg-[#D03A14] transition-colors"
                  >
                    Open {latest.longLabel} reports <ArrowRight className="w-4 h-4" />
                  </Link>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 px-4 sm:px-5">
                <CardTitle className="text-base">Quick actions</CardTitle>
                <p className="text-xs text-gray-500 mt-0.5">{fmt(activeCompanies)} active companies.</p>
              </CardHeader>
              <CardContent className="px-4 sm:px-5 pb-4 space-y-2">
                {[
                  { href: '/dashboard/companies', label: 'Browse companies', hint: 'Start an audit via n8n', Icon: Building2 },
                  { href: '/dashboard/summary', label: 'Summary reports', hint: 'Review, approve, publish', Icon: PieChart },
                  { href: '/dashboard/comparison', label: 'Comparison', hint: 'Month and practice deep-dive', Icon: GitCompareArrows },
                  { href: '/dashboard/ghl-calls', label: 'GHL calls', hint: 'Gillespie reconciliation', Icon: PhoneCall },
                ].map(({ href, label, hint, Icon }) => (
                  <Link key={href} href={href} className="group flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2 hover:border-orange-200 hover:bg-orange-50/40 transition-colors">
                    <span className="w-7 h-7 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0"><Icon className="w-3.5 h-3.5 text-[#E8431A]" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-gray-900">{label}</span>
                      <span className="block text-[11px] text-gray-500">{hint}</span>
                    </span>
                    <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-[#E8431A] transition-colors shrink-0" />
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
