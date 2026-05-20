"use client"

/**
 * Player & staff development slice.
 *
 * Five actions covering talent unlocks, perks/skills, training focus,
 * and sanitized player-stat updates:
 *
 *   - unlockPlayerTalent — spend player talent points to unlock a node
 *     from the PLAYER_TALENT_TREE. TOCTOU-safe (checks happen inside
 *     the set callback). STAT_BOOST effects clamp targets to 0-100;
 *     passive bonuses are referenced elsewhere by talent-id presence.
 *   - unlockStaffTalent — same idea but for staff, against
 *     STAFF_TALENT_TREES keyed by role. STAT_BOOST applies to staff.stats.
 *   - unlockSkill — spend availableSkillPoints to add a perk id to the
 *     player's perks array (idempotent).
 *   - setPlayerTrainingFocus — set the per-player "trainingFocus" hint
 *     read by the weekly training engine.
 *   - updatePlayer — sanitized writeback for dynamic stats (energy,
 *     fatigue, morale, health, form, weaponMastery). Only the player's
 *     own team's roster can be mutated through this API; numeric inputs
 *     are clamped to 0-100.
 */

import type { SliceCreator } from "@/store/types"
import { PLAYER_TALENT_TREE, STAFF_TALENT_TREES } from "@/engine/talent-trees"
import { nextDeterministicId } from "@/store/utils/helpers"

const STAT_CLAMP_MAX = 100

export interface PlayerDevelopmentActions {
    unlockPlayerTalent: (playerId: string, talentId: string) => void
    unlockSkill: (playerId: string, skillId: string, cost: number) => void
    unlockStaffTalent: (staffId: string, talentId: string) => void
    setPlayerTrainingFocus: (playerId: string, focus: string) => void
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updatePlayer: (playerId: string, updates: Record<string, any>) => void
}

