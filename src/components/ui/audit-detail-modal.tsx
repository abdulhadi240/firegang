'use client'

import { AuditResult, Company } from '@/types'
import { Tag } from '@/components/ui/tag'
import { CopyId } from '@/components/ui/copy-id'
import { formatDate } from '@/lib/utils'
import { X, Phone, Tag as TagIcon, FileText, Clock, Building2 } from 'lucide-react'

interface AuditDetailModalProps {
  result: AuditResult & { companies?: Pick<Company, 'id' | 'name'> | { name: string } }
  onClose: () => void
}

export function AuditDetailModal({ result, onClose }: AuditDetailModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />

      {/* Modal — max height + scroll */}
      <div className="relative bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-md max-h-[90vh] flex flex-col">

        {/* Header — fixed */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0">
              <Phone className="w-4 h-4 text-[#E8431A]" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 text-sm">Call Details</p>
              <CopyId id={result.call_id} className="text-gray-400" />
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors shrink-0 ml-3"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="overflow-y-auto px-6 py-5 space-y-5">

          {/* Company */}
          {result.companies?.name && (
            <div className="flex items-start gap-3">
              <Building2 className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Company</p>
                <p className="text-sm font-medium text-gray-900">{result.companies.name}</p>
              </div>
            </div>
          )}

          {/* Call ID */}
          <div className="flex items-start gap-3">
            <Phone className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-gray-400 mb-1">Call ID</p>
              <CopyId id={result.call_id} />
            </div>
          </div>

          {/* Tags — horizontal single row with scroll */}
          <div className="flex items-start gap-3">
            <TagIcon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-400 mb-1.5">Tags</p>
              {(result.call_tags ?? []).length > 0 ? (
                <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                  {result.call_tags.map((tag) => (
                    <Tag key={tag} label={tag} className="shrink-0" />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">No tags</p>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="flex items-start gap-3">
            <FileText className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-gray-400 mb-1.5">Notes</p>
              {result.notes ? (
                <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5 whitespace-pre-wrap">
                  {result.notes}
                </p>
              ) : (
                <p className="text-sm text-gray-400 italic">No notes</p>
              )}
            </div>
          </div>

          {/* Date */}
          <div className="flex items-start gap-3">
            <Clock className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Audited at</p>
              <p className="text-sm text-gray-700">{formatDate(result.created_at)}</p>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
