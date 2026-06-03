import * as React from 'react'

import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // placeholder bumped from /35 (sub-WCAG AA on glass) to /55 so
        // placeholder text is legibly distinct from the input chrome.
        'file:text-foreground placeholder:text-white/55 selection:bg-primary selection:text-primary-foreground h-9 w-full min-w-0 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1 text-base transition-[color,background-color,box-shadow] outline-none hover:bg-white/[0.06] file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-white/20 focus-visible:bg-white/[0.06]',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
