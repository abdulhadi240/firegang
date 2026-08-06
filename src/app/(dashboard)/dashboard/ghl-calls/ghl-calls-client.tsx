'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { GhlReconciliation, ReconciliationStatus } from '@/types'
import { cn } from '@/lib/utils'
import { UploadPanel } from './upload-panel'
import {
  Plus, X, CalendarDays, CheckCircle2, FileSpreadsheet, ChevronRight,
  Clock, AlertTriangle, Building2, ListChecks, Trash2, Loader2,
} from 'lucide-react'

interface Props {
  practiceName: string
  reconciliations: GhlReconciliation[]
  defaultMonth: string
  defaultYear: number
}

const STATUS_STYLES: Record<ReconciliationStatus, string> = {
  draft:     'bg-gray-50 text-gray-500 border-gray-200',
  verified:  'bg-blue-50 text-blue-600 border-blue-100',
  submitted: 'bg-green-50 text-green-600 border-green-100',
}

const STATUS_LABELS: Record<ReconciliationStatus, string> = {
  draft:     'In review',
  verified:  'Verified',
  submitted: 'Sent for auditing',
}

function StatusPill({ status }: { status: ReconciliationStatus }) {
  return (
    <span className={cn(
      'text-[10px] px-2 py-0.5 rounded-full border font-medium whitespace-nowrap',
      STATUS_STYLES[status]
    )}>
      {STATUS_LABELS[status]}
    </span>
  )
}

