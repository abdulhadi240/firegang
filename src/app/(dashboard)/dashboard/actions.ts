'use server'

import { updateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { WRONG_TAGS_CACHE_TAG } from '@/lib/callrail'

/** Drops the cached CallRail wrong-tag counts so the next render re-fetches them. */
export async function refreshWrongTags() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  updateTag(WRONG_TAGS_CACHE_TAG)
}
