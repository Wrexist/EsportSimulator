/**
 * R3: anti-strat prep. Rival clubs have habits per map: the site their Ts
 * hit on a full buy, and the site their CTs stack. A habit is a lean, not a
 * rule: their Ts keep to it on TUNING.HABIT_RATE_T of their full buys and
 * their CTs on HABIT_RATE_CT; the rest is the IGL's usual mix. Only an AI
 * club playing the manager's team runs its habits.
 *
 * A VOD review shows the habits of the opponent; the manager can then pick a
 * counter per map and side for the match:
 * - CT: stack the site their Ts favour (on your full buys).
 * - T: hit the site their CTs leave light (on your full buys).
 * A counter is a guess on their habit: when they run something else it is on
 * the wrong site.
 *
 * Habits move (TeamHabitState on the club): every club's habits are drawn
 * afresh each season, and a club that was countered reads it after the
 * match: each counter it faced makes it change that habit with
 * HABIT_ADAPT_CHANCE. A counter only works on the habit a fresh VOD review
 * shows, so the same counter does not win every meeting.
 */

import { SeededRNG, deriveSeed } from "../rng"
import type { SiteId } from "./round-script-types"

export interface MapHabits {
    /** Their Ts on a full buy: the site they lean to. */
    t: { site: SiteId }
    /** Their CTs on a full buy: the site they stack. */
    ct: { stack: SiteId }
}

/** The counters picked for one map. */
export interface MapCounters {
    /** As CT: stack the site their Ts favour. */
    ct?: boolean
    /** As T: hit the site their CTs leave light. */
    t?: boolean
}

/** Map id → counters picked for that map (ScheduledMatch.counters). */
export type MatchCounters = Partial<Record<string, MapCounters>>

/** The site a counter plays to, for the side the managed team is on. */
export interface RoundCounter {
    side: "ct" | "t"
    site: SiteId
}

/**
 * Measured value of a counter (scripts/audit-anti-strat.ts, 960 paired maps of
 * even teams): rounds won per 100 of your full buys on that side, and map-win
 * points, against a club keeping to its habits.
 */
export const COUNTER_EFFECT = {
    ct: { rounds: 4, maps: 5 },
    t: { rounds: 5, maps: 8 },
} as const

/** Map id → which of a club's habits it changed since the season's draw. */
export type HabitShift = Partial<Record<string, MapCounters>>

/** A club's habit state (TeamSaveData.habits): the season they were drawn for and what changed since. */
export interface TeamHabitState {
    season?: number
    shift?: HabitShift
}

/** Chance a club changes a habit it was countered on, after the match. */
export const HABIT_ADAPT_CHANCE = 0.6

const flip = (site: SiteId): SiteId => site === "A" ? "B" : "A"

/**
 * A club's habits on a map: drawn for the club, map and season (season one
 * keeps the original draw), then any habit the club changed after being
 * countered.
 */
export function teamHabits(teamId: string, mapId: string, state?: TeamHabitState | null): MapHabits {
    const season = state?.season ?? 1
    const rng = new SeededRNG(season > 1 ? deriveSeed(0x4ab17, teamId, mapId, season) : deriveSeed(0x4ab17, teamId, mapId))
    const t: SiteId = rng.bool(0.5) ? "A" : "B"
    const ct: SiteId = rng.bool(0.5) ? "A" : "B"
    const shift = state?.shift?.[mapId]
    return {
        t: { site: shift?.t ? flip(t) : t },
        ct: { stack: shift?.ct ? flip(ct) : ct },
    }
}

/**
 * After a match: the club read the counters it faced. Your CT counter (stack
 * their T site) may make their Ts change site; your T counter (hit the site
 * their CTs leave light) may make their CTs change the stack.
 */
export function adaptHabits(state: TeamHabitState | null | undefined, counters: MatchCounters | undefined, teamId: string, seed: number): TeamHabitState {
    const next: TeamHabitState = { ...(state ?? {}), shift: { ...(state?.shift ?? {}) } }
    for (const [mapId, used] of Object.entries(counters ?? {})) {
        if (!used || (!used.ct && !used.t)) continue
        const rng = new SeededRNG(deriveSeed(0xad4b7, teamId, mapId, seed))
        const cur = { ...(next.shift![mapId] ?? {}) }
        if (used.ct && rng.bool(HABIT_ADAPT_CHANCE)) cur.t = !cur.t
        if (used.t && rng.bool(HABIT_ADAPT_CHANCE)) cur.ct = !cur.ct
        if (cur.t || cur.ct) next.shift![mapId] = { ...(cur.t ? { t: true } : {}), ...(cur.ct ? { ct: true } : {}) }
        else delete next.shift![mapId]
    }
    return next
}

/** Keeps only a valid habit state (saves). */
export function sanitizeHabitState(value: unknown): TeamHabitState | undefined {
    if (!value || typeof value !== "object") return undefined
    const v = value as Record<string, unknown>
    const season = typeof v.season === "number" && Number.isInteger(v.season) && v.season >= 1 ? v.season : undefined
    const shift = sanitizeCounters(v.shift)
    if (!season && !Object.keys(shift).length) return undefined
    return { ...(season ? { season } : {}), ...(Object.keys(shift).length ? { shift } : {}) }
}

/** The site each counter plays to against these habits. */
export function counterSite(side: "ct" | "t", habits: MapHabits): SiteId {
    return side === "ct" ? habits.t.site : habits.ct.stack === "A" ? "B" : "A"
}

export const habitLine = {
    t: (h: MapHabits) => `Their Ts favour ${h.t.site} on full buys.`,
    ct: (h: MapHabits) => `Their CTs like to stack ${h.ct.stack}.`,
}

export const COUNTER_LABEL = {
    ct: (h: MapHabits) => `Stack ${counterSite("ct", h)}`,
    t: (h: MapHabits) => `Hit ${counterSite("t", h)}`,
}

/** Keeps only valid entries (saves). */
export function sanitizeCounters(value: unknown): MatchCounters {
    const out: MatchCounters = {}
    if (!value || typeof value !== "object") return out
    for (const [mapId, raw] of Object.entries(value as Record<string, unknown>)) {
        if (!raw || typeof raw !== "object") continue
        const c = raw as Record<string, unknown>
        const entry: MapCounters = {}
        if (c.ct === true) entry.ct = true
        if (c.t === true) entry.t = true
        if (entry.ct || entry.t) out[mapId] = entry
    }
    return out
}
