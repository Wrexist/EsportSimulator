"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import {
  Target, Gamepad2, TrendingUp, Heart, Zap, User as UserIcon,
} from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { PlayerPortrait } from "@/components/ui/asset-images"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { getTierStyle, type TierLevel } from "@/engine/tier-system"

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

/**
 * Minimal player shape accepted by PlayerCard.
 * Intentionally loose — any object satisfying these fields works, so we can
 * feed evaluated players, hall-of-fame legends, mvp stubs, etc.
 */
export interface PlayerCardPlayer {
  id: string
  nickname: string
  name?: string
  portraitPath?: string
  role?: string
  secondaryRole?: string
  nationality?: string
  tier?: TierLevel | string
  overallRating?: number
  form?: number
  morale?: number
  fatigue?: number
  salaryPerWeek?: number
  contractYearsLeft?: number
}

export type PlayerCardSize = "xs" | "sm" | "md" | "lg"
export type PlayerCardVariant = "default" | "compact" | "reveal"

export interface PlayerCardOverlays {
  /** Show OVR + tier badge on the right */
  stats?: boolean
  /** Show weekly salary + years-left row */
  contract?: boolean
  /** Show morale / form / energy bars */
  form?: boolean
}

export interface PlayerCardProps {
  player: PlayerCardPlayer
  size?: PlayerCardSize
  variant?: PlayerCardVariant
  overlays?: PlayerCardOverlays
  /** Wrap the whole card in a <Link> to the player's profile */
  href?: string | null
  /** Click handler (overrides href if both are given) */
  onClick?: () => void
  /** Visual selection state */
  selected?: boolean
  /** Dim / mark as inactive */
  muted?: boolean
  /** Tone the border / ring for injury, error, etc. */
  accent?: "default" | "danger" | "success" | "brand"
  /** Arbitrary trailing content rendered as an overlay (action buttons, swap controls) */
  children?: ReactNode
  /** framer-motion layoutId for shared-element transitions */
  layoutId?: string
  className?: string
}

// ────────────────────────────────────────────────────────────────────────────
// Size tokens
// ────────────────────────────────────────────────────────────────────────────

const PORTRAIT_PX: Record<PlayerCardSize, number> = {
  xs: 40,
  sm: 56,
  md: 72,
  lg: 96,
}

const NAME_CLASS: Record<PlayerCardSize, string> = {
  xs: "text-sm",
  sm: "text-base",
  md: "text-xl tracking-tight",
  lg: "text-2xl tracking-tighter",
}

const OVR_CLASS: Record<PlayerCardSize, string> = {
  xs: "text-xl",
  sm: "text-2xl",
  md: "text-4xl",
  lg: "text-5xl",
}

const PADDING_CLASS: Record<PlayerCardSize, string> = {
  xs: "p-2",
  sm: "p-3",
  md: "p-4",
  lg: "p-4",
}

const ACCENT_CLASS = {
  default: "border-white/10 bg-black/30",
  danger: "border-red-500/30 bg-red-500/[0.04]",
  success: "border-emerald-500/30 bg-emerald-500/[0.04]",
  brand: "border-primary/40 bg-primary/[0.06]",
} as const

// ────────────────────────────────────────────────────────────────────────────
// Small helpers
// ────────────────────────────────────────────────────────────────────────────

function roleIcon(role: string | undefined, px = 12) {
  switch (role?.toUpperCase()) {
    case "AWPER": return <Target size={px} className="text-red-400" />
    case "RIFLER": return <Gamepad2 size={px} className="text-blue-400" />
    case "IGL": return <TrendingUp size={px} className="text-amber-400" />
    case "SUPPORT": return <Heart size={px} className="text-emerald-400" />
    case "ENTRY":
    case "ENTRY_FRAGGER": return <Zap size={px} className="text-orange-400" />
    default: return <UserIcon size={px} />
  }
}

