import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'
import { motion } from "framer-motion"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 active:text-primary-foreground active:scale-95 transition-all',
        destructive:
          'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60 active:bg-destructive/80 active:text-white active:scale-95 transition-all',
        outline:
          'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 active:bg-accent active:text-accent-foreground active:scale-95 transition-all',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/70 active:text-secondary-foreground active:scale-95 transition-all',
        ghost:
          'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 active:bg-accent active:text-accent-foreground active:scale-95 transition-all',
        link: 'text-primary underline-offset-4 hover:underline active:opacity-70 transition-all',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
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

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      soundManager.play('click')
      props.onClick?.(e)
    }

    const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
      // soundManager.play('hover') // Too noisy by default, maybe make optional prop?
      props.onMouseEnter?.(e)
    }

    const MotionComp = motion(Comp as any)

    return (
      <MotionComp
        data-slot="button"
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        whileHover={{ scale: 1.02, brightness: 1.1 }}
        whileTap={{ scale: 0.96 }}
        transition={{ type: "spring", stiffness: 400, damping: 15 }}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
