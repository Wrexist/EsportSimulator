import * as React from 'react'

import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // placeholder bumped from /35 to /55 for WCAG AA legibility on
        // glass — match input.tsx.
        'placeholder:text-white/55 focus-visible:border-white/20 focus-visible:bg-white/6 aria-invalid:border-destructive flex min-h-16 w-full rounded-lg border border-white/10 bg-white/4 px-3 py-2 text-base transition-[color,background-color,box-shadow] outline-hidden hover:bg-white/6 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
