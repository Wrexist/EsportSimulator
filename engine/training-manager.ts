import { GameSave } from "./save-types"
import { Role } from "@/types"
import { PlayerRole } from "@/types/enums"

const ROLE_TO_PLAYER_ROLE: Record<Role, PlayerRole> = {
  awper: PlayerRole.AWPER,
  rifler: PlayerRole.RIFLER,
  igl: PlayerRole.IGL,
  support: PlayerRole.SUPPORT,
  entry: PlayerRole.ENTRY_FRAGGER,
}

export class TrainingManager {
  static ROLE_TRAINING_COST = 5000
  static ROLE_TRAINING_DURATION = 8

  /**
   * Start training a player for a new role.
   * Validates funds and eligibility.
   */
  static startRoleTraining(
    game: GameSave,
    teamId: string,
    playerId: string,
    targetRole: Role
  ): { success: boolean, message: string } {
    const team = game.teams.find(t => t.id === teamId)
    if (!team) return { success: false, message: "Team not found" }

    const player = game.players.find(p => p.id === playerId)
    if (!player) return { success: false, message: "Player not found" }

    // 1. Check if already training
    if (!team.activeRoleTraining) team.activeRoleTraining = []
    if (team.activeRoleTraining.find(t => t.playerId === playerId)) {
      return { success: false, message: "Player is already in training" }
    }

    // Check if player already has a secondary role
    if (player.secondaryRole) {
      return { success: false, message: "Player already has a secondary role (Max: 2)" }
    }

    // Slot & Energy Checks
    if ((team.trainingSlotsUsed || 0) >= (team.maxTrainingSlots || 10)) {
      return { success: false, message: "No training slots available this week" }
    }

    if ((player.energy || 100) < 20) {
      return { success: false, message: "Player is too exhausted to start training" }
    }

    // 2. Check funds for first week
    if (team.budget < this.ROLE_TRAINING_COST) {
      return { success: false, message: "Insufficient funds to start training" }
    }

    // 3. Start Training
    team.activeRoleTraining.push({
      playerId,
      targetRole,
      weeksCompleted: 0,
      totalWeeks: this.ROLE_TRAINING_DURATION,
      weeklyCost: this.ROLE_TRAINING_COST,
      startWeek: game.currentWeek
    })

    // Increment slots used
    team.trainingSlotsUsed = (team.trainingSlotsUsed || 0) + 1

    // Training START event (only notify for player's own team)
    if (teamId === game.playerTeamId) {
      game.eventsLog.unshift({
        id: `training_start_${game.currentWeek}_${playerId}`,
        week: game.currentWeek,
        type: "TRAINING_START",
        data: {
          description: `${player.nickname} has begun ${targetRole} training (8 weeks, $5,000/wk)`,
          importance: "MEDIUM",
          entityId: player.id
        },
        acknowledged: false
      })
    }

    return { success: true, message: `Started ${targetRole} training for ${player.nickname}` }
  }

  /**
   * Cancel an active training session
   */
  static cancelTraining(game: GameSave, teamId: string, playerId: string) {
    const team = game.teams.find(t => t.id === teamId)
    if (!team || !team.activeRoleTraining) return

    const cancelled = team.activeRoleTraining.find(t => t.playerId === playerId)
    team.activeRoleTraining = team.activeRoleTraining.filter(t => t.playerId !== playerId)

    // Refund slot
    team.trainingSlotsUsed = Math.max(0, (team.trainingSlotsUsed || 0) - 1)

    // Partial refund: 50% of remaining weeks' cost
    if (cancelled) {
      const weeksRemaining = cancelled.totalWeeks - cancelled.weeksCompleted
      const refund = Math.floor(cancelled.weeklyCost * weeksRemaining * 0.5)
      if (refund > 0) {
        team.budget += refund
      }
    }

    // Training CANCEL event (only for player's own team)
    if (cancelled && teamId === game.playerTeamId) {
      const player = game.players.find(p => p.id === playerId)
      const weeksRemaining = cancelled.totalWeeks - cancelled.weeksCompleted
      const refund = Math.floor(cancelled.weeklyCost * weeksRemaining * 0.5)
      game.eventsLog.unshift({
        id: `training_cancel_${game.currentWeek}_${playerId}`,
        week: game.currentWeek,
        type: "TRAINING_CANCEL",
        data: {
          description: `Training cancelled for ${player?.nickname || 'Player'}. Progress: ${cancelled.weeksCompleted}/${cancelled.totalWeeks} weeks.${refund > 0 ? ` Refunded $${refund.toLocaleString()}.` : ''}`,
          importance: "LOW",
          entityId: playerId
        },
        acknowledged: false
      })
    }
  }

