"use client"

import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: {
    label: string
    onClick?: () => void
    href?: string
  }
  /** Extra custom content rendered below the description. */
  children?: ReactNode
  /** Use a dashed, glass-style card frame. Off for raw-content embedding. */
  framed?: boolean
  className?: string
}

/**
 * EmptyState — the canonical "no data yet" panel. Replaces inline variants
 * scattered across feature screens (glass-panel with dashed border + icon).
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  children,
  framed = true,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center text-center",
      framed && "p-10 rounded-2xl border border-dashed border-white/10 bg-white/[0.01]",
      !framed && "py-8",
      className,
    )}>
      {Icon && (
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-5 border border-white/10">
          <Icon className="w-8 h-8 text-muted-foreground/60" />
        </div>
      )}
      <h3 className="text-sm font-bold uppercase tracking-widest text-white">
        {title}
      </h3>
      {description && (
        <p className="text-xs text-muted-foreground/70 mt-2 max-w-md">
          {description}
        </p>
      )}
      {children && <div className="mt-4 w-full max-w-sm">{children}</div>}
      {action && (
        <div className="mt-5">
          {action.href ? (
            <Button asChild variant="outline" size="sm" className="gap-2">
              <a href={action.href}>{action.label}</a>
            </Button>
          ) : (
            <Button onClick={action.onClick} variant="outline" size="sm" className="gap-2">
              {action.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
