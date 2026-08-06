'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Company, SummaryDocument, ApprovalStatus, MONTH_NAMES, monthDateRange } from '@/types'
import { cn, formatDate } from '@/lib/utils'
import {
  Building2, FileText, CheckCheck, CalendarDays, Sparkles, Loader2,
  ChevronRight, X, ChevronLeft, ChevronsLeft, ChevronsRight, Check, Ban, Search,
  Trash2, AlertCircle, Clock, ExternalLink, RefreshCw, MoreHorizontal,
} from 'lucide-react'

// Published summaries live in Teamwork Notebooks. `teamwork_ref` holds the notebook id.
const TEAMWORK_NOTEBOOK_BASE = 'https://firegangdentalmarketing.teamwork.com/app/notebooks'
function teamworkUrl(ref: string | null | undefined) {
  return ref ? `${TEAMWORK_NOTEBOOK_BASE}/${ref}` : null
}

interface Props {
  companies: Company[]
  monthDocuments: SummaryDocument[]   // documents for the (previous) target month
  month: string                       // month name, e.g. "June"
  year: number
}

const PAGE_SIZE = 12

// ── Approval badge ────────────────────────────────────────────────────────────
function ApprovalPill({ status }: { status: ApprovalStatus }) {
  const map: Record<ApprovalStatus, string> = {
    pending:     'bg-yellow-50 text-yellow-600 border-yellow-100',
    approved:    'bg-green-50 text-green-600 border-green-100',
    disapproved: 'bg-red-50 text-red-500 border-red-100',
  }
  return (
    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full border font-medium capitalize', map[status])}>
      {status}
    </span>
  )
}

// The row exists but the workflow hasn't written the report into it yet.
function GeneratingPill() {
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded-full border bg-orange-50 text-[#E8431A] border-orange-100 font-medium inline-flex items-center gap-1"
      title="The report is still being generated — it will appear here shortly"
    >
      <Loader2 className="w-2.5 h-2.5 animate-spin" /> Generating
    </span>
  )
}

function TeamworkPill({ published }: { published: boolean }) {
  return published ? (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-blue-50 text-blue-600 border-blue-100 font-medium inline-flex items-center gap-0.5">
      <CheckCheck className="w-2.5 h-2.5" /> Teamwork
    </span>
  ) : (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-gray-50 text-gray-400 border-gray-100 font-medium">
      Not published
    </span>
  )
}

// ── Pagination ────────────────────────────────────────────────────────────────
// Numbered pages, truncated with ellipses so the control keeps a constant width
// however many pages there are. All indices here are 1-based; the `page` prop
// and `onChange` callback are 0-based to match the callers' slice maths.
function pageWindow(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  let start = Math.max(2, current - 1)
  let end   = Math.min(total - 1, current + 1)
  // Widen the window at the edges so the control doesn't change width there.
  if (current <= 3)         { start = 2;          end = 4 }
  if (current >= total - 2) { start = total - 3;  end = total - 1 }

  const pages: (number | 'gap')[] = [1]
  if (start > 2) pages.push('gap')
  for (let p = start; p <= end; p++) pages.push(p)
  if (end < total - 1) pages.push('gap')
  pages.push(total)
  return pages
}

function PageButton({
  children, active, disabled, title, onClick,
}: {
  children: React.ReactNode
  active?: boolean
  disabled?: boolean
  title?: string
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'min-w-[2rem] h-8 px-2 rounded-lg text-xs font-medium tabular-nums transition-all duration-150 flex items-center justify-center',
        active
          ? 'bg-[#E8431A] text-white shadow-sm shadow-orange-200'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
        disabled && 'opacity-30 cursor-not-allowed hover:bg-transparent hover:text-gray-600'
      )}
    >
      {children}
    </button>
  )
}

