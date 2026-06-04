'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { TestRun, LLM_LABELS, LLM_MODELS } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, PlayCircle, CheckCircle2, AlertCircle, Clock, BarChart3, Check, ArrowRight, X, Trash2 } from 'lucide-react'
import { formatDate } from '@/lib/utils'

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending:   <Clock className="w-4 h-4 text-gray-400" />,
  running:   <Loader2 className="w-4 h-4 animate-spin text-orange-500" />,
  completed: <CheckCircle2 className="w-4 h-4 text-green-500" />,
  failed:    <AlertCircle className="w-4 h-4 text-red-500" />,
}

interface Props {
  initialRuns: TestRun[]
  completedModels: Record<string, string[]>
}

export function TestRunsClient({ initialRuns, completedModels }: Props) {
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [runName, setRunName] = useState('')
  const [error, setError] = useState('')
  const [compareRun, setCompareRun] = useState<TestRun | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function handleStartRun() {
    setRunning(true); setError('')
    const res = await fetch('/api/testing/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: runName.trim() || undefined }),
    })
    const data = await res.json()
    setRunning(false)
    if (!res.ok || !data.success) { setError(data.error || 'Run failed'); return }
    router.push(`/dashboard/testing/runs/${data.run_id}`)
  }

  return (
    <>
      {/* Compare dialog */}
      {compareRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCompareRun(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <button
              onClick={() => setCompareRun(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
            >
              <X className="w-4 h-4" />
            </button>

            <h2 className="text-base font-bold text-gray-900 mb-4">Run Details</h2>

            {/* ID */}
            <div className="mb-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Run ID</p>
              <p className="text-xs font-mono bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-gray-700 break-all">
                {compareRun.id}
              </p>
            </div>

            {/* LLMs */}
            <div className="mb-5">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">LLMs</p>
              <div className="space-y-2">
                {LLM_MODELS.map(m => {
                  const done = (completedModels[compareRun.id] ?? []).includes(m)
                  return (
                    <div key={m} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
                      <span className="text-sm text-gray-700">{LLM_LABELS[m]}</span>
                      {done
                        ? <Check className="w-4 h-4 text-green-500" />
                        : <span className="text-xs text-gray-300">pending</span>
                      }
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() => { setCompareRun(null); router.push(`/dashboard/testing/runs/${compareRun.id}`) }}
              >
                View Results <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Start new run */}
      <Card className="mb-6">
        <CardContent className="pt-5 space-y-3">
          <div className="flex gap-3">
            <Input
              placeholder="Run name (optional)"
              value={runName}
              onChange={e => setRunName(e.target.value)}
              className="max-w-xs"
              disabled={running}
            />
            <Button onClick={handleStartRun} disabled={running}>
              {running
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Starting...</>
                : <><PlayCircle className="w-4 h-4" /> Start New Run</>
              }
            </Button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </CardContent>
      </Card>

      {/* Runs list */}
      <Card>
        <CardHeader><CardTitle className="text-base">Past Runs ({initialRuns.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {initialRuns.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No runs yet. Start your first test run above.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {initialRuns.map(run => {
                const models = completedModels[run.id] ?? []
                return (
                  <div key={run.id} className="px-5 py-4 flex items-center justify-between gap-4">
                    {/* Left: status + name + date */}
                    <div className="flex items-center gap-3 min-w-0">
                      {STATUS_ICON[run.status]}
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 text-sm truncate">{run.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {run.total_calls} calls · {formatDate(run.created_at)}
                        </p>
                        {/* LLM tick marks */}
                        <div className="flex items-center gap-3 mt-2">
                          {LLM_MODELS.map(m => (
                            <div key={m} className="flex items-center gap-1">
                              {models.includes(m)
                                ? <Check className="w-3 h-3 text-green-500" />
                                : <span className="w-3 h-3 rounded-full border border-gray-200 inline-block" />
                              }
                              <span className="text-[10px] text-gray-400">{LLM_LABELS[m]}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Right: actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setCompareRun(run)}
                        className="text-xs"
                      >
                        Compare
                      </Button>
                      <button
                        onClick={async () => {
                          setDeleting(true)
                          await fetch(`/api/testing/runs/${run.id}`, { method: 'DELETE' })
                          setDeleting(false)
                          router.refresh()
                        }}
                        disabled={deleting}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
