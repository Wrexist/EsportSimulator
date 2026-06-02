"use client"

import { Flame, Swords } from "lucide-react"
import type { RivalryData, CompletedMatchSaveData } from "@/engine/save-types"
import { cn } from "@/lib/utils"

interface RivalryBannerProps {
    /**
     * Stored aggregate H2H record between player team and opponent.
     * Optional — when missing or w/ <2 meetings the banner skips render.
     */
    rivalry?: RivalryData
    /**
     * Completed matches involving the two teams, sorted newest-first.
     * Used to derive the live "lost 4 straight" / "won 3 in a row" streak
     * that aggregate counts don't capture.
     */
    recentH2H: CompletedMatchSaveData[]
    /** The player's team — used to figure out which side each result is. */
    playerTeamId: string
    opponentName: string
}

interface Streak {
    type: "wins" | "losses" | null
    length: number
}

function deriveStreak(matches: CompletedMatchSaveData[], playerTeamId: string): Streak {
    if (matches.length === 0) return { type: null, length: 0 }
    let type: "wins" | "losses" | null = null
    let length = 0
    for (const m of matches) {
        const isHome = m.homeTeamId === playerTeamId
        const won = isHome
            ? m.result.homeScore > m.result.awayScore
            : m.result.awayScore > m.result.homeScore
        const thisType: "wins" | "losses" = won ? "wins" : "losses"
        if (type === null) {
            type = thisType
            length = 1
        } else if (type === thisType) {
            length += 1
        } else {
            break
        }
    }
    return { type, length }
}

export function RivalryBanner({ rivalry, recentH2H, playerTeamId, opponentName }: RivalryBannerProps) {
    // Need at least 2 meetings on record before this reads as a "rivalry"
    // rather than a one-off prior matchup.
    if (!rivalry || rivalry.matchesPlayed < 2) return null

    const streak = deriveStreak(recentH2H, playerTeamId)
    const isHeated = rivalry.intensity === "HEATED" || rivalry.intensity === "FIERCE"
    const tone = streak.type === "losses" && streak.length >= 3
        ? "danger"
        : streak.type === "wins" && streak.length >= 3
            ? "dominant"
            : isHeated ? "heated" : "neutral"

    const toneClasses: Record<typeof tone, string> = {
        danger: "border-red-500/30 bg-red-500/10 text-red-300",
        dominant: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
        heated: "border-orange-500/30 bg-orange-500/10 text-orange-300",
        neutral: "border-white/10 bg-white/[0.04] text-white/70",
    }

    const intensityLabel: Record<RivalryData["intensity"], string> = {
        FRIENDLY: "Familiar",
        NEUTRAL: "Met before",
        HEATED: "Heated",
        FIERCE: "Bitter rivalry",
    }

    // Build the headline line. Streaks always win — that's what makes the
    // match feel personal. Fall through to aggregate record otherwise.
    let headline: string
    if (streak.type === "losses" && streak.length >= 3) {
        headline = `You have lost ${streak.length} straight to ${opponentName}.`
    } else if (streak.type === "wins" && streak.length >= 3) {
        headline = `You have won ${streak.length} straight against ${opponentName}.`
    } else if (rivalry.wins > rivalry.losses) {
        headline = `You lead ${opponentName} ${rivalry.wins}-${rivalry.losses} all-time.`
    } else if (rivalry.losses > rivalry.wins) {
        headline = `${opponentName} leads the series ${rivalry.losses}-${rivalry.wins}.`
    } else {
        headline = `${rivalry.wins}-${rivalry.losses} all-time — the series is even.`
    }

    return (
        <div
            className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2 mb-4 transition-colors",
                toneClasses[tone],
            )}
            role="region"
            aria-label="Rivalry summary"
        >
            {tone === "danger"
                ? <Flame className="w-4 h-4 shrink-0" aria-hidden="true" />
                : <Swords className="w-4 h-4 shrink-0" aria-hidden="true" />}
            <div className="flex-1 min-w-0">
                <p className="text-xs font-medium leading-tight">{headline}</p>
                <p className="text-[10px] uppercase tracking-widest opacity-60 mt-0.5">
                    {intensityLabel[rivalry.intensity]} · {rivalry.matchesPlayed} meetings
                    {rivalry.highStakesCount && rivalry.highStakesCount > 0
                        ? ` · ${rivalry.highStakesCount} playoff`
                        : ""}
                </p>
            </div>
        </div>
    )
}
