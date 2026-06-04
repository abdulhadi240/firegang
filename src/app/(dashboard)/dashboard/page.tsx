import { createClient } from '@/lib/supabase/server'
import { ADMIN_USER_ID } from '@/lib/auth'
import Link from 'next/link'
import { Building2, ClipboardCheck, Phone, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { TagList } from '@/components/ui/tag'
import { formatDate } from '@/lib/utils'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { count: companiesCount } = await supabase
    .from('companies').select('*', { count: 'exact', head: true })
  const { count: activeCompanies } = await supabase
    .from('companies').select('*', { count: 'exact', head: true }).eq('status', 'active')
  const { count: myAuditCount } = await supabase
    .from('audit_results').select('*', { count: 'exact', head: true }).eq('user_id', ADMIN_USER_ID)
  const { count: totalAuditCount } = await supabase
    .from('audit_results').select('*', { count: 'exact', head: true })
  const { data: recentResults } = await supabase
    .from('audit_results')
    .select('*, companies(name)')
    .eq('user_id', ADMIN_USER_ID)
    .order('created_at', { ascending: false })
    .limit(6)

  const stats = [
    { label: 'Total Companies',     value: companiesCount ?? 0,  icon: Building2,      color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-100' },
    { label: 'Active Companies',    value: activeCompanies ?? 0, icon: Building2,      color: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-100' },
    { label: 'My Audited Calls',    value: myAuditCount ?? 0,    icon: Phone,          color: 'text-[#E8431A]',  bg: 'bg-orange-50', border: 'border-orange-100' },
    { label: 'Total Audited Calls', value: totalAuditCount ?? 0, icon: ClipboardCheck, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' },
  ]

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 lg:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Good day, Admin 👋</h1>
        <p className="text-gray-500 mt-1 text-sm">Here&apos;s your call audit overview.</p>
      </div>

      {/* Stats — 2 cols on mobile, 4 on desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6 lg:mb-8">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.label}>
              <CardContent className="p-4 lg:p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500 leading-tight">{stat.label}</p>
                    <p className="text-2xl lg:text-3xl font-bold text-gray-900 mt-1">{stat.value}</p>
                  </div>
                  <div className={`w-9 h-9 rounded-xl ${stat.bg} border ${stat.border} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-4 h-4 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Bottom section — stacked on mobile, side-by-side on lg */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Quick Start */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Quick Start</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-500">
              Select a company to begin auditing their calls via the n8n workflow.
            </p>
            <Link href="/dashboard/companies">
              <Button className="w-full">
                <Building2 className="w-4 h-4" />
                Browse Companies
                <ArrowRight className="w-4 h-4 ml-auto" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Recent Audits */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">My Recent Audits</CardTitle>
            <Link href="/dashboard/audit-logs">
              <Button variant="ghost" size="sm" className="text-xs">View all</Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {!recentResults || recentResults.length === 0 ? (
              <div className="text-center py-10 text-gray-400 px-6">
                <ClipboardCheck className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No audits yet. Start by selecting a company.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {recentResults.map((result: any) => (
                  <div key={result.id} className="flex items-center justify-between px-4 sm:px-6 py-3 hover:bg-gray-50 transition-colors gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0">
                        <Building2 className="w-3.5 h-3.5 text-[#E8431A]" />
                      </div>
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {result.companies?.name ?? '—'}
                      </span>
                    </div>
                    <div className="flex-shrink-0">
                      <TagList tags={result.call_tags ?? []} max={3} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