  /**
   * Process weekly training progress.
   * Pauses if funds run out or player is injured.
   */
  static processWeeklyTraining(game: GameSave) {
    game.teams.forEach(team => {
      if (!team.activeRoleTraining || team.activeRoleTraining.length === 0) return

      // Iterate backwards to allow removal
      for (let i = team.activeRoleTraining.length - 1; i >= 0; i--) {
        const session = team.activeRoleTraining[i]
        const player = game.players.find(p => p.id === session.playerId)

        // Pause training while injured
        if (player?.injury) {
          session.injuryPaused = true
          continue
        }

        // Check if training was previously paused due to injury and player has recovered
        if (session.injuryPaused && player) {
          session.injuryPaused = false
          if (team.id === game.playerTeamId) {
            game.eventsLog.unshift({
              id: `training_resume_${game.currentWeek}_${session.playerId}`,
              week: game.currentWeek,
              type: "TRAINING_START",
              data: {
                description: `${player.nickname} has recovered from injury and resumed ${session.targetRole} training (${session.weeksCompleted}/${session.totalWeeks} weeks completed).`,
                importance: "MEDIUM",
                entityId: player.id
              },
              acknowledged: false
            })
          }
        }

        // 1. Pay Cost
        if (team.budget >= session.weeklyCost) {
          // Reset paused flag when funds are available again
          if (session.pausedNotified) {
            session.pausedNotified = false
          }
          team.budget -= session.weeklyCost

          // Log to finance ledger
          if (game.financeLedger) {
            game.financeLedger.push({
              id: `exp_train_${game.currentWeek}_${team.id}_${session.playerId}`,
              week: game.currentWeek,
              teamId: team.id,
              type: "EXPENSE",
              category: "TRAINING",
              amount: session.weeklyCost,
              description: `Role training: ${player?.nickname || 'Player'} → ${session.targetRole}`,
              balance: team.budget
            })
          }

          // 2. Advance Progress
          session.weeksCompleted++

          // 3. Check Completion
          if (session.weeksCompleted >= session.totalWeeks) {
            this.completeTraining(game, team, session)
            // Remove from active list
            team.activeRoleTraining.splice(i, 1)
            // Refund slot
            team.trainingSlotsUsed = Math.max(0, (team.trainingSlotsUsed || 0) - 1)
          }

          // Deduct Energy (only if training progressed)
          if (player) {
            player.energy = Math.max(0, (player.energy || 100) - 10)
          }
        } else {
          // Paused due to lack of funds — notify player once (only for player's own team)
          if (!session.pausedNotified) {
            session.pausedNotified = true
            if (team.id === game.playerTeamId) {
              game.eventsLog.unshift({
                id: `training_paused_${game.currentWeek}_${session.playerId}`,
                week: game.currentWeek,
                type: "TRAINING_CANCEL",
                data: {
                  description: `Training paused for ${player?.nickname || 'Player'} — insufficient funds ($${team.budget.toLocaleString()} available, $${session.weeklyCost.toLocaleString()} needed).`,
                  importance: "MEDIUM",
                  entityId: session.playerId
                },
                acknowledged: false
              })
            }
          }
        }
      }
    })
  }

  private static completeTraining(
    game: GameSave,
    team: any,
    session: any
  ) {
    const player = game.players.find(p => p.id === session.playerId)
    if (!player) return

    // Swap Roles: New Role becomes Primary, Old Primary becomes Secondary
    const oldPrimary = player.role
    player.role = ROLE_TO_PLAYER_ROLE[session.targetRole as Role] || session.targetRole
    player.secondaryRole = oldPrimary

    // Calculate coach bonus (coach development stat / 500, so 80 dev = +0.16 multiplier)
    const staff = (game as any).staff || []
    const coach = staff.find((s: any) => s.teamId === team.id && s.role === "coach")
    const coachBonus = coach ? (coach.stats?.development || 50) / 500 : 0

    // Apply Stat Boosts based on new role (with coach bonus)
    this.applyRoleBonuses(player, session.targetRole as Role, coachBonus)

    // Morale boost for completing training
    player.morale = Math.min(100, (player.morale || 70) + 10)

    // Career milestone
    if (!player.achievements) player.achievements = []
    player.achievements.push({
      type: "ROLE_MASTERY",
      week: game.currentWeek,
      description: `Mastered ${session.targetRole} as secondary role`
    })

    // Notify (only for player's own team)
    if (team.id === game.playerTeamId) {
      game.eventsLog.unshift({
        id: `training_complete_${game.currentWeek}_${session.playerId}`,
        week: game.currentWeek,
        type: "TRAINING_COMPLETE",
        data: {
          description: `${player.nickname} has completed ${session.targetRole} training! ${oldPrimary} is now their secondary role.`,
          importance: "HIGH",
          entityId: player.id
        },
        acknowledged: false
      })
    }
  }

  private static applyRoleBonuses(player: any, role: Role, coachBonus: number = 0) {
    // Boost relevant stats (0-100 scale)
    // Training completion provides a significant bump, enhanced by coach
    const boost = (val: number, amount: number) => Math.min(99, (val || 50) + Math.round(amount * (1 + coachBonus)))

    switch (role) {
      case "igl":
        player.tactic = boost(player.tactic, 5)
        player.leader = boost(player.leader, 3)
        break
      case "entry":
        player.reaction = boost(player.reaction, 4)
        player.rifle = boost(player.rifle, 4)
        break
      case "support":
        player.grenades = boost(player.grenades, 5)
        player.teamwork = boost(player.teamwork, 3)
        break
      case "awper":
        player.awp = boost(player.awp, 6)
        break
      case "rifler":
        player.rifle = boost(player.rifle, 4)
        player.skill = boost(player.skill, 4)
        break
    }
  }
}
