/**
 * Team OVR: the starting five's average OVR, the same number the fixtures,
 * match preview and Home show. Null when the team has nobody to field.
 */

import { evaluatePlayer } from "@/engine/player-evaluation"
import { getActivePlayersByRosterOrder } from "./live-match-builders"

export function teamOvr(
    team: { rosterIds?: string[]; roster?: string[] } | undefined,
    players: Array<{ id: string; isRetired?: boolean }>,
    playerMap?: Map<string, { id: string; isRetired?: boolean }>,
): number | null {
    if (!team) return null
    const five = getActivePlayersByRosterOrder(team, players, playerMap)
    if (five.length === 0) return null
    return Math.round(five.reduce((sum, p) => sum + evaluatePlayer(p as unknown as Parameters<typeof evaluatePlayer>[0]).overallRating, 0) / five.length)
}

/** Team OVR for every team, keyed by id, for lists that show many teams at once. */
export function teamOvrMap(
    teams: Array<{ id: string; rosterIds?: string[]; roster?: string[] }>,
    players: Array<{ id: string; isRetired?: boolean }>,
): Map<string, number> {
    const playerMap = new Map(players.map(p => [p.id, p]))
    const out = new Map<string, number>()
    for (const t of teams) {
        const ovr = teamOvr(t, players, playerMap)
        if (ovr != null) out.set(t.id, ovr)
    }
    return out
}
