'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export function CopyId({ id, className }: { id: string; className?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(id).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'group inline-flex items-center gap-1.5 font-mono text-xs text-gray-500 hover:text-[#E8431A] transition-colors',
        className
      )}
      title="Click to copy"
    >
      <span>{id}</span>
      <span className="opacity-0 group-hover:opacity-100 transition-opacity">
        {copied
          ? <Check className="w-3 h-3 text-green-500" />
          : <Copy className="w-3 h-3" />
        }
      </span>
    </button>
  )
}
