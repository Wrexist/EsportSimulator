/**
 * Team OVR: the starting five's average OVR, the same number the fixtures,
 * match preview and Home show. Null when the team has nobody to field.
 */

import { evaluatePlayer } from "@/engine/player-evaluation"
import { getActivePlayersByRosterOrder } from "./live-match-builders"

/** Players in a starting five. */
export const STARTING_FIVE = 5

/**
 * The starting five's average from the OVRs of the players in it. An empty
 * slot counts as 0 (SQUAD-06): a club one player short can't field a team,
 * so it must not read stronger than with a weak fifth. Null when nobody
 * plays.
 */
export function startingFiveOvr(ovrs: readonly number[]): number | null {
    if (ovrs.length === 0) return null
    const five = ovrs.slice(0, STARTING_FIVE)
    return Math.round(five.reduce((sum, v) => sum + v, 0) / STARTING_FIVE)
}

export function teamOvr(
    team: { rosterIds?: string[]; roster?: string[] } | undefined,
    players: Array<{ id: string; isRetired?: boolean }>,
    playerMap?: Map<string, { id: string; isRetired?: boolean }>,
): number | null {
    if (!team) return null
    const five = getActivePlayersByRosterOrder(team, players, playerMap)
    return startingFiveOvr(five.map(p => evaluatePlayer(p as unknown as Parameters<typeof evaluatePlayer>[0]).overallRating))
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
