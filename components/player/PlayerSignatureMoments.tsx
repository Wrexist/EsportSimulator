"use client"
import { intlLocale, t, tn } from "@/lib/i18n"

import { Award, Trophy, Crosshair, Zap, Star, Flame, Crown, Skull } from "lucide-react"
import type { PlayerSaveData } from "@/engine/save-types"
import { cn } from "@/lib/utils"
import { clutchRateFraction } from "@/lib/utils-extended"

interface Moment {
    icon: typeof Trophy
    title: string
    description: string
    tone: "gold" | "blue" | "rose" | "violet" | "neutral"
}

/**
 * Derive a narrative timeline for the player from the career fields the
 * save model already tracks (no new schema). Returns a compact list of
 * "signature moments" — major wins, MVP count, peak rating, clutch
 * specialty — surfaced as the player's story instead of a flat
 * "no achievements yet" panel.
 */
function deriveMoments(player: PlayerSaveData): Moment[] {
    const moments: Moment[] = []

    if (player.majorWins && player.majorWins > 0) {
        moments.push({
            icon: Trophy,
            title: tn("moment.major", player.majorWins),
            description: player.majorWins === 1
                ? t("moment.majorFirst")
                : t("moment.majorMany"),
            tone: "gold",
        })
    }

    const seasonMvps = (player.honours ?? []).filter(h => h.award === "MVP")
    if (seasonMvps.length > 0) {
        moments.push({
            icon: Crown,
            title: seasonMvps.length === 1 ? t("moment.seasonMvpOne", { season: seasonMvps[0].season }) : t("moment.seasonMvpMany", { n: seasonMvps.length }),
            description: t("moment.seasonMvpBody"),
            tone: "violet",
        })
    }

    if (player.totalMVPs && player.totalMVPs > 0) {
        moments.push({
            icon: Star,
            title: tn("moment.matchMvp", player.totalMVPs),
            description: t("moment.matchMvpBody"),
            tone: "violet",
        })
    }

    // A career rating means something only over a real career of official maps.
    const ratedCareer = (player.mapsPlayed ?? 0) >= 50
    if (ratedCareer && player.avgRating >= 1.25) {
        moments.push({
            icon: Flame,
            title: t("moment.eliteForm"),
            description: t("moment.eliteFormBody", { rating: player.avgRating.toFixed(2), maps: player.mapsPlayed ?? 0 }),
            tone: "rose",
        })
    } else if (ratedCareer && player.avgRating >= 1.15) {
        moments.push({
            icon: Zap,
            title: t("moment.consistent"),
            description: t("moment.consistentBody", { rating: player.avgRating.toFixed(2), maps: player.mapsPlayed ?? 0 }),
            tone: "blue",
        })
    }

    const clutchRate = clutchRateFraction(player.clutchSuccessRate)
    if (clutchRate >= 0.40) {
        moments.push({
            icon: Crown,
            title: t("moment.clutch"),
            description: t("moment.clutchBody", { pct: Math.round(clutchRate * 100) }),
            tone: "gold",
        })
    }

    if (player.totalHeadshots && player.totalHeadshots > 500) {
        moments.push({
            icon: Crosshair,
            title: t("moment.headshot"),
            description: t("moment.headshotBody", { n: player.totalHeadshots.toLocaleString(intlLocale()) }),
            tone: "rose",
        })
    }

    if (player.matchesPlayed >= 200) {
        moments.push({
            icon: Skull,
            title: t("moment.veteran"),
            description: t("moment.veteranBody", { n: player.matchesPlayed }),
            tone: "neutral",
        })
    }

    if (player.isLegendary) {
        moments.push({
            icon: Crown,
            title: t("moment.legend"),
            description: t("moment.legendBody"),
            tone: "gold",
        })
    }

    return moments
}

/** Gold is for trophies only; every other moment reads neutral. */
const TONE_ICON: Record<Moment["tone"], string> = {
    gold: "text-gold",
    blue: "text-ink-2",
    rose: "text-ink-2",
    violet: "text-ink-2",
    neutral: "text-ink-3",
}

interface PlayerSignatureMomentsProps {
    player: PlayerSaveData
}

export function PlayerSignatureMoments({ player }: PlayerSignatureMomentsProps) {
    const moments = deriveMoments(player)
    const stored = player.achievements ?? []

    if (moments.length === 0 && stored.length === 0) {
        return (
            <p className="px-4 py-5 text-sm text-ink-3" role="status">
                {player.matchesPlayed > 0
                    ? t("moment.noneYet")
                    : t("moment.noneStart")}
            </p>
        )
    }

    return (
        <ul className="divide-y divide-line">
            {moments.map((m, idx) => {
                const Icon = m.icon
                return (
                    <li key={`derived-${idx}`} className="flex items-start gap-3 px-4 py-3">
                        <Icon size={16} className={cn("mt-0.5 shrink-0", TONE_ICON[m.tone])} aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-ink-1">{m.title}</p>
                            <p className="mt-0.5 text-[13px] leading-relaxed text-ink-3">{m.description}</p>
                        </div>
                    </li>
                )
            })}

            {/* Stored achievement entries — the engine writes these on role
                mastery, retirement and legendary milestones. */}
            {stored.map((a, idx) => (
                <li key={`stored-${idx}`} className="flex items-start gap-3 px-4 py-3">
                    <Award size={16} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ink-1">{a.description}</p>
                        <p className="mt-0.5 text-xs text-ink-3">{t("common.week", { n: a.week })}</p>
                    </div>
                </li>
            ))}
        </ul>
    )
}
