import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded text-sm font-semibold select-none touch-manipulation transition-[background-color,border-color,color] duration-100 ease-out active:scale-[0.98] active:duration-0 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-hidden focus-visible:border-gold focus-visible:ring-gold/30 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        /** Design system v2: gold is the one primary action on a screen. */
        default: 'border border-gold bg-gold text-gold-on hover:border-gold-hover hover:bg-gold-hover',
        /** PLAY MATCH / START MATCH: the primary gold action, bolder. */
        play:
          'border border-gold bg-gold text-gold-on hover:border-gold-hover hover:bg-gold-hover font-bold',
        /** Advance time (Next day, Continue, Skip week): gold as well. */
        continue:
          'border border-gold bg-gold text-gold-on hover:border-gold-hover hover:bg-gold-hover font-bold',
        destructive:
          'border border-negative bg-negative text-ink hover:bg-negative/90 focus-visible:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
        outline:
          'border border-line bg-raised text-ink-1 hover:border-line-strong hover:bg-hover',
        secondary:
          'border border-line bg-raised text-ink-1 hover:border-line-strong hover:bg-hover',
        ghost:
          'text-ink-2 hover:bg-raised hover:text-ink-1',
        link: 'text-gold underline-offset-4 hover:text-gold-hover hover:underline active:opacity-70',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-10 px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

import { soundManager } from '@/lib/sound-manager'

const Button = React.forwardRef<HTMLButtonElement, React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"

    // Fire the click sound on pointer-DOWN so audio lands in lockstep with
    // the browser's native :active visual feedback. onClick still owns the
    // actual handler so dragging off the button cancels the action — only
    // the press cue is synced to the press.
    const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!props.disabled && typeof window !== 'undefined') {
        soundManager.play('click')
      }
      props.onPointerDown?.(e)
    }

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      props.onClick?.(e)
    }

    // Hover tick (off unless enabled in Settings → Audio; the manager gates it).
    const handlePointerEnter = (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!props.disabled && e.pointerType === 'mouse') soundManager.play('hover')
      props.onPointerEnter?.(e)
    }

    return (
      <Comp
        data-slot="button"
        data-variant={variant || 'default'}
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
        onPointerDown={handlePointerDown}
        onPointerEnter={handlePointerEnter}
        onClick={handleClick}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
