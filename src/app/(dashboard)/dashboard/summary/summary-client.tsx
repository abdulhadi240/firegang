'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Company, SummaryDocument, ApprovalStatus } from '@/types'
import { cn } from '@/lib/utils'
import {
  Building2, FileText, CheckCheck, CalendarDays, Sparkles, Loader2,
  ChevronRight, X, ChevronLeft, Check, Ban, Search, Clock,
} from 'lucide-react'

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
              const busy = busyId === doc.id
              return (
                <div
                  key={doc.id}
                  className="border border-gray-200 rounded-xl overflow-hidden hover:border-orange-200 transition-colors"
                >
                  {/* Clickable preview row → editor */}
                  <button
                    onClick={() => router.push(`/dashboard/summary/${doc.id}`)}
                    className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 group"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">
                        {doc.month} {doc.year}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <ApprovalPill status={doc.approval_status} />
                        <TeamworkPill published={published} />
                      </div>
                    </div>
                    <span className="text-[11px] text-gray-400 inline-flex items-center gap-1 shrink-0 group-hover:text-[#E8431A] transition-colors">
                      Edit <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </button>

                  {/* Approve / disapprove — only while not published to Teamwork */}
                  {!published && (
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
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 shrink-0">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 disabled:opacity-30 hover:text-gray-900 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Prev
            </button>
            <span className="text-xs text-gray-400 tabular-nums">
              Page {page + 1} of {totalPages}
            </span>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 disabled:opacity-30 hover:text-gray-900 transition-colors"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Generate dialog: pick up to 5 companies, 1-minute cooldown per batch ──────
const MAX_PER_BATCH = 5
const COOLDOWN_SECONDS = 60

function GenerateDialog({
  companies,
  monthLabel,
  month,
  year,
  onClose,
  onGenerated,
}: {
  companies: Company[]
  monthLabel: string
  month: string
  year: number
  onClose: () => void
  onGenerated: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [listOpen, setListOpen] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(0) // seconds remaining

  // Cooldown ticker
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

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

  async function generate() {
    if (selected.size === 0 || generating || cooldown > 0) return
    setGenerating(true)
    setError('')
    try {
      const res = await fetch('/api/summary/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyIds: Array.from(selected), month, year }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Generation failed')
      onGenerated()                // refresh the list behind the dialog
      setSelected(new Set())
      setCooldown(COOLDOWN_SECONDS) // start 1-minute cooldown before next batch
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setGenerating(false)
    }
  }

  const busy = generating
  const disabled = busy || cooldown > 0 || selected.size === 0

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg flex flex-col max-h-[90vh] animate-scale-in">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <p className="font-semibold text-gray-900 text-sm">Generate {monthLabel} summaries</p>
            <p className="text-xs text-gray-400 mt-0.5">Select up to {MAX_PER_BATCH} companies per batch</p>
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
              Batch limit reached — generate these {MAX_PER_BATCH}, then pick more after the cooldown.
            </p>
          )}
          {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={generate}
            disabled={disabled}
            className={cn(
              'w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all',
              disabled
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                : 'bg-[#E8431A] text-white hover:bg-[#D03A14]'
            )}
          >
            {busy ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
            ) : cooldown > 0 ? (
              <><Clock className="w-4 h-4" /> Cooldown — {cooldown}s</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Generate {selected.size > 0 ? `(${selected.size})` : ''}</>
            )}
          </button>
          <p className="text-[11px] text-gray-400 mt-2 text-center">
            Up to {MAX_PER_BATCH} at a time · {COOLDOWN_SECONDS}s cooldown between batches
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function SummaryClient({ companies, monthDocuments, month, year }: Props) {
  const router = useRouter()
  const [showGenerate, setShowGenerate] = useState(false)
  const [openCompany, setOpenCompany] = useState<Company | null>(null)

  const monthLabel = `${month} ${year}`

  // Companies that have a summary for the target month
  const docByCompany = useMemo(() => {
    const m = new Map<string, SummaryDocument>()
    for (const d of monthDocuments) m.set(d.company_id, d)
    return m
  }, [monthDocuments])

  const companiesWithSummary = useMemo(
    () => companies.filter((c) => docByCompany.has(c.id)),
    [companies, docByCompany]
  )

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
          Select up to {MAX_PER_BATCH} companies per batch · {COOLDOWN_SECONDS}s cooldown between batches
        </p>
      </div>

      {/* ── Companies with a summary this month ───────────────────────────── */}
      <div className="flex items-center gap-2 mb-5">
        <FileText className="w-4 h-4 text-gray-400" />
        <h2 className="text-sm font-semibold text-gray-700">Companies with a {monthLabel} summary</h2>
        <span className="text-xs text-gray-400 tabular-nums">({companiesWithSummary.length})</span>
      </div>

      {companiesWithSummary.length === 0 ? (
        <div className="text-center py-16 text-gray-400 animate-fade-in border border-dashed border-gray-200 rounded-2xl">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No summaries generated for {monthLabel} yet.</p>
          <p className="text-xs mt-1 text-gray-300">Use the button above to generate them.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {companiesWithSummary.map((company, idx) => {
            const doc = docByCompany.get(company.id)!
            const published = !!doc.teamwork_inserted_at
            return (
              <button
                key={company.id}
                onClick={() => setOpenCompany(company)}
                className="text-left bg-white border border-gray-200 rounded-xl px-4 py-3.5 hover:border-orange-200 hover:shadow-sm transition-all duration-150 group animate-fade-in-up"
                style={{ animationDelay: `${idx * 40}ms` }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0 mt-0.5">
                      <Building2 className="w-3.5 h-3.5 text-[#E8431A]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{company.name}</p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <ApprovalPill status={doc.approval_status} />
                        <TeamworkPill published={published} />
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#E8431A] transition-colors shrink-0 mt-1" />
                </div>
              </button>
            )
          })}
        </div>
      )}

      {openCompany && (
        <CompanyDialog company={openCompany} onClose={() => setOpenCompany(null)} />
      )}

      {showGenerate && (
        <GenerateDialog
          companies={companies}
          monthLabel={monthLabel}
          month={month}
          year={year}
          onClose={() => setShowGenerate(false)}
          onGenerated={() => router.refresh()}
        />
      )}
    </div>
  )
}
