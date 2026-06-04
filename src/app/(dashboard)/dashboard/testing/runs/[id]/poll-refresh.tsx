'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function PollRefresh({ status }: { status: string }) {
  const router = useRouter()

  useEffect(() => {
    if (status !== 'running') return
    const id = setInterval(() => router.refresh(), 3000)
    return () => clearInterval(id)
  }, [status, router])

  return null
}
