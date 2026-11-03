"use client"
import { t, tn } from "@/lib/i18n"

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
    const losingRun = streak.type === "losses" && streak.length >= 3


    // Build the headline line. Streaks always win — that's what makes the
    // match feel personal. Fall through to aggregate record otherwise.
    let headline: string
    if (streak.type === "losses" && streak.length >= 3) {
        headline = t("sch.riv.lostStraight", { n: streak.length, team: opponentName })
    } else if (streak.type === "wins" && streak.length >= 3) {
        headline = t("sch.riv.wonStraight", { n: streak.length, team: opponentName })
    } else if (rivalry.wins > rivalry.losses) {
        headline = t("sch.riv.lead", { team: opponentName, w: rivalry.wins, l: rivalry.losses })
    } else if (rivalry.losses > rivalry.wins) {
        headline = t("sch.riv.trail", { team: opponentName, w: rivalry.losses, l: rivalry.wins })
    } else {
        headline = t("sch.riv.even", { w: rivalry.wins, l: rivalry.losses })
    }

    return (
        <div
            className="flex items-center gap-3 rounded-md border border-line bg-shell px-3 py-2"
            role="region"
            aria-label={t("sch.riv.aria")}
        >
            {losingRun || isHeated
                ? <Flame className={cn("h-4 w-4 shrink-0", losingRun ? "text-caution" : "text-ink-2")} aria-hidden="true" />
                : <Swords className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />}
            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight text-ink-1">{headline}</p>
                <p className="mt-0.5 text-xs text-ink-3">
                    {t(`sch.riv.${rivalry.intensity}`)} · {tn("sch.riv.meetings", rivalry.matchesPlayed)}
                    {rivalry.highStakesCount && rivalry.highStakesCount > 0
                        ? ` · ${t("sch.riv.playoffs", { n: rivalry.highStakesCount })}`
                        : ""}
                </p>
            </div>
        </div>
    )
}
