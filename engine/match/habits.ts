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

/** A club's habits on a map: fixed for the club and map, so they show again every time you meet them. */
export function teamHabits(teamId: string, mapId: string): MapHabits {
    const rng = new SeededRNG(deriveSeed(0x4ab17, teamId, mapId))
    return {
        t: { site: rng.bool(0.5) ? "A" : "B" },
        ct: { stack: rng.bool(0.5) ? "A" : "B" },
    }
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
