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
        <h1 className="text-2xl font-bold text-[#F1F5F9]">Companies</h1>
        <p className="text-[#6B7280] mt-1">
          Select a company to check and audit their pending calls.
        </p>
      </div>
      <CompaniesClient companies={companies ?? []} />
    </div>
  )
}
