import { createClient } from '@/lib/supabase/server'
import { CompaniesClient } from './companies-client'

export default async function CompaniesPage() {
  const supabase = await createClient()

  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, status, created_at')
    .order('name', { ascending: true })

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Companies</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Select a company to check and audit their pending calls.
        </p>
      </div>
      <CompaniesClient companies={companies ?? []} />
    </div>
  )
}
