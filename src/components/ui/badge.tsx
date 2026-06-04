import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors border',
  {
    variants: {
      variant: {
        default:    'bg-orange-50 text-[#E8431A] border-orange-200',
        secondary:  'bg-gray-100 text-gray-600 border-gray-200',
        success:    'bg-green-50 text-green-700 border-green-200',
        warning:    'bg-yellow-50 text-yellow-700 border-yellow-200',
        destructive:'bg-red-50 text-red-700 border-red-200',
        info:       'bg-blue-50 text-blue-700 border-blue-200',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
