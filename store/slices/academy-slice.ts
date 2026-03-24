"use client"

import type { AcademyState, AcademyActions, SliceCreator } from "@/store/types"
import type { PlayerSaveData } from "@/engine/save-types"
import type { AcademyPlayer, AcademyTrainingFocus, ScoutingTier } from "@/types/academy"
import { AcademyEngine } from "@/engine/academy-engine"
import { generateProspect, prospectToPlayerData } from "@/engine/prospect-generator"
import {
  SCOUTING_COSTS,
  ACADEMY_LEVELS,
  DEV_MATCH_CONFIG,
  isScoutingTierUnlocked,
  ENERGY_CONFIG,
  DEVELOPMENT_CONFIG,
  ACADEMY_DRILLS,
  SCOUTING_DURATIONS,
  PENDING_POOL_MAX_SIZE,
} from "@/engine/academy-constants"
import { SeededRNG } from "@/engine"
import { generateSeed } from "@/engine/rng"

// ---- Local constants (mirrors game-store.ts private constants) ----
const MAX_TRANSFER_FEE = 1_000_000_000
const MAX_PLAYER_SALARY_PER_WEEK = 10_000_000
const MAX_CONTRACT_LENGTH_WEEKS = 52 * 10

type NumericValidationResult =
  | { ok: true; value: number }
  | { ok: false; message: string }

const parseBoundedInt = (
  value: unknown,
  label: string,
  min: number,
  max: number,
): NumericValidationResult => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, message: `${label} must be a valid number` }
  }
  const normalized = Math.floor(value)
  if (normalized < min || normalized > max) {
    return { ok: false, message: `${label} must be between ${min.toLocaleString()} and ${max.toLocaleString()}` }
  }
  return { ok: true, value: normalized }
}

type RngBackedState = {
  lastRngSeed: number
  currentWeek: number
}

const nextRandomInt = (state: RngBackedState, min: number, max: number): number => {
  const rng = new SeededRNG(state.lastRngSeed || generateSeed())
  const value = rng.next()
  state.lastRngSeed = rng.getState()
  return Math.floor(value * (max - min + 1)) + min
}

const nextDeterministicId = (
  state: RngBackedState,
  prefix: string,
  ...parts: Array<string | number | null | undefined>
): string => {
  const token = nextRandomInt(state, 0, 0x7fffffff).toString(36)
  const suffix = parts
    .filter((part): part is string | number => part !== undefined && part !== null)
    .map(String)
    .join("_")
  return suffix
    ? `${prefix}_${state.currentWeek}_${token}_${suffix}`
    : `${prefix}_${state.currentWeek}_${token}`
}

// ---- Initial State ----

export const academyInitialState: AcademyState = {
  academyPlayers: [],
  academyMatchHistory: [],
  academyRoster: {},
  academyTrainingSchedule: {},
  academyWeeklyReports: [],
  academyScoutingMissions: [],
  academyPendingProspects: [],
}

// ---- Slice Creator ----

