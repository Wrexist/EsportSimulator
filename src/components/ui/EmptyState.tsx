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
  /** Draw a dashed frame. Off for raw-content embedding. */
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
      framed && "rounded-lg border border-dashed border-line-strong px-6 py-6",
      !framed && "py-6",
      className,
    )}>
      {Icon && (
        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-raised">
          <Icon className="h-[18px] w-[18px] text-ink-3" />
        </div>
      )}
      <h3 className="text-sm font-semibold text-ink-1">
        {title}
      </h3>
      {description && (
        <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-3">
          {description}
        </p>
      )}
      {children && <div className="mt-3 w-full max-w-sm">{children}</div>}
      {action && (
        <div className="mt-4">
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
