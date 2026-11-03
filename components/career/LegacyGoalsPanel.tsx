"use client"

/**
 * Legacy goals for this career (engine/legacy-goals.ts): what each one asks,
 * the level reached, and how far the next one is. Reaching a level raises the
 * manager's reputation once.
 */

import { useMemo } from "react"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import { Panel } from "@/src/components/ui/Panel"
import { Meter } from "@/src/components/ui/Meter"
import { legacyProgress, type LegacyView } from "@/engine/legacy-goals"
import { cn } from "@/lib/utils"

const LEVEL_NAMES = ["Bronze", "Silver", "Gold"]

export function LegacyGoalsPanel() {
    const view = useGameStore(useShallow(s => ({
        managerDetails: s.managerDetails, teams: s.teams, players: s.players, playerTeamId: s.playerTeamId,
        currentWeek: s.currentWeek, recordBook: s.recordBook, gameOverReason: s.gameOverReason, proCareer: s.proCareer,
    })))
    const rows = useMemo(() => legacyProgress(view as unknown as LegacyView), [view])
    const levels = rows.reduce((n, r) => n + r.level, 0)
    const total = rows.reduce((n, r) => n + r.goal.levels.length, 0)
    return (
        <Panel title="Legacy goals" actions={<span className="text-xs tabular-nums text-ink-3">{levels} of {total} levels</span>}>
            <p className="mb-3 text-xs text-ink-3">Long-term aims across every club you manage. Each level reached raises your reputation once.</p>
            <ul className="space-y-3">
                {rows.map(r => (
                    <li key={r.goal.id}>
                        <div className="flex items-baseline justify-between gap-3">
                            <span className="text-sm font-semibold text-ink-1">{r.goal.name}</span>
                            <span className={cn("text-xs font-semibold", r.level > 0 ? "text-gold" : "text-ink-3")}>
                                {r.level > 0 ? LEVEL_NAMES[r.level - 1] ?? `Level ${r.level}` : "Not started"}
                            </span>
                        </div>
                        <p className="mt-0.5 text-xs text-ink-3">
                            {r.next != null
                                ? <>Next: {r.goal.describe(r.next)} · reputation +{r.goal.reputation[r.level]}</>
                                : "Every level reached."}
                        </p>
                        {r.next != null && <Meter value={r.toward * 100} label={`${r.goal.name} progress`} tone="neutral" showValue={false} trackClassName="mt-1.5 w-full h-1.5" />}
                    </li>
                ))}
            </ul>
        </Panel>
    )
}
