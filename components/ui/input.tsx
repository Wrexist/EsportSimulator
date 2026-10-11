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
        'file:text-foreground placeholder:text-ink-2 selection:bg-primary selection:text-primary-foreground h-9 w-full min-w-0 rounded-lg border border-line bg-raised px-3 py-1 text-base transition-[color,background-color,box-shadow] outline-hidden hover:bg-raised file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-line-strong focus-visible:bg-raised',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
