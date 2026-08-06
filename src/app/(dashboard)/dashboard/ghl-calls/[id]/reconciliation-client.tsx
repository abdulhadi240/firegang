'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  GhlReconciliation,
  GhlReconciliationRow,
  ReconcileSummary,
  RowSource,
  ROW_SOURCE_LABELS,
  MERGED_COLUMNS,
  MATCH_COLUMNS,
  OUR_RECORDING_COLUMN,
  MISSED_CALL_COLUMN,
  MISSED_CALL_YES,
  isEligible,
  isMissedCall,
  isMissedCallExplicit,
} from '@/types'
import { cn } from '@/lib/utils'
import {
  Loader2, X, Check, AlertTriangle, ChevronLeft, Plus, Trash2, Link2, Send,
  Search, EyeOff, Eye, CheckCircle2, Pencil, PhoneMissed, FileSpreadsheet,
  ExternalLink,
} from 'lucide-react'

interface Props {
  practiceName: string
  reconciliation: GhlReconciliation
  initialRows: GhlReconciliationRow[]
}

// The grid shows the columns that matter for spotting a bad match; the rest of
// the record is a click away in the row editor.
const GRID_COLUMNS = [
  'Date & time',
  'Contact name',
  'Contact phone',
  'Duration',
  'Call status',
  'Direction',
] as const

type FilterKey = 'all' | 'ineligible' | 'eligible' | 'excluded'

// ── Eligibility badge ────────────────────────────────────────────────────────

function EligibilityPill({ row }: { row: GhlReconciliationRow }) {
  const missed = isMissedCall(row)
  if (missed) {
    return (
      <span
        className="text-[10px] px-1.5 py-0.5 rounded-full border font-medium whitespace-nowrap bg-purple-50 text-purple-600 border-purple-100 inline-flex items-center gap-1"
        title={
          isMissedCallExplicit(row)
            ? 'Marked as a missed call — eligible without a recording'
            : 'Matched call with no recording, so it was never picked up — eligible automatically'
        }
      >
        <PhoneMissed className="w-2.5 h-2.5" />
        Missed call
        {!isMissedCallExplicit(row) && <span className="opacity-60">auto</span>}
      </span>
    )
  }
  return isEligible(row) ? (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full border font-medium whitespace-nowrap bg-green-50 text-green-600 border-green-100">
      Eligible
    </span>
  ) : (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full border font-medium whitespace-nowrap bg-red-50 text-red-500 border-red-100">
      Ineligible
    </span>
  )
}

const SOURCE_STYLES: Record<RowSource, string> = {
  matched:    'bg-green-50 text-green-600 border-green-100',
  ghl_only:   'bg-amber-50 text-amber-600 border-amber-100',
  sheet_only: 'bg-blue-50 text-blue-600 border-blue-100',
  manual:     'bg-purple-50 text-purple-600 border-purple-100',
}

function SourcePill({ source }: { source: RowSource }) {
  return (
    <span className={cn(
      'text-[10px] px-1.5 py-0.5 rounded-full border font-medium whitespace-nowrap',
      SOURCE_STYLES[source]
    )}>
      {ROW_SOURCE_LABELS[source]}
    </span>
  )
}

// ── Row editor ───────────────────────────────────────────────────────────────

