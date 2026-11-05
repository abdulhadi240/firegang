'use server'

import { updateTag } from 'next/cache'
import { isAuthenticated } from '@/lib/auth'
import { WRONG_TAGS_CACHE_TAG } from '@/lib/callrail'

/** Drops the cached CallRail wrong-tag counts so the next render re-fetches them. */
export async function refreshWrongTags() {
  if (!(await isAuthenticated())) throw new Error('Unauthorized')

  updateTag(WRONG_TAGS_CACHE_TAG)
}
