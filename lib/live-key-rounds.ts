/**
 * "Key rounds only" for the live match: which rounds play on the radar and
 * which finish at once. The round is already decided when it starts, so the
 * choice can look at what happens in it (a clutch, a four-kill round, a
 * defuse) as well as the score before it.
 *
 * Display only: skipping a round reveals the same result it would have shown
 * when played out, so the match is identical either way.
 */

import type { MatchEvent } from "@/types"
import { MATCH_STRUCTURE } from "@/lib/constants"

export interface KeyRoundInput {
    /** Round number on this map, 1-based (overtime continues the count). */
    roundNumber: number
    isOvertime: boolean
    /** Score on this map before the round. */
    homeRounds: number
    awayRounds: number
    events: readonly MatchEvent[]
    /** The managed team made its own call this round (not the auto pick). */
    managerCall?: boolean
}

export type KeyRoundReason =
    | "pistol" | "half-end" | "overtime" | "map-point" | "close-finish"
    | "manager-call" | "clutch" | "multi-kill" | "defuse"

/** Why the round is worth watching, or null when it can be skipped. */
export function keyRoundReason(r: KeyRoundInput): KeyRoundReason | null {
    const half = MATCH_STRUCTURE.REGULATION_ROUNDS / 2
    const toWin = half + 1
    if (r.isOvertime || r.roundNumber > MATCH_STRUCTURE.REGULATION_ROUNDS) return "overtime"
    if (r.roundNumber === 1 || r.roundNumber === half + 1) return "pistol"
    if (r.roundNumber === half) return "half-end"
    if (r.homeRounds === toWin - 1 || r.awayRounds === toWin - 1) return "map-point"
    if (r.homeRounds >= toWin - 3 && r.awayRounds >= toWin - 3 && Math.abs(r.homeRounds - r.awayRounds) <= 2) return "close-finish"
    if (r.managerCall) return "manager-call"
    if (r.events.some(e => e.type === "CLUTCH")) return "clutch"
    const kills = new Map<string, number>()
    for (const e of r.events) {
        if (e.type !== "KILL" || !e.playerId) continue
        const n = (kills.get(e.playerId) ?? 0) + 1
        kills.set(e.playerId, n)
        if (n >= 4) return "multi-kill"
    }
    if (r.events.some(e => e.type === "DEFUSE")) return "defuse"
    return null
}

/** Short feed line for a skipped round. */
export const SKIPPED_ROUND_LINE = "Quiet round: skipped to the result"
