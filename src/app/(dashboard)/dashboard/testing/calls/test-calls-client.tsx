'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { TestCall } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tag } from '@/components/ui/tag'
import { Plus, Trash2, Loader2, FlaskConical } from 'lucide-react'

export function TestCallsClient({ initialCalls }: { initialCalls: TestCall[] }) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [form, setForm] = useState({ call_id: '', human_tags: '', company_id: '' })

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    const tags = form.human_tags.split(',').map(t => t.trim()).filter(Boolean)
    if (!form.call_id.trim()) { setFormError('Call ID is required.'); return }
    if (tags.length === 0) { setFormError('At least one approved tag is required.'); return }
    if (!form.company_id) { setFormError('Company is required.'); return }
    setSaving(true)
    const res = await fetch('/api/testing/calls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ call_id: form.call_id.trim(), human_tags: tags, company_id: form.company_id }),
    })
    const data = await res.json()
    if (!res.ok) { setFormError(data.error || 'Failed to save'); setSaving(false); return }
    setForm({ call_id: '', human_tags: '', company_id: '' })
    setShowForm(false)
    setSaving(false)
    router.refresh()
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    await fetch(`/api/testing/calls/${id}`, { method: 'DELETE' })
    setDeleting(null)
    router.refresh()
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={() => { setShowForm(!showForm); setFormError('') }}>
          <Plus className="w-4 h-4" /> Add Call
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6">
          <CardHeader><CardTitle className="text-base">New Test Call</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>Call ID <span className="text-red-500">*</span></Label>
                  <Input
                    placeholder="External call identifier"
                    value={form.call_id}
                    onChange={e => setForm(f => ({ ...f, call_id: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>
                    Approved Tags <span className="text-red-500">*</span>
                    <span className="text-gray-400 text-xs font-normal ml-1">(comma-separated)</span>
                  </Label>
                  <Input
                    placeholder="no-greeting, missed-booking"
                    value={form.human_tags}
                    onChange={e => setForm(f => ({ ...f, human_tags: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Company ID <span className="text-red-500">*</span></Label>
                  <Input
                    placeholder="Company UUID"
                    value={form.company_id}
                    onChange={e => setForm(f => ({ ...f, company_id: e.target.value }))}
                  />
                </div>
              </div>
              {formError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-red-600 text-sm">
                  {formError}
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save Call
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {initialCalls.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <FlaskConical className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No test calls yet. Add your first failed call above.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-2.5 font-medium">Call ID</th>
                  <th className="text-left px-4 py-2.5 font-medium">Approved Tags</th>
                  <th className="text-left px-4 py-2.5 font-medium">Company</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {initialCalls.map(call => (
                  <tr key={call.id} className="hover:bg-gray-50/50">
                    <td className="px-5 py-3 font-mono text-xs text-gray-700">{call.call_id}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {call.human_tags.length > 0
                          ? call.human_tags.map(t => <Tag key={t} label={t} />)
                          : <span className="text-xs text-red-400 italic">no tags</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {call.company_id ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      <button
                        onClick={() => handleDelete(call.id)}
                        disabled={deleting === call.id}
                        className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                      >
                        {deleting === call.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Trash2 className="w-4 h-4" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </>
  )
}