function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  itemLabel,
  compact = false,
  className,
  onChange,
}: {
  page: number            // 0-based
  totalPages: number
  totalItems: number
  pageSize: number
  itemLabel: string       // plural noun, e.g. "companies"
  compact?: boolean       // dialog footers: drop the range text and jump box
  className?: string
  onChange: (page: number) => void
}) {
  const [jump, setJump] = useState('')

  if (totalPages <= 1) return null

  const first = page * pageSize + 1
  const last  = Math.min(totalItems, (page + 1) * pageSize)

  function go(p: number) {
    onChange(Math.min(totalPages - 1, Math.max(0, p)))
  }

  function submitJump(e: React.FormEvent) {
    e.preventDefault()
    const n = Number.parseInt(jump, 10)
    if (Number.isFinite(n)) go(n - 1)
    setJump('')
  }

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        'flex flex-col sm:flex-row items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl px-3 py-2.5',
        !compact && 'shadow-sm',
        className
      )}
    >
      {!compact && (
        <p className="text-xs text-gray-400 tabular-nums order-2 sm:order-1">
          Showing <span className="font-semibold text-gray-700">{first}–{last}</span> of{' '}
          <span className="font-semibold text-gray-700">{totalItems}</span> {itemLabel}
        </p>
      )}

      <div className="flex items-center gap-1 order-1 sm:order-2">
        <PageButton title="First page"    disabled={page === 0}              onClick={() => go(0)}>
          <ChevronsLeft className="w-4 h-4" />
        </PageButton>
        <PageButton title="Previous page" disabled={page === 0}              onClick={() => go(page - 1)}>
          <ChevronLeft className="w-4 h-4" />
        </PageButton>

        {/* Numbered pages — collapses to a page counter on narrow screens */}
        <div className="hidden sm:flex items-center gap-1 mx-1">
          {pageWindow(page + 1, totalPages).map((p, i) =>
            p === 'gap' ? (
              <span key={`gap-${i}`} className="w-6 flex items-center justify-center text-gray-300">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </span>
            ) : (
              <PageButton key={p} active={p === page + 1} title={`Page ${p}`} onClick={() => go(p - 1)}>
                {p}
              </PageButton>
            )
          )}
        </div>
        <span className="sm:hidden mx-2 text-xs text-gray-500 tabular-nums">
          {page + 1} / {totalPages}
        </span>

        <PageButton title="Next page" disabled={page >= totalPages - 1} onClick={() => go(page + 1)}>
          <ChevronRight className="w-4 h-4" />
        </PageButton>
        <PageButton title="Last page" disabled={page >= totalPages - 1} onClick={() => go(totalPages - 1)}>
          <ChevronsRight className="w-4 h-4" />
        </PageButton>

        {/* Jumping beats clicking once the list gets long */}
        {!compact && totalPages > 5 && (
          <form onSubmit={submitJump} className="hidden lg:flex items-center gap-1.5 ml-2 pl-2 border-l border-gray-100">
            <label htmlFor="page-jump" className="text-xs text-gray-400">Go to</label>
            <input
              id="page-jump"
              type="number"
              min={1}
              max={totalPages}
              value={jump}
              onChange={(e) => setJump(e.target.value)}
              placeholder={`${page + 1}`}
              className="w-14 h-8 px-2 text-xs text-center tabular-nums rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#E8431A]/30 focus:border-[#E8431A]"
            />
          </form>
        )}
      </div>
    </nav>
  )
}

