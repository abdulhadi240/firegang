import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { SummaryDocument } from '@/types'
import { DocEditor } from './doc-editor'

export default async function SummaryDocPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data } = await supabase
    .from('summary_documents')
    .select('*')
    .eq('id', id)
    .single()

  if (!data) notFound()

  return (
    <DocEditor document={data as SummaryDocument} />
  )
}
