"use client"

/**
 * Academy slice — youth development pipeline.
 *
 * 13 actions covering the full academy lifecycle:
 *
 *   Facility management:
 *     - buildAcademy / upgradeAcademy
 *
 *   Scouting & enrollment:
 *     - scoutProspect — start a tier-bound scouting mission (cost +
 *       duration from constants). Requires a Scout staff member.
 *     - enrollProspect — accept a candidate into the academy.
 *     - discardPendingProspect — reject a scouted prospect.
 *     - enrollPendingProspect — accept from pending pool (delegates to
 *       enrollProspect via get()).
 *
 *   Roster / schedule:
 *     - updateAcademyRoster — slot a prospect into a role.
 *     - updateAcademySchedule — set a drill for a weekday.
 *     - setProspectTraining — change a prospect's training focus.
 *
 *   Lifecycle:
 *     - releaseProspect — drop with termination fee.
 *     - promoteProspect — academy → senior roster with validated contract.
 *     - scheduleDevMatch — play a development match using the assigned
 *       starters (consumes energy, gives XP).
 *
 *   Weekly tick:
 *     - processAcademyWeek — runs every weekly tick. Applies drill XP +
 *       stat gains to every prospect, recovers energy, completes
 *       scouting missions, deducts upkeep, generates weekly report.
 *
 * Extracted from game-store.ts as the final big domain.
 */

import type { SliceCreator } from "@/store/types"
import type { PlayerSaveData } from "@/engine/save-types"
import { AcademyEngine } from "@/engine/academy-engine"
import { generateProspect, prospectToPlayerData } from "@/engine/prospect-generator"
import { getStaffPassiveBonuses, isFeatureUnlocked } from "@/engine/talent-trees"
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
import type {
    AcademyPlayer,
    AcademyTrainingFocus,
    AcademyScoutingMission,
    AcademyWeeklyReport,
    AcademyTrainingDrill,
    ScoutingTier,
    TrainableStat,
} from "@/types/academy"
import { SeededRNG, generateSeed } from "@/engine/rng"
import {
    nextDeterministicId,
    parseBoundedInt,
    MAX_TRANSFER_FEE,
    MAX_PLAYER_SALARY_PER_WEEK,
    MAX_CONTRACT_LENGTH_WEEKS,
} from "@/store/utils/helpers"

const MAX_ACADEMY_LEVEL = 5
const MAX_ROSTER_SIZE = 7
const ACADEMY_RNG_SALT = 0xACADE
const SCOUT_RNG_SALT = 0xACADE // Academy uses a derived seed so main RNG isn't mutated
const ACADEMY_REPORT_HISTORY_CAP = 10
const BENCH_XP_MULTIPLIER = 0.25
const STAT_GROWTH_VARIANCE_LO = 0.8
const STAT_GROWTH_VARIANCE_HI = 0.4 // multiplied: stat_growth ∈ [0.8, 1.2]
const SCOUT_NOTES_REFRESH_INTERVAL = 4
const POTENTIAL_REVEAL_WEEKS: Record<number, number> = {
    1: 12, 2: 8, 3: 4, 4: 2, 5: 2,
}
const PROMOTION_BUYOUT_MULTIPLIER = 20
const NEWS_FEED_CAP = 50

export interface AcademyActions {
    buildAcademy: (teamId: string) => { success: boolean; message: string }
    upgradeAcademy: (teamId: string) => { success: boolean; message: string }
    scoutProspect: (tier: ScoutingTier) => { success: boolean; player?: PlayerSaveData; message: string }
    enrollProspect: (playerId: string) => { success: boolean; message: string }
    setProspectTraining: (prospectId: string, focus: AcademyTrainingFocus) => void
    releaseProspect: (prospectId: string, releaseCost?: number) => { success: boolean; message: string }
    promoteProspect: (
        prospectId: string,
        contract: { salaryPerWeek: number; lengthWeeks: number },
    ) => { success: boolean; message: string }
    scheduleDevMatch: () => { success: boolean; message: string }
    processAcademyWeek: () => void
    updateAcademyRoster: (role: string, prospectId: string | null) => void
    updateAcademySchedule: (day: number, drillId: string | null) => void
    discardPendingProspect: (playerId: string) => void
    enrollPendingProspect: (playerId: string) => { success: boolean; message: string }
}

