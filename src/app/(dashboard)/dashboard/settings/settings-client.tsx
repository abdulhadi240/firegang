'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Building2, Search, EyeOff, AlertTriangle, GitCompareArrows } from 'lucide-react'

export interface PracticeSetting {
  id: string
  name: string
  /** Months with a report on record. */
  months: number
  /** Switched out of the all-practices totals on the Comparison page. */
  excluded: boolean
}

interface Props {
  practices: PracticeSetting[]
  /** False until supabase-comparison-settings-migration.sql has been run. */
  available: boolean
}

function Switch({ on, disabled, onChange, label }: { on: boolean; disabled?: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        'relative w-10 h-6 rounded-full transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8431A]/40',
        on ? 'bg-[#E8431A]' : 'bg-gray-300',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform', on && 'translate-x-4')} />
    </button>
  )
}

export function SettingsClient({ practices: initial, available }: Props) {
  const [practices, setPractices] = useState(initial)
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? practices.filter((p) => p.name.toLowerCase().includes(q)) : practices
  }, [practices, query])
  const excludedCount = practices.filter((p) => p.excluded).length

  const toggle = async (p: PracticeSetting) => {
    const next = !p.excluded
    setError(null)
    setPending((s) => new Set(s).add(p.id))
    // Flip straight away; put it back if the save fails.
    setPractices((list) => list.map((x) => (x.id === p.id ? { ...x, excluded: next } : x)))
    try {
      const res = await fetch('/api/settings/comparison', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: p.id, company_name: p.name, excluded: next }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Save failed (${res.status})`)
      }
    } catch (err) {
      setPractices((list) => list.map((x) => (x.id === p.id ? { ...x, excluded: p.excluded } : x)))
      setError((err as Error).message)
    } finally {
      setPending((s) => { const n = new Set(s); n.delete(p.id); return n })
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-gray-100">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Comparison totals</h2>
              <p className="text-xs text-gray-500 mt-0.5 max-w-prose">
                The Comparison page adds every practice report for a month into one company-wide figure.
                Switch a practice off here to leave it out of those totals; its own history stays visible
                under Practice comparison. One outlier practice can move the company-wide accuracy on its own.
              </p>
            </div>
            <Link
              href="/dashboard/comparison"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#E8431A] hover:underline"
            >
              <GitCompareArrows className="w-4 h-4" /> Open Comparison
            </Link>
          </div>

          {!available && (
            <p className="mt-4 flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                This setting is not set up in the database yet. Run <code className="font-mono">supabase-comparison-settings-migration.sql</code> in
                the Supabase SQL editor, then reload this page.
              </span>
            </p>
          )}
          {error && (
            <p className="mt-4 flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search practices..."
                className="pl-9"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <p className="text-xs text-gray-500">
              {practices.length} practice{practices.length === 1 ? '' : 's'} with reports
              {excludedCount > 0 && (
                <span className="inline-flex items-center gap-1 ml-2 text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                  <EyeOff className="w-3 h-3" /> {excludedCount} left out of totals
                </span>
              )}
            </p>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Building2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">{practices.length === 0 ? 'No monthly reports yet.' : 'No practices match.'}</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((p) => {
              const on = !p.excluded
              return (
                <li key={p.id} className={cn('flex items-center justify-between gap-4 px-4 sm:px-6 py-3', p.excluded && 'bg-amber-50/40')}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                    <p className="text-[11px] text-gray-500">
                      {p.months} month{p.months === 1 ? '' : 's'} on record ·{' '}
                      <span className={p.excluded ? 'text-amber-800' : 'text-gray-500'}>
                        {p.excluded ? 'left out of totals' : 'included in totals'}
                      </span>
                    </p>
                  </div>
                  <Switch
                    on={on}
                    disabled={!available || pending.has(p.id)}
                    onChange={() => toggle(p)}
                    label={`${on ? 'Exclude' : 'Include'} ${p.name} in comparison totals`}
                  />
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
