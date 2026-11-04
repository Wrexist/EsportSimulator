"use client"

/**
 * Player page: the storylines the player has been part of (Phase 5.3), newest first,
 * each beat as it happened. Renders nothing for a player without a story.
 */

import { useGameStore } from "@/store/game-store"
import { Panel } from "@/src/components/ui/Panel"
import { arcsForPlayer } from "@/engine/storylines/view"
import { storyKindName } from "@/lib/story-names"
import { t, tn } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { lineText } from "@/lib/news-text"

const seasonWeek = (week: number) => t("story.seasonWeek", { s: Math.floor((week - 1) / 52) + 1, w: ((week - 1) % 52) + 1 })

const OUTCOMES = new Set(["RENEWED", "LEFT", "REQUEST", "UNSOLD", "SOLD", "KEPT", "BROKEN", "RECOVERED", "DROPPED", "RETIRED", "PLAYS_ON", "SETTLED", "LINGERS"])
const outcomeLabel = (outcome: string | undefined) => outcome && OUTCOMES.has(outcome) ? t(`story.outcome.${outcome}`) : t("story.outcome.over")

export function PlayerStorylines({ playerId }: { playerId: string }) {
    const storylines = useGameStore(s => s.storylines)
    const arcs = arcsForPlayer(storylines, playerId)
    if (arcs.length === 0) return null
    return (
        <Panel title={t("story.panel")} actions={<span className="text-xs text-ink-3">{tn("story.count", arcs.length)}</span>} padded={false}>
            <ol className="divide-y divide-line">
                {arcs.map(arc => (
                    <li key={arc.id} className="px-4 py-3">
                        <div className="flex items-baseline justify-between gap-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gold">{storyKindName(arc.kind)}</p>
                            <span className={cn("shrink-0 text-xs font-semibold", arc.state === "ACTIVE" ? "text-ink-1" : "text-ink-3")}>
                                {arc.state === "ACTIVE" ? t("story.active") : outcomeLabel(arc.outcome)}
                            </span>
                        </div>
                        <ul className="mt-1.5 space-y-1">
                            {arc.log.map((entry, i) => (
                                <li key={i} className="flex gap-3 text-[13px] leading-snug">
                                    <span className="w-14 shrink-0 text-xs tabular-nums text-ink-3">{seasonWeek(entry.week)}</span>
                                    <span className="min-w-0 text-ink-2">{lineText(entry)}</span>
                                </li>
                            ))}
                        </ul>
                    </li>
                ))}
            </ol>
        </Panel>
    )
}
