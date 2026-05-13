import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium select-none touch-manipulation will-change-transform transition-[background-color,border-color,color] duration-75 ease-out hover:-translate-y-px active:translate-y-0 active:scale-[0.97] active:duration-0 disabled:pointer-events-none disabled:opacity-50 disabled:hover:translate-y-0 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-cyan-300 focus-visible:ring-cyan-300/25 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: 'liquid-button bg-white text-black hover:bg-white/90 active:bg-white/85 active:text-black shadow-glass-soft',
        destructive:
          'border border-red-400/25 bg-red-500/80 text-white shadow-glass-soft hover:bg-red-500 focus-visible:ring-destructive/20 dark:aria-invalid:ring-destructive/40 dark:bg-destructive/60 active:bg-red-600 active:text-white',
        outline:
          'liquid-button text-white/90 hover:text-white hover:border-white/20 hover:bg-white/10 dark:bg-white/[0.055] dark:border-white/10 dark:hover:bg-white/[0.085] active:bg-white/[0.12]',
        secondary:
          'border border-white/10 bg-white/[0.075] text-white/90 shadow-glass-soft hover:bg-white/[0.11] active:bg-white/[0.08]',
        ghost:
          'text-white/70 hover:bg-white/[0.075] hover:text-white active:bg-white/[0.1]',
        link: 'text-cyan-300 underline-offset-4 hover:text-white hover:underline active:opacity-70',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 rounded-lg gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-lg px-6 has-[>svg]:px-4',
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

    return (
      <Comp
        data-slot="button"
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