function RowEditor({
  row,
  onClose,
  onSave,
  saving,
}: {
  row: GhlReconciliationRow | 'new'
  onClose: () => void
  onSave: (data: Record<string, string>) => void
  saving: boolean
}) {
  const isNew = row === 'new'
  const [data, setData] = useState<Record<string, string>>(() => {
    const base: Record<string, string> = {}
    for (const col of MERGED_COLUMNS) {
      base[col] = isNew ? '' : (row.data[col] ?? '')
    }
    return base
  })

  const missedCall = data[MISSED_CALL_COLUMN]?.trim().toLowerCase() === MISSED_CALL_YES

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl flex flex-col max-h-[90vh] animate-scale-in">

        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <p className="font-semibold text-gray-900 text-sm">
              {isNew ? 'Add a missing call' : 'Edit call'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {isNew
                ? 'Enter the call details and its recording URL'
                : 'Correct any field, or paste in the missing recording URL'}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {/* Missed call comes first: setting it makes the recording URL optional. */}
          <button
            type="button"
            onClick={() =>
              setData((d) => ({
                ...d,
                [MISSED_CALL_COLUMN]: missedCall ? '' : MISSED_CALL_YES,
              }))
            }
            className={cn(
              'w-full flex items-start gap-3 p-3 mb-4 rounded-xl border text-left transition-colors',
              missedCall
                ? 'bg-purple-50 border-purple-200'
                : 'bg-white border-gray-200 hover:border-gray-300'
            )}
          >
            <span className={cn(
              'w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-px transition-colors',
              missedCall ? 'bg-purple-600 border-purple-600' : 'bg-white border-gray-300'
            )}>
              {missedCall && <Check className="w-3.5 h-3.5 text-white" />}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                <PhoneMissed className="w-3.5 h-3.5 text-purple-600" /> Missed call
              </span>
              <span className="block text-xs text-gray-500 mt-0.5">
                Nobody picked up, so there is no recording to add. Missed calls are
                eligible for auditing on their own.
              </span>
            </span>
          </button>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {MERGED_COLUMNS.map((col) => {
              // Rendered as the toggle above, not as a free-text cell.
              if (col === MISSED_CALL_COLUMN) return null

              const isMatchKey  = MATCH_COLUMNS.includes(col)
              const isRecording = col === OUR_RECORDING_COLUMN
              return (
                <div key={col} className={cn(isRecording && 'sm:col-span-2')}>
                  <label className="block text-[11px] font-medium text-gray-500 mb-1">
                    {col}
                    {isMatchKey && (
                      <span className="ml-1.5 text-[9px] text-[#E8431A] uppercase tracking-wide">
                        match key
                      </span>
                    )}
                    {isRecording && missedCall && (
                      <span className="ml-1.5 text-[9px] text-purple-600 uppercase tracking-wide">
                        not needed
                      </span>
                    )}
                  </label>
                  <input
                    value={data[col]}
                    onChange={(e) => setData((d) => ({ ...d, [col]: e.target.value }))}
                    placeholder={isRecording ? (missedCall ? 'No recording — missed call' : 'https://…') : ''}
                    className={cn(
                      'w-full px-3 py-2 text-sm rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-[#E8431A]/30 focus:border-[#E8431A]',
                      isMatchKey ? 'border-orange-200' : 'border-gray-200'
                    )}
                  />
                </div>
              )
            })}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 shrink-0 flex gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(data)}
            disabled={saving}
            className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm bg-[#E8431A] text-white hover:bg-[#D03A14] disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {isNew ? 'Add call' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function ReconciliationClient({ practiceName, reconciliation, initialRows }: Props) {
  const router = useRouter()

  const [recon, setRecon] = useState(reconciliation)
  const [rows, setRows]   = useState(initialRows)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<GhlReconciliationRow | 'new' | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyRowId, setBusyRowId] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const monthLabel = `${recon.month} ${recon.year}`
  const submitted = recon.status === 'submitted'

  // Recompute live so the counts track the admin's edits rather than the
  // figures frozen at upload time.
  const summary: ReconcileSummary = useMemo(() => {
    const active = rows.filter((r) => !r.excluded)
    return {
      ghl_total:   recon.summary?.ghl_total ?? 0,
      sheet_total: recon.summary?.sheet_total ?? 0,
      matched:     active.filter((r) => r.source === 'matched').length,
      ghl_only:    active.filter((r) => r.source === 'ghl_only').length,
      sheet_only:  active.filter((r) => r.source === 'sheet_only').length,
      missing_recording: active.filter((r) => !r.data[OUR_RECORDING_COLUMN]?.trim()).length,
      missed_calls: active.filter(isMissedCall).length,
      ineligible:   active.filter((r) => !isEligible(r)).length,
    }
  }, [recon, rows])

  const visibleRows = useMemo(() => {
    let list = rows
    if (filter === 'ineligible')    list = list.filter((r) => !r.excluded && !isEligible(r))
    else if (filter === 'eligible') list = list.filter((r) => !r.excluded && isEligible(r))
    else if (filter === 'excluded') list = list.filter((r) => r.excluded)
    else                            list = list.filter((r) => !r.excluded)

    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((r) =>
        Object.values(r.data).some((v) => v?.toLowerCase().includes(q))
      )
    }
    return list
  }, [rows, filter, search])

  // ── Mutations ───────────────────────────────────────────────────────────────

  async function saveRow(data: Record<string, string>) {
    if (!editing) return
    setSaving(true)
    try {
      const isNew = editing === 'new'
      const res = await fetch(`/api/ghl/reconciliations/${recon.id}/rows`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isNew ? { data, source: 'manual' } : { rowId: editing.id, data }),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error ?? 'Save failed')

      const saved = payload.row as GhlReconciliationRow
      setRows((prev) => isNew ? [...prev, saved] : prev.map((r) => (r.id === saved.id ? saved : r)))
      setRecon((r) => ({ ...r, status: 'draft' }))
      setEditing(null)
    } catch (err: unknown) {
      setBanner({ kind: 'err', text: err instanceof Error ? err.message : 'Save failed' })
    } finally {
      setSaving(false)
    }
  }

  // Mark / unmark a call as never picked up. A missed call needs no recording
  // URL, so this is the other way (besides pasting a URL) to make a row eligible.
  async function toggleMissedCall(row: GhlReconciliationRow) {
    setBusyRowId(row.id)
    try {
      const next = {
        ...row.data,
        [MISSED_CALL_COLUMN]: isMissedCallExplicit(row) ? '' : MISSED_CALL_YES,
      }
      const res = await fetch(`/api/ghl/reconciliations/${recon.id}/rows`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowId: row.id, data: next }),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error ?? 'Update failed')
      setRows((prev) => prev.map((r) => (r.id === row.id ? payload.row : r)))
      setRecon((r) => ({ ...r, status: 'draft' }))
    } catch (err: unknown) {
      setBanner({ kind: 'err', text: err instanceof Error ? err.message : 'Update failed' })
    } finally {
      setBusyRowId(null)
    }
  }

  async function toggleExcluded(row: GhlReconciliationRow) {
    setBusyRowId(row.id)
    try {
      const res = await fetch(`/api/ghl/reconciliations/${recon.id}/rows`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowId: row.id, excluded: !row.excluded }),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error ?? 'Update failed')
      setRows((prev) => prev.map((r) => (r.id === row.id ? payload.row : r)))
      setRecon((r) => ({ ...r, status: 'draft' }))
    } catch (err: unknown) {
      setBanner({ kind: 'err', text: err instanceof Error ? err.message : 'Update failed' })
    } finally {
      setBusyRowId(null)
    }
  }

  async function deleteRow(row: GhlReconciliationRow) {
    setBusyRowId(row.id)
    try {
      const res = await fetch(
        `/api/ghl/reconciliations/${recon.id}/rows?rowId=${row.id}`,
        { method: 'DELETE' }
      )
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error ?? 'Delete failed')
      setRows((prev) => prev.filter((r) => r.id !== row.id))
      setRecon((r) => ({ ...r, status: 'draft' }))
    } catch (err: unknown) {
      setBanner({ kind: 'err', text: err instanceof Error ? err.message : 'Delete failed' })
    } finally {
      setBusyRowId(null)
    }
  }

  async function verify() {
    setVerifying(true)
    setBanner(null)
    try {
      const res = await fetch(`/api/ghl/reconciliations/${recon.id}/verify`, { method: 'POST' })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error ?? 'Verification failed')
      setRecon((r) => ({
        ...r,
        status: 'submitted',
        submitted_at: payload.submitted_at,
        webhook_ref: payload.webhook_ref ?? r.webhook_ref,
        // n8n returns the audit sheet it built for the month.
        google_sheet_url: payload.google_sheet_url ?? r.google_sheet_url,
      }))
      setBanner({
        kind: 'ok',
        text: payload.skipped_ineligible
          ? `${payload.submitted_rows} eligible calls sent for auditing. ${payload.skipped_ineligible} ineligible ${payload.skipped_ineligible === 1 ? 'call was' : 'calls were'} held back.`
          : `${payload.submitted_rows} calls sent for auditing.`,
      })
      router.refresh()
    } catch (err: unknown) {
      setBanner({ kind: 'err', text: err instanceof Error ? err.message : 'Verification failed' })
    } finally {
      setVerifying(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const stats = [
    { label: 'Matched',           value: summary.matched,             sub: 'in both sources',   color: 'bg-green-500',  bg: 'bg-green-50',  border: 'border-green-100' },
    { label: 'Missing from ours', value: summary.ghl_only,            sub: 'GHL only',          color: 'bg-amber-500',  bg: 'bg-amber-50',  border: 'border-amber-100' },
    { label: 'Missing from GHL',  value: summary.sheet_only,          sub: 'our sheet only',    color: 'bg-blue-500',   bg: 'bg-blue-50',   border: 'border-blue-100' },
    { label: 'Missed calls',      value: summary.missed_calls ?? 0,   sub: 'no recording due',  color: 'bg-purple-500', bg: 'bg-purple-50', border: 'border-purple-100' },
    { label: 'Ineligible',        value: summary.ineligible ?? 0,     sub: "won't be sent",     color: 'bg-red-500',    bg: 'bg-red-50',    border: 'border-red-100' },
  ]

  const active         = rows.filter((r) => !r.excluded)
  const activeCount    = active.length
  const eligibleCount  = active.filter(isEligible).length
  const blockedCount   = summary.ineligible ?? 0

  return (
    <div>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <Link
          href="/dashboard/ghl-calls"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:text-gray-900 hover:border-gray-300 shadow-sm transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> All reconciliations
        </Link>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="font-medium text-gray-600">{practiceName}</span>
          {recon.source_tab && <><span>·</span><span>tab: {recon.source_tab}</span></>}
        </div>
      </div>

      {banner && (
        <div className={cn(
          'flex items-start gap-2 px-4 py-3 rounded-xl border text-sm mb-5',
          banner.kind === 'ok'
            ? 'bg-green-50 border-green-100 text-green-700'
            : 'bg-red-50 border-red-100 text-red-600'
        )}>
          {banner.kind === 'ok'
            ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" />
            : <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />}
          <span className="flex-1">{banner.text}</span>
          <button onClick={() => setBanner(null)} className="shrink-0 opacity-60 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        {stats.map((stat, i) => (
          <div
            key={stat.label}
            className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm animate-fade-in-up"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="flex items-start justify-between mb-2">
              <p className="text-xs text-gray-400">{stat.label}</p>
              <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border', stat.bg, stat.border)}>
                <span className={cn('w-1.5 h-1.5 rounded-full', stat.color)} />
              </div>
            </div>
            <p className={cn(
              'text-2xl font-bold tabular-nums',
              stat.label === 'Ineligible' && stat.value > 0 ? 'text-red-500' : 'text-gray-900'
            )}>
              {stat.value}
            </p>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="inline-flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
          {([
            ['all',        `All (${activeCount})`],
            ['ineligible', `Ineligible (${blockedCount})`],
            ['eligible',   `Eligible (${eligibleCount})`],
            ['excluded',   `Excluded (${rows.filter((r) => r.excluded).length})`],
          ] as [FilterKey, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap',
                filter === key
                  ? 'bg-orange-50 text-[#E8431A] border border-orange-100'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50 border border-transparent'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[12rem]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, number, campaign…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#E8431A]/30 focus:border-[#E8431A]"
          />
        </div>

        {!submitted && (
          <button
            onClick={() => setEditing('new')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-white border border-gray-200 text-gray-700 hover:border-orange-200 hover:text-[#E8431A] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add call
          </button>
        )}
      </div>

      {/* ── Grid ──────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[64rem]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left text-[11px] font-medium text-gray-500 uppercase tracking-wide px-4 py-2.5 whitespace-nowrap">
                  Status
                </th>
                {GRID_COLUMNS.map((col) => (
                  <th key={col} className="text-left text-[11px] font-medium text-gray-500 uppercase tracking-wide px-4 py-2.5 whitespace-nowrap">
                    {col}
                  </th>
                ))}
                <th className="text-left text-[11px] font-medium text-gray-500 uppercase tracking-wide px-4 py-2.5 whitespace-nowrap">
                  Recording
                </th>
                <th className="text-left text-[11px] font-medium text-gray-500 uppercase tracking-wide px-4 py-2.5 whitespace-nowrap">
                  Eligibility
                </th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={GRID_COLUMNS.length + 4} className="text-center py-14 text-gray-400 text-sm">
                    {search ? 'No calls match your search.' : 'Nothing here.'}
                  </td>
                </tr>
              ) : visibleRows.map((row) => {
                const recording = row.data[OUR_RECORDING_COLUMN]?.trim()
                const missed    = isMissedCall(row)
                const eligible  = isEligible(row)
                const busy = busyRowId === row.id
                return (
                  <tr
                    key={row.id}
                    className={cn(
                      'hover:bg-gray-50/70 transition-colors',
                      row.excluded && 'opacity-50',
                      !eligible && !row.excluded && 'bg-red-50/30'
                    )}
                  >
                    <td className="px-4 py-2.5"><SourcePill source={row.source} /></td>
                    {GRID_COLUMNS.map((col) => (
                      <td key={col} className="px-4 py-2.5 text-gray-700 whitespace-nowrap max-w-[14rem] truncate">
                        {row.data[col] || <span className="text-gray-300">—</span>}
                      </td>
                    ))}
                    <td className="px-4 py-2.5">
                      {recording ? (
                        <a
                          href={recording}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                        >
                          <Link2 className="w-3 h-3" /> Listen
                        </a>
                      ) : missed ? (
                        <span className="text-xs text-gray-400">None — missed</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-red-500">
                          <AlertTriangle className="w-3 h-3" /> Missing
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5"><EligibilityPill row={row} /></td>
                    <td className="px-4 py-2.5">
                      {!submitted && (
                        <div className="flex items-center gap-0.5 justify-end">
                          <button
                            onClick={() => toggleMissedCall(row)}
                            disabled={busy || (missed && !isMissedCallExplicit(row))}
                            title={
                              missed && !isMissedCallExplicit(row)
                                ? 'Matched call with no recording — counted as a missed call automatically'
                                : isMissedCallExplicit(row)
                                  ? 'Not a missed call after all'
                                  : 'Mark as a missed call (no recording needed)'
                            }
                            className={cn(
                              'w-7 h-7 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40',
                              isMissedCallExplicit(row)
                                ? 'text-purple-600 bg-purple-50 hover:bg-purple-100'
                                : 'text-gray-400 hover:text-purple-600 hover:bg-purple-50'
                            )}
                          >
                            <PhoneMissed className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditing(row)}
                            title="Edit call"
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-[#E8431A] hover:bg-orange-50 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => toggleExcluded(row)}
                            disabled={busy}
                            title={row.excluded ? 'Include in the audit' : 'Exclude from the audit'}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors disabled:opacity-40"
                          >
                            {busy
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : row.excluded
                                ? <Eye className="w-3.5 h-3.5" />
                                : <EyeOff className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => deleteRow(row)}
                            disabled={busy}
                            title="Delete row"
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Verify ────────────────────────────────────────────────────────── */}
      <div className="mt-6 bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        {submitted ? (
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-green-50 border border-green-100 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">
                {monthLabel} sent for auditing
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {recon.submitted_at && new Date(recon.submitted_at).toLocaleString('en-US')}
                {recon.webhook_ref && ` · ref ${recon.webhook_ref}`}
              </p>

              {/* The sheet n8n produced for this month */}
              {recon.google_sheet_url ? (
                <a
                  href={recon.google_sheet_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-white border border-gray-200 text-gray-700 hover:border-green-300 hover:text-green-700 hover:shadow-sm transition-colors"
                >
                  <FileSpreadsheet className="w-4 h-4 text-green-600" />
                  Open the audit sheet
                  <ExternalLink className="w-3.5 h-3.5 opacity-50" />
                </a>
              ) : (
                <p className="text-xs text-gray-400 mt-2">
                  The audit sheet link will appear here once n8n returns it.
                </p>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3 mb-4">
              <div className={cn(
                'w-9 h-9 rounded-lg border flex items-center justify-center shrink-0',
                blockedCount > 0 ? 'bg-amber-50 border-amber-100' : 'bg-green-50 border-green-100'
              )}>
                {blockedCount > 0
                  ? <AlertTriangle className="w-4 h-4 text-amber-600" />
                  : <CheckCircle2 className="w-4 h-4 text-green-600" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {blockedCount > 0
                    ? `${blockedCount} ${blockedCount === 1 ? 'call is' : 'calls are'} ineligible and won't be sent`
                    : `All ${eligibleCount} calls are eligible for auditing`}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {blockedCount > 0
                    ? 'They have no recording URL and aren’t marked as missed calls. Add the URL, or mark them as a missed call, to include them.'
                    : `${summary.missed_calls ?? 0} of them are missed calls, which need no recording.`}
                </p>
              </div>
            </div>

            <button
              onClick={verify}
              disabled={verifying || eligibleCount === 0}
              className={cn(
                'w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all',
                verifying || eligibleCount === 0
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                  : 'bg-[#E8431A] text-white hover:bg-[#D03A14] shadow-lg shadow-orange-200 hover:shadow-xl hover:-translate-y-0.5'
              )}
            >
              {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {verifying
                ? 'Sending…'
                : eligibleCount === 0
                  ? 'No eligible calls to send'
                  : `Verify & send ${eligibleCount} eligible ${eligibleCount === 1 ? 'call' : 'calls'}`}
            </button>
          </>
        )}
      </div>

      {editing && (
        <RowEditor
          row={editing}
          saving={saving}
          onClose={() => setEditing(null)}
          onSave={saveRow}
        />
      )}
    </div>
  )
}