export const createAcademySlice: SliceCreator<AcademyActions> = (set, get) => ({
    buildAcademy: (teamId) => {
        let result = { success: false, message: "" }
        set((state) => {
            const team = state._teamIndex?.get(teamId) ?? state.teams.find(t => t.id === teamId)
            if (!team) {
                result = { success: false, message: "Team not found" }
                return
            }
            // Idempotency: refuse a re-build on an existing academy.
            if (team.academyFacility && team.academyFacility.level > 0) {
                result = { success: false, message: "Academy already exists" }
                return
            }

            const cost = ACADEMY_LEVELS[1].buildCost
            if (team.budget < cost) {
                result = { success: false, message: `Insufficient funds. Need $${cost.toLocaleString()}` }
                return
            }

            team.budget -= cost
            team.academyFacility = { level: 1, builtWeek: state.currentWeek }

            state.newsFeed.unshift({
                id: nextDeterministicId(state, "news_academy", team.id),
                title: `${team.name} opens Youth Academy`,
                content: `${team.name} have invested in their future by opening a Youth Academy facility. The organization is now ready to develop the next generation of esports talent.`,
                category: "FACILITY",
                teamId: team.id,
                week: state.currentWeek,
            })
            if (state.newsFeed.length > NEWS_FEED_CAP) state.newsFeed.pop()

            result = { success: true, message: "Academy built successfully!" }
        })
        return result
    },

    upgradeAcademy: (teamId) => {
        let result = { success: false, message: "" }
        set((state) => {
            const team = state._teamIndex?.get(teamId) ?? state.teams.find(t => t.id === teamId)
            if (!team) {
                result = { success: false, message: "Team not found" }
                return
            }

            const currentLevel = team.academyFacility?.level || 0
            if (currentLevel === 0) {
                result = { success: false, message: "Build academy first" }
                return
            }
            if (currentLevel >= MAX_ACADEMY_LEVEL) {
                result = { success: false, message: "Academy is already at maximum level" }
                return
            }

            const cost = AcademyEngine.getUpgradeCost(currentLevel)
            if (team.budget < cost) {
                result = { success: false, message: `Insufficient funds. Need $${cost.toLocaleString()}` }
                return
            }

            team.budget -= cost
            team.academyFacility!.level = currentLevel + 1
            team.academyFacility!.lastUpgradeWeek = state.currentWeek

            const levelInfo = ACADEMY_LEVELS[(currentLevel + 1) as keyof typeof ACADEMY_LEVELS]
            state.newsFeed.unshift({
                id: nextDeterministicId(state, "news_academy_up", team.id, currentLevel + 1),
                title: `${team.name} upgrade Academy to ${levelInfo.name}`,
                content: `${team.name}'s Youth Academy has been upgraded to Level ${currentLevel + 1}. ${levelInfo.description}`,
                category: "FACILITY",
                teamId: team.id,
                week: state.currentWeek,
            })
            if (state.newsFeed.length > NEWS_FEED_CAP) state.newsFeed.pop()

            result = { success: true, message: `Academy upgraded to Level ${currentLevel + 1}!` }
        })
        return result
    },

    scoutProspect: (tier) => {
        let result: { success: boolean; player?: PlayerSaveData; message: string } =
            { success: false, message: "" }
        set((state) => {
            const team = state._teamIndex?.get(state.playerTeamId!)
                ?? state.teams.find(t => t.id === state.playerTeamId)
            if (!team) {
                result = { success: false, message: "Team not found" }
                return
            }

            const academyLevel = team.academyFacility?.level || 0
            if (academyLevel === 0) {
                result = { success: false, message: "Build academy first" }
                return
            }
            const managerLevel = state.managerDetails?.level || 1
            if (!isScoutingTierUnlocked(tier, academyLevel, managerLevel)) {
                const managerThreshold = tier === "REGIONAL" ? 5 : 10
                const academyThreshold = tier === "REGIONAL" ? 2 : 4
                result = {
                    success: false,
                    message: `${tier} scouting requires Academy Level ${academyThreshold} or Manager Level ${managerThreshold}.`,
                }
                return
            }

            // A hired Scout is mandatory — without one the mission can't run.
            const scouter = state.staff.find(s => s.teamId === state.playerTeamId && s.role === "scout")
            if (!scouter) {
                result = { success: false, message: "A hired Scout is required to start scouting missions" }
                return
            }

            // Scout talent "Networking" reduces mission cost by 10% per unlock.
            // Stored as a negative value (-10) so just add it to a 100-base divisor.
            const scoutBonuses = getStaffPassiveBonuses("scout", scouter.unlockedTalentIds || [])
            const scoutCostBonus = scoutBonuses["scout_cost"] || 0
            const baseCost = SCOUTING_COSTS[tier]
            const cost = Math.max(0, Math.round(baseCost * (1 + scoutCostBonus / 100)))

            if (team.budget < cost) {
                result = { success: false, message: `Insufficient funds. Need $${cost.toLocaleString()}` }
                return
            }

            team.budget -= cost
            const duration = SCOUTING_DURATIONS[tier]

            const mission: AcademyScoutingMission = {
                id: nextDeterministicId(state, "mission", tier),
                tier,
                weeksRemaining: duration,
                cost,
                startWeek: state.currentWeek,
                scoutId: scouter.id,
            }
            state.academyScoutingMissions.push(mission)

            const savedMsg = cost < baseCost ? ` (saved $${(baseCost - cost).toLocaleString()} via Networking)` : ""
            result = { success: true, message: `${tier} scouting mission initiated. Will take ${duration} week(s).${savedMsg}` }
        })
        return result
    },

    enrollProspect: (playerId) => {
        let result = { success: false, message: "" }
        set((state) => {
            const team = state._teamIndex?.get(state.playerTeamId!)
                ?? state.teams.find(t => t.id === state.playerTeamId)
            if (!team) {
                result = { success: false, message: "Team not found" }
                return
            }

            const academyLevel = team.academyFacility?.level || 0
            if (academyLevel === 0) {
                result = { success: false, message: "Build academy first" }
                return
            }

            if (!AcademyEngine.canEnrollProspect(state.academyPlayers.length, academyLevel)) {
                result = { success: false, message: "Academy is at full capacity" }
                return
            }

            const player = state._playerIndex?.get(playerId)
                ?? state.players.find(p => p.id === playerId)
            if (!player) {
                result = { success: false, message: "Player not found" }
                return
            }
            if (state.academyPlayers.some(ap => ap.playerId === playerId)) {
                result = { success: false, message: "Player already in academy" }
                return
            }

            // Scout "Eagle Eye" talent (exact_potential) ALSO reveals
            // potential at enrollment — short-circuits the academy level 5
            // requirement so a Tier-2 scout investment effectively
            // substitutes for the most expensive facility upgrade.
            const scoutHasEagleEye = state.staff.some(s =>
                s.teamId === state.playerTeamId &&
                s.role === "scout" &&
                isFeatureUnlocked("scout", s.unlockedTalentIds, "exact_potential")
            )
            const revealedOnEnroll = academyLevel >= MAX_ACADEMY_LEVEL || scoutHasEagleEye

            const academyPlayer: AcademyPlayer = {
                id: nextDeterministicId(state, "academy", playerId),
                playerId,
                enrolledWeek: state.currentWeek,
                trainingFocus: "BALANCED",
                developmentProgress: 0,
                potentialRevealed: revealedOnEnroll,
                totalXpGained: 0,
                academyMatchesPlayed: 0,
                readyForPromotion: false,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                scoutNotes: AcademyEngine.generateScoutNotes(player as any, revealedOnEnroll),
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
            if (prospect) prospect.trainingFocus = focus
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

            const team = state._teamIndex?.get(state.playerTeamId!)
                ?? state.teams.find(t => t.id === state.playerTeamId)
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
            const player = state._playerIndex?.get(prospect.playerId)
                ?? state.players.find(p => p.id === prospect.playerId)

            if (team) team.budget -= normalizedReleaseCost

            // Drop from academy AND from the global players pool (academy
            // prospects are unique to this save — releasing means they're
            // gone, not added to free agency).
            state.academyPlayers.splice(prospectIndex, 1)
            const playerIndex = state.players.findIndex(p => p.id === prospect.playerId)
            if (playerIndex !== -1) {
                state.players.splice(playerIndex, 1)
            }

            result = {
                success: true,
                message: `${player?.nickname || "Prospect"} released. Paid $${normalizedReleaseCost.toLocaleString()} termination fee.`,
            }
        })
        return result
    },

    promoteProspect: (prospectId, contract) => {
        let result = { success: false, message: "" }
        set((state) => {
            const team = state._teamIndex?.get(state.playerTeamId!)
                ?? state.teams.find(t => t.id === state.playerTeamId)
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
            const player = state._playerIndex?.get(prospect.playerId)
                ?? state.players.find(p => p.id === prospect.playerId)
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

            if (team.rosterIds.length >= MAX_ROSTER_SIZE) {
                result = { success: false, message: `Roster is full (max ${MAX_ROSTER_SIZE} players)` }
                return
            }
            if (team.rosterIds.includes(player.id)) {
                result = { success: false, message: "Player is already on the main roster" }
                return
            }

            // Drop from academy, add to roster, issue contract.
            state.academyPlayers.splice(prospectIndex, 1)
            team.rosterIds.push(player.id)
            state.contracts = state.contracts.filter(c => c.playerId !== player.id)
            state.contracts.push({
                playerId: player.id,
                teamId: team.id,
                salaryPerWeek: normalizedSalary,
                startWeek: state.currentWeek,
                endWeek: state.currentWeek + normalizedLength,
                buyout: Math.min(MAX_TRANSFER_FEE, normalizedSalary * PROMOTION_BUYOUT_MULTIPLIER),
            })

            // Flag as academy graduate for achievement tracking + tier reset.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(player as any).isAcademyGraduate = true
            player.tier = "ACADEMY"

            state.newsFeed.unshift({
                id: nextDeterministicId(state, "news_promo", player.id),
                title: `${player.nickname} promoted to ${team.name} main roster`,
                content: `Rising star ${player.nickname} has graduated from ${team.name}'s Youth Academy and earned a spot on the main roster. The ${player.age}-year-old ${player.nationality} talent has signed a ${Math.round(normalizedLength / 52)}-year contract.`,
                category: "TRANSFER",
                teamId: team.id,
                playerId: player.id,
                week: state.currentWeek,
            })
            if (state.newsFeed.length > NEWS_FEED_CAP) state.newsFeed.pop()

            result = { success: true, message: `${player.nickname} promoted to main roster!` }
        })
        return result
    },

    scheduleDevMatch: () => {
        let result = { success: false, message: "" }
        set((state) => {
            const team = state._teamIndex?.get(state.playerTeamId!)
                ?? state.teams.find(t => t.id === state.playerTeamId)
            if (!team || !team.academyFacility || team.academyFacility.level < 2) {
                result = { success: false, message: "Academy Level 2 required for matches" }
                return
            }

            const academyLevel = team.academyFacility.level

            if (team.budget < DEV_MATCH_CONFIG.matchCost) {
                result = { success: false, message: `Insufficient budget ($${DEV_MATCH_CONFIG.matchCost.toLocaleString()} required)` }
                return
            }

            // Resolve assigned starters from academyRoster slots.
            const starterIds = Object.values(state.academyRoster).filter(Boolean) as string[]
            const activeStarters = state.academyPlayers.filter(p => starterIds.includes(p.id))
            if (activeStarters.length < 5) {
                result = { success: false, message: "You need 5 starters assigned in the roster tab to play matches" }
                return
            }

            // Refuse if any starter is below the exhaustion limit.
            const exhausted = activeStarters.filter(p => (p.energy ?? 100) < ENERGY_CONFIG.exhaustionLimit)
            if (exhausted.length > 0) {
                const names = exhausted.map(p => {
                    const pl = state.players.find(pl => pl.id === p.playerId)
                    return pl?.nickname || "Player"
                }).join(", ")
                result = {
                    success: false,
                    message: `Starters are too exhausted to play (<${ENERGY_CONFIG.exhaustionLimit}% Energy): ${names}`,
                }
                return
            }

            const prospectPlayers = activeStarters.map(ap =>
                state._playerIndex?.get(ap.playerId) ?? state.players.find(p => p.id === ap.playerId)
            ).filter(Boolean) as PlayerSaveData[]

            // Academy uses a derived seed so the main RNG chain isn't disturbed.
            const academyRng = new SeededRNG((state.lastRngSeed || generateSeed()) ^ ACADEMY_RNG_SALT)
            const matchResult = AcademyEngine.simulateDevelopmentMatch(
                activeStarters,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                prospectPlayers as any,
                academyLevel,
                state.currentWeek,
                academyRng,
            )

            // Apply per-starter energy cost + XP + progress + match count.
            activeStarters.forEach(prospect => {
                const xp = matchResult.xpGained[prospect.playerId] || 0
                prospect.energy = (prospect.energy ?? 100) - ENERGY_CONFIG.matchCost
                prospect.totalXpGained += xp
                prospect.academyMatchesPlayed += 1
                prospect.developmentProgress = Math.min(
                    100,
                    prospect.developmentProgress + AcademyEngine.calculateProgressGain(xp),
                )
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
            const team = state._teamIndex?.get(state.playerTeamId!)
                ?? state.teams.find(t => t.id === state.playerTeamId)
            if (!team || !team.academyFacility || team.academyFacility.level === 0) return

            const academyLevel = team.academyFacility.level

            // Coach talent "Youth Mentor" (academy_speed) stacks with the
            // facility-level dev bonus. Sum across every coach on the team,
            // capped at +50% so a team can't accumulate runaway acceleration.
            const coaches = state.staff.filter(s => s.teamId === state.playerTeamId && s.role === "coach")
            const academySpeedBonus = Math.min(
                50,
                coaches.reduce((sum, c) => {
                    const b = getStaffPassiveBonuses("coach", c.unlockedTalentIds || [])
                    return sum + (b["academy_speed"] || 0)
                }, 0),
            )
            const coachMultiplier = 1 + academySpeedBonus / 100
            const academyRng = new SeededRNG((state.lastRngSeed || generateSeed()) ^ SCOUT_RNG_SALT)

            const report: AcademyWeeklyReport = {
                week: state.currentWeek,
                overallXp: 0,
                prospectReports: [],
            }

            const starterIds = Object.values(state.academyRoster).filter(Boolean) as string[]
            const scheduledDrills = Object.values(state.academyTrainingSchedule)
                .map(id => ACADEMY_DRILLS.find(d => d.id === id))
                .filter(Boolean) as AcademyTrainingDrill[]

            // Per-prospect: apply drills, recover energy, evaluate promotion.
            state.academyPlayers.forEach(prospect => {
                const player = state._playerIndex?.get(prospect.playerId)
                    ?? state.players.find(p => p.id === prospect.playerId)
                if (!player) return

                const isStarter = starterIds.includes(prospect.id)
                let xpGained = 0
                let energyChange = 0
                const statsImproved: Partial<Record<TrainableStat, number>> = {}

                scheduledDrills.forEach(drill => {
                    energyChange -= drill.energyCost

                    // Starters get 100% XP; bench gets 25%.
                    let drillXp = drill.xpGain * (isStarter ? 1.0 : BENCH_XP_MULTIPLIER)

                    // Fatigue penalty: drills do less while exhausted.
                    if ((prospect.energy ?? 100) < ENERGY_CONFIG.fatigueThreshold) {
                        drillXp *= ENERGY_CONFIG.fatiguePenalty
                    }

                    // Coach Youth Mentor talent: boosts academy XP.
                    drillXp *= coachMultiplier
                    xpGained += drillXp

                    // Stat gains scale with the player's room-to-grow against
                    // potential cap. Small per-drill increments multiplied by
                    // an RNG factor in [0.8, 1.2] for variety.
                    drill.statFocus.forEach(stat => {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const currentValue = (player as any)[stat] as number
                        if (typeof currentValue !== "number") return
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const potentialCap = (player as any).potential
                        const roomToGrow = Math.max(0, potentialCap - currentValue)
                        const growthFactor = roomToGrow / 100
                        const improvement = (drillXp / 100) * DEVELOPMENT_CONFIG.statGainPer100XP * growthFactor
                            * (STAT_GROWTH_VARIANCE_LO + academyRng.next() * STAT_GROWTH_VARIANCE_HI)
                        statsImproved[stat] = (statsImproved[stat] || 0) + improvement
                    })
                })

                // Weekly energy recovery — starters recover slower (they
                // play more matches).
                energyChange += isStarter ? ENERGY_CONFIG.starterRecovery : ENERGY_CONFIG.benchRecovery

                prospect.energy = Math.min(100, Math.max(0, (prospect.energy ?? 100) + energyChange))
                prospect.totalXpGained += xpGained
                prospect.developmentProgress = Math.min(
                    100,
                    prospect.developmentProgress + AcademyEngine.calculateProgressGain(xpGained),
                )
                report.overallXp += xpGained

                // Apply the accumulated stat improvements via the engine.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const updates = AcademyEngine.applyStatImprovements(player as any, statsImproved)
                Object.assign(player, updates)

                // Promotion readiness check.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const evaluation = AcademyEngine.evaluatePromotion(prospect, player as any)
                prospect.readyForPromotion = evaluation.ready

                // Scout notes refresh every 4 weeks.
                if (state.currentWeek % SCOUT_NOTES_REFRESH_INTERVAL === 0) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    prospect.scoutNotes = AcademyEngine.generateScoutNotes(player as any, prospect.potentialRevealed)
                }

                // Potential reveal — earlier at higher academy levels.
                if (!prospect.potentialRevealed) {
                    const weeksEnrolled = state.currentWeek - prospect.enrolledWeek
                    const revealWeeks = POTENTIAL_REVEAL_WEEKS[academyLevel] ?? 12
                    if (weeksEnrolled >= revealWeeks) {
                        prospect.potentialRevealed = true
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        prospect.scoutNotes = AcademyEngine.generateScoutNotes(player as any, true)
                    }
                }

                report.prospectReports.push({
                    playerId: prospect.playerId,
                    nickname: player.nickname,
                    xpGained: Math.round(xpGained),
                    statImprovements: statsImproved,
                    energyChange,
                    isStarter,
                })
            })

            // Push report + cap history.
            state.academyWeeklyReports.unshift(report)
            if (state.academyWeeklyReports.length > ACADEMY_REPORT_HISTORY_CAP) {
                state.academyWeeklyReports = state.academyWeeklyReports.slice(0, ACADEMY_REPORT_HISTORY_CAP)
            }

            // Process scouting mission completion. New prospects land in
            // pending pool if there's room; otherwise the mission is wasted
            // (the user gets a "scouting overload" notification).
            state.academyScoutingMissions.forEach((mission) => {
                mission.weeksRemaining--
                if (mission.weeksRemaining > 0) return

                // Scout "Hidden Gem Finder" talent (gem_chance) gives a
                // weighted chance to upgrade the mission's prospect by
                // generating a second candidate and keeping the
                // higher-potential one. Scales linearly with talent value.
                const scout = state.staff.find(s => s.id === mission.scoutId)
                const scoutBonuses = scout
                    ? getStaffPassiveBonuses("scout", scout.unlockedTalentIds || [])
                    : {}
                const gemChance = (scoutBonuses["gem_chance"] || 0) / 100

                let newProspect = generateProspect(mission.tier, undefined, academyRng)
                if (gemChance > 0 && academyRng.next() < gemChance) {
                    const alternate = generateProspect(mission.tier, undefined, academyRng)
                    if ((alternate.stats?.potential ?? 0) > (newProspect.stats?.potential ?? 0)) {
                        newProspect = alternate
                    }
                }

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
            })
            // Drop completed missions.
            state.academyScoutingMissions = state.academyScoutingMissions.filter(m => m.weeksRemaining > 0)

            // Deduct weekly upkeep (scales with prospect count + facility level).
            const upkeep = AcademyEngine.getWeeklyUpkeep(academyLevel, state.academyPlayers.length)
            team.budget -= upkeep
        })
    },

    updateAcademyRoster: (role, prospectId) => {
        set((state) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(state.academyRoster as any)[role] = prospectId
        })
    },

    updateAcademySchedule: (day, drillId) => {
        set((state) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(state.academyTrainingSchedule as any)[day] = drillId
        })
    },

    discardPendingProspect: (playerId) => {
        set((state) => {
            state.academyPendingProspects = state.academyPendingProspects.filter(id => id !== playerId)
            // Drop from global players pool too — scouted prospects were
            // only created for this academy session.
            const playerIndex = state.players.findIndex(p => p.id === playerId)
            if (playerIndex !== -1) {
                state.players.splice(playerIndex, 1)
            }
        })
    },

    enrollPendingProspect: (playerId) => {
        // Delegate to enrollProspect (sibling action in the same slice).
        const result = get().enrollProspect(playerId)
        if (result.success) {
            set((state) => {
                state.academyPendingProspects = (state.academyPendingProspects || []).filter(id => id !== playerId)
            })
        }
        return result
    },
})
