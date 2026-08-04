'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { MONTH_NAMES } from '@/types'
import { cn } from '@/lib/utils'
import { parseCsv } from '@/lib/csv'
import { normalizeDateTime } from '@/lib/ghl-match'
import {
  UploadCloud, FileSpreadsheet, Loader2, Check, AlertTriangle,
  CalendarDays, ListFilter,
} from 'lucide-react'

// ── Upload panel ─────────────────────────────────────────────────────────────

/** One entry per month present in the uploaded file, most rows first. */
interface MonthTally {
  month: string
  year: number
  count: number
}

export function UploadPanel({
  month,
  year,
  existingKeys,
  onDone,
}: {
  month: string
  year: number
  /** "July-2026" for every month already reconciled, to warn before replacing one. */
  existingKeys: string[]
  /** `id` is the reconciliation just created, so the caller can navigate to it. */
  onDone: (month: string, year: number, id?: string) => void
}) {
  const [tabs, setTabs] = useState<string[] | null>(null)
  const [tab, setTab] = useState('')
  const [tabError, setTabError] = useState('')
  // Env keys that still need filling in before Sheets can be reached at all.
  const [missingConfig, setMissingConfig] = useState<string[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // The month the admin confirms after dropping the file — only calls from this
  // month are reconciled, on both sides.
  const [pickedMonth, setPickedMonth] = useState(month)
  const [pickedYear, setPickedYear] = useState(year)
  // What the file actually contains, so the choice is informed rather than blind.
  const [tallies, setTallies] = useState<MonthTally[] | null>(null)
  const [undated, setUndated] = useState(0)

  // Our sheet keeps one tab per month — load the list so the admin can pick.
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch('/api/ghl/sheet-tabs')
        // Surface the real failure rather than collapsing everything into one
        // vague message: a non-JSON body means the route itself blew up.
        const body = await res.text()
        let data: {
          configured?: boolean
          missing?: string[]
          tabs?: string[]
          defaultTab?: string | null
          error?: string
        }
        try {
          data = JSON.parse(body)
        } catch {
          throw new Error(`Server returned ${res.status} (${body.slice(0, 120) || 'empty response'})`)
        }
        if (!active) return

        if (data.configured === false) {
          setMissingConfig(data.missing ?? [])
          setTabs([])
          return
        }
        if (data.error) { setTabError(data.error); setTabs([]); return }

        const list = data.tabs ?? []
        setTabs(list)
        // Prefer the configured call-log tab. Tabs here aren't named by month,
        // so a month-name guess is only a last resort.
        const guess =
          data.defaultTab ??
          list.find(
            (t) => t.toLowerCase().includes(month.toLowerCase()) ||
                   t.toLowerCase().includes(month.slice(0, 3).toLowerCase())
          )
        if (guess) setTab(guess)
      } catch (err: unknown) {
        if (!active) return
        setTabError(err instanceof Error ? err.message : 'Could not reach Google Sheets')
        setTabs([])
      }
    })()
    return () => { active = false }
  }, [month])

  async function pickFile(f: File | null) {
    setError('')
    setTallies(null)
    if (!f) return
    if (!/\.csv$/i.test(f.name)) {
      setError('Please drop a .csv file exported from Go High Level')
      return
    }
    setFile(f)

    // Read the file's own dates so the month step can show what's in it and
    // default to the month that dominates, instead of guessing.
    try {
      const { headers, rows } = parseCsv(await f.text())
      if (!headers.includes('Date & time')) {
        setError(`This CSV has no "Date & time" column. Found: ${headers.join(', ')}`)
        return
      }

      const counts = new Map<string, number>()
      let missing = 0
      for (const r of rows) {
        const { date } = normalizeDateTime(r['Date & time'] ?? '')
        if (!date) { missing++; continue }
        const key = date.slice(0, 7) // YYYY-MM
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }

      const list: MonthTally[] = [...counts.entries()]
        .map(([key, count]) => ({
          month: MONTH_NAMES[Number(key.slice(5, 7)) - 1],
          year: Number(key.slice(0, 4)),
          count,
        }))
        .sort((a, b) => b.count - a.count)

      setTallies(list)
      setUndated(missing)
      if (list.length > 0) {
        setPickedMonth(list[0].month)
        setPickedYear(list[0].year)
      }
    } catch {
      setError('Could not read that CSV — is it a valid export?')
    }
  }

  async function submit() {
    if (!file || !tab) return
    setBusy(true)
    setError('')
    try {
      const csv = await file.text()
      const res = await fetch('/api/ghl/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv, month: pickedMonth, year: pickedYear, tab }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Reconciliation failed')
      onDone(pickedMonth, pickedYear, data.reconciliation_id)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Reconciliation failed')
    } finally {
      setBusy(false)
    }
  }

  // Years offered in the picker: whatever the file contains, plus a sensible
  // window around now, so an odd export is still selectable.
  const yearOptions = useMemo(() => {
    const nowY = new Date().getFullYear()
    const set = new Set<number>([nowY, nowY - 1, nowY - 2, year, pickedYear])
    for (const t of tallies ?? []) set.add(t.year)
    return [...set].sort((a, b) => b - a)
  }, [tallies, year, pickedYear])

  const pickedCount =
    tallies?.find((t) => t.month === pickedMonth && t.year === pickedYear)?.count ?? 0

  // Reconciling a month that already exists replaces it, edits and all.
  const willReplace = existingKeys.includes(`${pickedMonth}-${pickedYear}`)

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <UploadCloud className="w-4 h-4 text-[#E8431A]" />
        <h2 className="text-sm font-semibold text-gray-900">Upload the GHL export</h2>
      </div>

      {/* Google Sheets isn't wired up yet — tell the admin exactly what's missing */}
      {missingConfig.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
          <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Google Sheets isn&rsquo;t connected yet
          </p>
          <p className="text-[11px] text-amber-700 mt-1.5">
            Add these to <code className="font-mono">.env.local</code> and restart the dev server:
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {missingConfig.map((key) => (
              <li key={key} className="text-[11px] font-mono text-amber-800">• {key}</li>
            ))}
          </ul>
          <p className="text-[11px] text-amber-700 mt-2">
            See the <span className="font-medium">GHL Call Reconciliation</span> section of{' '}
            <code className="font-mono">SETUP.md</code>. Remember to share the sheet with the
            service account email.
          </p>
        </div>
      )}

      {/* Which tab of our sheet to compare against */}
      <label className="block text-xs font-medium text-gray-600 mb-1.5">
        Compare against our call log tab
      </label>
      {tabs === null ? (
        <div className="flex items-center gap-2 text-xs text-gray-400 py-2.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading tabs…
        </div>
      ) : missingConfig.length > 0 ? (
        <p className="text-xs text-gray-400 py-2">Connect Google Sheets to load the month tabs.</p>
      ) : tabError ? (
        <p className="text-xs text-red-500 py-2 break-words">{tabError}</p>
      ) : (
        <select
          value={tab}
          onChange={(e) => setTab(e.target.value)}
          className="w-full sm:max-w-xs px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#E8431A]/30 focus:border-[#E8431A]"
        >
          <option value="">Select the call log tab…</option>
          {tabs.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      )}

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          pickFile(e.dataTransfer.files?.[0] ?? null)
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'mt-4 border-2 border-dashed rounded-xl px-6 py-10 text-center cursor-pointer transition-all',
          dragging
            ? 'border-[#E8431A] bg-orange-50'
            : file
              ? 'border-green-200 bg-green-50/50'
              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <>
            <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 text-green-600" />
            <p className="text-sm font-medium text-gray-900">{file.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {(file.size / 1024).toFixed(0)} KB — click to choose a different file
            </p>
          </>
        ) : (
          <>
            <UploadCloud className={cn('w-8 h-8 mx-auto mb-2', dragging ? 'text-[#E8431A]' : 'text-gray-300')} />
            <p className="text-sm font-medium text-gray-700">
              Drop the Go High Level CSV here
            </p>
            <p className="text-xs text-gray-400 mt-0.5">or click to browse</p>
          </>
        )}
      </div>

      {/* ── Which month? Asked once the file is in, since only then can we show
             what it actually contains. ────────────────────────────────────── */}
      {file && tallies && (
        <div className="mt-4 rounded-xl border border-orange-100 bg-orange-50/60 p-4 animate-fade-in-up">
          <p className="text-xs font-semibold text-gray-900 flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5 text-[#E8431A]" />
            Which month should be reconciled?
          </p>
          <p className="text-[11px] text-gray-500 mt-1">
            Only calls from this month are used — from both this file and our call log.
          </p>

          <div className="flex flex-wrap gap-2 mt-3">
            <select
              value={pickedMonth}
              onChange={(e) => setPickedMonth(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#E8431A]/30 focus:border-[#E8431A]"
            >
              {MONTH_NAMES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <select
              value={pickedYear}
              onChange={(e) => setPickedYear(Number(e.target.value))}
              className="px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#E8431A]/30 focus:border-[#E8431A]"
            >
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {/* What the file holds, so an off-by-one month is obvious up front */}
          <div className="mt-3">
            <p className="text-[11px] font-medium text-gray-500 mb-1.5">This file contains:</p>
            <div className="flex flex-wrap gap-1.5">
              {tallies.map((t) => {
                const active = t.month === pickedMonth && t.year === pickedYear
                return (
                  <button
                    key={`${t.month}-${t.year}`}
                    onClick={() => { setPickedMonth(t.month); setPickedYear(t.year) }}
                    className={cn(
                      'text-[11px] px-2 py-1 rounded-lg border font-medium transition-colors',
                      active
                        ? 'bg-[#E8431A] text-white border-[#E8431A]'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-orange-200'
                    )}
                  >
                    {t.month} {t.year} — {t.count}
                  </button>
                )
              })}
              {undated > 0 && (
                <span className="text-[11px] px-2 py-1 rounded-lg border border-gray-200 bg-white text-gray-400">
                  {undated} undated
                </span>
              )}
            </div>
          </div>

          <p className={cn(
            'text-[11px] mt-3 flex items-start gap-1.5',
            pickedCount === 0 ? 'text-amber-700' : 'text-gray-600'
          )}>
            {pickedCount === 0
              ? <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              : <Check className="w-3.5 h-3.5 shrink-0 mt-px text-green-600" />}
            <span>
              {pickedCount === 0
                ? `No calls dated ${pickedMonth} ${pickedYear} in this file — nothing would be reconciled.`
                : `${pickedCount} ${pickedCount === 1 ? 'call' : 'calls'} from ${pickedMonth} ${pickedYear} will be reconciled.`}
            </span>
          </p>

          {willReplace && (
            <p className="text-[11px] mt-2 flex items-start gap-1.5 text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>
                {pickedMonth} {pickedYear} has already been reconciled. Continuing rebuilds it from
                scratch and discards any manual edits and added calls.
              </span>
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs text-red-500 mt-3 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>{error}</span>
        </p>
      )}

      <button
        onClick={submit}
        disabled={!file || !tab || busy || pickedCount === 0}
        className={cn(
          'mt-4 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all',
          !file || !tab || busy || pickedCount === 0
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
            : 'bg-[#E8431A] text-white hover:bg-[#D03A14] shadow-lg shadow-orange-100'
        )}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListFilter className="w-4 h-4" />}
        {busy
          ? 'Comparing…'
          : file && tallies
            ? `Compare ${pickedMonth} ${pickedYear} calls`
            : 'Compare calls'}
      </button>
    </div>
  )
}

