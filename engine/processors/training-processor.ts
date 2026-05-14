import { TrainingFocus, calculateTrainingGains, calculateTrainingFatigue, EventType } from "@/types"
import { GameSave, PlayerSaveData } from "../save-types"
import { TrainingManager } from "../training-manager"
import { PlayerLifecycleManager } from "../player-lifecycle"
import { SeededRNG } from "../rng"
import { getStaffPassiveBonuses, getPlayerPassiveBonuses } from "../talent-trees"
import type { SaveIndexes } from "@/store/indexes"

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
            const trainingBonus = 1 + (trainingFacility?.level || 0) * 0.1

            const tacticalFacility = team.facilities?.find(f => f.type === "TACTICAL")
            const tacticalBonus = 1 + (tacticalFacility?.level || 0) * 0.2

            // O(1) team-staff lookup via prebuilt index. Was scanning the full
            // ~50-100 staff array twice per team (coaches filter + teamStaff
            // filter) — O(teams × staff × 2) per week.
            const teamStaff = idx?.staffByTeamId.get(teamId) ?? save.staff.filter(s => s.teamId === teamId)
            let developmentStatSum = 0
            let staffTrainingEfficiency = 0
            let staffTacticMastery = 0
            for (const s of teamStaff) {
                if (s.role === "coach") developmentStatSum += s.stats?.development || 50
                const bonuses = getStaffPassiveBonuses(s.role, s.unlockedTalentIds || [])
                staffTrainingEfficiency += bonuses["training_efficiency"] || 0
                staffTacticMastery += bonuses["tactic_mastery"] || 0
            }
            const coachBonus = 1 + (developmentStatSum / 100) * 0.5
            const talentTrainingMod = 1 + staffTrainingEfficiency / 100
            const talentTacticMod = 1 + staffTacticMastery / 100

            team.rosterIds.forEach(playerId => {
                const player = idx ? idx.playerIndex.get(playerId) : save.players.find(p => p.id === playerId)
                if (!player) return

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

                        let finalGain = gain * trainingBonus * coachBonus * talentTrainingMod
                        if (['tactic', 'leader', 'teamwork'].includes(stat)) {
                            finalGain *= tacticalBonus * talentTacticMod
                        }

                        const newVal = Math.min(
                            player.potential,
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
                player.fatigue = Math.min(100, player.fatigue + fatigueGain)

                // REST bonus
                if (focus === TrainingFocus.REST) {
                    player.morale = Math.min(100, player.morale + 5)
                }
            })
        })
    }

    static processFatigueRecovery(save: GameSave, rng?: SeededRNG, idx?: SaveIndexes): void {
        // Get current year from game start date + current week
        const startYear = new Date(save.gameStartDate).getFullYear()
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
            let totalRecoveryBonus = recoveryFacility?.level || 0

            // Phase 57: Psychologist Bonus. O(1) team-staff lookup via index;
            // previously this re-scanned the full staff list for every player.
            if (team) {
                const teamStaff = idx?.staffByTeamId.get(team.id) ?? save.staff.filter(s => s.teamId === team.id)
                let psychStatSum = 0
                let psychRecoveryBonus = 0
                for (const s of teamStaff) {
                    if (s.role !== "psychologist") continue
                    psychStatSum += s.stats?.mentalRecovery || 50
                    const bonuses = getStaffPassiveBonuses(s.role, s.unlockedTalentIds || [])
                    psychRecoveryBonus += bonuses["recovery_amount"] || 0
                }
                // Bonus: 100 stat = +10 Recovery
                totalRecoveryBonus += (psychStatSum / 100) * 10 + psychRecoveryBonus
            }

            // Player talent: "energy_recovery" passive bonus
            const playerBonuses = getPlayerPassiveBonuses(player.unlockedTalentIds || [])
            totalRecoveryBonus += playerBonuses["energy_recovery"] || 0

            // Use the centralized Lifecycle Manager
            PlayerLifecycleManager.processWeeklyUpdates(player, currentYear, save.currentWeek, totalRecoveryBonus, rng)
        })
    }

    static processRestDays(save: GameSave, playerTeamId: string): void {
        const team = save.teams.find(t => t.id === playerTeamId)
        if (!team) return

        const playerRoster = save.players.filter(p => team.rosterIds.includes(p.id))
        const targetWeek = save.currentWeek - 1

        // Pre-fetch all matches for the target week
        const weekMatches = [
            ...save.scheduledMatches.filter(m => m.week === targetWeek && (m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId)),
            ...save.completedMatches.filter(m => m.week === targetWeek && (m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId))
        ].sort((a, b) => a.id.localeCompare(b.id))

        for (let day = 0; day <= 6; day++) {
            const hasMatch = weekMatches.some((m, idx) => {
                if (m.day !== undefined) return m.day === day
                if (m.isScrim) {
                    const scrimDay = idx % 2 === 0 ? 3 : 4
                    return day === scrimDay
                }
                const matchDayOffset = idx % 2 === 0 ? 5 : 6
                return day === matchDayOffset
            })

            const hasActivity = save.scheduledActivities?.some(a =>
                a.week === targetWeek &&
                (a.day === day || (a.duration || 0) > 0)
            )

            if (!hasMatch && !hasActivity) {
                const restDayId = `rest_w${targetWeek}_d${day}_${playerTeamId}`
                const alreadyExists = save.scheduledActivities.some(a => a.id === restDayId)
                if (!alreadyExists) {
                    save.scheduledActivities.push({
                        id: restDayId,
                        type: "REST",
                        week: targetWeek,
                        day: day,
                        duration: 0,
                        name: "Rest Day",
                        description: "Recovery (+15)",
                        cost: 0
                    })

                    playerRoster.forEach(player => {
                        player.energy = Math.min(player.maxEnergy || 100, (player.energy || 0) + 15)
                        player.morale = Math.min(100, (player.morale || 0) + 2)
                        player.form = Math.min(100, (player.form || 0) + 1)
                        player.fatigue = Math.max(0, (player.fatigue || 0) - 12)
                    })
                }
            }
        }
    }
}
