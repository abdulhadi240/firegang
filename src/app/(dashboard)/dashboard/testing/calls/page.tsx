import { createClient } from '@/lib/supabase/server'
import { TestCall } from '@/types'
import { FlaskConical } from 'lucide-react'
import { TestCallsClient } from './test-calls-client'

export default async function TestCallsPage() {
  const supabase = await createClient()
  const { data: calls } = await supabase
    .from('test_calls')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FlaskConical className="w-5 h-5 sm:w-6 sm:h-6 text-[#E8431A]" /> Test Calls
        </h1>
        <p className="text-gray-500 mt-1 text-sm">
          Failed calls with approved tags — used as ground truth for LLM scoring. {calls?.length ?? 0} saved.
        </p>
      </div>
      <TestCallsClient initialCalls={(calls as TestCall[]) ?? []} />
    </div>
  )
}
