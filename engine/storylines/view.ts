/**
 * Storylines (Phase 5.3): read helpers for screens, the weekly report and
 * the news. Pure and light (no engine imports), safe for the UI bundle.
 */

import type { StoryArc, StoryArcKind } from "./types"
import { BOARD_TUNING, STORY_TUNING as S } from "@/lib/balance-tuning"

export const STORY_KIND_LABEL: Record<StoryArcKind, string> = {
    CONTRACT_STANDOFF: "Contract standoff",
    RISING_STAR: "Rising star",
    SLUMP: "Slump",
    RIVALRY: "Rivalry",
    LAST_DANCE: "Last dance",
    RIFT: "Dressing-room rift",
    GIANT_KILLER: "Giant-killer run",
    BOARD_PRESSURE: "Board under pressure",
}

/** Weekly-report weight when several stories moved in one week (higher leads). */
const IMPORTANCE: Record<StoryArcKind, number> = {
    BOARD_PRESSURE: 8, CONTRACT_STANDOFF: 7, RIVALRY: 6, LAST_DANCE: 5, RIFT: 4, SLUMP: 3, RISING_STAR: 2, GIANT_KILLER: 1,
}

/** What the next beat of an active arc is, in a few words. */
const NEXT_HINT: Record<StoryArcKind, (arc: StoryArc) => string> = {
    CONTRACT_STANDOFF: a => a.beat <= 1 ? "Contract talks next week" : a.choice === "wait" ? `Transfer request in Week ${a.facts.requestWeek} if still unrenewed` : a.choice === "sell" ? "On the transfer list" : "Talks under way",
    RISING_STAR: a => a.beat <= 1 ? "The market reacts next week" : a.choice === "promise" ? "Your promise is running" : a.choice === "list" ? "On the transfer list" : "Watching his form",
    SLUMP: a => a.beat <= 1 ? "The press wants an answer next week" : `Over once he averages ${S.RECOVERY_RATING.toFixed(2)}+ over ${S.RECOVERY_MAPS} maps`,
    RIVALRY: a => `Match in Week ${a.facts.matchWeek}`,
    LAST_DANCE: a => a.beat <= 1 ? "Decision next week" : "Retirement check in week 52",
    RIFT: a => a.beat <= 1 ? "Your call next week" : `Settles ${S.RIFT_RESOLVE_WEEKS} weeks after your call`,
    GIANT_KILLER: () => "Next official result",
    BOARD_PRESSURE: a => a.beat <= 1 ? "The board's demand next" : `Over once confidence is back to ${BOARD_TUNING.RECOVERED_AT}`,
}

export function nextHint(arc: StoryArc): string {
    return NEXT_HINT[arc.kind](arc)
}

/** Active arcs involving a club, newest first. */
export function activeArcs(storylines: readonly StoryArc[] | undefined, teamId: string | null | undefined): StoryArc[] {
    return (storylines ?? []).filter(a => a.state === "ACTIVE" && a.teamId === teamId)
}

/** Other clubs' active stories (news only). */
export function worldArcs(storylines: readonly StoryArc[] | undefined, teamId: string | null | undefined): StoryArc[] {
    return (storylines ?? []).filter(a => a.state === "ACTIVE" && !a.managed && a.teamId !== teamId)
}

/** Every arc (active or resolved) about a player, newest first. */
export function arcsForPlayer(storylines: readonly StoryArc[] | undefined, playerId: string): StoryArc[] {
    return (storylines ?? []).filter(a => a.playerIds.includes(playerId)).sort((a, b) => b.startedWeek - a.startedWeek)
}

/** The latest beat line. */
export function arcHeadline(arc: StoryArc): string {
    return arc.log[arc.log.length - 1]?.text ?? STORY_KIND_LABEL[arc.kind]
}

/**
 * The most important storyline beat of the managed club logged in
 * [fromWeek, toWeek], for the weekly report headline.
 */
export function leadingBeat(storylines: readonly StoryArc[] | undefined, teamId: string, fromWeek: number, toWeek: number): { arc: StoryArc; text: string } | null {
    let best: { arc: StoryArc; text: string; score: number } | null = null
    for (const arc of storylines ?? []) {
        if (!arc.managed || arc.teamId !== teamId) continue
        for (let i = arc.log.length - 1; i >= 0; i--) {
            const entry = arc.log[i]
            if (entry.week < fromWeek || entry.week > toWeek) continue
            const score = IMPORTANCE[arc.kind] * 100 + (arc.state === "RESOLVED" ? 50 : 0) + entry.week
            if (!best || score > best.score) best = { arc, text: entry.text, score }
            break
        }
    }
    return best ? { arc: best.arc, text: best.text } : null
}
