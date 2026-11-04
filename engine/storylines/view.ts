/**
 * Storylines (Phase 5.3): read helpers for screens, the weekly report and
 * the news. Pure and light (no engine imports), safe for the UI bundle.
 */

import type { StoryArc, StoryArcKind } from "./types"
import { BOARD_TUNING, STORY_TUNING as S } from "@/lib/balance-tuning"
import { t, type TextRef } from "@/lib/i18n"
import { lineText } from "@/lib/news-text"

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

/** What the next beat of an active arc is, in a few words (active language). */
const NEXT_HINT: Record<StoryArcKind, (arc: StoryArc) => string> = {
    CONTRACT_STANDOFF: a => a.beat <= 1 ? t("sl.next.talks") : a.choice === "wait" ? t("sl.next.request", { week: String(a.facts.requestWeek) }) : a.choice === "sell" ? t("sl.next.listed") : t("sl.next.underWay"),
    RISING_STAR: a => a.beat <= 1 ? t("sl.next.market") : a.choice === "promise" ? t("sl.next.promise") : a.choice === "list" ? t("sl.next.listed") : t("sl.next.watching"),
    SLUMP: a => a.beat <= 1 ? t("sl.next.press") : t("sl.next.recovery", { rating: S.RECOVERY_RATING.toFixed(2), maps: S.RECOVERY_MAPS }),
    RIVALRY: a => t("sl.next.match", { week: String(a.facts.matchWeek) }),
    LAST_DANCE: a => a.beat <= 1 ? t("sl.next.decision") : t("sl.next.retireCheck"),
    RIFT: a => a.beat <= 1 ? t("sl.next.yourCall") : t("sl.next.settles", { weeks: S.RIFT_RESOLVE_WEEKS }),
    GIANT_KILLER: () => t("sl.next.result"),
    BOARD_PRESSURE: a => a.beat <= 1 ? t("sl.next.demand") : t("sl.next.confidence", { n: BOARD_TUNING.RECOVERED_AT }),
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
    const last = arc.log[arc.log.length - 1]
    return last ? lineText(last) : t(`story.kind.${arc.kind}`)
}

/**
 * The most important storyline beat of the managed club logged in
 * [fromWeek, toWeek], for the weekly report headline.
 */
export function leadingBeat(storylines: readonly StoryArc[] | undefined, teamId: string, fromWeek: number, toWeek: number): { arc: StoryArc; text: string; ref?: TextRef } | null {
    let best: { arc: StoryArc; text: string; ref?: TextRef; score: number } | null = null
    for (const arc of storylines ?? []) {
        if (!arc.managed || arc.teamId !== teamId) continue
        for (let i = arc.log.length - 1; i >= 0; i--) {
            const entry = arc.log[i]
            if (entry.week < fromWeek || entry.week > toWeek) continue
            const score = IMPORTANCE[arc.kind] * 100 + (arc.state === "RESOLVED" ? 50 : 0) + entry.week
            if (!best || score > best.score) best = { arc, text: entry.text, ref: entry.ref, score }
            break
        }
    }
    return best ? { arc: best.arc, text: best.text, ...(best.ref ? { ref: best.ref } : {}) } : null
}
