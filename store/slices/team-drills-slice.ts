"use client"

/**
 * Team drills slice.
 *
 * Single action: runTeamDrill. Spends one weekly training slot to give
 * every active roster player:
 *   - Fatigue cost (cost parameter, −20% with `player_fit_2` Iron Lung talent)
 *   - Flat 50 XP (with level-up handling and 1 talent point per level)
 *   - Per-stat point gains from `gains[]` (with drill terminology mapped
 *     to actual player stat keys: agility→reaction, focus→stressResistance,
 *     entry/accuracy→rifle, mechanics→skill)
 *   - Weapon mastery XP for weapon-themed drills (rifle/awp/smg/pistol)
 *
 * Refuses to fire when the team is at its weekly training cap or any
 * roster player is exhausted (fatigue ≥ 90).
 *
 * Copied from the live game-store implementation. Uses the indexed
 * lookups + nextDeterministicId helper.
 */

import type { SliceCreator } from "@/store/types"
import type { PlayerSaveData } from "@/engine/save-types"
import { WeaponMasteryManager, type WeaponType } from "@/engine/weapon-mastery-system"
import { nextDeterministicId } from "@/store/utils/helpers"

const DRILL_XP_GAIN = 50
const EXHAUSTION_THRESHOLD = 90
const DEFAULT_MAX_TRAINING_SLOTS = 10
const DEFAULT_XP_TO_NEXT_LEVEL = 1000
const IRON_LUNG_TALENT_ID = "player_fit_2"
const IRON_LUNG_FATIGUE_REDUCTION = 0.8

/** Map drill UI stat names to actual PlayerSaveData keys. */
const STAT_MAPPING: Record<string, keyof PlayerSaveData> = {
    agility: "reaction",
    focus: "stressResistance",
    entry: "rifle",
    mechanics: "skill",
    accuracy: "rifle",
}

const WEAPON_STAT_NAMES = new Set(["RIFLE", "AWP", "SMG", "PISTOL"])

export interface TeamDrillsActions {
    runTeamDrill: (
        drillId: string,
        gains: Array<{ stat: string; amount: number }>,
        cost: number,
    ) => { success: boolean; message: string }
}

export const createTeamDrillsSlice: SliceCreator<TeamDrillsActions> = (set) => ({
    runTeamDrill: (drillId, gains, cost) => {
        let result = { success: false, message: "Unknown error" }
        set((state) => {
            if (!state.playerTeamId) {
                result = { success: false, message: "No team selected" }
                return
            }

            const team = state._teamIndex?.get(state.playerTeamId!)
                ?? state.teams.find(t => t.id === state.playerTeamId)
            if (!team) {
                result = { success: false, message: "Team not found" }
                return
            }

            // Weekly slot cap.
            if ((team.trainingSlotsUsed || 0) >= (team.maxTrainingSlots || DEFAULT_MAX_TRAINING_SLOTS)) {
                result = { success: false, message: "Weekly training limit reached!" }
                return
            }

            const drillName = drillId.replace(/_/g, " ").toUpperCase()

            // Exhaustion guard — block drill if any active player is gassed.
            const roster = state.players.filter(p => team.rosterIds.includes(p.id))
            const exhaustedPlayer = roster.find(p => (p.fatigue || 0) >= EXHAUSTION_THRESHOLD)
            if (exhaustedPlayer) {
                result = { success: false, message: `${exhaustedPlayer.nickname} is too exhausted to train!` }
                return
            }

            // Apply fatigue + XP + stat gains to every active roster player.
            roster.forEach(p => {
                // Iron Lung talent reduces fatigue by 20% (rounded up).
                let fatigueHit = cost
                if (p.unlockedTalentIds && p.unlockedTalentIds.includes(IRON_LUNG_TALENT_ID)) {
                    fatigueHit = Math.ceil(fatigueHit * IRON_LUNG_FATIGUE_REDUCTION)
                }
                p.fatigue = Math.min(100, (p.fatigue || 0) + fatigueHit)

                // Flat XP.
                p.xp = (p.xp || 0) + DRILL_XP_GAIN

                // Level-up if XP cap reached. xpToNextLevel grows 1.5× per level.
                if (p.xp >= (p.xpToNextLevel || DEFAULT_XP_TO_NEXT_LEVEL)) {
                    p.xp -= (p.xpToNextLevel || DEFAULT_XP_TO_NEXT_LEVEL)
                    p.level = (p.level || 1) + 1
                    p.talentPoints = (p.talentPoints || 0) + 1
                    p.xpToNextLevel = Math.floor((p.xpToNextLevel || DEFAULT_XP_TO_NEXT_LEVEL) * 1.5)

                    state.eventsLog.push({
                        id: nextDeterministicId(state, "lvl_up", p.id),
                        type: "PLAYER_LEVEL_UP",
                        week: state.currentWeek,
                        acknowledged: false,
                        data: { playerId: p.id, message: `${p.nickname} reached Level ${p.level}!` },
                    })
                }

                // Per-stat gains. Clamp every player stat to the 0-100 range.
                gains.forEach(gain => {
                    let statKey = gain.stat.toLowerCase()
                    const mapped = STAT_MAPPING[statKey]
                    if (mapped) statKey = mapped

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const currentVal = (p as any)[statKey]
                    if (currentVal !== undefined && typeof currentVal === "number") {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        ;(p as any)[statKey] = Math.min(100, currentVal + gain.amount)
                    }
                })
            })

            // Consume the training slot.
            team.trainingSlotsUsed = (team.trainingSlotsUsed || 0) + 1

            // Weapon-mastery XP for weapon-themed drills (50 XP/drill).
            roster.forEach(p => {
                gains.forEach(g => {
                    const stat = g.stat.toUpperCase()
                    if (!WEAPON_STAT_NAMES.has(stat)) return
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const currentMastery = WeaponMasteryManager.getPlayerMastery(p as any)
                    const currentXP = currentMastery[stat as WeaponType] || 0
                    const newXP = currentXP + DRILL_XP_GAIN

                    if (!p.weaponMastery) p.weaponMastery = {}
                    // weaponMastery accepts both number and object shapes.
                    p.weaponMastery[stat] = newXP
                })
            })

            result = { success: true, message: `Completed ${drillName} (+${DRILL_XP_GAIN} XP)` }
        })
        return result
    },
})
