/**
 * Per-match weapon mastery XP aggregation + application.
 *
 * Extracted from atomic-week-processor.ts processMatches (Phase M8).
 * Runs once per simulated match. Two phases combined:
 *
 *   1. Aggregate: walk every map's round-kill events; bucket each
 *      kill by weapon type into one of four counts (rifle / awp /
 *      pistol / smg). Skips kills whose weapon id isn't in the WEAPONS
 *      table (defensive against legacy/corrupt data).
 *
 *   2. Apply: for each player who landed at least one kill, look up
 *      the player record (via the prebuilt idx if available) and call
 *      WeaponMasteryManager.processMatchWeaponXP with the four counts.
 *
 * Pure save mutator: writes weapon-mastery XP onto every player
 * record that earned kills. Caller passes the prebuilt save index
 * for O(1) player lookups.
 */

import type { GameSave, PlayerSaveData } from "../save-types"
import type { MatchResult } from "@/types"
import { WEAPONS } from "../economy-manager"
import { WeaponMasteryManager } from "../weapon-mastery-system"
import type { SaveIndexes } from "@/store/indexes"

interface WeaponKills {
    rifle: number
    awp: number
    pistol: number
    smg: number
}

/**
 * Walk a match result, bucket kills by weapon type per player.
 * Pure: no save mutation, no side effects.
 */
export function aggregateMatchWeaponKills(
    result: MatchResult,
): Record<string, WeaponKills> {
    const stats: Record<string, WeaponKills> = {}

    result.maps?.forEach(map => {
        map.rounds?.forEach(round => {
            round.kills?.forEach(k => {
                if (!k.weapon) return

                const weaponData = WEAPONS[k.weapon.toUpperCase()]
                if (!weaponData) return

                if (!stats[k.playerId]) {
                    stats[k.playerId] = { rifle: 0, awp: 0, pistol: 0, smg: 0 }
                }

                const entry = stats[k.playerId]
                if (weaponData.type === "RIFLE") entry.rifle += k.kills
                else if (weaponData.type === "SNIPER") entry.awp += k.kills
                else if (weaponData.type === "PISTOL") entry.pistol += k.kills
                else if (weaponData.type === "SMG") entry.smg += k.kills
            })
        })
    })

    return stats
}

/**
 * Aggregate per-player weapon kills from this match and apply
 * WeaponMastery XP via WeaponMasteryManager.processMatchWeaponXP.
 * Caller's save indexes are used for O(1) player lookup.
 */
export function processMatchWeaponMastery(
    save: GameSave,
    result: MatchResult,
    idx?: SaveIndexes,
): void {
    const stats = aggregateMatchWeaponKills(result)

    Object.entries(stats).forEach(([playerId, weaponCounts]) => {
        const player: PlayerSaveData | undefined =
            idx?.playerIndex.get(playerId) ?? save.players.find(p => p.id === playerId)
        if (!player) return

        WeaponMasteryManager.processMatchWeaponXP(
            player,
            weaponCounts.rifle,
            weaponCounts.awp,
            weaponCounts.pistol,
            weaponCounts.smg,
        )
    })
}
