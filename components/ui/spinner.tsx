import { Loader2Icon } from 'lucide-react'

import { cn } from '@/lib/utils'

function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    // motion-safe: gates the spin on prefers-reduced-motion: no-preference.
    // The role/aria-label still announces the loading state for users who
    // disable animations.
    <Loader2Icon
      role="status"
      aria-label="Loading"
      className={cn('size-4 motion-safe:animate-spin motion-reduce:opacity-60', className)}
      {...props}
    />
  )
}

export { Spinner }
