"use client"

import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export type SectionHeaderSize = "sm" | "md" | "lg"
export type SectionHeaderTone = "default" | "muted" | "primary"

export interface SectionHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  icon?: LucideIcon
  iconClassName?: string
  size?: SectionHeaderSize
  tone?: SectionHeaderTone
  /** Content rendered at the right edge (badge, button, meta). */
  actions?: ReactNode
  className?: string
}

const TITLE_CLASS: Record<SectionHeaderSize, string> = {
  sm: "text-[11px]",
  md: "text-sm",
  lg: "text-base",
}

const TONE_CLASS: Record<SectionHeaderTone, string> = {
  default: "text-white",
  muted: "text-white/60",
  primary: "text-primary",
}

/**
 * SectionHeader — the consistent "icon + title + optional subtitle + right-aligned action" block
 * used across feature screens (squad, stats, hall-of-fame, training, etc.).
 */
export function SectionHeader({
  title,
  subtitle,
  icon: Icon,
  iconClassName,
  size = "md",
  tone = "default",
  actions,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <div className="flex items-start gap-3 min-w-0">
        {Icon && (
          <Icon
            size={size === "lg" ? 20 : 16}
            className={cn("shrink-0 mt-0.5 text-primary", iconClassName)}
          />
        )}
        <div className="min-w-0 space-y-1">
          <h3 className={cn(
            "font-normal uppercase tracking-widest flex items-center gap-2",
            TITLE_CLASS[size],
            TONE_CLASS[tone],
          )}>
            {title}
          </h3>
          {subtitle && (
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}
