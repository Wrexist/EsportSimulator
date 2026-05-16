/**
 * Per-team buy-phase logic.
 *
 * Extracted from match-simulation.ts (Phase J2). Drives every player's
 * weapon / armor / kit / utility purchase decisions for one round based
 * on the team's chosen strategy (ECO / FORCE / SEMIBUY / FULL / PISTOL /
 * DOUBLE AWP) and any per-player custom loadouts from the tactics editor.
 *
 * Public API call chain:
 *   - useLiveMatch / match-simulation-slice / match-simulation.ts
 *   → SimulationEngineV2.performBuyPhase (thin facade)
 *   → performBuyPhase (this module, the real logic)
 *
 * Strategy quirks pinned by the J1 test suite:
 *   - PISTOL: $650 vest only, starting pistol enforced (no kit, no utility)
 *   - FULL with $10k+: every player spends something
 *   - DOUBLE AWP: AWPER-role players prioritized for AWP slots
 *   - Cash never goes negative for any player across 5×6 = 30 combinations
 *
 * The function MUTATES the economy record in place — caller passes the
 * map of per-player simulation state and receives back updated cash +
 * loadouts.
 */

import { EconomyManager, WEAPONS } from "../economy-manager"
import type { SeededRNG } from "../rng"
import type { Player, CustomTactics, TacticalStrategy, PlayerLoadout } from "@/types"
import { PlayerRole } from "@/types/enums"
import type { PlayerSimulationState } from "./round-outcome"

/**
 * Map a weapon ID to its CS2 tier ranking. Used by the upgrade gate so
 * `FULL` doesn't accidentally swap a player from an AK ($2700) back to
 * an AUG of the same tier but lower power.
 */
function weaponToLevel(weaponId: string): number {
    const w = WEAPONS[weaponId.toUpperCase()]
    if (!w) return 0
    if (w.type === "PISTOL") return 1
    if (w.type === "SMG") return 2
    if (w.type === "RIFLE") return 3
    if (w.type === "SNIPER") return 4
    return 0
}

export type BuyStrategy = "ECO" | "FORCE" | "SEMIBUY" | "FULL" | "PISTOL" | "DOUBLE AWP"

/**
 * Apply the per-team buy phase to every player's economy state.
 * Returns nothing — mutations land directly on the `economy` record.
 *
 * Determinism: every random decision routes through the supplied
 * SeededRNG. Same seed + same inputs → identical purchases.
 */
