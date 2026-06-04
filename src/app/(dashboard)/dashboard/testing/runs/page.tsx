import { createClient } from '@/lib/supabase/server'
import { TestRun } from '@/types'
import { BarChart3 } from 'lucide-react'
import { TestRunsClient } from './test-runs-client'

export default async function TestRunsPage() {
  const supabase = await createClient()

  const [{ data: runs }, { data: modelRows }] = await Promise.all([
    supabase.from('test_runs').select('*').order('created_at', { ascending: false }),
    supabase.from('test_results').select('test_run_id, llm_model'),
  ])

  // Build map: run_id → set of models that have results
  const completedModels: Record<string, string[]> = {}
  for (const row of (modelRows ?? [])) {
    if (!completedModels[row.test_run_id]) completedModels[row.test_run_id] = []
    if (!completedModels[row.test_run_id].includes(row.llm_model)) {
      completedModels[row.test_run_id].push(row.llm_model)
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-[#E8431A]" /> Test Runs
        </h1>
        <p className="text-gray-500 mt-1 text-sm">
          Run all test calls through all 4 LLMs and compare results side-by-side.
        </p>
      </div>
      <TestRunsClient
        initialRuns={(runs as TestRun[]) ?? []}
        completedModels={completedModels}
      />
    </div>
  )
}
