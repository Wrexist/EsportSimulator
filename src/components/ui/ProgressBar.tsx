"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

export type ProgressBarTone = "brand" | "success" | "warning" | "danger" | "neutral" | "auto"
export type ProgressBarSize = "xs" | "sm" | "md"

const TONE_GRADIENT: Record<Exclude<ProgressBarTone, "auto">, string> = {
  brand: "bg-gradient-to-r from-primary/80 to-primary",
  success: "bg-gradient-to-r from-emerald-600 to-emerald-400",
  warning: "bg-gradient-to-r from-amber-600 to-amber-400",
  danger: "bg-gradient-to-r from-rose-600 to-rose-400",
  neutral: "bg-gradient-to-r from-white/40 to-white/70",
}

const HEIGHT_CLASS: Record<ProgressBarSize, string> = {
  xs: "h-1",
  sm: "h-1.5",
  md: "h-2.5",
}

const VALUE_TONE = (v: number) =>
  v >= 80 ? "text-emerald-400" : v >= 60 ? "text-white/80" : "text-rose-400"

function resolveTone(tone: ProgressBarTone, value: number): Exclude<ProgressBarTone, "auto"> {
  if (tone !== "auto") return tone
  if (value >= 80) return "success"
  if (value >= 60) return "brand"
  if (value >= 40) return "warning"
  return "danger"
}

export interface ProgressBarProps {
  /** 0-100 */
  value: number
  label?: string
  /** Show numeric % next to the label. */
  showValue?: boolean
  size?: ProgressBarSize
  tone?: ProgressBarTone
  /** Render the glass-shine + shimmer decoration used in the PlayerCard bars. */
  decorative?: boolean
  className?: string
}

/**
 * ProgressBar — animated, label-capable progress meter.
 * Default is the "LiquidBar" look: 1.5px track, gradient fill, glass shine,
 * hover-triggered shimmer. Use `size` and `tone` to adapt.
 */
export function ProgressBar({
  value,
  label,
  showValue = true,
  size = "sm",
  tone = "auto",
  decorative = true,
  className,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value))
  const resolved = resolveTone(tone, clamped)

  return (
    <div className={cn("flex flex-col gap-1 w-full group/meter", className)}>
      {(label || showValue) && (
        <div className="flex items-center justify-between px-0.5">
          {label && (
            <span className="text-[9px] font-normal uppercase tracking-widest text-muted-foreground/60">
              {label}
            </span>
          )}
          {showValue && (
            <span className={cn("text-[9px] font-bold tabular-nums", VALUE_TONE(clamped))}>
              {Math.round(clamped)}%
            </span>
          )}
        </div>
      )}
      <div className={cn(
        "relative w-full rounded-full bg-white/5 overflow-hidden ring-1 ring-white/5",
        HEIGHT_CLASS[size],
      )}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${clamped}%` }}
          className={cn(
            "absolute inset-y-0 left-0 h-full rounded-full transition-all duration-700 ease-out",
            TONE_GRADIENT[resolved],
          )}
        >
          {decorative && (
            <>
              <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent opacity-80" />
              <div className="absolute inset-0 -translate-x-full group-hover/meter:animate-[shimmer_1s_infinite] bg-gradient-to-r from-transparent via-white/50 to-transparent" />
            </>
          )}
        </motion.div>
      </div>
    </div>
  )
}
