"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import {
  Target, Gamepad2, TrendingUp, Heart, Zap, User as UserIcon,
} from "lucide-react"
import { memo, type ReactNode } from "react"

import { cn } from "@/lib/utils"
import { RATING_TEXT, ratingBand } from "@/src/design/rating"
import { formatRole, formatCurrency } from "@/lib/utils-extended"

import { Badge } from "@/components/ui/badge"
import { PlayerPortrait } from "@/components/ui/asset-images"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { ProgressBar } from "@/src/components/ui/ProgressBar"
import { playerEnergyPercent } from "@/lib/player-energy"
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
  energy?: number
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
  default: "border-line bg-shell",
  danger: "border-negative/30 bg-negative/4",
  success: "border-positive/30 bg-positive/5",
  brand: "border-gold/40 bg-gold/5",
} as const

// ────────────────────────────────────────────────────────────────────────────
// Small helpers
// ────────────────────────────────────────────────────────────────────────────

function roleIcon(role: string | undefined, px = 12) {
  switch (role?.toUpperCase()) {
    case "AWPER": return <Target size={px} className="text-ink-2" />
    case "RIFLER": return <Gamepad2 size={px} className="text-ink-2" />
    case "IGL": return <TrendingUp size={px} className="text-ink-2" />
    case "SUPPORT": return <Heart size={px} className="text-ink-2" />
    case "ENTRY":
    case "ENTRY_FRAGGER": return <Zap size={px} className="text-ink-2" />
    default: return <UserIcon size={px} />
  }
}

/** Same rating bands as RatingChip (design system v2). */
function ovrColor(rating: number | undefined) {
  if (rating === undefined) return "text-ink-1"
  return RATING_TEXT[ratingBand(Math.round(rating))]
}

// ────────────────────────────────────────────────────────────────────────────
// PlayerCard
// ────────────────────────────────────────────────────────────────────────────

function PlayerCardImpl({
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

  // Skip the spring entrance for non-reveal cards — it re-fires every time the
  // parent list re-renders and adds visible jitter at scale. Keep it for the
  // hero/reveal variant where the card is the focal point.
  const Wrapper: any = isReveal ? motion.div : "div"
  const wrapperProps = isReveal
    ? {
        layoutId,
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
      }
    : {}

  const card = (
    <Wrapper
      {...wrapperProps}
      onClick={onClick}
      className={cn(
        "group relative rounded-lg border overflow-hidden",
        "transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out",
        PADDING_CLASS[size],
        ACCENT_CLASS[accent],
        selected && "border-gold bg-hover",
        muted && "opacity-60 grayscale",
        !selected && !muted && "hover:border-line-strong hover:bg-raised",
        isReveal && "border-line-strong",
        onClick && "cursor-pointer",
        className,
      )}
    >
      <div className={cn(
        "relative z-10 flex items-center gap-3",
        isReveal && size === "lg" && "flex-col text-center gap-4",
      )}>
        {/* Stable portrait shared with profile and transfer screens. */}
        <div
          className={cn(
            "relative shrink-0 rounded-md border overflow-hidden",
            accent === "danger"
              ? "bg-negative/10 border-negative/40"
              : selected
                ? "bg-raised border-gold"
                : "bg-raised border-line",
          )}
          style={{ width: portraitPx, height: portraitPx }}
        >
          <PlayerPortrait key={player.id} src={player.portraitPath} seed={player.id}
            alt={player.nickname} size={portraitPx} variant={isReveal ? "hero" : "card"} />
        </div>

        {/* Identity + bars */}
        <div className={cn(
          "flex flex-col min-w-0",
          isReveal ? "items-center gap-2" : "gap-1.5 flex-1",
        )}>
          <div className={cn("flex items-center gap-2 flex-wrap", isReveal && "justify-center")}>
            <span className={cn("font-semibold leading-none text-ink-1", NAME_CLASS[size])}>
              {player.nickname}
            </span>
            {tierStyle && (
              <Badge className={cn("text-[11px] px-2 py-0.5 border-none", tierStyle.bgColor, tierStyle.color)}>
                {tierStyle.shortLabel}
              </Badge>
            )}
          </div>

          {!isCompact && (
            <div className={cn("flex items-center gap-3 opacity-90", isReveal && "justify-center")}>
              {player.role && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-raised border border-line">
                  {roleIcon(player.role, 12)}
                  <span className="text-[11px] font-bold uppercase tracking-wide text-ink-1">
                    {formatRole(player.role)}
                  </span>
                  {player.secondaryRole && (
                    <span className="text-[11px] text-ink-3 uppercase">
                      +{formatRole(player.secondaryRole)}
                    </span>
                  )}
                </div>
              )}
              {player.nationality && (
                <CountryFlag country={player.nationality} showName={false} size={16} />
              )}
              {player.name && isReveal && (
                <span className="text-[11px] text-ink-2">{player.name}</span>
              )}
            </div>
          )}

          {isCompact && player.role && (
            <div className="flex items-center gap-2 opacity-80">
              {roleIcon(player.role, 10)}
              <span className="text-[11px] font-bold uppercase tracking-wide text-ink-2">
                {formatRole(player.role)}
              </span>
              {player.nationality && (
                <CountryFlag country={player.nationality} showName={false} size={12} />
              )}
            </div>
          )}

          {overlays?.contract && (player.salaryPerWeek !== undefined || player.contractYearsLeft !== undefined) && (
            <div className={cn("flex items-center gap-2 text-[11px] font-medium text-ink-3 mt-1", isReveal && "justify-center")}>
              {player.salaryPerWeek !== undefined && (
                <span className="font-semibold text-ink-1">
                  {formatCurrency(player.salaryPerWeek)}/wk
                </span>
              )}
              {player.salaryPerWeek !== undefined && player.contractYearsLeft !== undefined && (
                <span className="w-1 h-1 rounded-full bg-hover" />
              )}
              {player.contractYearsLeft !== undefined && (
                <span>{player.contractYearsLeft.toFixed(1)}y left</span>
              )}
            </div>
          )}

          {overlays?.form && !isReveal && (
            <div className="flex-1 w-full grid grid-cols-1 gap-1.5 mt-2">
              <ProgressBar label="Morale" value={player.morale ?? 75} tone="success" />
              <ProgressBar label="Form" value={player.form ?? 70} tone="brand" />
              <ProgressBar label="Energy" value={playerEnergyPercent(player)} tone="warning" />
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
            <span className="text-[11px] font-normal text-muted-foreground uppercase mt-1 tracking-[0.2em] opacity-60">
              OVR
            </span>
          </div>
        )}
      </div>

      {/* Feature-specific overlays (injury, swap controls, award ribbons, …) */}
      {children}
    </Wrapper>
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

export const PlayerCard = memo(PlayerCardImpl)
