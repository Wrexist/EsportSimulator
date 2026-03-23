import { TrainingFocus, calculateTrainingGains, calculateTrainingFatigue, EventType } from "@/types"
import { GameSave } from "../save-types"
import { TrainingManager } from "../training-manager"
import { PlayerLifecycleManager } from "../player-lifecycle"
import { SeededRNG } from "../rng"

export class TrainingProcessor {
    static processTraining(
        save: GameSave,
        trainingConfigs: Map<string, { focus: TrainingFocus; intensity: number }>
    ): void {
        trainingConfigs.forEach((config, teamId) => {
            const team = save.teams.find(t => t.id === teamId)
            if (!team) return

            team.rosterIds.forEach(playerId => {
                const player = save.players.find(p => p.id === playerId)
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

                // Bonues
                const trainingFacility = team.facilities?.find(f => f.type === "TRAINING")
                const trainingBonus = 1 + (trainingFacility?.level || 0) * 0.1

                const tacticalFacility = team.facilities?.find(f => f.type === "TACTICAL")
                const tacticalBonus = 1 + (tacticalFacility?.level || 0) * 0.2

                // Coach Bonus
                const coaches = save.staff.filter(s => s.teamId === teamId && s.role === "coach")
                const developmentStatSum = coaches.reduce((sum, c) => sum + (c.stats?.development || 50), 0)
                const coachBonus = 1 + (developmentStatSum / 100) * 0.5

                // Apply training gains
                const gains = calculateTrainingGains(
                    focus,
                    config.intensity,
                    player.productivity,
                    player.potential
                )

                Object.entries(gains).forEach(([stat, gain]) => {
                    if (gain && stat in player) {
                        const current = (player as any)[stat] as number

                        let finalGain = gain * trainingBonus * coachBonus
                        if (['tactic', 'leader', 'teamwork'].includes(stat)) {
                            finalGain *= tacticalBonus
                        }

                        const newVal = Math.min(
                            player.potential,
                            Math.min(100, Math.max(0, current + finalGain))
                        )
                            ; (player as any)[stat] = newVal
                    }
                })

                // Apply fatigue
                const fatigueGain = calculateTrainingFatigue(
                    focus,
                    config.intensity,
                    player.endurance
                )
                player.fatigue = Math.min(100, player.fatigue + fatigueGain)

                // REST bonus
                if (focus === TrainingFocus.REST) {
                    player.morale = Math.min(100, player.morale + 5)
                }
            })
        })
    }

    static processFatigueRecovery(save: GameSave, rng?: SeededRNG): void {
        // Get current year from game start date + current week
        const startYear = new Date(save.gameStartDate).getFullYear()
        // Approx 52 weeks per year
        const yearsPassed = Math.floor(save.currentWeek / 52)
        const currentYear = startYear + yearsPassed

        save.players.forEach(player => {
            // Phase 18: Find team and facility for recovery bonus
            const team = save.teams.find(t => t.rosterIds.includes(player.id))
            const recoveryFacility = team?.facilities?.find(f => f.type === "RECOVERY")
            let totalRecoveryBonus = recoveryFacility?.level || 0

            // Phase 57: Psychologist Bonus
            if (team) {
                const psychologists = save.staff.filter(s => s.teamId === team.id && s.role === "psychologist")
                const psychStatSum = psychologists.reduce((sum, p) => sum + (p.stats?.mentalRecovery || 50), 0)
                // Bonus: 100 stat = +10 Recovery
                totalRecoveryBonus += (psychStatSum / 100) * 10
            }

            // Use the centralized Lifecycle Manager
            PlayerLifecycleManager.processWeeklyUpdates(player as any, currentYear, save.currentWeek, totalRecoveryBonus, rng)
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