export const createPlayerDevelopmentSlice: SliceCreator<PlayerDevelopmentActions> = (set) => ({
    unlockPlayerTalent: (playerId, talentId) => {
        // Look up the talent node before opening the set callback —
        // PLAYER_TALENT_TREE is a static module-level constant.
        const node = PLAYER_TALENT_TREE.find(n => n.id === talentId)
        if (!node) return

        set((state) => {
            // Prefer the O(1) index; fall back to linear scan if missing
            // (matches the pattern used elsewhere in the store).
            const p = state.players.find(p => p.id === playerId)
            if (!p) return

            if (!p.unlockedTalentIds) p.unlockedTalentIds = []
            if (p.unlockedTalentIds.includes(talentId)) return

            // TOCTOU guard: re-check talent points + prerequisites here so
            // a rapid double-click can't double-spend.
            const hasPoints = (p.talentPoints || 0) >= node.cost
            const requirementsMet = node.requirements.every(req => p.unlockedTalentIds.includes(req))
            if (!hasPoints || !requirementsMet) return

            p.talentPoints -= node.cost
            p.unlockedTalentIds.push(talentId)

            // STAT_BOOST applies immediately (clamped to 0-100). Other effect
            // types are referenced by talent-id elsewhere — having the id in
            // unlockedTalentIds is what "activates" them.
            if (node.effect?.type === "STAT_BOOST") {
                const clamp = (v: number) => Math.max(0, Math.min(STAT_CLAMP_MAX, v))
                if (node.effect.target === "all") {
                    p.skill = clamp(p.skill + node.effect.value)
                    p.rifle = clamp(p.rifle + node.effect.value)
                    p.awp = clamp(p.awp + node.effect.value)
                    p.creativity = clamp(p.creativity + node.effect.value)
                    p.tactic = clamp(p.tactic + node.effect.value)
                    p.teamwork = clamp(p.teamwork + node.effect.value)
                    p.clutch = clamp(p.clutch + node.effect.value)
                } else {
                    const target = node.effect.target as keyof typeof p
                    if (typeof p[target] === "number") {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        ;(p[target] as any) = clamp((p[target] as number) + node.effect.value)
                    }
                }
            }

            state.eventsLog.unshift({
                id: nextDeterministicId(state, "evt_talent", playerId, talentId),
                // TRAINING_COMPLETE is reused for any positive-growth notification.
                type: "TRAINING_COMPLETE",
                week: state.currentWeek,
                data: {
                    title: "Talent Unlocked",
                    message: `${p.nickname} unlocked '${node.name}'`,
                    severity: "success",
                },
                acknowledged: false,
            })
        })
    },

    unlockSkill: (playerId, skillId, cost) => {
        set((state) => {
            const player = state.players.find(p => p.id === playerId)
            if (!player) return
            if ((player.availableSkillPoints || 0) < cost) return

            if (!player.perks) player.perks = []
            if (player.perks.includes(skillId)) return

            player.perks.push(skillId)
            player.availableSkillPoints = (player.availableSkillPoints || 0) - cost
        })
    },

    unlockStaffTalent: (staffId, talentId) => {
        set((state) => {
            // Must belong to the player's team — AI staff are managed by
            // the engine, not the UI.
            const staff = state.staff.find(s => s.id === staffId && s.teamId === state.playerTeamId)
            if (!staff) return

            const tree = STAFF_TALENT_TREES[staff.role] || []
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const node = tree.find((n: any) => n.id === talentId)
            if (!node) return

            if (staff.talentPoints < node.cost) return
            if (staff.unlockedTalentIds.includes(talentId)) return

            const meetsReq = node.requirements.every((req: string) => staff.unlockedTalentIds.includes(req))
            if (!meetsReq) return

            staff.talentPoints -= node.cost
            staff.unlockedTalentIds.push(talentId)

            // STAT_BOOST applies immediately to staff.stats. Other effect
            // types are referenced by talent-id elsewhere. Bind the effect
            // to a local so TS narrowing survives the inner forEach closure.
            const effect = node.effect
            if (effect && effect.type === "STAT_BOOST" && staff.stats) {
                const stats = staff.stats
                if (effect.target === "all") {
                    Object.keys(stats).forEach(key => {
                        stats[key] = Math.min(STAT_CLAMP_MAX, stats[key] + effect.value)
                    })
                } else if (stats[effect.target] !== undefined) {
                    stats[effect.target] = Math.min(
                        STAT_CLAMP_MAX,
                        stats[effect.target] + effect.value,
                    )
                }
            }
        })
    },

    setPlayerTrainingFocus: (playerId, focus) => {
        set((state) => {
            const player = state.players.find(p => p.id === playerId)
            if (!player) return
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(player as any).trainingFocus = focus
        })
    },

    updatePlayer: (playerId, updates) => {
        set((state) => {
            // Only the player team's own roster can be mutated through
            // this API. Other surfaces (transferPlayer, debug actions)
            // handle cross-team writes.
            const playerTeam = state.teams.find(t => t.id === state.playerTeamId)
            if (!playerTeam || !playerTeam.rosterIds.includes(playerId)) return

            const player = state.players.find(p => p.id === playerId)
            if (!player) return

            const numericClamp = (value: unknown, min: number, max: number): number | undefined => {
                if (typeof value !== "number" || !Number.isFinite(value)) return undefined
                return Math.max(min, Math.min(max, Math.floor(value)))
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const u = updates as any
            const nextEnergy = numericClamp(u.energy, 0, 100)
            if (nextEnergy !== undefined) player.energy = nextEnergy

            const nextFatigue = numericClamp(u.fatigue, 0, 100)
            if (nextFatigue !== undefined) player.fatigue = nextFatigue

            const nextMorale = numericClamp(u.morale, 0, 100)
            if (nextMorale !== undefined) player.morale = nextMorale

            const nextHealth = numericClamp(u.health, 0, 100)
            if (nextHealth !== undefined) player.health = nextHealth

            const nextForm = numericClamp(u.form, 0, 100)
            if (nextForm !== undefined) player.form = nextForm

            if (u.weaponMastery && typeof u.weaponMastery === "object") {
                player.weaponMastery = u.weaponMastery
            }
        })
    },
})
