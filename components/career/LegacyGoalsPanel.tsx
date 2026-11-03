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
import { t, tn } from "@/lib/i18n"

const LEVELS = ["bronze", "silver", "gold"]
const KNOWN = new Set(["silverware", "majors", "everywhere", "climb", "summit", "loyalty", "homegrown"])

/** A goal's name in the active language (the engine keeps English for logs). */
function goalName(goal: { id: string; name: string }): string {
    return KNOWN.has(goal.id) ? t(`lgl.${goal.id}.name`) : goal.name
}

/** What the next level asks, in the active language. */
function goalAsk(goal: { id: string; describe: (n: number) => string }, n: number): string {
    if (!KNOWN.has(goal.id)) return goal.describe(n)
    if (goal.id === "summit") return n === 1 ? t("lgl.summit.first") : t("lgl.summit.top", { n })
    if (goal.id === "homegrown") return t("lgl.homegrown.desc", { n })
    return tn(`lgl.${goal.id}.desc`, n)
}

export function LegacyGoalsPanel() {
    const view = useGameStore(useShallow(s => ({
        managerDetails: s.managerDetails, teams: s.teams, players: s.players, playerTeamId: s.playerTeamId,
        currentWeek: s.currentWeek, recordBook: s.recordBook, gameOverReason: s.gameOverReason, proCareer: s.proCareer,
    })))
    const rows = useMemo(() => legacyProgress(view as unknown as LegacyView), [view])
    const levels = rows.reduce((n, r) => n + r.level, 0)
    const total = rows.reduce((n, r) => n + r.goal.levels.length, 0)
    return (
        <Panel title={t("lgl.title")} actions={<span className="text-xs tabular-nums text-ink-3">{t("lgl.levels", { levels, total })}</span>}>
            <p className="mb-3 text-xs text-ink-3">{t("lgl.intro")}</p>
            <ul className="space-y-3">
                {rows.map(r => (
                    <li key={r.goal.id}>
                        <div className="flex items-baseline justify-between gap-3">
                            <span className="text-sm font-semibold text-ink-1">{goalName(r.goal)}</span>
                            <span className={cn("text-xs font-semibold", r.level > 0 ? "text-gold" : "text-ink-3")}>
                                {r.level > 0 ? (LEVELS[r.level - 1] ? t(`lgl.level.${LEVELS[r.level - 1]}`) : t("car.levelN", { level: r.level })) : t("lgl.notStarted")}
                            </span>
                        </div>
                        <p className="mt-0.5 text-xs text-ink-3">
                            {r.next != null
                                ? t("lgl.next", { ask: goalAsk(r.goal, r.next), rep: r.goal.reputation[r.level] })
                                : t("lgl.allReached")}
                        </p>
                        {r.next != null && <Meter value={r.toward * 100} label={t("lgl.progressAria", { goal: goalName(r.goal) })} tone="neutral" showValue={false} trackClassName="mt-1.5 w-full h-1.5" />}
                    </li>
                ))}
            </ul>
        </Panel>
    )
}
