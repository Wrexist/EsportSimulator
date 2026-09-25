"use client"

import Link from "next/link"
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
      "premium-empty-state flex flex-col items-center justify-center text-center",
      framed && "p-6 sm:p-8 rounded-xl border border-dashed border-white/10 bg-white/[0.01]",
      !framed && "py-8",
      className,
    )}>
      {Icon && (
        <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-4 border border-white/10">
          <Icon className="w-6 h-6 text-muted-foreground" />
        </div>
      )}
      <h3 className="text-base font-semibold text-foreground">
        {title}
      </h3>
      {description && (
        <p className="text-sm leading-relaxed text-muted-foreground mt-2 max-w-md">
          {description}
        </p>
      )}
      {children && <div className="mt-4 w-full max-w-sm">{children}</div>}
      {action && (
        <div className="mt-5">
          {action.href ? (
            <Button asChild variant="outline" size="sm" className="gap-2">
              <Link href={action.href}>{action.label}</Link>
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
