import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-md border font-medium w-fit whitespace-nowrap shrink-0 gap-1 [&>svg]:pointer-events-none focus-visible:border-gold focus-visible:ring-gold/25 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,background-color,border-color,box-shadow] duration-200 overflow-hidden',
  {
    variants: {
      variant: {
        default:
          'border-gold/20 bg-gold/15 text-gold [a&]:hover:bg-gold/20',
        secondary:
          'border-line bg-hover text-ink-2 [a&]:hover:bg-hover',
        destructive:
          'border-negative/30 bg-negative/16 text-negative [a&]:hover:bg-negative/20 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40',
        outline:
          'border-line bg-raised text-ink-2 [a&]:hover:bg-hover [a&]:hover:text-ink-1',
      },
      size: {
        default: 'px-2 py-0.5 text-xs [&>svg]:size-3',
        // Micro badge for dense rows (tier chips, stat tags) — replaces the
        // inline `text-[11px] px-1.5 py-0` one-offs scattered across screens.
        xs: 'px-1.5 py-0 text-[11px] [&>svg]:size-2.5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Badge({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span'

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