export function performBuyPhase(
    players: Player[],
    economy: Record<string, PlayerSimulationState>,
    strategy: BuyStrategy,
    isCT: boolean,
    rng: SeededRNG,
    customTactics?: CustomTactics,
): void {
    // PISTOL is not a key in CustomTactics; lookup returns undefined (safe via optional chaining).
    const tacticsForStrategy = customTactics ? customTactics[strategy as keyof CustomTactics] : undefined
    const customTactic: TacticalStrategy | undefined = tacticsForStrategy?.[isCT ? "ct" : "t"]
    const playerLoadouts: PlayerLoadout[] | undefined = customTactic?.playerLoadouts

    // PISTOL round override: starting pistol + optional vest, nothing else.
    if (strategy === "PISTOL") {
        players.forEach(p => {
            const state = economy[p.id]
            if (!state) return

            state.weapon = isCT ? "usp" : "glock"

            // Light kev ($650) for every player who can afford it.
            if (state.cash >= 650) {
                state.cash -= 650
                state.hasArmor = true
                state.hasHelmet = false
            }

            state.hasKit = false
            state.utility = []
        })
        return
    }

    // Pre-allocate AWP slots — prioritize AWPER role, then by cash.
    let awpsToBuy = strategy === "DOUBLE AWP" ? 2 : (strategy === "FULL" ? 1 : 0)
    const playerPositionMap = new Map(players.map((p, i) => [p.id, i]))
    const awpRecipients = new Set<string>()
    if (awpsToBuy > 0) {
        const candidates = [...players]
            .filter(p => {
                const pIdx = playerPositionMap.get(p.id) ?? -1
                const loadout = playerLoadouts?.[pIdx] || playerLoadouts?.find((l) => l.slotIndex === pIdx)
                return !loadout && economy[p.id]?.cash >= 4750
            })
            .sort((a, b) => {
                if (a.role === PlayerRole.AWPER && b.role !== PlayerRole.AWPER) return -1
                if (b.role === PlayerRole.AWPER && a.role !== PlayerRole.AWPER) return 1
                return economy[b.id].cash - economy[a.id].cash
            })
        for (let i = 0; i < Math.min(awpsToBuy, candidates.length); i++) {
            awpRecipients.add(candidates[i].id)
        }
    }

    players.forEach((p, idx) => {
        const state = economy[p.id]
        if (!state) return

        let effectiveRole = p.role
        const personalLoadout = playerLoadouts?.[idx] || playerLoadouts?.find((l) => l.slotIndex === idx)

        if (!personalLoadout) {
            if (awpRecipients.has(p.id)) {
                effectiveRole = PlayerRole.AWPER
            } else if (effectiveRole === PlayerRole.AWPER && !awpRecipients.has(p.id)) {
                effectiveRole = PlayerRole.RIFLER
            }
        }

        const buy = EconomyManager.getPlayerBuyV2(state.cash, strategy, effectiveRole, isCT, rng, personalLoadout || customTactic)

        // Weapon upgrade gate: never downgrade tier, prefer side-grades only at low tiers.
        const currentWeapon = WEAPONS[state.weapon.toUpperCase()] || WEAPONS.GLOCK
        const newWeapon = buy.weapon

        const currentLevel = weaponToLevel(state.weapon)
        const newLevel = weaponToLevel(newWeapon.id)

        const isStrictUpgrade = newLevel > currentLevel
        const isSideUpgrade = newLevel === currentLevel && newWeapon.price > currentWeapon.price
        const allowedUpgrade = isStrictUpgrade || (isSideUpgrade && currentLevel < 3)

        if (newWeapon.id !== state.weapon && allowedUpgrade && state.cash >= newWeapon.price) {
            state.cash -= newWeapon.price
            state.weapon = newWeapon.id
        }

        // Armor ladder: 0 (none), 1 (vest $650), 2 (helmet $1000 or $350 upgrade).
        if (buy.armorLevel > 0) {
            const currentArmorLevel = state.hasHelmet ? 2 : (state.hasArmor ? 1 : 0)

            if (buy.armorLevel > currentArmorLevel) {
                if (buy.armorLevel === 1 && currentArmorLevel === 0 && state.cash >= 650) {
                    state.cash -= 650
                    state.hasArmor = true
                } else if (buy.armorLevel === 2) {
                    if (currentArmorLevel === 1 && state.cash >= 350) {
                        state.cash -= 350
                        state.hasHelmet = true
                    } else if (currentArmorLevel === 0 && state.cash >= 1000) {
                        state.cash -= 1000
                        state.hasArmor = true
                        state.hasHelmet = true
                    }
                }
            }
        }

        if (buy.kit && !state.hasKit && state.cash >= 400) {
            state.cash -= 400
            state.hasKit = true
        }

        // Utility purchases from per-player loadout. Respects the 4-slot
        // CS2 utility cap and accounts for already-held items.
        if (personalLoadout && personalLoadout.utility && personalLoadout.utility.length > 0) {
            const desiredUtil = [...personalLoadout.utility]
            const currentUtilCounts = (state.utility || []).reduce((acc: Record<string, number>, u: string) => {
                acc[u] = (acc[u] || 0) + 1
                return acc
            }, {} as Record<string, number>)

            desiredUtil.forEach((utilId: string) => {
                if ((currentUtilCounts[utilId] || 0) > 0) {
                    currentUtilCounts[utilId]--
                    return
                }
                let cost = 0
                switch (utilId) {
                    case "flash": cost = 200; break
                    case "smoke": cost = 300; break
                    case "he": cost = 300; break
                    case "molotov": cost = isCT ? 600 : 400; break
                    case "decoy": cost = 50; break
                }

                if (state.cash >= cost && (state.utility || []).length < 4) {
                    state.cash -= cost
                    if (!state.utility) state.utility = []
                    state.utility.push(utilId)
                }
            })
        }
    })
}