function formatRole(role: string | undefined) {
  if (!role) return ""
  if (role.toUpperCase() === "ENTRY_FRAGGER") return "Entry"
  return role
}

function ovrColor(rating: number | undefined) {
  if (rating === undefined) return "text-white/80"
  if (rating >= 90) return "text-transparent bg-clip-text bg-gradient-to-b from-amber-300 to-amber-600"
  if (rating >= 80) return "text-emerald-400"
  return "text-white/80"
}

// ────────────────────────────────────────────────────────────────────────────
// LiquidBar — form/morale/energy meter
// ────────────────────────────────────────────────────────────────────────────

function LiquidBar({ value, label, subColor }: { value: number; label: string; subColor: string }) {
  return (
    <div className="flex flex-col gap-1 w-full group/meter">
      <div className="flex items-center justify-between px-0.5">
        <span className="text-[9px] font-normal uppercase tracking-widest text-muted-foreground/60">
          {label}
        </span>
        <span className={cn(
          "text-[9px] font-bold tabular-nums",
          value >= 80 ? "text-emerald-400" : value >= 60 ? "text-white/80" : "text-rose-400",
        )}>
          {Math.round(value)}%
        </span>
      </div>
      <div className="relative w-full h-1.5 rounded-full bg-white/5 overflow-hidden ring-1 ring-white/5">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
          className={cn("absolute inset-y-0 left-0 h-full rounded-full transition-all duration-700 ease-out", subColor)}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent opacity-80" />
          <div className="absolute inset-0 -translate-x-full group-hover/meter:animate-[shimmer_1s_infinite] bg-gradient-to-r from-transparent via-white/50 to-transparent" />
        </motion.div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// PlayerCard
// ────────────────────────────────────────────────────────────────────────────

export function PlayerCard({
  player,
  size = "md",
  variant = "default",
  overlays,
  href,
  onClick,
  selected = false,
  muted = false,
  accent = "default",
  children,
  layoutId,
  className,
}: PlayerCardProps) {
  const isCompact = variant === "compact" || size === "xs"
  const isReveal = variant === "reveal"
  const portraitPx = PORTRAIT_PX[size]
  const tierStyle = player.tier
    ? (() => {
      try { return getTierStyle(player.tier as TierLevel) } catch { return null }
    })()
    : null

  const linkUrl = href ?? (href === null ? null : `/player/${player.id}`)

  const card = (
    <motion.div
      layoutId={layoutId}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className={cn(
        "relative rounded-2xl border backdrop-blur-md transition-all duration-300 overflow-hidden",
        PADDING_CLASS[size],
        ACCENT_CLASS[accent],
        selected && "border-primary/60 bg-primary/[0.08] scale-[1.01]",
        muted && "opacity-60 grayscale",
        !selected && !muted && "hover:border-white/20 hover:bg-white/[0.04]",
        isReveal && "shadow-2xl",
        onClick && "cursor-pointer",
        className,
      )}
    >
      <div className={cn(
        "relative z-10 flex items-center gap-3",
        isReveal && size === "lg" && "flex-col text-center gap-4",
      )}>
        {/* Portrait */}
        <div
          className={cn(
            "relative shrink-0 rounded-2xl border-2 overflow-hidden shadow-xl",
            accent === "danger"
              ? "bg-red-500/10 border-red-500/40"
              : selected
                ? "bg-primary/10 border-primary/60"
                : "bg-gradient-to-br from-white/10 to-transparent border-white/10",
          )}
          style={{ width: portraitPx, height: portraitPx }}
        >
          <PlayerPortrait src={player.portraitPath} alt={player.nickname} size={portraitPx} />
        </div>

        {/* Identity + bars */}
        <div className={cn(
          "flex flex-col min-w-0",
          isReveal ? "items-center gap-2" : "gap-1.5 flex-1",
        )}>
          <div className={cn("flex items-center gap-2 flex-wrap", isReveal && "justify-center")}>
            <span className={cn("font-normal leading-none text-white", NAME_CLASS[size])}>
              {player.nickname}
            </span>
            {tierStyle && (
              <Badge className={cn("text-[9px] px-2 py-0.5 border-none", tierStyle.bgColor, tierStyle.color)}>
                {tierStyle.shortLabel}
              </Badge>
            )}
          </div>

          {!isCompact && (
            <div className={cn("flex items-center gap-3 opacity-90", isReveal && "justify-center")}>
              {player.role && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 border border-white/5">
                  {roleIcon(player.role, 12)}
                  <span className="text-[10px] font-bold uppercase tracking-wide text-white/80">
                    {formatRole(player.role)}
                  </span>
                  {player.secondaryRole && (
                    <span className="text-[9px] text-white/40 uppercase">
                      +{formatRole(player.secondaryRole)}
                    </span>
                  )}
                </div>
              )}
              {player.nationality && (
                <CountryFlag country={player.nationality} showName={false} size={16} />
              )}
              {player.name && isReveal && (
                <span className="text-[11px] text-white/50">{player.name}</span>
              )}
            </div>
          )}

          {isCompact && player.role && (
            <div className="flex items-center gap-2 opacity-80">
              {roleIcon(player.role, 10)}
              <span className="text-[10px] font-bold uppercase tracking-wide text-white/70">
                {formatRole(player.role)}
              </span>
              {player.nationality && (
                <CountryFlag country={player.nationality} showName={false} size={12} />
              )}
            </div>
          )}

          {overlays?.contract && (player.salaryPerWeek !== undefined || player.contractYearsLeft !== undefined) && (
            <div className={cn("flex items-center gap-2 text-[9px] font-medium text-white/40 mt-1", isReveal && "justify-center")}>
              {player.salaryPerWeek !== undefined && (
                <span className="text-emerald-400 font-bold">
                  ${(player.salaryPerWeek / 1000).toFixed(1)}k/wk
                </span>
              )}
              {player.salaryPerWeek !== undefined && player.contractYearsLeft !== undefined && (
                <span className="w-1 h-1 rounded-full bg-white/20" />
              )}
              {player.contractYearsLeft !== undefined && (
                <span>{player.contractYearsLeft.toFixed(1)}y left</span>
              )}
            </div>
          )}

          {overlays?.form && !isReveal && (
            <div className="flex-1 w-full grid grid-cols-1 gap-1.5 mt-2">
              <LiquidBar
                label="Morale"
                value={player.morale ?? 75}
                subColor="bg-gradient-to-r from-emerald-600 to-emerald-400"
              />
              <LiquidBar
                label="Form"
                value={player.form ?? 70}
                subColor="bg-gradient-to-r from-blue-600 to-blue-400"
              />
              <LiquidBar
                label="Energy"
                value={Math.max(0, 100 - (player.fatigue ?? 0))}
                subColor="bg-gradient-to-r from-amber-600 to-amber-400"
              />
            </div>
          )}
        </div>

        {/* OVR */}
        {overlays?.stats && player.overallRating !== undefined && (
          <div className={cn(
            "shrink-0 flex flex-col items-center justify-center",
            isReveal && size === "lg" ? "" : "w-[88px]",
          )}>
            <span className={cn(
              "font-normal tracking-tighter leading-none drop-shadow-2xl",
              OVR_CLASS[size],
              ovrColor(player.overallRating),
            )}>
              {player.overallRating}
            </span>
            <span className="text-[10px] font-normal text-muted-foreground uppercase mt-1 tracking-[0.2em] opacity-60">
              OVR
            </span>
          </div>
        )}
      </div>

      {/* Feature-specific overlays (injury, swap controls, award ribbons, …) */}
      {children}
    </motion.div>
  )

  if (linkUrl && !onClick) {
    return (
      <Link href={linkUrl} className="block">
        {card}
      </Link>
    )
  }

  return card
}
