'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Company } from '@/types'
import { Input } from '@/components/ui/input'
import { Tag } from '@/components/ui/tag'
import { Building2, Search, ArrowRight } from 'lucide-react'

interface CompaniesClientProps {
  companies: Company[]
}

const STATUS_STYLES: Record<string, string> = {
  active:   'bg-green-100 text-green-700 border-green-200',
  pending:  'bg-yellow-100 text-yellow-700 border-yellow-200',
  inactive: 'bg-gray-100 text-gray-500 border-gray-200',
}

export function CompaniesClient({ companies }: CompaniesClientProps) {
  const [query, setQuery] = useState('')
  const router = useRouter()

  const filtered = companies.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div>
      <div className="relative mb-5 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Search companies..."
          className="pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <p className="text-sm text-gray-500 mb-4">
        {filtered.length} {filtered.length === 1 ? 'company' : 'companies'}
      </p>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No companies found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((company) => (
            <button
              key={company.id}
              onClick={() => router.push(`/dashboard/companies/${company.id}`)}
              className="text-left w-full bg-white border border-gray-200 rounded-xl p-5 hover:border-[#E8431A]/40 hover:shadow-md transition-all duration-200 group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5 text-[#E8431A]" />
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-[#E8431A] transition-colors" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-3 truncate">{company.name}</h3>
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[company.status] ?? STATUS_STYLES.inactive}`}>
                {company.status}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
