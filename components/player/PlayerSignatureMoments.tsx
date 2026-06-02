"use client"

import { Award, Trophy, Crosshair, Zap, Star, Flame, Crown, Skull } from "lucide-react"
import type { PlayerSaveData } from "@/engine/save-types"
import { cn } from "@/lib/utils"

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
            title: player.majorWins === 1 ? "Major Champion" : `${player.majorWins}× Major Champion`,
            description: player.majorWins === 1
                ? "Lifted the S-Tier trophy. The moment that announced their career."
                : `Multiple S-Tier titles — a name etched into the league's record book.`,
            tone: "gold",
        })
    }

    if (player.totalMVPs && player.totalMVPs > 0) {
        moments.push({
            icon: Star,
            title: player.totalMVPs === 1 ? "Tournament MVP" : `${player.totalMVPs}× Tournament MVP`,
            description: `Top performer of the event — the floor turned over to them when it mattered.`,
            tone: "violet",
        })
    }

    if (player.avgRating >= 1.25) {
        moments.push({
            icon: Flame,
            title: "Elite Form",
            description: `Career average ${player.avgRating.toFixed(2)} rating — the kind of consistency you build a roster around.`,
            tone: "rose",
        })
    } else if (player.avgRating >= 1.15) {
        moments.push({
            icon: Zap,
            title: "Consistent Top-Half Player",
            description: `Career average ${player.avgRating.toFixed(2)} rating — reliable starter on any tier-1 team.`,
            tone: "blue",
        })
    }

    if (player.clutchSuccessRate >= 0.40) {
        moments.push({
            icon: Crown,
            title: "Clutch Specialist",
            description: `${Math.round(player.clutchSuccessRate * 100)}% win rate in 1vX situations. They want the bomb.`,
            tone: "gold",
        })
    }

    if (player.totalHeadshots && player.totalHeadshots > 500) {
        moments.push({
            icon: Crosshair,
            title: "Headshot Machine",
            description: `${player.totalHeadshots.toLocaleString()} career headshots — they don't miss when it matters.`,
            tone: "rose",
        })
    }

    if (player.matchesPlayed >= 200) {
        moments.push({
            icon: Skull,
            title: "Veteran Presence",
            description: `${player.matchesPlayed} professional matches under their belt. Seen every map, every read, every meta.`,
            tone: "neutral",
        })
    }

    if (player.isLegendary) {
        moments.push({
            icon: Crown,
            title: "Legend",
            description: "Inducted into the league's pantheon. A career that defined an era.",
            tone: "gold",
        })
    }

    return moments
}

const TONE_CLASSES: Record<Moment["tone"], { ring: string; icon: string; text: string }> = {
    gold:    { ring: "ring-amber-500/30 bg-amber-500/5",  icon: "text-amber-400", text: "text-amber-200" },
    blue:    { ring: "ring-sky-500/30 bg-sky-500/5",      icon: "text-sky-400",   text: "text-sky-200" },
    rose:    { ring: "ring-rose-500/30 bg-rose-500/5",    icon: "text-rose-400",  text: "text-rose-200" },
    violet:  { ring: "ring-violet-500/30 bg-violet-500/5",icon: "text-violet-400",text: "text-violet-200" },
    neutral: { ring: "ring-white/10 bg-white/5",          icon: "text-white/60",  text: "text-white/80" },
}

interface PlayerSignatureMomentsProps {
    player: PlayerSaveData
}

export function PlayerSignatureMoments({ player }: PlayerSignatureMomentsProps) {
    const moments = deriveMoments(player)
    const stored = player.achievements ?? []

    if (moments.length === 0 && stored.length === 0) {
        return (
            <div className="text-center py-8" role="status">
                <Award size={48} className="mx-auto mb-3 text-white/15" aria-hidden="true" />
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/40 mb-1">
                    Career still being written
                </p>
                <p className="text-xs text-white/55 max-w-xs mx-auto leading-relaxed">
                    {player.matchesPlayed > 0
                        ? "Keep climbing — major wins, MVP awards, and clutch milestones will land here."
                        : "They haven't taken the stage yet. Their story starts the next time they're called up."}
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-3">
            {moments.map((m, idx) => {
                const t = TONE_CLASSES[m.tone]
                const Icon = m.icon
                return (
                    <div
                        key={`derived-${idx}`}
                        className={cn(
                            "flex items-start gap-3 rounded-xl ring-1 p-3 transition-colors",
                            t.ring,
                        )}
                    >
                        <div className={cn("shrink-0 w-9 h-9 rounded-lg bg-black/40 flex items-center justify-center", t.icon)}>
                            <Icon size={18} aria-hidden="true" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className={cn("text-[10px] font-bold uppercase tracking-[0.25em] mb-0.5", t.text)}>
                                {m.title}
                            </p>
                            <p className="text-xs text-white/65 leading-relaxed">{m.description}</p>
                        </div>
                    </div>
                )
            })}

            {/* Stored achievement entries — engine event-processor writes
                these on retirement / legendary milestones. Surfaced after
                the derived moments so the timeline reads newest-at-bottom. */}
            {stored.map((a, idx) => (
                <div
                    key={`stored-${idx}`}
                    className="flex items-start gap-3 rounded-xl ring-1 ring-emerald-500/30 bg-emerald-500/5 p-3"
                >
                    <div className="shrink-0 w-9 h-9 rounded-lg bg-black/40 flex items-center justify-center text-emerald-400">
                        <Award size={18} aria-hidden="true" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-[0.25em] mb-0.5 text-emerald-200">
                            {a.type.replace(/_/g, " ")}
                        </p>
                        <p className="text-xs text-white/65 leading-relaxed">{a.description}</p>
                        <p className="text-[10px] text-white/30 mt-1">Week {a.week}</p>
                    </div>
                </div>
            ))}
        </div>
    )
}
