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
  default: "text-white",
  success: "text-emerald-400",
  warning: "text-amber-400",
  danger: "text-rose-400",
  brand: "text-primary",
}

/**
 * StatTile — a small glass-style box showing one metric: value + label.
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
    <span className="text-[10px] font-normal text-muted-foreground uppercase tracking-widest block">
      {label}
    </span>
  )
  const valueNode = (
    <span className={cn("font-normal leading-none tabular-nums", VALUE_CLASS[size], TONE_CLASS[tone])}>
      {value}
    </span>
  )

  return (
    <div className={cn(
      "glass-card rounded-lg border-white/5 bg-white/[0.02]",
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
