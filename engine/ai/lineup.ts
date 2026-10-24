/**
 * AI starting five (G5). Starters are the first five roster slots, and a
 * signing joins at the end, so an AI club used to leave a new AWPer or IGL
 * on the bench for good. Each week the club now fields the five with the
 * best summed overall, counting every role missing from the five as
 * AI_SQUAD_TUNING.LINEUP_ROLE_WEIGHT points lost (the engine charges
 * ROLE_MISSING_EDGE per missing role, and the AWPer role buys the AWP).
 * Injured players sit out. Only the order of rosterIds changes.
 */

import type { PlayerSaveData, TeamSaveData } from "../save-types"
import { evaluatePlayer } from "../player-evaluation"
import { missingRoles } from "../match/round-sim/team-edge"
import { AI_SQUAD_TUNING } from "@/lib/balance-tuning"

/** Rosters above this size only consider their best this-many players (by overall). */
const MAX_POOL = 9

function combinations<T>(items: T[], k: number, start = 0, picked: T[] = [], out: T[][] = []): T[][] {
    if (picked.length === k) { out.push([...picked]); return out }
    for (let i = start; i <= items.length - (k - picked.length); i++) {
        picked.push(items[i])
        combinations(items, k, i + 1, picked, out)
        picked.pop()
    }
    return out
}

/** The five to field and their score (summed overall minus the role cost). */
export function bestAILineup(players: PlayerSaveData[], week: number): { five: PlayerSaveData[]; score: number } {
    const fit = players.filter(p => !p.isRetired && !p.injury)
    const rated = fit.map(p => ({ p, ovr: evaluatePlayer(p, undefined, undefined, week).overallRating }))
        .sort((a, b) => b.ovr - a.ovr || a.p.id.localeCompare(b.p.id))
        .slice(0, MAX_POOL)
    if (rated.length <= 5) return { five: rated.map(r => r.p), score: 0 }
    const ovr = new Map(rated.map(r => [r.p.id, r.ovr]))
    let best: { five: PlayerSaveData[]; score: number } | null = null
    for (const five of combinations(rated.map(r => r.p), 5)) {
        const score = five.reduce((n, p) => n + ovr.get(p.id)!, 0) - missingRoles(five) * AI_SQUAD_TUNING.LINEUP_ROLE_WEIGHT
        if (!best || score > best.score + 1e-9) best = { five, score }
    }
    return best!
}

/**
 * Puts the club's best role-balanced five in the first five slots, keeping
 * the rest of the order. Returns true when the five changed.
 */
export function setAILineup(team: TeamSaveData, byId: Map<string, PlayerSaveData>, week: number): boolean {
    const roster = team.rosterIds.map(id => byId.get(id)).filter((p): p is PlayerSaveData => !!p)
    if (roster.length <= 5) return false
    const { five } = bestAILineup(roster, week)
    if (five.length < 5) return false
    const chosen = new Set(five.map(p => p.id))
    const current = team.rosterIds.slice(0, 5)
    if (current.every(id => chosen.has(id))) return false
    // Keep starters who stay in their slots; newcomers take the freed slots.
    const incoming = five.map(p => p.id).filter(id => !current.includes(id))
    const starters = current.map(id => (chosen.has(id) ? id : incoming.shift()!))
    const rest = team.rosterIds.filter(id => !chosen.has(id))
    team.rosterIds = [...starters, ...rest]
    return true
}
