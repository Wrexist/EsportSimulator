import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-cyan-300 focus-visible:ring-cyan-300/25 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,background-color,border-color,box-shadow] duration-200 overflow-hidden',
  {
    variants: {
      variant: {
        default:
          'border-cyan-300/20 bg-cyan-300/[0.14] text-cyan-100 shadow-glass-soft [a&]:hover:bg-cyan-300/20',
        secondary:
          'border-white/10 bg-white/[0.075] text-white/75 [a&]:hover:bg-white/[0.11]',
        destructive:
          'border-red-400/25 bg-red-500/[0.16] text-red-100 [a&]:hover:bg-red-500/[0.22] focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40',
        outline:
          'border-white/10 bg-white/[0.035] text-white/70 [a&]:hover:bg-white/[0.08] [a&]:hover:text-white',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span'

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