// ── Company summaries dialog (historical, 12-per-page) ────────────────────────
function CompanyDialog({
  company,
  onClose,
}: {
  company: Company
  onClose: () => void
}) {
  const router = useRouter()
  const [docs, setDocs] = useState<SummaryDocument[] | null>(null)
  const [error, setError] = useState('')
  const [page, setPage] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [resubmitId, setResubmitId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Load this company's summaries on mount
  useEffect(() => {
    let active = true
    fetch(`/api/summary/documents?company_id=${company.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (!active) return
        if (data.error) setError(data.error)
        else setDocs(data.documents as SummaryDocument[])
      })
      .catch(() => { if (active) setError('Failed to load summaries') })
    return () => { active = false }
  }, [company.id])

  async function decide(doc: SummaryDocument, decision: ApprovalStatus) {
    setBusyId(doc.id)
    try {
      const res = await fetch(`/api/summary/documents/${doc.id}/approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setDocs((prev) =>
        prev?.map((d) =>
          d.id === doc.id
            ? {
                ...d,
                approval_status: decision,
                teamwork_inserted_at: data.teamwork_inserted_at ?? d.teamwork_inserted_at,
                teamwork_ref: data.teamwork_ref ?? d.teamwork_ref,
              }
            : d
        ) ?? prev
      )
    } catch {
      // surface a subtle inline error by leaving state unchanged
    } finally {
      setBusyId(null)
    }
  }

  // Retry the Teamwork push for an approved-but-unpublished summary.
  async function resubmit(doc: SummaryDocument) {
    setResubmitId(doc.id)
    try {
      const res = await fetch(`/api/summary/documents/${doc.id}/resubmit`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Resubmit failed')
      setDocs((prev) =>
        prev?.map((d) =>
          d.id === doc.id
            ? {
                ...d,
                teamwork_inserted_at: data.teamwork_inserted_at ?? d.teamwork_inserted_at,
                teamwork_ref: data.teamwork_ref ?? d.teamwork_ref,
              }
            : d
        ) ?? prev
      )
    } catch {
      // leave the row unchanged on failure so the user can retry
    } finally {
      setResubmitId(null)
    }
  }

  async function deleteDoc(doc: SummaryDocument) {
    setDeletingId(doc.id)
    try {
      const res = await fetch(`/api/summary/documents/${doc.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Delete failed')
      setDocs((prev) => prev?.filter((d) => d.id !== doc.id) ?? prev)
      setConfirmDeleteId(null)
      router.refresh() // update the company list / stats behind the dialog
    } catch {
      // leave the row in place on failure
    } finally {
      setDeletingId(null)
    }
  }

  const totalPages = docs ? Math.ceil(docs.length / PAGE_SIZE) : 0
  const pageDocs = docs?.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE) ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl flex flex-col max-h-[90vh] animate-scale-in">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4 text-[#E8431A]" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 text-sm truncate">{company.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {docs ? `${docs.length} ${docs.length === 1 ? 'summary' : 'summaries'}` : 'Loading…'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {error && <p className="text-sm text-red-500 text-center py-10">{error}</p>}

          {!docs && !error && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin text-[#E8431A]" />
              <p className="text-sm">Loading summaries…</p>
            </div>
          )}

          {docs && docs.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-16">No summaries for this company yet.</p>
          )}

          <div className="space-y-2.5">
            {pageDocs.map((doc) => {
              const published = !!doc.teamwork_inserted_at
              const twUrl = teamworkUrl(doc.teamwork_ref)
              const busy = busyId === doc.id
              return (
                <div
                  key={doc.id}
                  className="group border border-gray-200 rounded-xl overflow-hidden hover:border-orange-200 transition-colors"
                >
                  {/* Preview row → editor, with delete control alongside */}
                  <div className="flex items-stretch">
                    <button
                      onClick={() => router.push(`/dashboard/summary/${doc.id}`)}
                      className="flex-1 min-w-0 text-left px-4 py-3 flex items-center justify-between gap-3 group"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">
                          {doc.month} {doc.year}
                        </p>
                        <p className="flex items-center gap-1 text-[11px] text-gray-400 mt-0.5">
                          <Clock className="w-3 h-3 shrink-0" />
                          Created {formatDate(doc.created_at)}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          {doc.is_generating ? (
                            <GeneratingPill />
                          ) : (
                            <>
                              <ApprovalPill status={doc.approval_status} />
                              <TeamworkPill published={published} />
                            </>
                          )}
                        </div>
                      </div>
                      <span className="text-[11px] text-gray-400 inline-flex items-center gap-1 shrink-0 group-hover:text-[#E8431A] transition-colors">
                        Edit <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </button>

                    {/* Open the published summary directly in Teamwork */}
                    {published && twUrl && (
                      <a
                        href={twUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open in Teamwork"
                        onClick={(e) => e.stopPropagation()}
                        className="px-3 shrink-0 flex items-center gap-1 text-[11px] font-medium text-gray-300 hover:text-blue-600 hover:bg-blue-50 transition-colors border-l border-gray-100 sm:opacity-0 sm:group-hover:opacity-100"
                      >
                        <ExternalLink className="w-4 h-4" />
                        <span className="hidden sm:inline">Teamwork</span>
                      </a>
                    )}

                    {/* Delete (two-step confirm) */}
                    {confirmDeleteId === doc.id ? (
                      <div className="flex items-center gap-1 pr-3 pl-2 shrink-0">
                        <button
                          disabled={deletingId === doc.id}
                          onClick={() => deleteDoc(doc)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
                        >
                          {deletingId === doc.id
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Trash2 className="w-3 h-3" />}
                          Delete
                        </button>
                        <button
                          disabled={deletingId === doc.id}
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-100 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(doc.id)}
                        title="Delete summary"
                        className="px-3 shrink-0 flex items-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors border-l border-gray-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Approve / disapprove — once there's a report to judge, and
                      only while it hasn't gone to Teamwork yet */}
                  {!published && !doc.is_generating && (
                    <div className="flex items-center gap-2 px-4 py-2.5 border-t border-gray-100 bg-gray-50/60">
                      <button
                        disabled={busy}
                        onClick={() => decide(doc, 'approved')}
                        className={cn(
                          'flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50',
                          doc.approval_status === 'approved'
                            ? 'bg-green-600 text-white'
                            : 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
                        )}
                      >
                        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Approve
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => decide(doc, 'disapproved')}
                        className={cn(
                          'flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50',
                          doc.approval_status === 'disapproved'
                            ? 'bg-red-500 text-white'
                            : 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                        )}
                      >
                        <Ban className="w-3 h-3" />
                        Disapprove
                      </button>
                      {/* Approved but not yet published → allow resubmitting to Teamwork */}
                      {doc.approval_status === 'approved' && (
                        <button
                          disabled={busy || resubmitId === doc.id}
                          onClick={() => resubmit(doc)}
                          title="Resubmit to Teamwork"
                          className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors disabled:opacity-50"
                        >
                          {resubmitId === doc.id
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <RefreshCw className="w-3 h-3" />}
                          Resubmit
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-3 py-2.5 border-t border-gray-100 shrink-0">
            <Pagination
              compact
              page={page}
              totalPages={totalPages}
              totalItems={docs?.length ?? 0}
              pageSize={PAGE_SIZE}
              itemLabel="summaries"
              className="border-0 bg-transparent px-0 py-0 justify-center"
              onChange={setPage}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Generate dialog: pick up to 5 companies at a time ─────────────────────────
const MAX_PER_BATCH = 5
const COUNTDOWN_SECONDS = 50

function GenerateDialog({
  companies,
  monthLabel,
  onClose,
  onStart,
}: {
  companies: Company[]
  monthLabel: string
  onClose: () => void
  onStart: (companyIds: string[]) => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [listOpen, setListOpen] = useState(true)

  const filtered = useMemo(
    () => companies.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())),
    [companies, search]
  )

  const atLimit = selected.size >= MAX_PER_BATCH

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < MAX_PER_BATCH) next.add(id)
      return next
    })
  }

  function start() {
    if (selected.size === 0) return
    onStart(Array.from(selected))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg flex flex-col max-h-[90vh] animate-scale-in">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <p className="font-semibold text-gray-900 text-sm">Generate {monthLabel} summaries</p>
            <p className="text-xs text-gray-400 mt-0.5">Select up to {MAX_PER_BATCH} companies at a time</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {/* Dropdown trigger */}
          <button
            onClick={() => setListOpen((o) => !o)}
            className={cn(
              'w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border bg-white text-sm font-medium transition-all',
              listOpen ? 'border-[#E8431A] ring-2 ring-[#E8431A]/20' : 'border-gray-200 hover:border-gray-300'
            )}
          >
            <span className="flex items-center gap-2 min-w-0">
              <Building2 className="w-4 h-4 text-[#E8431A] shrink-0" />
              <span className="text-gray-900">
                {selected.size === 0 ? 'Select companies' : `${selected.size} selected`}
              </span>
            </span>
            <span className={cn('text-xs tabular-nums', atLimit ? 'text-[#E8431A] font-semibold' : 'text-gray-400')}>
              {selected.size} / {MAX_PER_BATCH}
            </span>
          </button>

          {listOpen && (
            <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden">
              <div className="p-2 border-b border-gray-100">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search companies…"
                    className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#E8431A]/30 focus:border-[#E8431A]"
                  />
                </div>
              </div>
              <div className="max-h-56 overflow-y-auto">
                {filtered.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-5">No companies found</p>
                ) : (
                  filtered.map((c) => {
                    const isSel = selected.has(c.id)
                    const blocked = !isSel && atLimit
                    return (
                      <button
                        key={c.id}
                        onClick={() => toggle(c.id)}
                        disabled={blocked}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2.5 transition-colors',
                          blocked ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50'
                        )}
                      >
                        <span className={cn(
                          'w-4 h-4 rounded border-2 flex items-center justify-center shrink-0',
                          isSel ? 'bg-[#E8431A] border-[#E8431A]' : 'border-gray-300'
                        )}>
                          {isSel && <Check className="w-2.5 h-2.5 text-white" />}
                        </span>
                        <span className="text-sm text-gray-700 truncate flex-1 text-left">{c.name}</span>
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          )}

          {atLimit && (
            <p className="text-[11px] text-[#E8431A] mt-2">
              Batch limit reached — you can generate up to {MAX_PER_BATCH} at once.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={start}
            disabled={selected.size === 0}
            className={cn(
              'w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all',
              selected.size === 0
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                : 'bg-[#E8431A] text-white hover:bg-[#D03A14]'
            )}
          >
            <Sparkles className="w-4 h-4" /> Generate {selected.size > 0 ? `(${selected.size})` : ''}
          </button>
          <p className="text-[11px] text-gray-400 mt-2 text-center">
            Up to {MAX_PER_BATCH} at a time
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Floating progress widget: engaging 50s countdown while summaries generate ─
const LOADING_MESSAGES = [
  'Analyzing audited calls…',
  'Counting issue tags…',
  'Summarizing auditor notes…',
  'Drafting the monthly report…',
  'Formatting for Teamwork…',
  'Polishing the final copy…',
]

function GeneratingWidget({
  count,
  status,
  onDismiss,
}: {
  count: number
  status: 'running' | 'done' | 'error'
  onDismiss: () => void
}) {
  const [remaining, setRemaining] = useState(COUNTDOWN_SECONDS)
  const [msgIdx, setMsgIdx] = useState(0)

  // Countdown ticker (floors at 0, then shows "Finalizing…")
  useEffect(() => {
    if (status !== 'running') return
    const t = setInterval(() => setRemaining((r) => (r > 0 ? r - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [status])

  // Rotate loading messages
  useEffect(() => {
    if (status !== 'running') return
    const t = setInterval(() => setMsgIdx((i) => (i + 1) % LOADING_MESSAGES.length), 2500)
    return () => clearInterval(t)
  }, [status])

  // Auto-dismiss shortly after completion
  useEffect(() => {
    if (status === 'done') {
      const t = setTimeout(onDismiss, 2200)
      return () => clearTimeout(t)
    }
  }, [status, onDismiss])

  const pct = status === 'done'
    ? 100
    : Math.min(95, Math.round(((COUNTDOWN_SECONDS - remaining) / COUNTDOWN_SECONDS) * 100))

  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-50 sm:w-80 animate-fade-in-up">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
        <div className="p-4">
          <div className="flex items-center gap-3">
            {/* Countdown ring */}
            <div className="relative w-11 h-11 shrink-0">
              {status === 'running' && (
                <svg className="w-11 h-11 -rotate-90" viewBox="0 0 44 44">
                  <circle cx="22" cy="22" r="19" fill="none" stroke="#f3f4f6" strokeWidth="4" />
                  <circle
                    cx="22" cy="22" r="19" fill="none" stroke="#E8431A" strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 19}
                    strokeDashoffset={(1 - pct / 100) * 2 * Math.PI * 19}
                    style={{ transition: 'stroke-dashoffset 1s linear' }}
                  />
                </svg>
              )}
              <div className="absolute inset-0 flex items-center justify-center">
                {status === 'running' ? (
                  <span className="text-xs font-bold text-gray-900 tabular-nums">
                    {remaining > 0 ? remaining : <Loader2 className="w-4 h-4 animate-spin text-[#E8431A]" />}
                  </span>
                ) : status === 'done' ? (
                  <div className="w-11 h-11 rounded-full bg-green-50 border border-green-200 flex items-center justify-center">
                    <CheckCheck className="w-5 h-5 text-green-600" />
                  </div>
                ) : (
                  <div className="w-11 h-11 rounded-full bg-red-50 border border-red-100 flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-red-500" />
                  </div>
                )}
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900">
                {status === 'running'
                  ? `Generating ${count} ${count === 1 ? 'summary' : 'summaries'}…`
                  : status === 'done'
                    ? 'Summaries ready!'
                    : 'Generation failed'}
              </p>
              <p className="text-xs text-gray-400 mt-0.5 truncate">
                {status === 'running'
                  ? (remaining > 0 ? LOADING_MESSAGES[msgIdx] : 'Finalizing…')
                  : status === 'done'
                    ? 'Showing your accounts now'
                    : 'Please try again'}
              </p>
            </div>

            {status !== 'running' && (
              <button onClick={onDismiss} className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 shrink-0">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Progress bar */}
          <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-1000 ease-out',
                status === 'error' ? 'bg-red-400' : 'bg-gradient-to-r from-[#E8431A] to-[#F97316]')}
              style={{ width: `${status === 'error' ? 100 : pct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
const COMPANIES_PER_PAGE = 50

export function SummaryClient({ companies, monthDocuments, month, year }: Props) {
  const router = useRouter()
  const [showGenerate, setShowGenerate] = useState(false)
  const [openCompany, setOpenCompany] = useState<Company | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [genJob, setGenJob] = useState<
    { count: number; status: 'running' | 'done' | 'error' } | null
  >(null)

  const monthLabel = `${month} ${year}`

  // ── Month navigation ────────────────────────────────────────────────────────
  const monthIndex = MONTH_NAMES.indexOf(month)
  // Don't allow navigating past the current calendar month (no future audits).
  const now = new Date()
  const isCurrentOrFuture = year > now.getFullYear() || (year === now.getFullYear() && monthIndex >= now.getMonth())

  function goToMonth(delta: number) {
    let m = monthIndex + delta
    let y = year
    if (m < 0)  { m = 11; y -= 1 }
    if (m > 11) { m = 0;  y += 1 }
    router.push(`/dashboard/summary?month=${MONTH_NAMES[m]}&year=${y}`)
  }

  // Kick off generation: minimize the dialog, show the progress widget, and
  // reveal the accounts as soon as the summaries are available.
  function startGeneration(companyIds: string[]) {
    setShowGenerate(false)
    setGenJob({ count: companyIds.length, status: 'running' })

    // Send an inclusive ISO-8601 date range for the selected month so the
    // downstream call-audit API can pull the right calls.
    const { start_date, end_date } = monthDateRange(month, year)

    fetch('/api/summary/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyIds, month, year, start_date, end_date }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'Generation failed')
        // Summaries are available → reveal the accounts and finish the timer.
        router.refresh()
        setGenJob((j) => (j ? { ...j, status: 'done' } : j))
      })
      .catch(() => {
        setGenJob((j) => (j ? { ...j, status: 'error' } : j))
      })
  }

  // Companies that have a summary for the target month
  const docByCompany = useMemo(() => {
    const m = new Map<string, SummaryDocument>()
    for (const d of monthDocuments) m.set(d.company_id, d)
    return m
  }, [monthDocuments])

  // Driven by the documents, not the company list: summaries also arrive for
  // practices that aren't in the companies table (the GHL flow runs for one),
  // and filtering by `companies` would hide those entirely.
  // Latest summarized account first: sort by the summary's created date (desc).
  const companiesWithSummary = useMemo(() => {
    const byId = new Map(companies.map((c) => [c.id, c]))
    return monthDocuments
      .map((doc): Company =>
        byId.get(doc.company_id) ?? {
          id: doc.company_id,
          name: doc.company_name,
          status: 'active',
          created_at: doc.created_at,
        }
      )
      .sort((a, b) => {
        const da = docByCompany.get(a.id)!
        const db = docByCompany.get(b.id)!
        return new Date(db.created_at).getTime() - new Date(da.created_at).getTime()
      })
  }, [companies, monthDocuments, docByCompany])

  const visibleCompanies = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return companiesWithSummary
    return companiesWithSummary.filter((c) => c.name.toLowerCase().includes(q))
  }, [companiesWithSummary, search])

  // Back to page 1 whenever the result set changes under the current page.
  // Adjusted during render (not in an effect) so there's no flash of a stale page.
  const resetKey = `${month}|${year}|${search}`
  const [pagedFor, setPagedFor] = useState(resetKey)
  if (pagedFor !== resetKey) {
    setPagedFor(resetKey)
    setPage(0)
  }

  const totalPages  = Math.max(1, Math.ceil(visibleCompanies.length / COMPANIES_PER_PAGE))
  // Clamp rather than trust `page` — the list can shrink between renders.
  const safePage    = Math.min(page, totalPages - 1)
  const pageStart   = safePage * COMPANIES_PER_PAGE
  const pageCompanies = visibleCompanies.slice(pageStart, pageStart + COMPANIES_PER_PAGE)

  const publishedCount = useMemo(
    () => monthDocuments.filter((d) => d.teamwork_inserted_at).length,
    [monthDocuments]
  )

  const stats = [
    { label: 'Total Companies',    value: companies.length,        sub: 'in the system',        icon: Building2,    color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-100' },
    { label: 'Summaries Generated', value: monthDocuments.length,   sub: monthLabel,             icon: FileText,     color: 'text-[#E8431A]',  bg: 'bg-orange-50', border: 'border-orange-100' },
    { label: 'Published to Teamwork', value: publishedCount,        sub: `of ${monthDocuments.length} summaries`, icon: CheckCheck, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100' },
    { label: 'Month',              value: month,                   sub: `${year}`,              icon: CalendarDays, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' },
  ] as const

  return (
    <div>
      {/* ── Month switcher ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5">
        <div className="inline-flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
          <button
            onClick={() => goToMonth(-1)}
            title="Previous month"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 px-3 min-w-[8.5rem] justify-center">
            <CalendarDays className="w-4 h-4 text-[#E8431A] shrink-0" />
            <span className="text-sm font-semibold text-gray-900 tabular-nums">{monthLabel}</span>
          </div>
          <button
            onClick={() => goToMonth(1)}
            disabled={isCurrentOrFuture}
            title={isCurrentOrFuture ? "Can't audit a future month" : 'Next month'}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Stat cards ────────────────────────────────────────────────────── */}
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
              <p className="text-2xl font-bold text-gray-900 tabular-nums truncate">{stat.value}</p>
              <p className="text-xs text-gray-400 mt-0.5 truncate">{stat.sub}</p>
            </div>
          )
        })}
      </div>

      {/* ── Generate previous-month summaries ─────────────────────────────── */}
      <div className="mb-8 sm:mb-10">
        <button
          onClick={() => setShowGenerate(true)}
          className="group relative w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-200 bg-[#E8431A] text-white shadow-lg shadow-orange-200 hover:bg-[#D03A14] hover:shadow-xl hover:shadow-orange-300 hover:-translate-y-0.5 active:translate-y-0"
        >
          <Sparkles className="w-4 h-4" /> Generate {monthLabel} summaries
        </button>
        <p className="text-xs text-gray-400 mt-2 ml-1">
          Select up to {MAX_PER_BATCH} companies at a time
        </p>
      </div>

      {/* ── Companies with a summary this month ───────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-700">Companies with a {monthLabel} summary</h2>
          <span className="text-xs text-gray-400 tabular-nums">
            ({search.trim() ? `${visibleCompanies.length} of ${companiesWithSummary.length}` : companiesWithSummary.length})
          </span>
        </div>

        {companiesWithSummary.length > 0 && (
          <div className="relative sm:w-64 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search companies…"
              className="w-full pl-8 pr-8 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#E8431A]/30 focus:border-[#E8431A]"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                title="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {companiesWithSummary.length === 0 ? (
        <div className="text-center py-16 text-gray-400 animate-fade-in border border-dashed border-gray-200 rounded-2xl">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No summaries generated for {monthLabel} yet.</p>
          <p className="text-xs mt-1 text-gray-300">Use the button above to generate them.</p>
        </div>
      ) : visibleCompanies.length === 0 ? (
        <div className="text-center py-16 text-gray-400 animate-fade-in border border-dashed border-gray-200 rounded-2xl">
          <Search className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No companies match &ldquo;{search}&rdquo;.</p>
          <button onClick={() => setSearch('')} className="text-xs mt-1 text-[#E8431A] hover:underline">
            Clear search
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {pageCompanies.map((company, idx) => {
            const doc = docByCompany.get(company.id)!
            const published = !!doc.teamwork_inserted_at
            const twUrl = teamworkUrl(doc.teamwork_ref)
            return (
              <div
                key={company.id}
                className="relative flex items-start justify-between gap-2 text-left bg-white border border-gray-200 rounded-xl px-4 py-3.5 hover:border-orange-200 hover:shadow-sm transition-all duration-150 group animate-fade-in-up"
                style={{ animationDelay: `${idx * 40}ms` }}
              >
                <button
                  onClick={() => setOpenCompany(company)}
                  className="flex items-start gap-2.5 min-w-0 flex-1 text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0 mt-0.5">
                    <Building2 className="w-3.5 h-3.5 text-[#E8431A]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{company.name}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {doc.is_generating ? (
                        <GeneratingPill />
                      ) : (
                        <>
                          <ApprovalPill status={doc.approval_status} />
                          <TeamworkPill published={published} />
                        </>
                      )}
                    </div>
                  </div>
                </button>

                {/* Resting: chevron. On hover: check-summary + open-in-Teamwork actions. */}
                <div className="shrink-0 mt-0.5">
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:hidden mt-0.5" />
                  <div className="hidden group-hover:flex items-center gap-1">
                    <button
                      onClick={() => setOpenCompany(company)}
                      title="Check summary"
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-[#E8431A] hover:bg-orange-50 transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5" />
                    </button>
                    {published && twUrl && (
                      <a
                        href={twUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open in Teamwork"
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Pagination (50 per page) ──────────────────────────────────────── */}
      <Pagination
        page={safePage}
        totalPages={totalPages}
        totalItems={visibleCompanies.length}
        pageSize={COMPANIES_PER_PAGE}
        itemLabel="companies"
        className="mt-5"
        onChange={setPage}
      />

      {openCompany && (
        <CompanyDialog company={openCompany} onClose={() => setOpenCompany(null)} />
      )}

      {showGenerate && (
        <GenerateDialog
          companies={companies}
          monthLabel={monthLabel}
          onClose={() => setShowGenerate(false)}
          onStart={startGeneration}
        />
      )}

      {genJob && (
        <GeneratingWidget
          count={genJob.count}
          status={genJob.status}
          onDismiss={() => setGenJob(null)}
        />
      )}
    </div>
  )
}
