'use client'

import { useState } from 'react'
import { AuditResult } from '@/types'
import { AuditDetailModal } from '@/components/ui/audit-detail-modal'
import { Tag } from '@/components/ui/tag'
import { CopyId } from '@/components/ui/copy-id'
import { Building2, Phone } from 'lucide-react'

interface AuditLogsClientProps {
  results: (AuditResult & { companies?: { name: string } })[]
}

export function AuditLogsClient({ results }: AuditLogsClientProps) {
  const [selected, setSelected] = useState<(AuditResult & { companies?: { name: string } }) | null>(null)

  if (results.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <Phone className="w-10 h-10 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No audit records yet.</p>
      </div>
    )
  }

  return (
    <>
      {selected && (
        <AuditDetailModal result={selected} onClose={() => setSelected(null)} />
      )}

      {/* Mobile card list — hidden on sm+ */}
      <div className="sm:hidden divide-y divide-gray-100">
        {results.map((result) => (
          <button
            key={result.id}
            onClick={() => setSelected(result)}
            className="w-full text-left px-4 py-3.5 hover:bg-orange-50/50 transition-colors"
          >
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-7 h-7 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0">
                <Building2 className="w-3.5 h-3.5 text-[#E8431A]" />
              </div>
              <span className="font-medium text-gray-900 text-sm truncate">{result.companies?.name ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between gap-2 pl-9">
              <div onClick={(e) => e.stopPropagation()}>
                <CopyId id={result.call_id} />
              </div>
            </div>
            {(result.call_tags ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2 pl-9">
                {result.call_tags.map((tag) => <Tag key={tag} label={tag} />)}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Desktop table — hidden on mobile */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="text-xs text-gray-400 border-y border-gray-100 bg-gray-50">
              <th className="text-left px-6 py-2.5 font-medium w-44">Company</th>
              <th className="text-left px-4 py-2.5 font-medium w-36">Call ID</th>
              <th className="text-left px-4 py-2.5 font-medium">Tags</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {results.map((result) => (
              <tr
                key={result.id}
                onClick={() => setSelected(result)}
                className="hover:bg-orange-50/50 cursor-pointer transition-colors"
              >
                <td className="px-6 py-3 w-44">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0">
                      <Building2 className="w-3.5 h-3.5 text-[#E8431A]" />
                    </div>
                    <span className="font-medium text-gray-900 whitespace-nowrap">{result.companies?.name ?? '—'}</span>
                  </div>
                </td>
                <td className="px-4 py-3 w-36" onClick={(e) => e.stopPropagation()}>
                  <CopyId id={result.call_id} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {(result.call_tags ?? []).length > 0
                      ? result.call_tags.map((tag) => <Tag key={tag} label={tag} />)
                      : <span className="text-gray-300 text-xs italic">—</span>
                    }
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
