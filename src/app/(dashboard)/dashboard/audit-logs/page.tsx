import { createClient } from '@/lib/supabase/server'
import { ADMIN_USER_ID } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ClipboardList } from 'lucide-react'
import { AuditLogsClient } from './audit-logs-client'

export default async function AuditLogsPage() {
  const supabase = await createClient()

  const { data: results } = await supabase
    .from('audit_results')
    .select('*, companies(name)')
    .eq('user_id', ADMIN_USER_ID)
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">My Audit Logs</h1>
        <p className="text-gray-500 mt-1">All call audit records submitted by you. Click a row to see full details.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-[#E8431A]" />
            Audited Calls ({results?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <AuditLogsClient results={results ?? []} />
        </CardContent>
      </Card>
    </div>
  )
}