export function GhlCallsClient({
  practiceName,
  reconciliations,
  defaultMonth,
  defaultYear,
}: Props) {
  const router = useRouter()
  const [showUpload, setShowUpload] = useState(reconciliations.length === 0)
  // Deleting is two-step: the trash icon arms the confirm, the confirm commits.
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState('')

  async function remove(r: GhlReconciliation) {
    setDeletingId(r.id)
    setDeleteError('')
    try {
      const res = await fetch(`/api/ghl/reconciliations/${r.id}`, { method: 'DELETE' })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error ?? 'Delete failed')
      setConfirmId(null)
      router.refresh()
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  const submittedCount = reconciliations.filter((r) => r.status === 'submitted').length
  const draftCount     = reconciliations.filter((r) => r.status !== 'submitted').length
  const totalCalls     = reconciliations.reduce((n, r) => n + (r.summary?.matched ?? 0), 0)

  const stats = [
    { label: 'Reconciliations', value: reconciliations.length, sub: 'all months',       icon: ListChecks,  color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-100' },
    { label: 'Sent for audit',  value: submittedCount,         sub: 'completed',        icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50',  border: 'border-green-100' },
    { label: 'In review',       value: draftCount,             sub: 'not yet sent',     icon: Clock,       color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-100' },
    { label: 'Matched calls',   value: totalCalls,             sub: 'across all months', icon: FileSpreadsheet, color: 'text-[#E8431A]', bg: 'bg-orange-50', border: 'border-orange-100' },
  ]

  return (
    <div>
      {/* ── Header row ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Building2 className="w-3.5 h-3.5 text-[#E8431A]" />
          <span className="font-medium text-gray-600">{practiceName}</span>
        </div>
        {!showUpload && (
          <button
            onClick={() => setShowUpload(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm bg-[#E8431A] text-white hover:bg-[#D03A14] shadow-lg shadow-orange-200 hover:shadow-xl hover:-translate-y-0.5 transition-all"
          >
            <Plus className="w-4 h-4" /> New reconciliation
          </button>
        )}
      </div>

      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      {reconciliations.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {stats.map((stat, i) => {
            const Icon = stat.icon
            return (
              <div
                key={stat.label}
                className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm animate-fade-in-up"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="flex items-start justify-between mb-2">
                  <p className="text-xs text-gray-400">{stat.label}</p>
                  <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border', stat.bg, stat.border)}>
                    <Icon className={cn('w-3.5 h-3.5', stat.color)} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-gray-900 tabular-nums">{stat.value}</p>
                <p className="text-xs text-gray-400 mt-0.5 truncate">{stat.sub}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Upload ────────────────────────────────────────────────────────── */}
      {showUpload && (
        <div className="mb-6">
          <UploadPanel
            month={defaultMonth}
            year={defaultYear}
            existingKeys={reconciliations.map((r) => `${r.month}-${r.year}`)}
            onDone={(_m, _y, id) => {
              setShowUpload(false)
              // Straight into the new list — that's what the admin came to review.
              if (id) router.push(`/dashboard/ghl-calls/${id}`)
              else router.refresh()
            }}
          />
          {reconciliations.length > 0 && (
            <button
              onClick={() => setShowUpload(false)}
              className="mt-3 text-xs text-gray-500 hover:text-gray-900 inline-flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" /> Cancel
            </button>
          )}
        </div>
      )}

      {/* ── List ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-4">
        <CalendarDays className="w-4 h-4 text-gray-400" />
        <h2 className="text-sm font-semibold text-gray-700">Reconciliations</h2>
        <span className="text-xs text-gray-400 tabular-nums">({reconciliations.length})</span>
      </div>

      {deleteError && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl border border-red-100 bg-red-50 text-xs text-red-600">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {deleteError}
        </div>
      )}

      {reconciliations.length === 0 ? (
        <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-2xl">
          <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No reconciliations yet.</p>
          <p className="text-xs mt-1 text-gray-300">
            Upload a GHL export above to create the first one.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {reconciliations.map((r, idx) => {
            const s = r.summary ?? {}
            const gaps = (s.ghl_only ?? 0) + (s.sheet_only ?? 0)
            // Older reconciliations predate the eligibility rules — fall back to
            // the raw missing-recording count for those.
            const ineligible = s.ineligible ?? s.missing_recording ?? 0
            return (
              <div
                key={r.id}
                className="group flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3.5 hover:border-orange-200 hover:shadow-sm transition-all duration-150 animate-fade-in-up"
                style={{ animationDelay: `${idx * 40}ms` }}
              >
                <Link
                  href={`/dashboard/ghl-calls/${r.id}`}
                  className="flex items-start gap-3 min-w-0 flex-1"
                >
                  <div className={cn(
                    'w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 mt-0.5',
                    r.status === 'submitted'
                      ? 'bg-green-50 border-green-100'
                      : 'bg-orange-50 border-orange-100'
                  )}>
                    {r.status === 'submitted'
                      ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                      : <Clock className="w-4 h-4 text-[#E8431A]" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">
                      {r.month} {r.year}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <StatusPill status={r.status} />
                      <span className="text-[11px] text-gray-400 tabular-nums">
                        {s.matched ?? 0} matched
                      </span>
                      {gaps > 0 && (
                        <span className="text-[11px] text-amber-600 tabular-nums">
                          · {gaps} unmatched
                        </span>
                      )}
                      {ineligible > 0 && (
                        <span className="text-[11px] text-red-500 inline-flex items-center gap-0.5">
                          <AlertTriangle className="w-2.5 h-2.5" /> {ineligible} ineligible
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">
                      {r.submitted_at
                        ? `Sent ${new Date(r.submitted_at).toLocaleString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}`
                        : `Updated ${new Date(r.updated_at).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric',
                          })}`}
                    </p>
                  </div>
                </Link>

                {/* Delete — two-step so a stray click can't drop a month's work */}
                {confirmId === r.id ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="hidden sm:inline text-[11px] text-gray-500 mr-1">
                      Delete {r.month} {r.year}
                      {r.status === 'submitted' && ' (already sent for auditing)'}?
                    </span>
                    <button
                      disabled={deletingId === r.id}
                      onClick={() => remove(r)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
                    >
                      {deletingId === r.id
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <Trash2 className="w-3 h-3" />}
                      Delete
                    </button>
                    <button
                      disabled={deletingId === r.id}
                      onClick={() => setConfirmId(null)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-100 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 shrink-0">
                    {r.google_sheet_url && (
                      <a
                        href={r.google_sheet_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open the audit sheet"
                        aria-label={`Open the ${r.month} ${r.year} audit sheet`}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-green-600 hover:bg-green-50 transition-colors"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button
                      onClick={() => { setConfirmId(r.id); setDeleteError('') }}
                      title="Delete reconciliation"
                      aria-label={`Delete ${r.month} ${r.year} reconciliation`}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#E8431A] transition-colors" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
