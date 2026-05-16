/**
 * Bulk synergy-matrix recalculation across every team in a save.
 *
 * Builds a players-by-id Map once and then runs O(roster) lookups per
 * team. The earlier inline copies in game-store.ts used
 * `players.filter(p => rosterIds.includes(p.id))` per team, which is
 * O(players × roster) — on a ~30 team / ~150 player league that's ~9000
 * array scans every recalc. This is the single hot path that handles
 * the same work in ~450 map lookups.
 *
 * Mutates each team's `synergyMatrix` in place. Pure with respect to
 * everything else on the save.
 */

import type { TeamSaveData, PlayerSaveData } from "../save-types"
import { SynergyCalculator } from "../synergy-calculator"

export function recalculateAllSynergy(
    teams: TeamSaveData[],
    players: PlayerSaveData[],
): void {
    const playersById = new Map<string, PlayerSaveData>()
    for (const p of players) playersById.set(p.id, p)

    teams.forEach(team => {
        const roster: PlayerSaveData[] = []
        for (const id of team.rosterIds) {
            const player = playersById.get(id)
            if (player) roster.push(player)
        }
        // SynergyCalculator.calculateTeamMatrix accepts plain PlayerSaveData[]
        // — the type is loose internally so passing through is safe.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        team.synergyMatrix = SynergyCalculator.calculateTeamMatrix(roster as any)
    })
}

/**
 * Single-team synergy refresh — used after transfer/release events
 * where only one roster has changed. Uses a per-call linear scan since
 * building a map for a single lookup isn't worth the overhead.
 */
export function recalculateTeamSynergy(
    team: TeamSaveData,
    allPlayers: PlayerSaveData[],
): void {
    const roster = allPlayers.filter(p => team.rosterIds.includes(p.id))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    team.synergyMatrix = SynergyCalculator.calculateTeamMatrix(roster as any)
}
