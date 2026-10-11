import * as React from 'react'

import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // placeholder bumped from /35 to /55 for WCAG AA legibility on
        // glass — match input.tsx.
        'placeholder:text-ink-2 focus-visible:border-line-strong focus-visible:bg-raised aria-invalid:border-destructive flex min-h-16 w-full rounded-lg border border-line bg-raised px-3 py-2 text-base transition-[color,background-color,box-shadow] outline-hidden hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
