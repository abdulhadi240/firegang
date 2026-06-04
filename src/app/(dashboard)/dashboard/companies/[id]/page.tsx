import { createClient } from '@/lib/supabase/server'
import { ADMIN_USER_ID } from '@/lib/auth'
import { notFound } from 'next/navigation'
import { CompanyAuditClient } from './company-audit-client'
import { Building2, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'

const statusVariant: Record<string, 'success' | 'warning' | 'secondary'> = {
  active: 'success',
  pending: 'warning',
  inactive: 'secondary',
}

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: company } = await supabase
    .from('companies')
    .select('id, name, status, created_at')
    .eq('id', id)
    .single()

  if (!company) notFound()

  const { data: auditResults } = await supabase
    .from('audit_results')
    .select('*')
    .eq('company_id', id)
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <Link
        href="/dashboard/companies"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Companies
      </Link>

      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0">
          <Building2 className="w-7 h-7 text-[#E8431A]" />
        </div>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{company.name}</h1>
            <Badge variant={statusVariant[company.status] ?? 'secondary'}>{company.status}</Badge>
          </div>
          <p className="text-gray-500 text-sm mt-0.5">{auditResults?.length ?? 0} calls audited</p>
        </div>
      </div>

      <CompanyAuditClient
        company={company}
        userId={ADMIN_USER_ID}
        auditResults={auditResults ?? []}
      />
    </div>
  )
}
