/**
 * Storylines (Phase 5.3): the weekly step.
 *
 * Runs once per week tick, after the board step (results, retirements and
 * board confidence are settled) and before decisions get their deadlines.
 *
 *  1. Active arcs whose next beat is due run it: news, a decision, or the
 *     resolution. A managed arc whose club the manager has left ends quietly.
 *  2. At most one new arc starts (managed stories first), and only while
 *     fewer than MAX_ACTIVE_MANAGED managed arcs are active. A kind waits
 *     COOLDOWN_KIND weeks per club, a subject COOLDOWN_SUBJECT weeks, and a
 *     player is in one story at a time. Other clubs' stories are news only.
 *  3. Resolved arcs beyond KEEP_RESOLVED are dropped.
 *
 * Cost: a scan of the managed roster, a few overall ratings, and the last
 * few weeks of results. Deterministic: no RNG (scores and ids decide).
 */

import type { GameSave } from "../save-types"
import type { StoryArc, StoryArcKind } from "./types"
import { STORY_TUNING as S } from "@/lib/balance-tuning"
import { buildContext, resolveArc, type ArcCandidate, type ArcDefinition, type StoryContext } from "./common"
import { contractStandoff } from "./arcs/contract-standoff"
import { risingStar } from "./arcs/rising-star"
import { slump } from "./arcs/slump"
import { rivalry } from "./arcs/rivalry"
import { lastDance } from "./arcs/last-dance"
import { rift } from "./arcs/rift"
import { giantKiller } from "./arcs/giant-killer"
import { boardPressure } from "./arcs/board-pressure"

export const ARC_DEFINITIONS: Record<StoryArcKind, ArcDefinition> = {
    CONTRACT_STANDOFF: contractStandoff,
    RISING_STAR: risingStar,
    SLUMP: slump,
    RIVALRY: rivalry,
    LAST_DANCE: lastDance,
    RIFT: rift,
    GIANT_KILLER: giantKiller,
    BOARD_PRESSURE: boardPressure,
}

/** Which story starts when several trigger in one week (fixture-bound first). */
const START_ORDER: StoryArcKind[] = ["RIVALRY", "BOARD_PRESSURE", "CONTRACT_STANDOFF", "SLUMP", "LAST_DANCE", "RIFT", "RISING_STAR", "GIANT_KILLER"]

export interface StoryWeekResult {
    started: StoryArc[]
    /** Beats run by active arcs this week. */
    beats: number
    resolved: number
    /** Effects storylines applied directly this week (weekly report causes). */
    applied: string[]
}

function lastWeekOf(arcs: readonly StoryArc[], test: (a: StoryArc) => boolean, resolvedOnly = false): number {
    let w = -Infinity
    for (const a of arcs) if (test(a)) w = Math.max(w, resolvedOnly && a.state === "ACTIVE" ? Infinity : resolvedOnly ? a.updatedWeek : a.startedWeek)
    return w
}

/** May this candidate start now (caps and cooldowns aside from the weekly one)? */
export function eligible(arcs: readonly StoryArc[], c: ArcCandidate, week: number): boolean {
    for (const a of arcs) {
        if (a.state !== "ACTIVE") continue
        if (c.playerIds.some(id => a.playerIds.includes(id))) return false
        if (a.kind === c.kind && a.teamId === c.teamId) return false
    }
    if (week - lastWeekOf(arcs, a => a.kind === c.kind && a.teamId === c.teamId) < S.COOLDOWN_KIND[c.kind]) return false
    if (week - lastWeekOf(arcs, a => a.kind === c.kind && a.facts.subject === c.subject, true) < S.COOLDOWN_SUBJECT[c.kind]) return false
    return true
}

function start(ctx: StoryContext, arcs: StoryArc[], c: ArcCandidate): StoryArc {
    const arc: StoryArc = {
        id: `${c.kind.toLowerCase()}_${c.teamId}_${c.subject === c.teamId ? "club" : c.subject}_${ctx.week}`,
        kind: c.kind,
        teamId: c.teamId,
        managed: c.managed,
        playerIds: c.playerIds,
        clubIds: c.clubIds,
        beat: 0,
        startedWeek: ctx.week,
        updatedWeek: ctx.week,
        nextWeek: ctx.week + 1,
        state: "ACTIVE",
        facts: { ...c.facts, subject: c.subject },
        log: [],
    }
    arcs.unshift(arc)
    ARC_DEFINITIONS[c.kind].open(ctx, arc)
    return arc
}

/** The weekly storyline step. Idempotent per week (a re-run starts nothing new). */
export function processStorylines(save: GameSave): StoryWeekResult {
    const out: StoryWeekResult = { started: [], beats: 0, resolved: 0, applied: [] }
    const ctx = buildContext(save)
    const arcs = (save.storylines ??= [])
    const week = ctx.week

    // 1. Beats of active arcs.
    for (const arc of [...arcs]) {
        if (arc.state !== "ACTIVE" || arc.nextWeek > week) continue
        const clubGone = arc.managed && arc.kind !== "BOARD_PRESSURE" && (save.gameOverReason || arc.teamId !== save.playerTeamId)
        if (clubGone) resolveArc(arc, week, "MANAGER_LEFT", "Story closed: you left the club.")
        else ARC_DEFINITIONS[arc.kind].advance(ctx, arc)
        out.beats++
        // (advance() may have resolved it)
        if ((arc.state as StoryArc["state"]) === "RESOLVED") out.resolved++
    }

    // 2. One new arc this week.
    if (!save.gameOverReason && !arcs.some(a => a.startedWeek === week)) {
        const managedActive = arcs.filter(a => a.state === "ACTIVE" && a.managed).length
        const detected = new Map<StoryArcKind, ArcCandidate[]>()
        const detect = (kind: StoryArcKind) => {
            let list = detected.get(kind)
            if (!list) detected.set(kind, list = ARC_DEFINITIONS[kind].detect(ctx))
            return list
        }
        const pick = (managed: boolean): ArcCandidate | undefined => {
            for (const kind of START_ORDER) {
                if (managed && managedActive >= S.MAX_ACTIVE_MANAGED) return undefined
                if (!managed && kind !== "GIANT_KILLER") continue
                const found = detect(kind)
                    .filter(c => c.managed === managed && eligible(arcs, c, week))
                    .sort((a, b) => b.score - a.score || a.subject.localeCompare(b.subject))[0]
                if (found) return found
            }
            return undefined
        }
        const candidate = pick(true) ?? pick(false)
        if (candidate) out.started.push(start(ctx, arcs, candidate))
    }

    // 3. Keep every active arc and the latest resolved ones.
    let resolvedKept = 0
    save.storylines = arcs.filter(a => a.state === "ACTIVE" || resolvedKept++ < S.KEEP_RESOLVED)
    out.applied = ctx.applied
    return out
}

export { STORY_KIND_LABEL } from "./view"
