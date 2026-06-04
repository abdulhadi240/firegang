'use client'

import { useState } from 'react'
import { Company } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Phone, Loader2, PhoneCall, Radio } from 'lucide-react'

interface CompanyAuditClientProps {
  company: Company
  userId: string
  auditResults: unknown[]
}

export function CompanyAuditClient({ company, userId, auditResults }: CompanyAuditClientProps) {
  const [loading, setLoading] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [error, setError] = useState('')

  const handleStartAudit = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/audit/check-calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: company.id }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Webhook did not return success')
      setShowDialog(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowDialog(false)} />
          <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-7 sm:p-8 w-full sm:max-w-sm text-center">
            <div className="relative w-16 h-16 mx-auto mb-5">
              <div className="absolute inset-0 rounded-full bg-orange-100 animate-ping opacity-75" />
              <div className="relative w-16 h-16 rounded-full bg-orange-100 border border-orange-200 flex items-center justify-center">
                <Radio className="w-7 h-7 text-[#E8431A]" />
              </div>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Auditing in Progress</h2>
            <p className="text-sm text-gray-500 mb-6">
              The n8n workflow is now auditing calls for{' '}
              <span className="font-medium text-gray-700">{company.name}</span>.
              Results will appear as they are logged.
            </p>
            <Button className="w-full" onClick={() => setShowDialog(false)}>Got it</Button>
          </div>
        </div>
      )}

      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <PhoneCall className="w-5 h-5 text-[#E8431A]" />
            Start Call Audit
          </CardTitle>
          <CardDescription>
            Trigger n8n to fetch and audit pending calls for {company.name}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={handleStartAudit} disabled={loading} className="w-full">
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Contacting n8n...</>
              : <><Phone className="w-4 h-4" /> Start Call Audit</>
            }
          </Button>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-600 text-sm">
              {error}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
