"use client"

/**
 * C10: the pro's personal match goal (engine/pro-career.ts proMatchGoal), on
 * the live match, the result screen and Home.
 */

import { useMemo } from "react"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import type { GameSave } from "@/engine/save-types"
import { isProActive, proMatchGoal, PRO_TUNING, type ProGoalResult } from "@/engine/pro-career"
import { cn } from "@/lib/utils"

/** The pro's player id and the goal for his next match (null when benched); undefined outside a pro career. */
export function useProGoal(): { playerId: string; goal: number | null; last?: ProGoalResult; set: number; hit: number } | undefined {
    const view = useGameStore(useShallow(s => ({ proCareer: s.proCareer, players: s.players, teams: s.teams, playerTeamId: s.playerTeamId, currentWeek: s.currentWeek })))
    // Memoised: the live match re-renders many times a second and the goal reads every squad rating.
    return useMemo(() => {
        const save = view as unknown as GameSave
        if (!view.proCareer || !isProActive(save)) return undefined
        const goals = view.proCareer.goals
        return { playerId: view.proCareer.playerId, goal: proMatchGoal(save), last: goals?.last, set: goals?.set ?? 0, hit: goals?.hit ?? 0 }
    }, [view])
}

/** Footer line on the own roster card in the live match. */
export function ProGoalStrip({ goal, kills, deaths }: { goal: number | null; kills: number; deaths: number }) {
    return (
        <div className="flex items-center gap-2 border-t border-line bg-gold/5 px-3 py-2 text-xs text-ink-2" data-testid="pro-goal-strip">
            <span className="rounded-sm bg-gold/15 px-1.5 py-0.5 text-[11px] font-bold leading-none tracking-[0.06em] text-gold">YOUR MATCH</span>
            <span className="min-w-0 truncate">
                {goal != null ? <>Goal: a rating of <span className="font-semibold tabular-nums text-ink-1">{goal.toFixed(2)}</span> or better</> : "On the bench this match"}
            </span>
            <span className="ml-auto shrink-0 tabular-nums">K-D <span className="font-semibold text-ink-1">{kills}-{deaths}</span></span>
        </div>
    )
}

/** The verdict for one finished match (result screen). */
export function ProGoalVerdict({ result, rating }: { result?: ProGoalResult; rating?: number }) {
    if (!result) {
        return (
            <p className="text-sm text-ink-3" data-testid="pro-goal-verdict">
                {rating != null ? `You rated ${rating.toFixed(2)}. You were not set a goal for this match.` : "You did not play in this match."}
            </p>
        )
    }
    return (
        <div className="flex flex-wrap items-center gap-3" data-testid="pro-goal-verdict">
            <span className={cn("rounded-sm px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em]", result.hit ? "bg-positive/15 text-positive" : "bg-caution/15 text-caution")}>
                {result.hit ? "Goal met" : "Goal missed"}
            </span>
            <span className="text-sm text-ink-2">
                You rated <span className="font-semibold tabular-nums text-ink-1">{result.rating.toFixed(2)}</span> against a goal of <span className="tabular-nums">{result.target.toFixed(2)}</span>.
            </span>
            <span className="text-xs text-ink-3">
                {result.hit
                    ? `Clubs scout you ${PRO_TUNING.GOAL_SCOUT_WEEKS === 1 ? "a week" : `${PRO_TUNING.GOAL_SCOUT_WEEKS} weeks`} sooner, and your confidence is up.`
                    : "The next match is another chance."}
            </span>
        </div>
    )
}
