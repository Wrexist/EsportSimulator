"use client"

import { cn } from "@/lib/utils"
import { getTierStyle, type TierLevel } from "@/engine/tier-system"

/**
 * Rating — a stat or tier badge. Two modes:
 *  - numeric (`value` number) renders a large tinted number with optional label
 *  - tier (`tier` string) renders a colored tier chip via the design tokens
 */

export type RatingSize = "sm" | "md" | "lg"

export interface NumericRatingProps {
  value: number
  label?: string
  size?: RatingSize
  /** Override the numeric color bands. */
  colorFor?: (v: number) => string
  className?: string
}

export interface TierRatingProps {
  tier: TierLevel | string
  size?: RatingSize
  short?: boolean
  className?: string
}

const NUMBER_CLASS: Record<RatingSize, string> = {
  sm: "text-lg",
  md: "text-3xl",
  lg: "text-5xl",
}

function defaultColor(value: number): string {
  if (value >= 90) return "text-transparent bg-clip-text bg-gradient-to-b from-amber-300 to-amber-600"
  if (value >= 80) return "text-emerald-400"
  if (value >= 60) return "text-white/80"
  return "text-rose-400"
}

export function Rating({
  value,
  label = "OVR",
  size = "md",
  colorFor,
  className,
}: NumericRatingProps) {
  const color = (colorFor ?? defaultColor)(value)
  return (
    <div className={cn("flex flex-col items-center", className)}>
      <span className={cn(
        "font-normal tracking-tighter leading-none drop-shadow-2xl tabular-nums",
        NUMBER_CLASS[size],
        color,
      )}>
        {Math.round(value)}
      </span>
      {label && (
        <span className="text-[10px] font-normal text-muted-foreground uppercase mt-1 tracking-[0.2em] opacity-60">
          {label}
        </span>
      )}
    </div>
  )
}

export function TierBadge({ tier, size = "md", short = false, className }: TierRatingProps) {
  let style: ReturnType<typeof getTierStyle> | null = null
  try { style = getTierStyle(tier as TierLevel) } catch { style = null }
  if (!style) return null
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 font-bold uppercase tracking-widest",
        size === "sm" && "text-[9px]",
        size === "md" && "text-[10px]",
        size === "lg" && "text-xs",
        style.bgColor,
        style.color,
        className,
      )}
    >
      {short ? style.shortLabel : style.label}
    </span>
  )
}
