import { TrainingFocus, calculateTrainingGains, calculateTrainingFatigue, EventType } from "@/types"
import { GameSave, PlayerSaveData } from "../save-types"
import { TrainingManager } from "../training-manager"
import { PlayerLifecycleManager } from "../player-lifecycle"
import { SeededRNG } from "../rng"
import { getPlayerPassiveBonuses } from "../talent-trees"
import { facilityLevel, staffDevelopmentEffects } from "../organization-effects"
import type { SaveIndexes } from "@/store/indexes"
import { CONDITION_TUNING } from "@/lib/balance-tuning"

export class TrainingProcessor {
    static processTraining(
        save: GameSave,
        trainingConfigs: Map<string, { focus: TrainingFocus; intensity: number }>,
        idx?: SaveIndexes
    ): void {
        trainingConfigs.forEach((config, teamId) => {
            const team = idx ? idx.teamIndex.get(teamId) : save.teams.find(t => t.id === teamId)
            if (!team) return

            // Pre-compute facility and coach lookups once per team
            const trainingFacility = team.facilities?.find(f => f.type === "TRAINING")
            const trainingBonus = 1 + facilityLevel(trainingFacility?.level || 0) * 0.1

            const tacticalFacility = team.facilities?.find(f => f.type === "TACTICAL")
            const tacticalBonus = 1 + facilityLevel(tacticalFacility?.level || 0) * 0.2

            // O(1) team-staff lookup via prebuilt index. Was scanning the full
            // ~50-100 staff array twice per team (coaches filter + teamStaff
            // filter) — O(teams × staff × 2) per week.
            const teamStaff = idx?.staffByTeamId.get(teamId) ?? save.staff.filter(s => s.teamId === teamId)
            const effects = staffDevelopmentEffects(teamStaff.filter(s => s.contractEndWeek === undefined || s.contractEndWeek > save.currentWeek))
            const coachBonus = effects.trainingMultiplier
            const talentTacticMod = effects.tacticMultiplier

            team.rosterIds.forEach(playerId => {
                const player = idx ? idx.playerIndex.get(playerId) : save.players.find(p => p.id === playerId)
                if (!player || player.isRetired) return

                // Check if in Role Training
                const roleTraining = team.activeRoleTraining?.find(rt => rt.playerId === playerId)
                if (roleTraining) {
                    return
                }

                // Determine Focus
                let focus = config.focus

                // Override with Individual Focus if set
                if (player.trainingFocus && player.trainingFocus !== "BALANCED" && Object.values(TrainingFocus).includes(player.trainingFocus as TrainingFocus)) {
                    focus = player.trainingFocus as TrainingFocus
                }

                // Apply training gains
                const gains = calculateTrainingGains(
                    focus,
                    config.intensity,
                    player.productivity,
                    player.potential
                )

                // Player talent passive bonuses (fatigue reduction, energy recovery)
                const playerBonuses = getPlayerPassiveBonuses(player.unlockedTalentIds || [])
                const playerFatigueReduction = playerBonuses["fatigue_reduction"] || 0

                Object.entries(gains).forEach(([stat, gain]) => {
                    if (gain && stat in player) {
                        const current = player[stat as keyof PlayerSaveData] as number

                        let finalGain = gain * trainingBonus * coachBonus
                        if (['tactic', 'leader', 'teamwork'].includes(stat)) {
                            finalGain *= tacticalBonus * talentTacticMod
                        }

                        const newVal = Math.min(
                            Math.min(100, Math.max(current, player.potential)),
                            Math.min(100, Math.max(0, current + finalGain))
                        )
                        ;(player as unknown as Record<string, unknown>)[stat] = newVal
                    }
                })

                // Apply fatigue (reduced by player talent)
                let fatigueGain = calculateTrainingFatigue(
                    focus,
                    config.intensity,
                    player.endurance
                )
                if (playerFatigueReduction > 0) {
                    fatigueGain *= (1 - Math.min(playerFatigueReduction, 90) / 100)
                }
                player.fatigue = Math.max(0, Math.min(100, player.fatigue + fatigueGain))

                // REST bonus
                if (focus === TrainingFocus.REST) {
                    player.morale = Math.min(100, player.morale + 5)
                }
            })
        })
    }

