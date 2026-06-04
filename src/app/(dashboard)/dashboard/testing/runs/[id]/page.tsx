import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { TestRun, TestResult, LLM_MODELS, LLM_LABELS, LLM_COSTS, LlmModel } from '@/types'
import { CheckCircle2, XCircle, ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'
import { PollRefresh } from './poll-refresh'

type CallRow = {
  human_tags: string[]
  models: Partial<Record<LlmModel, TestResult>>
}

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: run }, { data: results }] = await Promise.all([
    supabase.from('test_runs').select('*').eq('id', id).single(),
    supabase
      .from('test_results')
      .select('*, test_calls(human_tags)')
      .eq('test_run_id', id)
      .order('created_at', { ascending: true }),
  ])

  if (!run) notFound()

  const byCall: Record<string, CallRow> = {}
  for (const r of (results ?? [])) {
    const tc = (r as any).test_calls
    if (!byCall[r.test_call_id]) {
      byCall[r.test_call_id] = { human_tags: tc?.human_tags ?? [], models: {} }
    }
    byCall[r.test_call_id].models[r.llm_model as LlmModel] = r as TestResult
  }

  const calls = Object.entries(byCall)

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PollRefresh status={(run as TestRun).status} />

      <Link
        href="/dashboard/testing/runs"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-5 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Runs
      </Link>

      {(run as TestRun).status === 'running' && (
        <div className="mb-5 flex items-start sm:items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-sm text-orange-700">
          <Loader2 className="w-4 h-4 animate-spin shrink-0 mt-0.5 sm:mt-0" />
          <span>n8n is processing — results will appear automatically as they come in.</span>
        </div>
      )}

      <div className="mb-5 sm:mb-6">
        <h1 className="text-lg sm:text-xl font-bold text-gray-900">{(run as TestRun).name}</h1>
        <p className="text-gray-400 text-xs mt-1">
          {(run as TestRun).total_calls} calls · {formatDate((run as TestRun).created_at)}
        </p>
      </div>

      {calls.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">No results yet.</div>
      ) : (
        <div className="space-y-8">
          {calls.map(([callId, call], idx) => {
            const humanTags = call.human_tags

            return (
              <div key={callId}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                  Call {idx + 1}
                </p>

                {/* Pricing-style cards — horizontal scroll on small screens */}
                <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 -mx-1 px-1">

                  {/* Human / Approved card */}
                  <div className="flex-shrink-0 w-44 sm:w-52 rounded-2xl border-2 border-gray-200 bg-white flex flex-col">
                    <div className="px-4 pt-5 pb-3 border-b border-gray-100">
                      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Approved</p>
                      <p className="text-base font-bold text-gray-900 mt-0.5">Ground Truth</p>
                    </div>
                    <div className="flex-1 px-4 py-4 space-y-2.5">
                      {humanTags.map(tag => (
                        <div key={tag} className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                          <span className="text-sm text-gray-700 leading-tight">{tag}</span>
                        </div>
                      ))}
                    </div>
                    <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
                      <p className="text-xs text-gray-400">{humanTags.length} tags</p>
                    </div>
                  </div>

                  {/* One card per LLM model */}
                  {LLM_MODELS.map(m => {
                    const r = call.models[m]
                    const llmTags = r?.llm_tags ?? []
                    const isCurrent = m === 'google/gemini-3-flash-preview'
                    const matched = llmTags.filter(t => humanTags.includes(t)).length
                    const total = humanTags.length
                    const pct = total > 0 ? Math.round((matched / total) * 100) : 0

                    return (
                      <div
                        key={m}
                        className={`flex-shrink-0 w-44 sm:w-52 rounded-2xl border-2 flex flex-col ${
                          isCurrent
                            ? 'border-[#E8431A] bg-white shadow-md shadow-orange-100'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                        {/* Card header */}
                        <div className={`px-4 pt-5 pb-3 border-b ${isCurrent ? 'border-orange-100' : 'border-gray-100'}`}>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <p className="text-xs font-semibold text-gray-700">
                              {LLM_LABELS[m]}
                            </p>
                            {isCurrent && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-[#E8431A] font-semibold">
                                Current
                              </span>
                            )}
                          </div>
                          <div className="flex gap-2 mt-1 mb-2">
                            <span className="text-[10px] text-gray-400">
                              In: <span className="font-medium text-gray-600">{LLM_COSTS[m].input}</span>
                            </span>
                            <span className="text-[10px] text-gray-300">·</span>
                            <span className="text-[10px] text-gray-400">
                              Out: <span className="font-medium text-gray-600">{LLM_COSTS[m].output}</span>
                            </span>
                            <span className="text-[10px] text-gray-300">/1M</span>
                          </div>
                          {!r ? (
                            <p className="text-sm text-gray-300 italic">Pending...</p>
                          ) : (
                            <p className="text-base font-bold text-gray-900">
                              {matched}<span className="text-sm font-normal text-gray-400">/{total}</span>
                              <span className="text-sm font-normal text-gray-400 ml-1">({pct}%)</span>
                            </p>
                          )}
                        </div>

                        {/* Tags list */}
                        <div className="flex-1 px-4 py-4 space-y-2.5">
                          {!r ? (
                            <p className="text-xs text-gray-300 italic">No results yet</p>
                          ) : llmTags.length === 0 ? (
                            <p className="text-xs text-gray-300 italic">No tags returned</p>
                          ) : (
                            llmTags.map(tag => {
                              const correct = humanTags.includes(tag)
                              return (
                                <div key={tag} className="flex items-start gap-2">
                                  {correct
                                    ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                                    : <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                  }
                                  <span className={`text-sm leading-tight ${correct ? 'text-gray-700' : 'text-gray-400'}`}>
                                    {tag}
                                  </span>
                                </div>
                              )
                            })
                          )}
                        </div>

                        {/* Score footer */}
                        <div className={`px-4 py-3 border-t rounded-b-2xl ${
                          isCurrent ? 'border-orange-100 bg-orange-50' : 'border-gray-100 bg-gray-50'
                        }`}>
                          {r ? (
                            <p className={`text-xs font-semibold ${
                              pct === 100 ? 'text-green-600' : pct >= 60 ? 'text-orange-500' : 'text-red-500'
                            }`}>
                              {matched}/{total} correct · {pct}%
                            </p>
                          ) : (
                            <p className="text-xs text-gray-300">—</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
