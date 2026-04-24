"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { ChevronRight, Crown } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { getTierStyle, type TierLevel } from "@/engine/tier-system"

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface TeamCardTeam {
  id?: string
  name: string
  shortName?: string
  logoPath?: string
  tier?: TierLevel | string
  worldRanking?: number
  elo?: number
  overallRating?: number
  record?: { wins: number; losses: number; draws?: number }
  /** Most-recent-first list of results ('W' | 'L' | 'D') */
  form?: Array<"W" | "L" | "D">
  customTeamData?: {
    logoData?: string
    primaryColor: string
    secondaryColor: string
    logoIndex: number
  }
}

export type TeamCardSize = "xs" | "sm" | "md" | "lg"
export type TeamCardVariant = "default" | "row" | "reveal"

export interface TeamCardOverlays {
  /** Wins/losses/draws line */
  record?: boolean
  /** Colored W/L/D bubbles trailing the card */
  form?: boolean
  /** Tier badge next to the team name */
  tier?: boolean
}

export interface TeamCardProps {
  team: TeamCardTeam
  size?: TeamCardSize
  variant?: TeamCardVariant
  overlays?: TeamCardOverlays
  href?: string | null
  onClick?: () => void
  selected?: boolean
  muted?: boolean
  /** Show the world-ranking position as a leading badge */
  showRank?: boolean
  /** Trailing slot (action buttons, chevron, stats column) */
  children?: ReactNode
  layoutId?: string
  className?: string
}

// ────────────────────────────────────────────────────────────────────────────
// Size tokens
// ────────────────────────────────────────────────────────────────────────────

const LOGO_PX: Record<TeamCardSize, number> = {
  xs: 24,
  sm: 36,
  md: 56,
  lg: 80,
}

const NAME_CLASS: Record<TeamCardSize, string> = {
  xs: "text-sm",
  sm: "text-base",
  md: "text-xl tracking-tight",
  lg: "text-3xl tracking-tighter",
}

const PADDING_CLASS: Record<TeamCardSize, string> = {
  xs: "p-2",
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function FormBubbles({ form }: { form: Array<"W" | "L" | "D"> }) {
  return (
    <div className="flex items-center gap-1">
      {form.slice(0, 5).map((r, i) => (
        <span
          key={i}
          className={cn(
            "w-4 h-4 rounded-full text-[8px] font-bold flex items-center justify-center",
            r === "W" && "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40",
            r === "L" && "bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/40",
            r === "D" && "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40",
          )}
        >
          {r}
        </span>
      ))}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// TeamCard
// ────────────────────────────────────────────────────────────────────────────

export function TeamCard({
  team,
  size = "md",
  variant = "default",
  overlays,
  href,
  onClick,
  selected = false,
  muted = false,
  showRank = false,
  children,
  layoutId,
  className,
}: TeamCardProps) {
  const isRow = variant === "row"
  const isReveal = variant === "reveal"
  const logoPx = LOGO_PX[size]
  const tierStyle = team.tier
    ? (() => {
      try { return getTierStyle(team.tier as TierLevel) } catch { return null }
    })()
    : null

  const card = (
    <motion.div
      layoutId={layoutId}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className={cn(
        "relative rounded-2xl border border-white/10 bg-black/30 backdrop-blur-md transition-all duration-300",
        PADDING_CLASS[size],
        selected && "border-primary/60 bg-primary/[0.08]",
        muted && "opacity-60 grayscale",
        !selected && !muted && "hover:border-white/20 hover:bg-white/[0.04]",
        isReveal && "shadow-2xl",
        onClick && "cursor-pointer",
        className,
      )}
    >
      <div className={cn(
        "relative z-10 flex items-center gap-3",
        isReveal && "flex-col text-center gap-4",
      )}>
        {showRank && team.worldRanking !== undefined && (
          <div className={cn(
            "shrink-0 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center font-bold tabular-nums",
            size === "xs" ? "w-6 h-6 text-[10px]" : "w-8 h-8 text-xs",
            team.worldRanking === 1 && "bg-amber-500/15 border-amber-400/40 text-amber-300",
          )}>
            #{team.worldRanking}
          </div>
        )}

        <div
          className="shrink-0 group-hover:scale-105 transition-transform duration-300"
          style={{ width: logoPx, height: logoPx }}
        >
          <TeamLogoDisplay team={team} size={logoPx} />
        </div>

        <div className={cn(
          "flex flex-col min-w-0",
          isReveal ? "items-center gap-1" : "gap-0.5 flex-1",
        )}>
          <div className={cn("flex items-center gap-2 flex-wrap", isReveal && "justify-center")}>
            {team.worldRanking === 1 && <Crown size={14} className="text-amber-400" />}
            <span className={cn("font-bold text-white leading-none", NAME_CLASS[size])}>
              {team.name}
            </span>
            {overlays?.tier && tierStyle && (
              <Badge className={cn("text-[9px] px-2 py-0.5 border-none", tierStyle.bgColor, tierStyle.color)}>
                {tierStyle.label}
              </Badge>
            )}
          </div>

          {overlays?.record && team.record && (
            <div className="flex items-center gap-2 text-[10px] text-white/60 tabular-nums">
              <span className="text-emerald-400 font-bold">{team.record.wins}W</span>
              <span className="text-rose-400 font-bold">{team.record.losses}L</span>
              {team.record.draws !== undefined && (
                <span className="text-amber-400 font-bold">{team.record.draws}D</span>
              )}
            </div>
          )}
        </div>

        {/* Row-variant stats strip */}
        {isRow && (team.elo !== undefined || team.overallRating !== undefined) && (
          <div className="flex items-center gap-4 shrink-0 text-xs tabular-nums">
            {team.elo !== undefined && (
              <div className="flex flex-col items-center">
                <span className="text-[9px] text-white/40 uppercase tracking-widest">ELO</span>
                <span className="font-bold text-white">{Math.round(team.elo)}</span>
              </div>
            )}
            {team.overallRating !== undefined && (
              <div className="flex flex-col items-center">
                <span className="text-[9px] text-white/40 uppercase tracking-widest">OVR</span>
                <span className="font-bold text-white">{Math.round(team.overallRating)}</span>
              </div>
            )}
          </div>
        )}

        {overlays?.form && team.form && team.form.length > 0 && (
          <FormBubbles form={team.form} />
        )}

        {isRow && href !== null && (
          <ChevronRight size={16} className="text-muted-foreground shrink-0" />
        )}
      </div>

      {children}
    </motion.div>
  )

  if (href && !onClick) {
    return (
      <Link href={href} className="block group">
        {card}
      </Link>
    )
  }

  return card
}
