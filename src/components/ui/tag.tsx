import { cn } from '@/lib/utils'

// Deterministic color from tag string
const TAG_COLORS = [
  'bg-orange-100 text-orange-700 border-orange-200',
  'bg-blue-100 text-blue-700 border-blue-200',
  'bg-green-100 text-green-700 border-green-200',
  'bg-purple-100 text-purple-700 border-purple-200',
  'bg-pink-100 text-pink-700 border-pink-200',
  'bg-teal-100 text-teal-700 border-teal-200',
  'bg-yellow-100 text-yellow-700 border-yellow-200',
  'bg-indigo-100 text-indigo-700 border-indigo-200',
]

function tagColor(tag: string) {
  let hash = 0
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash)
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length]
}

interface TagProps {
  label: string
  className?: string
}

export function Tag({ label, className }: TagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        tagColor(label),
        className
      )}
    >
      {label}
    </span>
  )
}

export function TagList({ tags, max }: { tags: string[]; max?: number }) {
  if (!tags || tags.length === 0) {
    return <span className="text-gray-300 text-xs italic">No tags</span>
  }
  const visible = max ? tags.slice(0, max) : tags
  const remaining = max ? tags.length - max : 0
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((tag) => (
        <Tag key={tag} label={tag} />
      ))}
      {remaining > 0 && (
        <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
          +{remaining}
        </span>
      )}
    </div>
  )
}