    static processFatigueRecovery(save: GameSave, rng?: SeededRNG, idx?: SaveIndexes): void {
        // Get current year from game start date + current week
        const startYear = new Date(save.gameStartDate).getUTCFullYear()
        // Approx 52 weeks per year
        const yearsPassed = Math.floor(save.currentWeek / 52)
        const currentYear = startYear + yearsPassed

        // Build player-to-team map for O(1) lookups
        const playerTeamMap = new Map<string, typeof save.teams[0]>()
        save.teams.forEach(t => t.rosterIds.forEach(pid => playerTeamMap.set(pid, t)))

        save.players.forEach(player => {
            // Phase 18: Find team and facility for recovery bonus
            const team = playerTeamMap.get(player.id)
            const recoveryFacility = team?.facilities?.find(f => f.type === "RECOVERY")
            let totalRecoveryBonus = facilityLevel(recoveryFacility?.level || 0)

            // Phase 57: Psychologist Bonus. O(1) team-staff lookup via index;
            // previously this re-scanned the full staff list for every player.
            if (team) {
                const teamStaff = idx?.staffByTeamId.get(team.id) ?? save.staff.filter(s => s.teamId === team.id)
                totalRecoveryBonus += staffDevelopmentEffects(teamStaff.filter(s => s.contractEndWeek === undefined || s.contractEndWeek > save.currentWeek)).recovery
            }

            // Player talent: "energy_recovery" passive bonus
            const playerBonuses = getPlayerPassiveBonuses(player.unlockedTalentIds || [])
            totalRecoveryBonus += playerBonuses["energy_recovery"] || 0

            // Use the centralized Lifecycle Manager
            PlayerLifecycleManager.processWeeklyUpdates(player, currentYear, save.currentWeek, totalRecoveryBonus, rng)
        })
    }

    /**
     * Idle-day recovery for the week that just ended. Every club's roster
     * recovers on each day without a match (and, for the managed club, without
     * a booked activity) under the same rule (CONDITION_TUNING). Only the
     * managed club gets calendar "Rest Day" rows; that row is also the
     * exactly-once guard for its recovery. AI recovery runs once per tick.
     */
    static processRestDays(save: GameSave, playerTeamId: string): void {
        const targetWeek = save.currentWeek - 1

        // Each club's fixtures for the target week, in the order the original
        // day fallback used (sorted by id; idx picks day 5/6, scrims 3/4).
        const matchesByTeam = new Map<string, Array<{ id: string; day?: number; isScrim?: boolean }>>()
        for (const m of [...save.scheduledMatches, ...save.completedMatches]) {
            if (m.week !== targetWeek) continue
            for (const id of [m.homeTeamId, m.awayTeamId]) {
                const list = matchesByTeam.get(id)
                if (list) list.push(m)
                else matchesByTeam.set(id, [m])
            }
        }
        const matchDays = (teamId: string): Set<number> => {
            const days = new Set<number>()
            const list = [...(matchesByTeam.get(teamId) || [])].sort((a, b) => a.id.localeCompare(b.id))
            list.forEach((m, idx) => {
                if (m.day !== undefined) days.add(m.day)
                else if (m.isScrim) days.add(idx % 2 === 0 ? 3 : 4)
                else days.add(idx % 2 === 0 ? 5 : 6)
            })
            return days
        }

        const playersById = new Map(save.players.map(p => [p.id, p]))
        for (const team of save.teams) {
            const busy = matchDays(team.id)
            const roster = team.rosterIds.map(id => playersById.get(id)).filter((p): p is PlayerSaveData => !!p && !p.isRetired)
            const isManaged = team.id === playerTeamId
            for (let day = 0; day <= 6; day++) {
                if (busy.has(day)) continue
                if (isManaged) {
                    const hasActivity = save.scheduledActivities?.some(a =>
                        a.week === targetWeek &&
                        (a.day === day || (a.duration || 0) > 0)
                    )
                    if (hasActivity) continue
                    const restDayId = `rest_w${targetWeek}_d${day}_${playerTeamId}`
                    if (save.scheduledActivities.some(a => a.id === restDayId)) continue
                    save.scheduledActivities.push({
                        id: restDayId,
                        type: "REST",
                        week: targetWeek,
                        day: day,
                        duration: 0,
                        name: "Rest Day",
                        description: `Recovery (+${CONDITION_TUNING.IDLE_DAY_ENERGY} energy)`,
                        cost: 0
                    })
                }
                roster.forEach(player => TrainingProcessor.applyIdleDayRecovery(player))
            }
        }
    }

    /** One idle day of recovery (CONDITION_TUNING); identical for every club. */
    static applyIdleDayRecovery(player: PlayerSaveData): void {
        player.energy = Math.min(player.maxEnergy || 100, (player.energy || 0) + CONDITION_TUNING.IDLE_DAY_ENERGY)
        player.fatigue = Math.max(0, (player.fatigue || 0) * (1 - CONDITION_TUNING.IDLE_DAY_FATIGUE_RECOVERY_RATE))
        if (CONDITION_TUNING.IDLE_DAY_MORALE) player.morale = Math.min(100, (player.morale || 0) + CONDITION_TUNING.IDLE_DAY_MORALE)
        if (CONDITION_TUNING.IDLE_DAY_FORM) player.form = Math.min(100, (player.form || 0) + CONDITION_TUNING.IDLE_DAY_FORM)
    }
}
