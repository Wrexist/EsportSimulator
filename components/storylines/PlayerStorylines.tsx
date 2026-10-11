"use client"

/**
 * Player page: the storylines he has been part of (Phase 5.3), newest first,
 * each beat as it happened. Renders nothing for a player without a story.
 */

import { useGameStore } from "@/store/game-store"
import { Panel } from "@/src/components/ui/Panel"
import { STORY_KIND_LABEL, arcsForPlayer } from "@/engine/storylines/view"
import { cn } from "@/lib/utils"

const seasonWeek = (week: number) => `S${Math.floor((week - 1) / 52) + 1} W${((week - 1) % 52) + 1}`

const OUTCOME_LABEL: Record<string, string> = {
    RENEWED: "Renewed", LEFT: "Left the club", REQUEST: "Transfer request", UNSOLD: "Stayed", SOLD: "Sold",
    KEPT: "Promise kept", BROKEN: "Promise broken", QUIET: "Over", RECOVERED: "Back in form", DROPPED: "Dropped",
    FADED: "Over", RETIRED: "Retired", PLAYS_ON: "Plays on", SETTLED: "Settled", LINGERS: "Lingers",
    MANAGER_LEFT: "Over",
}

export function PlayerStorylines({ playerId }: { playerId: string }) {
    const storylines = useGameStore(s => s.storylines)
    const arcs = arcsForPlayer(storylines, playerId)
    if (arcs.length === 0) return null
    return (
        <Panel title="Storylines" actions={<span className="text-xs text-ink-3">{arcs.length} stor{arcs.length === 1 ? "y" : "ies"}</span>} padded={false}>
            <ol className="divide-y divide-line">
                {arcs.map(arc => (
                    <li key={arc.id} className="px-4 py-3">
                        <div className="flex items-baseline justify-between gap-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gold">{STORY_KIND_LABEL[arc.kind]}</p>
                            <span className={cn("shrink-0 text-xs font-semibold", arc.state === "ACTIVE" ? "text-ink-1" : "text-ink-3")}>
                                {arc.state === "ACTIVE" ? "Active" : OUTCOME_LABEL[arc.outcome ?? ""] ?? "Over"}
                            </span>
                        </div>
                        <ul className="mt-1.5 space-y-1">
                            {arc.log.map((entry, i) => (
                                <li key={i} className="flex gap-3 text-[13px] leading-snug">
                                    <span className="w-14 shrink-0 text-xs tabular-nums text-ink-3">{seasonWeek(entry.week)}</span>
                                    <span className="min-w-0 text-ink-2">{entry.text}</span>
                                </li>
                            ))}
                        </ul>
                    </li>
                ))}
            </ol>
        </Panel>
    )
}