export const createAcademySlice: SliceCreator<AcademyActions> = (set, get) => ({
  buildAcademy: (teamId) => {
    let result = { success: false, message: "" }
    set((state) => {
      const team = state.teams.find(t => t.id === teamId)
      if (!team) {
        result = { success: false, message: "Team not found" }
        return
      }

      // Check if already built
      if (team.academyFacility && team.academyFacility.level > 0) {
        result = { success: false, message: "Academy already exists" }
        return
      }

      const cost = ACADEMY_LEVELS[1].buildCost
      if (team.budget < cost) {
        result = { success: false, message: `Insufficient funds. Need $${cost.toLocaleString()}` }
        return
      }

      // Build academy
      team.budget -= cost
      team.academyFacility = { level: 1, builtWeek: state.currentWeek }

      // Add news
      state.newsFeed.unshift({
        id: nextDeterministicId(state, "news_academy", team.id),
        title: `${team.name} opens Youth Academy`,
        content: `${team.name} have invested in their future by opening a Youth Academy facility. The organization is now ready to develop the next generation of esports talent.`,
        category: "FACILITY",
        teamId: team.id,
        week: state.currentWeek,
      })
      if (state.newsFeed.length > 50) state.newsFeed.pop()

      result = { success: true, message: "Academy built successfully!" }
    })
    return result
  },

  upgradeAcademy: (teamId) => {
    let result = { success: false, message: "" }
    set((state) => {
      const team = state.teams.find(t => t.id === teamId)
      if (!team) {
        result = { success: false, message: "Team not found" }
        return
      }

      const currentLevel = team.academyFacility?.level || 0
      if (currentLevel === 0) {
        result = { success: false, message: "Build academy first" }
        return
      }
      if (currentLevel >= 5) {
        result = { success: false, message: "Academy is already at maximum level" }
        return
      }

      const cost = AcademyEngine.getUpgradeCost(currentLevel)
      if (team.budget < cost) {
        result = { success: false, message: `Insufficient funds. Need $${cost.toLocaleString()}` }
        return
      }

      // Upgrade
      team.budget -= cost
      team.academyFacility!.level = currentLevel + 1
      team.academyFacility!.lastUpgradeWeek = state.currentWeek

      const levelInfo = ACADEMY_LEVELS[currentLevel + 1 as keyof typeof ACADEMY_LEVELS]
      state.newsFeed.unshift({
        id: nextDeterministicId(state, "news_academy_up", team.id, currentLevel + 1),
        title: `${team.name} upgrade Academy to ${levelInfo.name}`,
        content: `${team.name}'s Youth Academy has been upgraded to Level ${currentLevel + 1}. ${levelInfo.description}`,
        category: "FACILITY",
        teamId: team.id,
        week: state.currentWeek,
      })
      if (state.newsFeed.length > 50) state.newsFeed.pop()

      result = { success: true, message: `Academy upgraded to Level ${currentLevel + 1}!` }
    })
    return result
  },

  scoutProspect: (tier: ScoutingTier) => {
    let result: { success: boolean; player?: PlayerSaveData; message: string } = { success: false, message: "" }
    set((state) => {
      const team = state.teams.find(t => t.id === state.playerTeamId)
      if (!team) {
        result = { success: false, message: "Team not found" }
        return
      }

      const academyLevel = team.academyFacility?.level || 0
      if (academyLevel === 0) {
        result = { success: false, message: "Build academy first" }
        return
      }

      if (!isScoutingTierUnlocked(tier, academyLevel)) {
        result = { success: false, message: `${tier} scouting requires Academy Level ${tier === "REGIONAL" ? 2 : 4}` }
        return
      }

      const cost = SCOUTING_COSTS[tier]
      if (team.budget < cost) {
        result = { success: false, message: `Insufficient funds. Need $${cost.toLocaleString()}` }
        return
      }

      // Check for staff
      const scouter = state.staff.find(s => s.teamId === state.playerTeamId && s.role === "scout")
      if (!scouter) {
        result = { success: false, message: "A hired Scout is required to start scouting missions" }
        return
      }

      // Deduct cost only after all preconditions pass
      team.budget -= cost

      const duration = SCOUTING_DURATIONS[tier]

      // Add mission
      const mission: import("@/types/academy").AcademyScoutingMission = {
        id: nextDeterministicId(state, "mission", tier),
        tier,
        weeksRemaining: duration,
        cost,
        startWeek: state.currentWeek,
        scoutId: scouter.id,
      }

      state.academyScoutingMissions.push(mission)

      result = { success: true, message: `${tier} scouting mission initiated. Will take ${duration} week(s).` }
    })
    return result
  },

  enrollProspect: (playerId) => {
    let result = { success: false, message: "" }
    set((state) => {
      const team = state.teams.find(t => t.id === state.playerTeamId)
      if (!team) {
        result = { success: false, message: "Team not found" }
        return
      }

      const academyLevel = team.academyFacility?.level || 0
      if (academyLevel === 0) {
        result = { success: false, message: "Build academy first" }
        return
      }

      // Check capacity
      if (!AcademyEngine.canEnrollProspect(state.academyPlayers.length, academyLevel)) {
        result = { success: false, message: "Academy is at full capacity" }
        return
      }

      const player = state.players.find(p => p.id === playerId)
      if (!player) {
        result = { success: false, message: "Player not found" }
        return
      }

      // Check if already enrolled
      if (state.academyPlayers.some(ap => ap.playerId === playerId)) {
        result = { success: false, message: "Player already in academy" }
        return
      }

      // Create academy player record
      const academyPlayer: AcademyPlayer = {
        id: nextDeterministicId(state, "academy", playerId),
        playerId,
        enrolledWeek: state.currentWeek,
        trainingFocus: "BALANCED",
        developmentProgress: 0,
        potentialRevealed: academyLevel >= 5, // Level 5 = instant reveal
        totalXpGained: 0,
        academyMatchesPlayed: 0,
        readyForPromotion: false,
        scoutNotes: AcademyEngine.generateScoutNotes(player as any, academyLevel >= 5),
        energy: 100,
      }

      state.academyPlayers.push(academyPlayer)
      result = { success: true, message: `${player.nickname} enrolled in academy` }
    })
    return result
  },

  setProspectTraining: (prospectId, focus) => {
    set((state) => {
      const prospect = state.academyPlayers.find(p => p.id === prospectId)
      if (prospect) {
        prospect.trainingFocus = focus
      }
    })
  },

  releaseProspect: (prospectId, releaseCost = 1000) => {
    let result = { success: false, message: "" }
    set((state) => {
      const releaseCostValidation = parseBoundedInt(releaseCost, "Release fee", 0, MAX_TRANSFER_FEE)
      if (!releaseCostValidation.ok) {
        result = { success: false, message: releaseCostValidation.message }
        return
      }
      const normalizedReleaseCost = releaseCostValidation.value

      const team = state.teams.find(t => t.id === state.playerTeamId)
      const prospectIndex = state.academyPlayers.findIndex(p => p.id === prospectId)

      if (prospectIndex === -1) {
        result = { success: false, message: "Prospect not found" }
        return
      }

      if (team && team.budget < normalizedReleaseCost) {
        result = { success: false, message: `Insufficient funds to pay termination fee ($${normalizedReleaseCost.toLocaleString()})` }
        return
      }

      const prospect = state.academyPlayers[prospectIndex]
      const player = state.players.find(p => p.id === prospect.playerId)

      // Deduct release cost
      if (team) {
        team.budget -= normalizedReleaseCost
      }

      // Remove from academy
      state.academyPlayers.splice(prospectIndex, 1)

      // Remove player from game if not promoted
      const playerIndex = state.players.findIndex(p => p.id === prospect.playerId)
      if (playerIndex !== -1) {
        state.players.splice(playerIndex, 1)
      }

      result = { success: true, message: `${player?.nickname || "Prospect"} released. Paid $${normalizedReleaseCost.toLocaleString()} termination fee.` }
    })
    return result
  },

  promoteProspect: (prospectId, contract) => {
    let result = { success: false, message: "" }
    set((state) => {
      const team = state.teams.find(t => t.id === state.playerTeamId)
      if (!team) {
        result = { success: false, message: "Team not found" }
        return
      }

      const prospectIndex = state.academyPlayers.findIndex(p => p.id === prospectId)
      if (prospectIndex === -1) {
        result = { success: false, message: "Prospect not found" }
        return
      }

      const prospect = state.academyPlayers[prospectIndex]
      const player = state.players.find(p => p.id === prospect.playerId)

      if (!player) {
        result = { success: false, message: "Player data not found" }
        return
      }

      const salaryValidation = parseBoundedInt(contract.salaryPerWeek, "Prospect salary", 1, MAX_PLAYER_SALARY_PER_WEEK)
      if (!salaryValidation.ok) {
        result = { success: false, message: salaryValidation.message }
        return
      }
      const lengthValidation = parseBoundedInt(contract.lengthWeeks, "Contract length", 1, MAX_CONTRACT_LENGTH_WEEKS)
      if (!lengthValidation.ok) {
        result = { success: false, message: lengthValidation.message }
        return
      }
      const normalizedSalary = salaryValidation.value
      const normalizedLength = lengthValidation.value

      // Check roster space
      if (team.rosterIds.length >= 7) {
        result = { success: false, message: "Roster is full (max 7 players)" }
        return
      }
      if (team.rosterIds.includes(player.id)) {
        result = { success: false, message: "Player is already on the main roster" }
        return
      }

      // Remove from academy
      state.academyPlayers.splice(prospectIndex, 1)

      // Add to roster
      team.rosterIds.push(player.id)

      // Create contract
      state.contracts = state.contracts.filter(c => c.playerId !== player.id)
      state.contracts.push({
        playerId: player.id,
        teamId: team.id,
        salaryPerWeek: normalizedSalary,
        startWeek: state.currentWeek,
        endWeek: state.currentWeek + normalizedLength,
        buyout: Math.min(MAX_TRANSFER_FEE, normalizedSalary * 20),
      })

      // Mark as academy graduate
      ;(player as any).isAcademyGraduate = true
      player.tier = "ACADEMY"

      // News
      state.newsFeed.unshift({
        id: nextDeterministicId(state, "news_promo", player.id),
        title: `${player.nickname} promoted to ${team.name} main roster`,
        content: `Rising star ${player.nickname} has graduated from ${team.name}'s Youth Academy and earned a spot on the main roster. The ${player.age}-year-old ${player.nationality} talent has signed a ${Math.round(normalizedLength / 52)}-year contract.`,
        category: "TRANSFER",
        teamId: team.id,
        playerId: player.id,
        week: state.currentWeek,
      })
      if (state.newsFeed.length > 50) state.newsFeed.pop()

      result = { success: true, message: `${player.nickname} promoted to main roster!` }
    })
    return result
  },

  scheduleDevMatch: () => {
    let result = { success: false, message: "" }
    set((state) => {
      const team = state.teams.find(t => t.id === state.playerTeamId)
      if (!team || !team.academyFacility || team.academyFacility.level < 2) {
        result = { success: false, message: "Academy Level 2 required for matches" }
        return
      }

      const academyLevel = team.academyFacility.level

      if (team.budget < DEV_MATCH_CONFIG.matchCost) {
        result = { success: false, message: `Insufficient budget ($${DEV_MATCH_CONFIG.matchCost.toLocaleString()} required)` }
        return
      }

      // Get the actual enrolled starters
      const starterIds = Object.values(state.academyRoster).filter(Boolean) as string[]
      const activeStarters = state.academyPlayers.filter(p => starterIds.includes(p.id))

      if (activeStarters.length < 5) {
        result = { success: false, message: "You need 5 starters assigned in the roster tab to play matches" }
        return
      }

      // Check for exhaustion
      const exhausted = activeStarters.filter(p => (p.energy ?? 100) < ENERGY_CONFIG.exhaustionLimit)
      if (exhausted.length > 0) {
        const names = exhausted.map(p => {
          const pl = state.players.find(pl => pl.id === p.playerId)
          return pl?.nickname || "Player"
        }).join(", ")
        result = { success: false, message: `Starters are too exhausted to play (<${ENERGY_CONFIG.exhaustionLimit}% Energy): ${names}` }
        return
      }

      const prospectPlayers = activeStarters.map(ap =>
        state.players.find(p => p.id === ap.playerId)
      ).filter(Boolean) as PlayerSaveData[]
      const academyRng = new SeededRNG(state.lastRngSeed || generateSeed())

      const matchResult = AcademyEngine.simulateDevelopmentMatch(
        activeStarters,
        prospectPlayers as any,
        academyLevel,
        state.currentWeek,
        academyRng,
      )
      state.lastRngSeed = academyRng.getState()

      // Consume energy and apply XP
      activeStarters.forEach(prospect => {
        const xp = matchResult.xpGained[prospect.playerId] || 0
        prospect.energy = (prospect.energy ?? 100) - ENERGY_CONFIG.matchCost
        prospect.totalXpGained += xp
        prospect.academyMatchesPlayed += 1
        prospect.developmentProgress = Math.min(100, prospect.developmentProgress + AcademyEngine.calculateProgressGain(xp))
      })

      state.academyMatchHistory.unshift(matchResult)
      team.budget -= DEV_MATCH_CONFIG.matchCost

      const scoreText = `${matchResult.scoreHome}-${matchResult.scoreAway}`
      result = {
        success: true,
        message: matchResult.won
          ? `Victory! ${scoreText} vs ${matchResult.opponentName}`
          : `Defeat ${scoreText} vs ${matchResult.opponentName}`,
      }
    })
    return result
  },

  processAcademyWeek: () => {
    set((state) => {
      const team = state.teams.find(t => t.id === state.playerTeamId)
      if (!team || !team.academyFacility || team.academyFacility.level === 0) return

      const academyLevel = team.academyFacility.level
      const academyRng = new SeededRNG(state.lastRngSeed || generateSeed())

      // Prepare report
      const report: import("@/types/academy").AcademyWeeklyReport = {
        week: state.currentWeek,
        overallXp: 0,
        prospectReports: [],
      }

      // Identify starters
      const starterIds = Object.values(state.academyRoster).filter(Boolean) as string[]

      // Get active drills
      const scheduledDrills = Object.values(state.academyTrainingSchedule)
        .map(id => ACADEMY_DRILLS.find(d => d.id === id))
        .filter(Boolean) as import("@/types/academy").AcademyTrainingDrill[]

      // Process each prospect
      state.academyPlayers.forEach(prospect => {
        const player = state.players.find(p => p.id === prospect.playerId)
        if (!player) return

        const isStarter = starterIds.includes(prospect.id)
        let xpGained = 0
        let energyChange = 0
        const statsImproved: Partial<Record<import("@/types/academy").TrainableStat, number>> = {}

        // 1. Process Training Schedule (Drills)
        scheduledDrills.forEach(drill => {
          // Deduct energy
          energyChange -= drill.energyCost

          // Calculate XP gain (Starters 100%, Bench 25%)
          let drillXp = drill.xpGain * (isStarter ? 1.0 : 0.25)

          // Fatigue penalty
          if ((prospect.energy ?? 100) < ENERGY_CONFIG.fatigueThreshold) {
            drillXp *= ENERGY_CONFIG.fatiguePenalty
          }

          xpGained += drillXp

          // Fractional Stat Improvements per drill
          drill.statFocus.forEach(stat => {
            const currentValue = (player as any)[stat] as number
            if (typeof currentValue === "number") {
              const potentialCap = (player as any).potential
              const roomToGrow = Math.max(0, potentialCap - currentValue)
              const growthFactor = roomToGrow / 100
              // Small increment per drill
              const improvement = (drillXp / 100) * DEVELOPMENT_CONFIG.statGainPer100XP * growthFactor * (0.8 + academyRng.next() * 0.4)
              statsImproved[stat] = (statsImproved[stat] || 0) + improvement
            }
          })
        })

        // 2. Weekly Recovery
        energyChange += isStarter ? ENERGY_CONFIG.starterRecovery : ENERGY_CONFIG.benchRecovery

        // 3. Finalize XP and Energy
        prospect.energy = Math.min(100, Math.max(0, (prospect.energy ?? 100) + energyChange))
        prospect.totalXpGained += xpGained
        prospect.developmentProgress = Math.min(100, prospect.developmentProgress + AcademyEngine.calculateProgressGain(xpGained))
        report.overallXp += xpGained

        // 4. Apply Stat Improvements
        const updates = AcademyEngine.applyStatImprovements(player as any, statsImproved)
        Object.assign(player, updates)

        // 5. check promotion etc
        const evaluation = AcademyEngine.evaluatePromotion(prospect, player as any)
        prospect.readyForPromotion = evaluation.ready

        if (state.currentWeek % 4 === 0) {
          prospect.scoutNotes = AcademyEngine.generateScoutNotes(player as any, prospect.potentialRevealed)
        }

        // Reveal potential based on level
        if (!prospect.potentialRevealed) {
          const weeksEnrolled = state.currentWeek - prospect.enrolledWeek
          const revealWeeks = academyLevel >= 4 ? 2 : academyLevel === 3 ? 4 : academyLevel === 2 ? 8 : 12

          if (weeksEnrolled >= revealWeeks) {
            prospect.potentialRevealed = true
            prospect.scoutNotes = AcademyEngine.generateScoutNotes(player as any, true)
          }
        }

        // 6. Add to prospect report
        report.prospectReports.push({
          playerId: prospect.playerId,
          nickname: player.nickname,
          xpGained: Math.round(xpGained),
          statImprovements: statsImproved,
          energyChange,
          isStarter,
        })
      })

      // Save report
      state.academyWeeklyReports.unshift(report)
      if (state.academyWeeklyReports.length > 10) {
        state.academyWeeklyReports = state.academyWeeklyReports.slice(0, 10)
      }

      // 7. Process Scouting Missions
      state.academyScoutingMissions.forEach((mission) => {
        mission.weeksRemaining--

        if (mission.weeksRemaining <= 0) {
          // Complete Mission
          const newProspect = generateProspect(mission.tier, undefined, academyRng)
          const playerData = prospectToPlayerData(newProspect, state.currentWeek, academyRng) as unknown as PlayerSaveData

          const isPoolFull = (state.academyPendingProspects || []).length >= PENDING_POOL_MAX_SIZE

          if (!isPoolFull) {
            state.players.push(playerData)
            state.academyPendingProspects.push(playerData.id)
          }

          state.newsFeed.unshift({
            id: nextDeterministicId(state, "news_scout", mission.id),
            title: isPoolFull ? `${mission.tier} Scouting Overload` : `${mission.tier} Scouting Complete`,
            content: isPoolFull
              ? `Your scout found a talent, but your review desk is full (Max ${PENDING_POOL_MAX_SIZE}). The prospect was lost to other teams.`
              : `Your scout has found a new talent: ${playerData.nickname} (${playerData.age}y). Review them in the Scouting tab.`,
            category: "STAFF",
            week: state.currentWeek,
            teamId: team.id,
          })
        }
      })

      // Remove completed missions
      state.academyScoutingMissions = state.academyScoutingMissions.filter(m => m.weeksRemaining > 0)
      state.lastRngSeed = academyRng.getState()

      // Deduct costs
      const upkeep = AcademyEngine.getWeeklyUpkeep(academyLevel, state.academyPlayers.length)
      team.budget -= upkeep
    })
  },

  updateAcademyRoster: (role, prospectId) => {
    set((state) => {
      state.academyRoster[role] = prospectId
    })
  },

  updateAcademySchedule: (day, drillId) => {
    set((state) => {
      state.academyTrainingSchedule[day] = drillId
    })
  },

  discardPendingProspect: (playerId) => {
    set((state) => {
      state.academyPendingProspects = state.academyPendingProspects.filter(id => id !== playerId)
      // Also remove from global players pool if they were only scouted for the academy
      const playerIndex = state.players.findIndex(p => p.id === playerId)
      if (playerIndex !== -1) {
        state.players.splice(playerIndex, 1)
      }
    })
  },

  enrollPendingProspect: (playerId) => {
    const state = get()
    let result = state.enrollProspect(playerId)
    if (result.success) {
      set((state) => {
        state.academyPendingProspects = (state.academyPendingProspects || []).filter(id => id !== playerId)
      })
    }
    return result
  },
})
