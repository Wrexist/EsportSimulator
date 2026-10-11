"use client"

import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export type StatTileSize = "sm" | "md" | "lg"
export type StatTileTone = "default" | "success" | "warning" | "danger" | "brand"

export interface StatTileProps {
  label: string
  value: ReactNode
  icon?: LucideIcon
  size?: StatTileSize
  tone?: StatTileTone
  /** Place label above the value (default) or below. */
  labelPosition?: "top" | "bottom"
  className?: string
}

const VALUE_CLASS: Record<StatTileSize, string> = {
  sm: "text-lg",
  md: "text-xl",
  lg: "text-3xl",
}

const TONE_CLASS: Record<StatTileTone, string> = {
  default: "text-ink-1",
  success: "text-positive",
  warning: "text-caution",
  danger: "text-negative",
  brand: "text-gold",
}

/**
 * StatTile — one metric on a v2 panel surface: overline label + display-face value.
 * Replaces the ad-hoc `<div className="glass-panel px-6 py-3 rounded-2xl">...<span>Label</span><span>Value</span></div>` pattern.
 */
export function StatTile({
  label,
  value,
  icon: Icon,
  size = "md",
  tone = "default",
  labelPosition = "top",
  className,
}: StatTileProps) {
  const labelNode = (
    <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
      {label}
    </span>
  )
  const valueNode = (
    <span className={cn("font-display font-bold leading-none tabular-nums", VALUE_CLASS[size], TONE_CLASS[tone])}>
      {value}
    </span>
  )

  return (
    <div className={cn(
      "premium-metric rounded-lg border border-line bg-panel",
      size === "sm" && "px-4 py-2",
      size === "md" && "px-6 py-3",
      size === "lg" && "px-8 py-5",
      className,
    )}>
      {Icon && <Icon className={cn("mb-2 opacity-60", TONE_CLASS[tone])} size={18} />}
      <div className={cn("flex flex-col gap-1", labelPosition === "bottom" && "flex-col-reverse")}>
        {labelNode}
        {valueNode}
      </div>
    </div>
  )
}
