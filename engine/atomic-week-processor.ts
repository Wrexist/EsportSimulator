/**
 * Atomic Week Processor
 * Phase 5: Transactional week tick with rollback/resume
 * 
 * GUARANTEES:
 * - If interrupted, rollback or resume safely
 * - No step may run twice
 * - State is always consistent
 */

import { SeededRNG } from "./rng"
import { debug } from "@/lib/debug-logger"
import { SaveManager, saveManager } from "./save-manager"
import {
    GameSave,
    TeamSaveData,
    WeekTickState,
    FinanceLedgerEntry,
    GameEventSaveData,
    CompletedMatchSaveData,
    TournamentSaveData,
    getResumeStep,
    CURRENT_SAVE_VERSION,
    repairSave,
} from "./save-types"
import { SponsorGenerator } from "./economy-manager"
import { MatchEngine } from "./match-engine"
import { WeaponMasteryManager } from "@/engine/weapon-mastery-system"
import { WEAPONS } from "@/engine/economy-manager"
import { AIManager } from "./ai-manager"
import { processWeeklyChemistryGrowth } from "./chemistry-engine"
import {
    Player,
    Team,
    TrainingFocus,
    EventType,
} from "@/types"
import { PlayerLifecycleManager } from "./player-lifecycle"
import { EconomyEngine } from "./economy-engine"
import { LegendEventsManager } from "./legend-events-manager"
import { EventsManager } from "./events-manager"
import { updateRivalries } from "./history-tracker"
import { MatchAnalyzer } from "./match-analyzer"
import { TrainingManager } from "./training-manager"
import { TrainingProcessor } from "./processors/training-processor"
import { FinanceProcessor } from "./processors/finance-processor"
import { EventProcessor } from "./processors/event-processor"
import { LeagueEngine } from "./league-engine"
import { FULL_TOURNAMENT_CALENDAR, TournamentDefinition, CIRCUIT_POINTS } from "@/data/tournament-calendar"
import { TournamentManager } from "./tournament-manager"
import { JobOfferGenerator } from "./job-offer-generator"
import { QualificationEngine } from "./tournament-qualification"
import { LEGENDARY_PLAYERS } from "./legendary-players-data"
import { generateAnnualTop20, shouldTriggerAwards, addHLTVAwardsEvent } from "./hltv-awards-engine"
import { buildQualificationGraph, dedupeQualifications, isQualificationForTournament } from "./circuit-engine"
import { ManagerProgression } from "./manager-progression"
import { StaffGenerator } from "./staff-generator"
import { isSeasonEnd, getSeasonNumber, updateCareerStats, migrateCareerStats } from "./career-stats"
import { buildSaveIndexes, type SaveIndexes } from "@/store/indexes"
import { ARRAY_CAPS } from "@/engine/constants"

// ===== TYPES =====

export interface WeekProcessorConfig {
    trainingFocus: Map<string, { focus: TrainingFocus; intensity: number }>
    playerTeamId: string
}

export interface WeekProcessorResult {
    success: boolean
    error?: string
    matchesPlayed: number
    eventsGenerated: number
    injuriesOccurred: number
    financeSummary: {
        income: number
        expenses: number
        net: number
    }
}

// ===== DEBUG =====
const AWP_DEBUG = process.env.NODE_ENV === "development"
const debugLog = (...args: any[]) => { if (AWP_DEBUG) console.log(...args) }

// ===== CONSTANTS =====

const FATIGUE_RECOVERY_PER_WEEK = 10
const INJURY_BASE_CHANCE = 0.01 // 1% base injury chance per week
const FATIGUE_INJURY_MULTIPLIER = 0.005 // +0.5% per fatigue point over 50 (e.g. fatigue 80 = +15%)

// ===== ATOMIC WEEK PROCESSOR =====

export class AtomicWeekProcessor {
    private saveManager: SaveManager
    private matchEngine: MatchEngine

    constructor(manager: SaveManager = saveManager) {
        this.saveManager = manager
        this.matchEngine = new MatchEngine()
    }

    /**
     * Process a week atomically
     * Can resume from interruption
     */
    async processWeek(
        save: GameSave,
        config: WeekProcessorConfig,
        rng: SeededRNG
    ): Promise<WeekProcessorResult> {
        // Check for incomplete transaction
        let transaction = await this.saveManager.getIncompleteTransaction(save.saveId)
        let resumeStep = 1

        if (
            transaction &&
            (
                transaction.weekNumber === save.currentWeek ||
                transaction.weekNumber === save.currentWeek + 1
            )
        ) {
            // Resuming from interrupted transaction
            resumeStep = getResumeStep(transaction)
            debugLog(`Resuming week ${save.currentWeek} from step ${resumeStep}`)
        } else {
            // Start new transaction
            transaction = await this.saveManager.beginWeekTick(save)
        }

        // Create backup before processing
        await this.saveManager.saveGame(save)

        // Build O(1) lookup indexes for this tick (rebuilt once, used throughout)
        const idx = buildSaveIndexes(save)

        // Build O(1) dedup sets for event/ledger ID checks
        const eventIdSet = new Set(save.eventsLog.map(e => e.id))
        const ledgerIdSet = new Set(save.financeLedger.map(e => e.id))

        try {
            const result: WeekProcessorResult = {
                success: false,
                matchesPlayed: 0,
                eventsGenerated: 0,
                injuriesOccurred: 0,
                financeSummary: { income: 0, expenses: 0, net: 0 },
            }

            // Increment week once per transaction (do not double-increment on resume).
            if (save.currentWeek < transaction.weekNumber) {
                save.currentWeek++
            }

            // ===== STEP 1: Training Effects =====
            if (resumeStep <= 1) {
                debugLog(`[Week ${save.currentWeek}] Step 1: Training...`)
                TrainingProcessor.processTraining(save, config.trainingFocus)
                TrainingManager.processWeeklyTraining(save) // Process Role Training
                await this.saveManager.markStepComplete(transaction, "trainingComplete")
                await this.saveManager.saveGame(save)
            }

            // ===== STEP 2: Fatigue Recovery =====
            if (resumeStep <= 2) {
                debugLog(`[Week ${save.currentWeek}] Step 2: Fatigue recovery...`)
                TrainingProcessor.processFatigueRecovery(save, rng)
                await this.saveManager.markStepComplete(transaction, "fatigueRecoveryComplete")
                await this.saveManager.saveGame(save)
            }

            // ===== STEP 3: Injury Checks =====
            if (resumeStep <= 3) {
                debugLog(`[Week ${save.currentWeek}] Step 3: Injury checks...`)
                result.injuriesOccurred = EventProcessor.processInjuryChecks(save, rng)
                await this.saveManager.markStepComplete(transaction, "injuryChecksComplete")
                await this.saveManager.saveGame(save)
            }

            // ===== STEP 4: Finance Processing =====
            if (resumeStep <= 4) {
                debugLog(`[Week ${save.currentWeek}] Step 4: Finance...`)
                FinanceProcessor.processContractExpiry(save, config.playerTeamId) // Process expiring contracts
                result.financeSummary = FinanceProcessor.processFinance(save, config.playerTeamId)
                await this.saveManager.markStepComplete(transaction, "financeComplete")
                await this.saveManager.saveGame(save)
            }

            // ===== STEP 4.5: Tournament Processing (MOVED BEFORE MATCHES) =====
            // This must run before matches so tournament matches are scheduled first
            if (resumeStep <= 5) {
                debugLog(`[Week ${save.currentWeek}] Step 4.5: Tournament Processing...`)
                this.processTournaments(save, config.playerTeamId, rng, idx, eventIdSet, ledgerIdSet)
                await this.saveManager.markStepComplete(transaction, "tournamentProcessingComplete")
                await this.saveManager.saveGame(save)
            }

            // ===== STEP 5: Match Simulation =====
            if (resumeStep <= 6) {
                debugLog(`[Week ${save.currentWeek}] Step 5: Match simulation...`)

                // Phase 47: Send upcoming match notification for player's tournament matches
                const playerUpcomingMatches = save.scheduledMatches.filter(
                    m => m.week === save.currentWeek &&
                        (m.homeTeamId === config.playerTeamId || m.awayTeamId === config.playerTeamId) &&
                        m.tournamentId
                )

                for (const match of playerUpcomingMatches) {
                    const opponentId = match.homeTeamId === config.playerTeamId ? match.awayTeamId : match.homeTeamId
                    const opponent = idx.teamIndex.get(opponentId)
                    const tournament = match.tournamentId ? idx.tournamentIndex.get(match.tournamentId) : undefined

                    if (opponent && tournament) {
                        save.eventsLog.push({
                            id: `upcoming_match_${match.id}_${save.currentWeek}`,
                            type: "TOURNAMENT",
                            week: save.currentWeek,
                            acknowledged: false,
                            data: {
                                title: "🎮 Match Day!",
                                message: `Your team faces ${opponent.name} (#${opponent.worldRanking || '?'}) today in ${tournament.name}. ${match.stage || 'Tournament Match'}. Good luck!`,
                                severity: "info",
                                tournamentId: tournament.id,
                                matchId: match.id,
                                logoPath: tournament.logoPath
                            }
                        })
                    }
                }

                result.matchesPlayed = await this.processMatches(save, transaction, rng, config.playerTeamId, idx, eventIdSet, ledgerIdSet)
                await this.saveManager.markStepComplete(transaction, "matchSimulationComplete")
                await this.saveManager.saveGame(save)
            }

            // ===== STEP 6: Standings Update =====
            if (resumeStep <= 7) {
                debugLog(`[Week ${save.currentWeek}] Step 6: Standings...`)
                this.updateStandings(save, idx, eventIdSet, ledgerIdSet)

                // Sync all team league tiers based on current Elo
                // This ensures teams always have correct S/A/B tier assignment
                save.teams.forEach(team => {
                    const correctTier = LeagueEngine.getTierFromElo(team.elo)
                    if (team.leagueTier !== correctTier) {
                        team.leagueTier = correctTier
                    }
                })

                // Phase 19: Check for season end and process promotions/relegations
                if (LeagueEngine.isSeasonEnd(save.currentWeek)) {
                    debugLog(`[Week ${save.currentWeek}] Season End! Processing promotions/relegations...`)
                    LeagueEngine.processSeasonEnd(save, config.playerTeamId)
                }

                // Phase 63: HLTV Top 20 Awards - Trigger at start of each new year (Week 53, 105, etc.)
                if (shouldTriggerAwards(save.currentWeek)) {
                    debugLog(`[Week ${save.currentWeek}] Generating HLTV Top 20 Awards for Year ${Math.ceil(save.currentWeek / 52)}...`)
                    const awards = generateAnnualTop20(save, config.playerTeamId)
                    addHLTVAwardsEvent(save, awards)
                }

                await this.saveManager.markStepComplete(transaction, "standingsUpdateComplete")
                await this.saveManager.saveGame(save)
            }

            // ===== STEP 7: Event Generation =====
            if (resumeStep <= 8) {
                debugLog(`[Week ${save.currentWeek}] Step 7: Events...`)
                result.eventsGenerated = await EventProcessor.generateEvents(save, transaction, rng, config.playerTeamId, this.saveManager)

                // Phase 23: Legend Events (Mentorship, Coach Opportunities)
                LegendEventsManager.processWeeklyLegendEvents(save, config.playerTeamId, rng)

                // Modern events: media interviews, fan milestones, transfer rumors, birthdays, rivalries, equipment deals
                EventsManager.generateModernEvents(save, rng)

                // Phase 9: Check scouting mission completion
                this.processScoutingMissions(save, idx)

                // Phase 60: Job Market - Generate job offers based on performance
                JobOfferGenerator.processWeeklyJobOffers(save, rng)

                await this.saveManager.markStepComplete(transaction, "eventGenerationComplete")
                await this.saveManager.saveGame(save)
            }

            // ===== STEP 7.5: AI World Logic (Phase 19/24) =====
            if (resumeStep <= 9) {
                debugLog(`[Week ${save.currentWeek}] Step 7.5: World Logic (AI / Fans)...`)
                this.processAIWorldLogic(save, config.playerTeamId, rng)
                this.processFanbaseGrowth(save, rng)
                this.processWeeklySponsorGoals(save, eventIdSet, ledgerIdSet)
                this.refreshSponsorOffers(save, config.playerTeamId, rng)

                // ===== STEP 7.7: Player Retirements (Phase 23) =====
                debugLog(`[Week ${save.currentWeek}] Step 7.7: Retirements...`)
                const retirementResult = EventProcessor.processRetirements(save, rng)
                if (retirementResult.legends.length > 0) {
                    // Move legendary players to Hall of Fame
                    retirementResult.legends.forEach(playerId => {
                        const player = idx.playerIndex.get(playerId) ?? save.players.find(p => p.id === playerId)
                        if (player && player.isLegendary) {
                            save.legendaryPlayers.push({ ...player })
                        }
                    })
                }

                // Mid-season surprise retirements (every 4 weeks, old declining AI players)
                const midSeasonResult = EventProcessor.processMidSeasonRetirements(save, config.playerTeamId, rng)
                midSeasonResult.legends.forEach(playerId => {
                    const player = idx.playerIndex.get(playerId) ?? save.players.find(p => p.id === playerId)
                    if (player?.isLegendary) save.legendaryPlayers.push({ ...player })
                })

                await this.saveManager.markStepComplete(transaction, "worldLogicComplete")
                await this.saveManager.saveGame(save)
            }

            // ===== STEP 8: Rest Day Processing =====
            if (resumeStep <= 10) {
                debugLog(`[Week ${save.currentWeek}] Step 8: Rest days...`)
                TrainingProcessor.processRestDays(save, config.playerTeamId)
                await this.saveManager.markStepComplete(transaction, "restDayProcessingComplete")
                await this.saveManager.saveGame(save)
            }

            // ===== STEP 9: Finalize =====
            debugLog(`[Week ${save.currentWeek}] Step 9: Finalizing...`)

            // Reset daily/weekly counters
            save.teams.forEach(t => {
                t.trainingSlotsUsed = 0
                processWeeklyChemistryGrowth(t, save.currentWeek)
            })

            // Manager Level Up Check (uses ManagerProgression XP table)
            if (save.managerDetails) {
                const currentLevel = save.managerDetails.level || 1
                const xp = save.managerDetails.xp || 0
                let newLevel = currentLevel
                let remainingXp = xp
                while (newLevel < 20 && remainingXp >= ManagerProgression.getXPForLevel(newLevel + 1)) {
                    remainingXp -= ManagerProgression.getXPForLevel(newLevel + 1)
                    newLevel++
                }
                save.managerDetails.xp = remainingXp

                if (newLevel > currentLevel) {
                    save.managerDetails.level = newLevel

                    save.eventsLog.push({
                        id: `mgr_lvl_${save.currentWeek}_${Math.floor(rng.next() * 1_000_000_000).toString(36)}`,
                        type: "CAREER_UPDATE",
                        week: save.currentWeek,
                        acknowledged: false,
                        data: {
                            title: "Manager Promotion!",
                            message: `You have reached Manager Level ${newLevel}. New opportunities may be available in future careers.`,
                            severity: "success"
                        }
                    })
                }
            }

            // ===== STEP 8C: Narrative & News =====
            debugLog(`[Week ${save.currentWeek}] Step 8C: Processing Narrative Features...`)
            this.generateNarrativeNews(save, rng, idx)

            // === Cross-Season Career Statistics ===
            // Compute at season boundaries (every 52 weeks)
            if (isSeasonEnd(save.currentWeek)) {
                save.careerStats = updateCareerStats(save)
                debug.log(`[Week ${save.currentWeek}] Season ${getSeasonNumber(save.currentWeek)} career stats updated`)
            } else if (!save.careerStats) {
                // First-time migration for existing saves
                save.careerStats = migrateCareerStats(save)
            }

            // Guard long-running saves against unbounded log growth.
            this.compactPersistentState(save)

            // Week was already incremented at start of processWeek
            save.lastRngSeed = rng.getState()

            // Final save
            const saveResult = await this.saveManager.saveGame(save)
            if (!saveResult.success) {
                throw new Error(saveResult.error || "Failed to save")
            }

            // Clear transaction
            await this.saveManager.completeWeekTick(save.saveId)

            result.success = true
            return result

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error"
            debug.error(`Week processing failed: ${errorMessage}`)

            // Mark transaction as failed
            await this.saveManager.markTransactionFailed(
                transaction,
                `step_${resumeStep}`,
                errorMessage
            )

            // Preserve incomplete transaction for exact-once resume on next tick.
            // Explicit rollback remains available through rollback() when requested.

            return {
                success: false,
                error: errorMessage,
                matchesPlayed: 0,
                eventsGenerated: 0,
                injuriesOccurred: 0,
                financeSummary: { income: 0, expenses: 0, net: 0 },
            }
        }
    }

    /**
     * Rollback to pre-week state
     */
    async rollback(saveId: string): Promise<{ success: boolean }> {
        return this.saveManager.rollbackTransaction(saveId)
    }

    // Remaining private members (Matches, Standings, etc.)

    private async processMatches(
        save: GameSave,
        transaction: WeekTickState,
        rng: SeededRNG,
        playerTeamId: string,
        idx?: SaveIndexes,
        eventIdSet?: Set<string>,
        ledgerIdSet?: Set<string>
    ): Promise<number> {
        const weekMatches = save.scheduledMatches.filter(m => {
            const isPastWeek = m.week < save.currentWeek
            const isCurrentWeek = m.week === save.currentWeek
            const isPlayerMatch = m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId
            const isAlreadyCompleted = transaction.completedMatchIds.includes(m.id)

            // Auto-simulate if:
            // 1. It's a past week match (player missed it)
            // 2. OR it's current week AND NOT a player match
            // AND the match ID isn't already processed in this transaction
            const shouldAutoSimulate = (isPastWeek || (isCurrentWeek && !isPlayerMatch)) && !isAlreadyCompleted

            return shouldAutoSimulate
        })

        debugLog(`[Matches] Week ${save.currentWeek}: Found ${weekMatches.length} matches to simulate (Total scheduled: ${save.scheduledMatches.length})`)
        if (weekMatches.length > 0) {
            debugLog(`[Matches] First match: ${weekMatches[0].id} (Week ${weekMatches[0].week})`)
        }

        let matchesPlayed = 0

        for (const match of weekMatches) {
            const homeTeam = idx?.teamIndex.get(match.homeTeamId) ?? save.teams.find(t => t.id === match.homeTeamId)
            const awayTeam = idx?.teamIndex.get(match.awayTeamId) ?? save.teams.find(t => t.id === match.awayTeamId)
            if (!homeTeam || !awayTeam) continue

            // Select active 5, skipping injured players and pulling from bench
            const selectActivePlayers = (rosterIds: string[]) => {
                const available = rosterIds
                    .map(id => idx?.playerIndex.get(id) ?? save.players.find(p => p.id === id))
                    .filter(p => p && !p.injury) as typeof save.players
                return available.slice(0, 5)
            }

            const homePlayers = selectActivePlayers(homeTeam.rosterIds)
            const awayPlayers = selectActivePlayers(awayTeam.rosterIds)

            if (homePlayers.length < 5 || awayPlayers.length < 5) {
                // Forfeit: team with fewer than 5 healthy players loses the match
                const forfeitingTeam = homePlayers.length < 5 ? homeTeam : awayTeam
                const winningTeam = homePlayers.length < 5 ? awayTeam : homeTeam
                const homeForfeits = homePlayers.length < 5

                // Create a forfeit result
                const forfeitResult: CompletedMatchSaveData = {
                    ...match,
                    result: {
                        homeScore: homeForfeits ? 0 : 1,
                        awayScore: homeForfeits ? 1 : 0,
                        maps: [],
                        playerStats: {},
                        winnerId: winningTeam.id,
                        mvpPlayerId: ""
                    },
                    analysis: {
                        summary: `${forfeitingTeam.name} forfeited due to insufficient healthy players (${homeForfeits ? homePlayers.length : awayPlayers.length}/5 available).`,
                        keyFactor: "FIREPOWER",
                        winningFactor: "Win by forfeit",
                        losingFactor: "Insufficient healthy players",
                        teamPerformance: { economyRating: 0, aimRating: 0, utilityRating: 0, tradingRating: 0 }
                    },
                }

                save.completedMatches.push(forfeitResult)
                save.scheduledMatches = save.scheduledMatches.filter(m => m.id !== match.id)

                // Update form (already resolved, use directly)
                const wTeam = winningTeam
                const fTeam = forfeitingTeam
                if (wTeam) {
                    if (!wTeam.recentForm) wTeam.recentForm = []
                    wTeam.recentForm.push("W")
                    if (wTeam.recentForm.length > 5) wTeam.recentForm.shift()
                }
                if (fTeam) {
                    if (!fTeam.recentForm) fTeam.recentForm = []
                    fTeam.recentForm.push("L")
                    if (fTeam.recentForm.length > 5) fTeam.recentForm.shift()
                }

                // Generate forfeit event for player team
                if (forfeitingTeam.id === playerTeamId || winningTeam.id === playerTeamId) {
                    save.eventsLog.unshift({
                        id: `forfeit_${save.currentWeek}_${match.id}`,
                        type: "MATCH_RESULT",
                        week: save.currentWeek,
                        data: {
                            description: forfeitingTeam.id === playerTeamId
                                ? `Your team forfeited against ${winningTeam.name} due to too many injured players.`
                                : `${forfeitingTeam.name} forfeited your match — win by default!`,
                            importance: "HIGH"
                        },
                        acknowledged: false
                    })
                }

                matchesPlayed++
                continue
            }

            // Phase 57: Analyst Bonus (Tactical) & Strategy Triangle
            const getTacticalBonus = (teamId: string, opponentStyle: string, myStyle: string) => {
                let bonus = 0

                // 1. Analyst Stats
                const analysts = save.staff.filter(s => s.teamId === teamId && s.role === "analyst")
                const statSum = analysts.reduce((sum, s) => sum + (s.stats?.analysis || 50), 0)
                bonus += (statSum / 100) * 5

                // 2. Strategy Triangle (Rock-Paper-Scissors)
                // AGGRESSIVE > STRUCTURED
                // STRUCTURED > BALANCED
                // BALANCED > AGGRESSIVE

                // Normalize "DEFAULT" to "BALANCED"
                const normalize = (s: string) => (!s || s === "default") ? "balanced" : s
                const my = normalize(myStyle)
                const opp = normalize(opponentStyle)

                if (my === "aggressive" && opp === "structured") bonus += 5
                if (my === "structured" && opp === "balanced") bonus += 5
                if (my === "balanced" && opp === "aggressive") bonus += 5

                return bonus
            }

            const homeBonus = getTacticalBonus(homeTeam.id, awayTeam.playstyle ?? "", homeTeam.playstyle ?? "")
            const awayBonus = getTacticalBonus(awayTeam.id, homeTeam.playstyle ?? "", awayTeam.playstyle ?? "")

            // Collect team staff for talent bonus application in match sim
            const homeTeamStaff = save.staff.filter(s => s.teamId === homeTeam.id)
            const awayTeamStaff = save.staff.filter(s => s.teamId === awayTeam.id)

            // Simulate using full engine
            const result = this.matchEngine.simulateMatch(
                match,
                homeTeam,
                awayTeam,
                homePlayers,
                awayPlayers,
                rng,
                homeBonus,
                awayBonus,
                homeTeamStaff,
                awayTeamStaff
            )

            // Phase 48: Weapon Mastery XP
            // Accumulate kills by weapon type
            const playerWeaponStats: Record<string, { rifle: number, awp: number, pistol: number, smg: number }> = {}

            const trackWeaponKill = (playerId: string, weaponId: string, kills: number) => {
                if (!playerWeaponStats[playerId]) playerWeaponStats[playerId] = { rifle: 0, awp: 0, pistol: 0, smg: 0 }
                const w = WEAPONS[weaponId.toUpperCase()]
                if (!w) return

                // Add based on weapon type
                if (w.type === "RIFLE") playerWeaponStats[playerId].rifle += kills
                else if (w.type === "SNIPER") playerWeaponStats[playerId].awp += kills
                else if (w.type === "PISTOL") playerWeaponStats[playerId].pistol += kills
                else if (w.type === "SMG") playerWeaponStats[playerId].smg += kills
            }

            // Iterate through every round of every map
            result.maps.forEach(map => {
                map.rounds.forEach(round => {
                    round.kills.forEach(k => {
                        if (k.weapon) {
                            trackWeaponKill(k.playerId, k.weapon, k.kills)
                        }
                    })
                })
            })

            // Manager XP & Stats
            if (save.managerDetails) {
                let winnerId: string | null = null
                if (result.homeScore > result.awayScore) winnerId = match.homeTeamId
                else if (result.awayScore > result.homeScore) winnerId = match.awayTeamId

                if (winnerId === playerTeamId) {
                    save.managerDetails.careerWins++
                    save.managerDetails.xp += 100
                    save.managerDetails.reputation += 5
                } else if (match.homeTeamId === playerTeamId || match.awayTeamId === playerTeamId) {
                    save.managerDetails.careerLosses++
                    save.managerDetails.xp += 25 // Participation XP
                    save.managerDetails.reputation = Math.max(0, save.managerDetails.reputation - 1)
                }
            }

            // Award XP
            Object.entries(playerWeaponStats).forEach(([playerId, stats]) => {
                const p = idx?.playerIndex.get(playerId) ?? save.players.find(pl => pl.id === playerId)
                if (p) {
                    WeaponMasteryManager.processMatchWeaponXP(
                        p,
                        stats.rifle,
                        stats.awp,
                        stats.pistol,
                        stats.smg
                    )
                }
            })

            // Phase 12: Analyze match
            const analysis = MatchAnalyzer.analyze(
                match,
                result,
                homeTeam?.name || "Home Team",
                awayTeam?.name || "Away Team",
                homePlayers,
                awayPlayers
            )

            // Record result
            const completedMatch: CompletedMatchSaveData = {
                ...match,
                result: result,
                analysis,
            }

            save.completedMatches.push(completedMatch)
            save.scheduledMatches = save.scheduledMatches.filter(m => m.id !== match.id)

            // Detect comeback win (team was down by 9+ rounds on a map but won it)
            let hasComebackWin = false
            for (const mapResult of result.maps) {
                const rounds = mapResult.rounds || []
                let homeMapScore = 0, awayMapScore = 0
                for (const round of rounds) {
                    if (round.winningTeamId === homeTeam.id) homeMapScore++
                    else awayMapScore++
                    // Check if a team was down 3-12 or worse and ended up winning the map
                    const homeDown = awayMapScore - homeMapScore >= 9
                    const awayDown = homeMapScore - awayMapScore >= 9
                    if (homeDown && mapResult.finalScore.team1 > mapResult.finalScore.team2) { hasComebackWin = true; break }
                    if (awayDown && mapResult.finalScore.team2 > mapResult.finalScore.team1) { hasComebackWin = true; break }
                }
                if (hasComebackWin) break
            }

            // Detect underdog win (beat a team ranked 20+ positions higher)
            const homeRank = homeTeam.worldRanking || 99
            const awayRank = awayTeam.worldRanking || 99
            const homeIsUnderdog = homeRank - awayRank >= 20
            const awayIsUnderdog = awayRank - homeRank >= 20
            const hasUnderdogWin = (result.homeScore > result.awayScore && homeIsUnderdog) ||
                (result.awayScore > result.homeScore && awayIsUnderdog)

            // Store flags on the completed match for achievement tracking
            if (hasComebackWin) completedMatch._comebackWin = true
            if (hasUnderdogWin) completedMatch._underdogWin = true

            // Update player stats
            const homeWon = result.homeScore > result.awayScore

            // Resolve tournament tier for fatigue/morale scaling and XP
            let matchTournamentTier: string | undefined
            if (match.tournamentId && match.tournamentId !== "SCRIM") {
                const matchTournament = idx?.tournamentIndex.get(match.tournamentId) ?? save.tournaments.find(t => t.id === match.tournamentId)
                if (matchTournament) matchTournamentTier = matchTournament.tier
            }

            // Tournament XP bonus for participating players
            if (matchTournamentTier) {
                const tierXpBonus: Record<string, number> = {
                    "S_TIER": 200, "A_TIER": 150, "B_TIER": 100, "C_TIER": 50
                }
                const baseXp = tierXpBonus[matchTournamentTier] ?? 50
                const winBonus = 100
                const applyTournamentXP = (players: typeof save.players, won: boolean) => {
                    players.forEach(p => {
                        const xpGain = baseXp + (won ? winBonus : 0)
                        p.xp = (p.xp ?? 0) + xpGain

                        // Level-up check
                        const threshold = p.xpToNextLevel || 1000
                        if (p.xp >= threshold) {
                            p.xp -= threshold
                            p.level = (p.level || 1) + 1
                            p.talentPoints = (p.talentPoints || 0) + 1
                            p.xpToNextLevel = Math.floor(threshold * 1.5)
                            save.eventsLog.unshift({
                                id: `evt_lvl_${save.currentWeek}_${p.id}_t`,
                                type: "PLAYER_LEVEL_UP",
                                week: save.currentWeek,
                                data: { playerName: p.nickname || p.id, newLevel: p.level },
                                acknowledged: false
                            })
                        }
                    })
                }
                applyTournamentXP(homePlayers, homeWon)
                applyTournamentXP(awayPlayers, !homeWon)
            }

            // Fatigue scaled by match format (BO1=10, BO3=15, BO5=25)
            const matchFormat = (match.format || "BO1").toUpperCase()
            const fatigueCost = matchFormat === "BO5" ? 25 : matchFormat === "BO3" ? 15 : 10

            // Morale scaled by tournament tier
            const getMoraleChange = (won: boolean): number => {
                if (!matchTournamentTier) return won ? 5 : -5
                switch (matchTournamentTier) {
                    case "S_TIER": return won ? 15 : -3
                    case "A_TIER": return won ? 10 : -4
                    case "B_TIER": return won ? 7 : -5
                    default: return won ? 5 : -5
                }
            }

            const updateStats = (players: typeof save.players, won: boolean) => {
                players.forEach(p => {
                    const pStat = result.playerStats[p.id]
                    p.matchesPlayed++
                    if (pStat) {
                        p.headshots = (p.headshots || 0) + (pStat.headshots || 0)
                        p.totalHeadshots = (p.totalHeadshots || 0) + (pStat.headshots || 0)
                        p.totalKills = (p.totalKills || 0) + pStat.kills
                        p.totalDeaths = (p.totalDeaths || 0) + pStat.deaths
                    }

                    p.fatigue = Math.min(100, p.fatigue + fatigueCost)

                    // Phase 55: Energy drain from matches (-15 per match)
                    p.energy = Math.max(0, (p.energy ?? 100) - 15)

                    p.morale = Math.max(0, Math.min(100, p.morale + getMoraleChange(won)))

                    // Phase 6: Skill Point Progression
                    // 5% chance on win, 1% on loss to simulate learning
                    const spChance = won ? 0.05 : 0.01
                    if (rng.next() < spChance) {
                        p.availableSkillPoints = (p.availableSkillPoints || 0) + 1
                        // Optional: Log an event for this? Might be too spammy.
                    }
                })
            }

            updateStats(homePlayers, homeWon)
            updateStats(awayPlayers, !homeWon)

            this.applyMatchSponsorGoalProgress(save, homeTeam, homeWon, result.homeScore, match.id, eventIdSet, ledgerIdSet)
            this.applyMatchSponsorGoalProgress(save, awayTeam, !homeWon, result.awayScore, match.id, eventIdSet, ledgerIdSet)

            // Phase 11: Update team rivalries
            updateRivalries(save, completedMatch)

            // Phase 19: Update Elo ratings and Recent Form
            const scoreDiff = Math.abs(result.homeScore - result.awayScore)
            const isDraw = scoreDiff === 0

            const winnerId = homeWon ? homeTeam.id : awayTeam.id
            const loserId = homeWon ? awayTeam.id : homeTeam.id

            // Update Recent Form
            const updateForm = (teamId: string, outcome: "W" | "L" | "D") => {
                const team = idx?.teamIndex.get(teamId) ?? save.teams.find(t => t.id === teamId)
                if (team) {
                    if (!team.recentForm) team.recentForm = []
                    team.recentForm.push(outcome)
                    // Keep last 5 matches
                    if (team.recentForm.length > 5) team.recentForm.shift()
                }
            }

            if (isDraw) {
                updateForm(homeTeam.id, "D")
                updateForm(awayTeam.id, "D")
            } else {
                updateForm(winnerId, "W")
                updateForm(loserId, "L")

                // Resolve tournament tier for K-factor bonus
                let tournamentTier: string | undefined
                if (match.tournamentId && match.tournamentId !== "SCRIM") {
                    const tournament = idx?.tournamentIndex.get(match.tournamentId) ?? save.tournaments.find(t => t.id === match.tournamentId)
                    if (tournament) tournamentTier = tournament.tier
                }

                // Calculate matches played for calibration (K=50 for first 10 matches)
                const getMatchesPlayed = (tid: string) =>
                    save.completedMatches.filter(m => m.homeTeamId === tid || m.awayTeamId === tid).length

                const winnerMatches = getMatchesPlayed(winnerId)
                const loserMatches = getMatchesPlayed(loserId)

                // Calculate Net Round Differential (Total rounds won by winner - Total rounds won by loser)
                // result.maps contains round scores. result.homeScore is Map wins.
                // We need to iterate maps to get round details.
                let homeRoundsTotal = 0
                let awayRoundsTotal = 0

                result.maps.forEach(m => {
                    homeRoundsTotal += m.homeScore || 0
                    awayRoundsTotal += m.awayScore || 0
                })

                // If homeWon, diff = home - away. If awayWon, diff = away - home.
                const roundDiff = homeWon
                    ? (homeRoundsTotal - awayRoundsTotal)
                    : (awayRoundsTotal - homeRoundsTotal)

                const eloResult = LeagueEngine.updateEloAfterMatch(
                    save,
                    winnerId,
                    loserId,
                    scoreDiff,
                    tournamentTier,
                    winnerMatches,
                    loserMatches,
                    roundDiff
                )

                // Store ELO change (Phase 19 improvement)
                const savedMatch = (idx?.completedMatchIndex.get(match.id) as CompletedMatchSaveData | undefined) ?? save.completedMatches.find(m => m.id === match.id)
                if (savedMatch && eloResult) {
                    savedMatch.eloChange = {
                        home: homeWon ? eloResult.winnerChange : eloResult.loserChange,
                        away: homeWon ? eloResult.loserChange : eloResult.winnerChange
                    }
                }
            }

            // NEW: Tournament Progression
            if (match.tournamentId && match.tournamentId !== "SCRIM") {
                TournamentManager.processMatchResult(save, match.tournamentId, match.id, winnerId, loserId)
            }

            // Phase 48: Talent Point Rewards
            // MVP of the match gets talent points (scaled by tournament tier)
            if (result.mvpPlayerId) {
                const mvpPlayer = idx?.playerIndex.get(result.mvpPlayerId) ?? save.players.find(p => p.id === result.mvpPlayerId)
                if (mvpPlayer) {
                    const mvpTalentBonus = matchTournamentTier === "S_TIER" ? 3
                        : matchTournamentTier === "A_TIER" ? 2
                            : 1
                    mvpPlayer.talentPoints = (mvpPlayer.talentPoints || 0) + mvpTalentBonus
                    mvpPlayer.totalMVPs = (mvpPlayer.totalMVPs || 0) + 1
                }
            }

            // Players hitting match milestones (every 10 matches) get 1 talent point
            ;[...homePlayers, ...awayPlayers].forEach(p => {
                if (p.matchesPlayed > 0 && p.matchesPlayed % 10 === 0) {
                    p.talentPoints = (p.talentPoints || 0) + 1
                }
            })

            await this.saveManager.recordMatchComplete(transaction, match.id)
            matchesPlayed++
        }

        return matchesPlayed
    }

    private isTerminalBracketStage(stage: string): boolean {
        const normalized = stage.toLowerCase()
        return normalized.includes("grand final")
            || normalized === "final"
            || normalized === "finals"
    }

    private hasTerminalTournamentCompletion(save: GameSave, tournament: TournamentSaveData): boolean {
        const tournamentMatches = save.completedMatches.filter(m => m.tournamentId === tournament.id)
        if (tournamentMatches.length === 0) return false

        if (tournament.playoffBracket && tournament.playoffBracket.length > 0) {
            const terminalMatch = tournament.playoffBracket
                .filter(m => this.isTerminalBracketStage(m.stage))
                .sort((a, b) => (b.week || 0) - (a.week || 0))[0]

            if (!terminalMatch || !terminalMatch.isCompleted || !terminalMatch.winnerId) {
                return false
            }
            return tournamentMatches.some(m => m.id === terminalMatch.id)
        }

        if (tournament.format === "league") {
            const pending = save.scheduledMatches.some(
                m => m.tournamentId === tournament.id && m.week <= save.currentWeek
            )
            if (pending) return false
            return tournamentMatches.length > 0
        }

        const finalByStage = tournamentMatches
            .filter(m => m.stage && this.isTerminalBracketStage(m.stage))
            .sort((a, b) => (b.week || 0) - (a.week || 0))[0]
        return !!finalByStage?.result?.winnerId
    }

    private updateStandings(save: GameSave, idx?: SaveIndexes, eventIdSet?: Set<string>, ledgerIdSet?: Set<string>): void {
        const toBaseTournamentId = (id: string) => id.replace(/_s\d+$/, "")

        const compareStandings = (
            a: TournamentSaveData["standings"][number],
            b: TournamentSaveData["standings"][number],
            tournamentMatches: CompletedMatchSaveData[]
        ): number => {
            // 1) Points (desc)
            if (b.points !== a.points) return b.points - a.points
            // 2) Wins (desc)
            if (b.wins !== a.wins) return b.wins - a.wins
            // 3) Head-to-head wins (desc)
            const h2hMatches = tournamentMatches.filter(
                m =>
                    (m.homeTeamId === a.teamId && m.awayTeamId === b.teamId) ||
                    (m.homeTeamId === b.teamId && m.awayTeamId === a.teamId)
            )
            if (h2hMatches.length > 0) {
                const aH2HWins = h2hMatches.filter(m => m.result.winnerId === a.teamId).length
                const bH2HWins = h2hMatches.filter(m => m.result.winnerId === b.teamId).length
                if (aH2HWins !== bH2HWins) return bH2HWins - aH2HWins
            }
            // 4) Map diff (desc)
            if (b.mapDiff !== a.mapDiff) return b.mapDiff - a.mapDiff
            // 5) Round diff (desc)
            if (b.roundDiff !== a.roundDiff) return b.roundDiff - a.roundDiff
            // 6) Deterministic fallback
            return a.teamId.localeCompare(b.teamId)
        }

        save.tournaments.forEach(tournament => {
            // Recalculate standings from completed matches
            const tournamentMatches = save.completedMatches.filter(
                m => m.tournamentId === tournament.id
            )

            tournament.standings.forEach(standing => {
                const teamMatches = tournamentMatches.filter(
                    m => m.homeTeamId === standing.teamId || m.awayTeamId === standing.teamId
                )

                standing.matchesPlayed = teamMatches.length
                standing.wins = teamMatches.filter(m => {
                    const isHome = m.homeTeamId === standing.teamId
                    return isHome ? m.result.homeScore > m.result.awayScore : m.result.awayScore > m.result.homeScore
                }).length
                standing.losses = standing.matchesPlayed - standing.wins
                standing.points = standing.wins * 3

                // Map differential
                standing.mapsWon = teamMatches.reduce((sum, m) => {
                    const isHome = m.homeTeamId === standing.teamId
                    return sum + (isHome ? m.result.homeScore : m.result.awayScore)
                }, 0)
                standing.mapsLost = teamMatches.reduce((sum, m) => {
                    const isHome = m.homeTeamId === standing.teamId
                    return sum + (isHome ? m.result.awayScore : m.result.homeScore)
                }, 0)
                standing.mapDiff = standing.mapsWon - standing.mapsLost
                standing.roundDiff = teamMatches.reduce((sum, m) => {
                    const homeRounds = (m.result.maps || []).reduce((acc, map) => acc + (map.homeScore || 0), 0)
                    const awayRounds = (m.result.maps || []).reduce((acc, map) => acc + (map.awayScore || 0), 0)
                    const isHome = m.homeTeamId === standing.teamId
                    return sum + (isHome ? (homeRounds - awayRounds) : (awayRounds - homeRounds))
                }, 0)
            })

            // Sort standings
            tournament.standings.sort((a, b) => compareStandings(a, b, tournamentMatches))

            // Completion now requires a terminal competitive state, not only endWeek.
            if (!tournament.isCompleted && this.hasTerminalTournamentCompletion(save, tournament)) {
                tournament.isCompleted = true
                if (!tournament.winnerId) {
                    const terminalMatch = tournament.playoffBracket
                        ?.filter(m => this.isTerminalBracketStage(m.stage) && m.isCompleted && m.winnerId)
                        .sort((a, b) => (b.week || 0) - (a.week || 0))[0]
                    tournament.winnerId = terminalMatch?.winnerId || tournament.standings[0]?.teamId
                }
            }

            if (!tournament.isCompleted || tournament.rewardsGranted) return

            const tournamentPlayedMatches = save.completedMatches.filter(m => m.tournamentId === tournament.id)
            if (tournamentPlayedMatches.length === 0) return

            const winnerTeamId = tournament.winnerId || tournament.standings[0]?.teamId
            if (!winnerTeamId) return

            const winningTeam = idx?.teamIndex.get(winnerTeamId) ?? save.teams.find(t => t.id === winnerTeamId)
            if (!winningTeam) return
            if (!winningTeam.trophies) winningTeam.trophies = []

            const seasonAwareTrophyExists = winningTeam.trophies.some(
                trophy =>
                    trophy.tournamentId === tournament.id ||
                    (toBaseTournamentId(trophy.tournamentId) === toBaseTournamentId(tournament.id) &&
                        trophy.week === save.currentWeek)
            )
            if (!seasonAwareTrophyExists) {
                winningTeam.trophies.push({
                    tournamentId: tournament.id,
                    tournamentName: tournament.name,
                    week: save.currentWeek,
                    tier: tournament.tier,
                    trophyPath: tournament.trophyPath,
                })
            }

            // Compute placements for prize distribution and circuit points
            const placements = TournamentManager.calculatePlacements(save, tournament)

            // Prize distribution by placement (matches UI percentages)
            const prizeDistribution: Record<number, number> = {
                1: 0.40, 2: 0.20, 3: 0.10, 4: 0.10, 5: 0.05, 6: 0.05, 7: 0.05, 8: 0.05,
                9: 0.025, 10: 0.025, 11: 0.025, 12: 0.025,
                13: 0.005, 14: 0.005, 15: 0.005, 16: 0.005
            }

            if (tournament.prizePool > 0) {
                for (const p of placements) {
                    const prizePct = prizeDistribution[p.position] ?? 0
                    if (prizePct <= 0) continue
                    const prizeAmount = Math.round(tournament.prizePool * prizePct)
                    if (prizeAmount <= 0) continue

                    const prizeLedgerId = `prize_${tournament.id}_${p.teamId}_p${p.position}`
                    if (ledgerIdSet?.has(prizeLedgerId) ?? save.financeLedger.some(entry => entry.id === prizeLedgerId)) continue

                    const team = idx?.teamIndex.get(p.teamId) ?? save.teams.find(t => t.id === p.teamId)
                    if (!team) continue

                    team.budget += prizeAmount
                    save.financeLedger.push({
                        id: prizeLedgerId,
                        week: save.currentWeek,
                        teamId: p.teamId,
                        type: "INCOME",
                        category: "PRIZE",
                        amount: prizeAmount,
                        description: `${tournament.name} - ${p.position === 1 ? "1st" : p.position === 2 ? "2nd" : p.position + "th"} Place`,
                        balance: team.budget,
                    })
                    ledgerIdSet?.add(prizeLedgerId)
                }
            }

            // Award circuit points for each placement
            if (!save.circuitPoints) save.circuitPoints = []
            const tierKey = tournament.tier as keyof typeof CIRCUIT_POINTS
            const pointsTable = (CIRCUIT_POINTS[tierKey] || {}) as Record<number, number>
            for (const p of placements) {
                const points = pointsTable[p.position] ?? 0
                if (points <= 0) continue

                let entry = save.circuitPoints.find(cp => cp.teamId === p.teamId) // circuitPoints not indexed (small array)
                if (entry) {
                    entry.points += points
                    entry.results.push({
                        tournamentId: tournament.id,
                        tournamentName: tournament.name,
                        placement: p.position,
                        points,
                        week: save.currentWeek
                    })
                } else {
                    save.circuitPoints.push({
                        teamId: p.teamId,
                        points,
                        results: [{
                            tournamentId: tournament.id,
                            tournamentName: tournament.name,
                            placement: p.position,
                            points,
                            week: save.currentWeek
                        }]
                    })
                }
            }

            winningTeam.reputation = Math.min(100, winningTeam.reputation + 10)

            const tierMultiplier: Record<string, number> = {
                "S_TIER": 200,
                "A_TIER": 100,
                "B_TIER": 50,
                "C_TIER": 20
            }
            const mult = tierMultiplier[tournament.tier] || 10
            const fanGain = (mult * 100) + (winningTeam.reputation * mult)
            winningTeam.followers = (winningTeam.followers || 0) + fanGain

            const trophyEventId = `trophy_${tournament.id}_${winnerTeamId}`
            if (!(eventIdSet?.has(trophyEventId) ?? save.eventsLog.some(event => event.id === trophyEventId))) {
                save.eventsLog.push({
                    id: trophyEventId,
                    type: EventType.MEDIA,
                    week: save.currentWeek,
                    data: { teamId: winningTeam.id, tournamentName: tournament.name, fanGain },
                    acknowledged: false
                })
                eventIdSet?.add(trophyEventId)
            }

            if (winningTeam.id === save.playerTeamId) {
                save.pendingCelebration = {
                    tournamentId: tournament.id,
                    tournamentName: tournament.name,
                    tier: tournament.tier,
                    prize: tournament.prizePool,
                    repGain: 10,
                    fanGain: fanGain,
                    week: save.currentWeek,
                    logoPath: tournament.logoPath,
                    trophyPath: tournament.trophyPath
                }

                // Major win (S_TIER) → offer legend pick
                if (tournament.tier === "S_TIER") {
                    const alreadySigned = save.signedLegendIds || []
                    // Also exclude legends whose active counterpart is still playing
                    const stillActiveLegendIds = (save.activelyPlayingLegendIds || []).filter(lid => {
                        // Check if the active counterpart has retired — if so, allow this legend
                        const legendData = LEGENDARY_PLAYERS.find(lp => lp.id === lid) // static data, small array
                        if (!legendData) return true
                        const nick = legendData.nickname.toLowerCase()
                        return save.players.some(p =>
                            p.id !== lid && !p.isRetired &&
                            p.nickname.toLowerCase() === nick
                        )
                    })
                    const availableLegends = LEGENDARY_PLAYERS.filter(
                        lp => !alreadySigned.includes(lp.id) &&
                            !stillActiveLegendIds.includes(lp.id) &&
                            !winningTeam.rosterIds.includes(lp.id)
                    )
                    if (availableLegends.length >= 3) {
                        // Deterministic shuffle using seeded RNG
                        const pickRng = new SeededRNG(save.currentWeek * 31337 + (save.lastRngSeed || 1))
                        const shuffled = [...availableLegends]
                        for (let i = shuffled.length - 1; i > 0; i--) {
                            const j = pickRng.int(0, i)
                                ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
                        }
                        save.pendingLegendPick = {
                            tournamentName: tournament.name,
                            candidates: shuffled.slice(0, 3).map(p => p.id),
                            week: save.currentWeek,
                        }
                    }
                }
            }

            tournament.rewardsGranted = true
        })
    }

    // generateEvents moved to processors/event-processor.ts

    /**
     * Phase 9: Process scouting missions - complete any that are done
     */
    private processScoutingMissions(save: GameSave, idx?: SaveIndexes): void {
        if (!save.activeScoutingMission) return

        const mission = save.activeScoutingMission

        // Check if mission is complete
        if (save.currentWeek >= mission.completionWeek) {
            // Add to scouted players
            if (!save.scoutedPlayers) {
                save.scoutedPlayers = []
            }

            save.scoutedPlayers.push({
                playerId: mission.playerId,
                scoutedWeek: save.currentWeek,
                scoutLevel: "EXPERT" as const,
            })

            // Generate news event
            const scoutedPlayer = idx?.playerIndex.get(mission.playerId) ?? save.players.find(p => p.id === mission.playerId)
            if (scoutedPlayer) {
                save.eventsLog.push({
                    id: `scouting_complete_${save.currentWeek}_${mission.playerId}`,
                    type: "NEWS",
                    week: save.currentWeek,
                    data: {
                        text: `Scouting report complete for ${scoutedPlayer.nickname}. Full stats are now visible.`,
                        playerName: scoutedPlayer.nickname,
                    },
                    acknowledged: false,
                })
            }

            // Clear active mission
            save.activeScoutingMission = undefined

            debugLog(`[Scouting] Completed mission for ${mission.playerId}`)
        }
    }

    private processAIWorldLogic(save: GameSave, playerTeamId: string, rng: SeededRNG): void {
        // 1. Elo updates are now handled atomically in processMatches via LeagueEngine
        // This prevents double-counting and ensures consistent logic.

        // 2. Refresh World Rankings
        AIManager.refreshWorldRankings(save)

        // 3. Process AI Decision Logic & Academy
        save.teams.forEach(team => {
            AIManager.processAcademyScouting(save, team, rng)
        })

        // Process AI logic — transfers only during transfer windows
        // Transfer windows: weeks 1-8 (pre-season) and 26-34 (mid-season)
        const weekOfSeason = ((save.currentWeek - 1) % 52) + 1
        const isTransferWindow = weekOfSeason <= 8 || (weekOfSeason >= 26 && weekOfSeason <= 34)
        AIManager.processWeeklyAI(save, playerTeamId, rng, isTransferWindow)

        // AI-to-AI transfers during transfer windows
        if (isTransferWindow) {
            AIManager.processAIToAITransfers(save, playerTeamId, rng)
        }

        // 3b. Staff market auto-refresh every 4 weeks
        if (save.currentWeek > 0 && save.currentWeek % 4 === 0) {
            const staffRng = new SeededRNG(rng.next() * 2147483646 || 1)
            save.marketStaff = StaffGenerator.generateWeeklyMarket(save.currentWeek, 20, staffRng)
            save.nextMarketRefreshWeek = save.currentWeek + 4
        }

        // 4. Seasonal logic (Season transition every 52 weeks)
        if (save.currentWeek > 0 && save.currentWeek % 52 === 0) {
            AIManager.processSeasonEnd(save)

            // ===== YOUTH ACADEMY: Generate Prospects =====
            // Teams with Training Center Level 3+ get 1-2 youth prospects
            debugLog(`[Season End] Generating Youth Prospects...`)

            save.teams.forEach(team => {
                const trainingFacility = team.facilities?.find(f => f.type === "TRAINING")
                if (!trainingFacility || trainingFacility.level < 3) return

                const prospectsToGenerate = trainingFacility.level >= 5 ? 2 : 1

                for (let i = 0; i < prospectsToGenerate; i++) {
                    const prospectId = `youth_${team.id}_${save.currentWeek}_${i}`
                    const prospectAge = 16 + Math.floor(rng.next() * 3) // 16-18
                    const potential = 60 + Math.floor(rng.next() * 30) // 60-89

                    // Random nationality pool
                    const nationalities = ["Denmark", "Sweden", "France", "Germany", "Poland", "Brazil", "USA", "Russia", "Kazakhstan", "China"]
                    const nationality = nationalities[Math.floor(rng.next() * nationalities.length)]

                    // Generate adjective-based nickname
                    const prefixes = ["Neo", "Hyper", "Swift", "Blaze", "Frost", "Storm", "Volt", "Shadow", "Apex", "Nova"]
                    const suffixes = ["X", "Z", "1", "Y", "Q", "0", "K", "R"]
                    const nickname = prefixes[Math.floor(rng.next() * prefixes.length)] + suffixes[Math.floor(rng.next() * suffixes.length)]

                    // Roles pool
                    const roles: ("Rifler" | "AWPer" | "Support" | "Entry" | "Lurker")[] = ["Rifler", "AWPer", "Support", "Entry", "Lurker"]
                    const role = roles[Math.floor(rng.next() * roles.length)]

                    // Current skill is lower than potential (they need to grow)
                    const currentSkill = Math.max(40, potential - 25 - Math.floor(rng.next() * 10))

                    const newProspect: any = {
                        id: prospectId,
                        nickname: nickname,
                        firstName: "Youth",
                        lastName: "Prospect",
                        nationality: nationality,
                        age: prospectAge,
                        role: role,
                        skill: currentSkill,
                        potential: potential,
                        morale: 80,
                        fatigue: 0,
                        form: 70,
                        health: 100,
                        matchesPlayed: 0,
                        isYouthPlayer: true,
                        // Weapons Map (default values)
                        rifle: currentSkill * 0.8,
                        awp: role === "AWPer" ? currentSkill : currentSkill * 0.5,
                        pistol: currentSkill * 0.7,
                        grenades: currentSkill * 0.7,
                        tactic: currentSkill * 0.6,
                        creativity: currentSkill * 0.6,
                        reaction: currentSkill * 0.7,
                        clutch: currentSkill * 0.5,
                        teamwork: currentSkill * 0.6,
                        stressResistance: currentSkill * 0.5,
                        entry: currentSkill * 0.5,
                        trading: currentSkill * 0.5,
                        leader: currentSkill * 0.3,
                        amicability: currentSkill * 0.6,
                        eyesight: currentSkill * 0.7,
                        strength: currentSkill * 0.6,
                        endurance: currentSkill * 0.6,
                        portraitPath: null,
                        xp: 0,
                        xpToNextLevel: 1000,
                        level: 1,
                    }

                    save.players.push(newProspect)

                    // Add to academy players (Phase 70 canonical)
                    if (!save.academyPlayers) save.academyPlayers = []
                    save.academyPlayers.push({
                        id: `academy_${prospectId}_${save.currentWeek}`,
                        playerId: prospectId,
                        enrolledWeek: save.currentWeek,
                        trainingFocus: 'BALANCED' as const,
                        developmentProgress: 0,
                        potentialRevealed: false,
                        totalXpGained: 0,
                        academyMatchesPlayed: 0,
                        readyForPromotion: false,
                        scoutNotes: `Youth intake prospect for ${team.name}`,
                        energy: 100,
                    })

                    debugLog(`[Youth Academy] ${team.name} signed prospect: ${nickname} (Skill: ${currentSkill}, Potential: ${potential})`)
                }

                // Notify player team
                if (team.id === playerTeamId) {
                    save.eventsLog.unshift({
                        id: `youth_intake_${save.currentWeek}`,
                        type: "TRAINING_COMPLETE",
                        week: save.currentWeek,
                        acknowledged: false,
                        data: {
                            title: "Youth Intake Complete",
                            message: `${prospectsToGenerate} new prospect${prospectsToGenerate > 1 ? 's have' : ' has'} joined your Youth Academy. Check the Squad page to view and promote them.`,
                            severity: "success"
                        }
                    })
                }
            })
        }
    }

    /**
     * Phase 24: Process performance-based follower growth
     */
    private processFanbaseGrowth(save: GameSave, rng: SeededRNG): void {
        save.teams.forEach(team => {
            // Organic growth based on reputation (e.g. 50-250 fans depending on 0-100 rep)
            let dailyOrganic = (team.reputation / 100) * 15
            let weeklyGrowth = dailyOrganic * 7

            // Phase 18: Fan Zone Bonus (15% per level)
            const fanZoneFacility = team.facilities?.find(f => f.type === "FANZONE")
            const fanZoneBonus = 1 + (fanZoneFacility?.level || 0) * 0.15
            weeklyGrowth *= fanZoneBonus

            // Performance influence (recent matches)
            const weekMatches = save.completedMatches.filter(m =>
                (m.homeTeamId === team.id || m.awayTeamId === team.id) &&
                m.week === save.currentWeek
            )

            weekMatches.forEach(m => {
                const isHome = m.homeTeamId === team.id
                const won = isHome ? m.result.homeScore > m.result.awayScore : m.result.awayScore > m.result.homeScore

                if (won) {
                    // Winning matches adds followers
                    // Elite teams gain more from wins, but have higher expectations
                    const gain = 500 + (team.reputation * 5)
                    weeklyGrowth += gain
                } else {
                    // Losing matches causes a slight stagnation or decline
                    weeklyGrowth -= 100
                }
            })

            // Ranking clout
            if (team.worldRanking && team.worldRanking <= 30) {
                // Top teams get bonus organic spread
                const rankingBonus = (31 - team.worldRanking) * 50
                weeklyGrowth += rankingBonus
            }

            // Marketing campaign bonus
            const activeMarketing = save.scheduledActivities?.filter(a =>
                a.type === "MARKETING" &&
                save.currentWeek >= a.week &&
                save.currentWeek < a.week + a.duration &&
                typeof (a.data as { followersPerWeek?: number } | undefined)?.followersPerWeek === "number"
            ) ?? []
            for (const campaign of activeMarketing) {
                const gain = (campaign.data as { followersPerWeek?: number })?.followersPerWeek ?? 0
                if (typeof gain === "number" && gain > 0) {
                    weeklyGrowth += gain
                }
            }

            team.followers = Math.max(0, Math.floor((team.followers || 0) + weeklyGrowth))
        })
    }

    private applyMatchSponsorGoalProgress(
        save: GameSave,
        team: TeamSaveData,
        wonMatch: boolean,
        mapsWon: number,
        matchId: string,
        eventIdSet?: Set<string>,
        ledgerIdSet?: Set<string>
    ): void {
        if (!team.sponsors || team.sponsors.length === 0) return

        team.sponsors.forEach(sponsor => {
            if (!Array.isArray(sponsor.goals)) return

            sponsor.goals.forEach(goal => {
                if (goal.isCompleted) return

                if (goal.description.includes("Win Matches") && wonMatch) {
                    goal.current += 1
                }

                if (goal.description.includes("Win Tournament maps")) {
                    goal.current += mapsWon
                }

                if (goal.current < goal.target) return
                goal.current = goal.target
                goal.isCompleted = true

                const payoutEntryId = `fin_sponsor_match_${save.currentWeek}_${team.id}_${sponsor.id}_${goal.id}_${matchId}`
                const alreadyPaid = ledgerIdSet?.has(payoutEntryId) ?? save.financeLedger.some(entry => entry.id === payoutEntryId)
                if (alreadyPaid) return

                team.budget += goal.bonusPayout
                save.financeLedger.push({
                    id: payoutEntryId,
                    week: save.currentWeek,
                    teamId: team.id,
                    type: "INCOME",
                    category: "SPONSOR",
                    amount: goal.bonusPayout,
                    description: `Goal Reached: ${goal.description}`,
                    balance: team.budget
                })
                ledgerIdSet?.add(payoutEntryId)

                if (team.id !== save.playerTeamId) return

                const eventId = `evt_sponsor_match_goal_${save.currentWeek}_${sponsor.id}_${goal.id}_${matchId}`
                if (!(eventIdSet?.has(eventId) ?? save.eventsLog.some(event => event.id === eventId))) {
                    save.eventsLog.unshift({
                        id: eventId,
                        type: "SPONSOR_OFFER",
                        week: save.currentWeek,
                        data: {
                            title: "Sponsor Goal Met",
                            message: `${sponsor.name} sent a bonus of $${goal.bonusPayout.toLocaleString()}.`
                        },
                        acknowledged: false
                    })
                    eventIdSet?.add(eventId)
                }
            })
        })
    }

    /**
     * Process sponsor contract lifecycle and weekly sponsor goals exactly once per week.
     */
    private processWeeklySponsorGoals(save: GameSave, eventIdSet?: Set<string>, ledgerIdSet?: Set<string>): void {
        save.teams.forEach(team => {
            if (!team.sponsors || team.sponsors.length === 0) return

            const followers = team.followers || 0
            const rosterPlayers = save.players.filter(player => team.rosterIds.includes(player.id))
            const avgMorale = rosterPlayers.length > 0
                ? rosterPlayers.reduce((sum, player) => sum + (player.morale || 0), 0) / rosterPlayers.length
                : 0

            const activeSponsors: typeof team.sponsors = []

            team.sponsors.forEach(sponsor => {
                // Idempotency guard for rollback/resume paths.
                if (sponsor.lastProcessedWeek === save.currentWeek) {
                    if (sponsor.remainingWeeks > 0) activeSponsors.push(sponsor)
                    return
                }

                const previousFollowers = sponsor.followerCheckpoint ?? followers
                const gainedFollowers = Math.max(0, followers - previousFollowers)

                if (Array.isArray(sponsor.goals)) {
                    sponsor.goals.forEach(goal => {
                        if (goal.isCompleted) return

                        if (goal.description.includes("Gain Followers")) {
                            goal.current += gainedFollowers
                        }

                        if (goal.description.includes("Maintain Morale > 80") && avgMorale > 80) {
                            goal.current += 1
                        }

                        if (goal.current >= goal.target) {
                            goal.current = goal.target
                            goal.isCompleted = true

                            const payoutEntryId = `fin_sponsor_goal_${save.currentWeek}_${team.id}_${sponsor.id}_${goal.id}`
                            const alreadyPaid = ledgerIdSet?.has(payoutEntryId) ?? save.financeLedger.some(entry => entry.id === payoutEntryId)

                            if (!alreadyPaid) {
                                team.budget += goal.bonusPayout
                                save.financeLedger.push({
                                    id: payoutEntryId,
                                    week: save.currentWeek,
                                    teamId: team.id,
                                    type: "INCOME",
                                    category: "SPONSOR",
                                    amount: goal.bonusPayout,
                                    description: `Goal Reached: ${goal.description}`,
                                    balance: team.budget
                                })
                                ledgerIdSet?.add(payoutEntryId)

                                if (team.id === save.playerTeamId) {
                                    const eventId = `evt_sponsor_goal_${save.currentWeek}_${sponsor.id}_${goal.id}`
                                    if (!(eventIdSet?.has(eventId) ?? save.eventsLog.some(event => event.id === eventId))) {
                                        save.eventsLog.unshift({
                                            id: eventId,
                                            type: "SPONSOR_OFFER",
                                            week: save.currentWeek,
                                            data: {
                                                title: "Sponsor Goal Met",
                                                message: `${sponsor.name} sent a bonus of $${goal.bonusPayout.toLocaleString()}.`
                                            },
                                            acknowledged: false
                                        })
                                        eventIdSet?.add(eventId)
                                    }
                                }
                            }
                        }
                    })
                }

                sponsor.followerCheckpoint = followers
                sponsor.lastProcessedWeek = save.currentWeek
                sponsor.remainingWeeks = Math.max(0, (sponsor.remainingWeeks || 0) - 1)

                if (sponsor.remainingWeeks > 0) {
                    activeSponsors.push(sponsor)
                    return
                }

                if (team.id === save.playerTeamId) {
                    const expiryEventId = `evt_sponsor_expired_${save.currentWeek}_${sponsor.id}`
                    if (!(eventIdSet?.has(expiryEventId) ?? save.eventsLog.some(event => event.id === expiryEventId))) {
                        save.eventsLog.unshift({
                            id: expiryEventId,
                            type: "SPONSOR_OFFER",
                            week: save.currentWeek,
                            data: {
                                title: "Sponsor Contract Ended",
                                message: `${sponsor.name} partnership has expired.`
                            },
                            acknowledged: false
                        })
                        eventIdSet?.add(expiryEventId)
                    }
                }
            })

            team.sponsors = activeSponsors
        })
    }

    /**
     * Generate fresh sponsor offers for the player's team each week.
     */
    private refreshSponsorOffers(save: GameSave, playerTeamId: string, rng: SeededRNG): void {
        const team = save.teams.find(t => t.id === playerTeamId)
        if (!team) return
        const offerRng = new SeededRNG(rng.int(1, 2147483646))
        save.sponsorOffers = SponsorGenerator.generateVariedOffers(team, save.currentWeek, offerRng)
        save.declinedSponsorOfferIds = []
    }

    // Phase 20: Process tournament-related logic
    processTournaments(save: GameSave, playerTeamId: string, rng: SeededRNG, idx?: SaveIndexes, eventIdSet?: Set<string>, ledgerIdSet?: Set<string>): void {
        const currentWeek = save.currentWeek
        const weekOfSeason = ((currentWeek - 1) % 52) + 1
        const season = Math.floor((currentWeek - 1) / 52) + 1

        const qualificationGraph = buildQualificationGraph(FULL_TOURNAMENT_CALENDAR)
        if (qualificationGraph.errors.length > 0) {
            qualificationGraph.errors.forEach(error => {
                debug.warn(`[CircuitGraph] ${error}`)
            })
        }

        // CLEANUP: Reset stale future tournament state from legacy seeding.
        save.tournaments.forEach(t => {
            if (t.startWeek > currentWeek) {
                const hasPrematureState =
                    (t.teamIds && t.teamIds.length > 0)
                    || (t.standings && t.standings.length > 0)
                    || (t.playoffBracket && t.playoffBracket.length > 0)

                if (!hasPrematureState) return

                t.teamIds = []
                t.standings = []
                t.playoffBracket = []
                t.currentStage = "Registration"
                t.isCompleted = false
                t.winnerId = undefined
                t.rewardsGranted = false
            }
        })

        // Find tournaments starting this week
        const startingTournaments = FULL_TOURNAMENT_CALENDAR.filter(t => t.startWeek === weekOfSeason)

        // Phase 61: Proactive Invitations (4 weeks ahead)
        // This ensures teams (including player) get "Invited" status before the event starts
        const invitationWindow = 4
        const futureTournaments = FULL_TOURNAMENT_CALENDAR.filter(t => {
            if (t.entryType !== "INVITE") return false
            // Handle wrap-around for end of season
            let weeksUntil = t.startWeek - weekOfSeason
            if (weeksUntil < 0) weeksUntil += 52
            return weeksUntil > 0 && weeksUntil <= invitationWindow
        })

        futureTournaments.forEach(def => {
            const rankedTeams = [...save.teams].sort((a, b) => (a.worldRanking || 999) - (b.worldRanking || 999))

            const beforeCount = (save.tournamentQualifications || []).length
            save.tournamentQualifications = QualificationEngine.generateAutoInvites(
                save.tournamentQualifications || [],
                def,
                rankedTeams.map(t => ({ id: t.id, worldRanking: t.worldRanking || 999 })),
                currentWeek
            )

            // Notify player if they were just invited
            if ((save.tournamentQualifications || []).length > beforeCount) {
                const isInvited = save.tournamentQualifications.some(q =>
                    isQualificationForTournament(q, def.id, currentWeek) &&
                    q.teamId === playerTeamId &&
                    q.status === "QUALIFIED"
                )

                const alreadyNotified = eventIdSet?.has(`invite_notif_${def.id}_s${season}`) ?? save.eventsLog.some(e => e.id === `invite_notif_${def.id}_s${season}`)

                if (isInvited && !alreadyNotified) {
                    const inviteEventId = `invite_notif_${def.id}_s${season}`
                    save.eventsLog.push({
                        id: inviteEventId,
                        type: "TOURNAMENT",
                        week: save.currentWeek,
                        acknowledged: false,
                        data: {
                            title: "📧 Tournament Invitation",
                            message: `Your team's performance has earned an official invitation to **${def.name}**! The event starts in ${def.startWeek - weekOfSeason > 0 ? def.startWeek - weekOfSeason : (52 - weekOfSeason) + def.startWeek} weeks.`,
                            severity: "success",
                            tournamentId: def.id,
                            tier: def.tier
                        }
                    })
                    eventIdSet?.add(inviteEventId)
                }
            }
        })

        // Process each starting tournament
        for (const definition of startingTournaments) {
            debugLog(`[Tournament] ${definition.name} (Season ${season}) is starting!`)

            // Ensure tournament exists in save with SEASONAL ID
            const seasonalId = `${definition.id}_s${season}`
            let tournament = idx?.tournamentIndex.get(seasonalId) ?? save.tournaments.find(t => t.id === seasonalId)
            if (!tournament) {
                tournament = {
                    id: seasonalId,
                    seriesId: definition.id,
                    instanceId: seasonalId,
                    seasonNumber: season,
                    name: season > 1 ? `${definition.name} S${season}` : definition.name,
                    shortName: definition.shortName || definition.name,
                    region: definition.region || "INTERNATIONAL",
                    tier: definition.tier,
                    teamIds: [],
                    format: definition.format,
                    currentStage: "Registration",
                    standings: [],
                    prizePool: definition.prizePool,
                    startWeek: currentWeek, // Actual absolute week
                    duration: definition.duration,
                    endWeek: currentWeek + definition.duration
                }
                save.tournaments.push(tournament as TournamentSaveData)
            }

            // Get ranked teams for participants - Prioritize World Ranking
            const rankedTeams = [...save.teams]
                .sort((a, b) => (a.worldRanking || 999) - (b.worldRanking || 999))

            // 1. Get teams that explicitly registered or have a "QUALIFIED" status
            // FIX: Check BOTH Base ID and Seasonal ID since registrations store Base ID
            const qualifiedRegistrations = (save.tournamentQualifications || [])
                .filter(q =>
                    isQualificationForTournament(q, seasonalId, currentWeek)
                    && (q.status === "QUALIFIED" || q.status === "REGISTERED" || q.status === "INVITED")
                )

            // CRITICAL: Deduplicate to prevent same team appearing multiple times
            let participants = [...new Set(qualifiedRegistrations.map(q => q.teamId))]

            // 2. Determine if player team is already in (via registration)
            const isPlayerRegistered = participants.includes(playerTeamId)

            // 3. Fill remaining slots with AI teams based on rank and league tier restrictions
            const remainingSlots = definition.slots - participants.length
            debugLog(`[Tournament] ${definition.name}: Need ${remainingSlots} more teams (have ${participants.length}/${definition.slots})`)

            if (remainingSlots > 0) {
                let availableAI = rankedTeams
                    .filter(t => t.id !== playerTeamId && !participants.includes(t.id))

                // If this is a qualifier, exclude teams already invited/qualified for the main tournament
                if (definition.qualifierFor) {
                    const mainSeasonalId = `${definition.qualifierFor}_s${season}`
                    const mainQualifiedTeamIds = new Set(
                        (save.tournamentQualifications || [])
                            .filter(q =>
                                isQualificationForTournament(q, mainSeasonalId, currentWeek) &&
                                (q.status === "QUALIFIED" || q.status === "REGISTERED" || q.status === "INVITED")
                            )
                            .map(q => q.teamId)
                    )
                    if (mainQualifiedTeamIds.size > 0) {
                        availableAI = availableAI.filter(t => !mainQualifiedTeamIds.has(t.id))
                        debugLog(`[Tournament] ${definition.name}: Excluded ${mainQualifiedTeamIds.size} teams already in main event`)
                    }
                }

                debugLog(`[Tournament] ${definition.name}: Found ${availableAI.length} available AI teams`)

                // If tournament has a requiredLeagueTier, prioritize matches but fallback if needed
                if (definition.requiredLeagueTier) {
                    const requiredTier = definition.requiredLeagueTier
                    const strictMatches = availableAI.filter(t => t.leagueTier === requiredTier)

                    if (strictMatches.length >= remainingSlots) {
                        availableAI = strictMatches
                    } else {
                        debugLog(`[Tournament] ${definition.name}: Not enough ${requiredTier} teams (${strictMatches.length}), using fallback.`)
                        // Prioritize strict matches, then fill with others
                        const others = availableAI.filter(t => t.leagueTier !== requiredTier)
                        availableAI = [...strictMatches, ...others]
                    }
                    debugLog(`[Tournament] ${definition.name}: After tier priority: ${availableAI.length} candidates`)
                }

                // Prevent negative slice which adds all teams
                const safeRemaining = Math.max(0, remainingSlots)
                const fillTeams = availableAI.slice(0, safeRemaining).map(t => t.id)
                participants = [...participants, ...fillTeams]
                debugLog(`[Tournament] ${definition.name}: Filled ${fillTeams.length} AI teams`)
            }

            // Final deduplication and re-sort by ranking to ensure seeding logic works
            participants = [...new Set(participants)]
            const teamLookup = new Map(save.teams.map(t => [t.id, t]))
            participants.sort((a, b) => {
                const teamA = teamLookup.get(a)
                const teamB = teamLookup.get(b)
                const rankDiff = (teamA?.worldRanking || 999) - (teamB?.worldRanking || 999)
                if (rankDiff !== 0) return rankDiff
                return a.localeCompare(b)
            })

            // 4. AI teams are filled automatically. 
            // Player must be in participants list via QUALIFIED or REGISTERED status 
            // set up in previous weeks (via auto-invites or manual registration).

            // **FIX: Cap participants to slots, but PRIORITIZE player team**
            if (participants.length > definition.slots) {
                debugLog(`[Tournament] Over-capacity for ${definition.name}: ${participants.length}/${definition.slots}. Truncating list.`)

                const wasPlayerIn = participants.includes(playerTeamId)
                participants = participants.slice(0, definition.slots)

                // If the player was in the list but got truncated because of low ranking, 
                // swap them back in for the lowest ranked AI team.
                if (wasPlayerIn && !participants.includes(playerTeamId)) {
                    participants[participants.length - 1] = playerTeamId
                    debugLog(`[Tournament] Forced player team ${playerTeamId} into over-capacity tournament ${definition.name}`)
                }
            }

            // Bracket generation requires a stable power-of-two participant count.
            // Trim deterministically to prevent fallback simple brackets that can stall progression.
            if (definition.format === "bracket") {
                const isPowerOfTwo = (n: number) => n > 1 && (n & (n - 1)) === 0
                if (!isPowerOfTwo(participants.length)) {
                    let targetSize = 1
                    while ((targetSize * 2) <= participants.length) targetSize *= 2
                    targetSize = Math.max(2, targetSize)

                    const playerWasIncluded = participants.includes(playerTeamId)
                    let trimmed = participants.slice(0, targetSize)
                    if (playerWasIncluded && !trimmed.includes(playerTeamId)) {
                        trimmed[trimmed.length - 1] = playerTeamId
                    }

                    participants = [...new Set(trimmed)]
                    debugLog(`[Tournament] ${definition.name}: normalized bracket field from ${participants.length} teams to power-of-two size ${targetSize}.`)
                }
            }

            if (participants.length < 2) {
                debugLog(`[Tournament] Skipping ${definition.name}: insufficient participants (${participants.length})`)
                continue
            }

            // DEBUG: Log participant count before initialization
            debugLog(`[Tournament] Initializing ${definition.name} with ${participants.length} participants (required: ${definition.slots})`)
            if (participants.length === 0) {
                debugLog(`[Tournament] WARNING: No participants for ${definition.name}! Qualifications:`, qualifiedRegistrations.length, `AI fill attempted:`, remainingSlots)
            }

            // Initialize the tournament structure
            // **FIX: Use seasonalId to match the actual tournament object created above**
            TournamentManager.initializeTournament(save, seasonalId, participants, rng)

            // Phase 20: Add Inbox Notification
            if (participants.includes(playerTeamId)) {
                save.eventsLog.push({
                    id: `tourney_start_${definition.id}_${save.currentWeek}`,
                    type: "TOURNAMENT",
                    week: save.currentWeek,
                    acknowledged: false,
                    data: {
                        title: "Tournament Started",
                        message: `${definition.name} has officially begun! Check the Tournament Hub for your opening match.`,
                        severity: "info",
                        tournamentId: definition.id
                    }
                })
            }
        }

        // Bracket recovery pass: ensures dependency-resolved matches are scheduled and avoids dead-end trees.
        save.tournaments.forEach((liveTournament) => {
            if (liveTournament.playoffBracket && liveTournament.playoffBracket.length > 0 && !liveTournament.isCompleted) {
                TournamentManager.repairTournamentProgression(save, liveTournament.id)
            }
        })

        // Check for tournaments ending this week - award circuit points
        const endingTournaments = FULL_TOURNAMENT_CALENDAR.filter(t => {
            const duration = t.duration || 1
            const endWeekOfSeason = ((t.startWeek + duration - 2) % 52) + 1
            return weekOfSeason === endWeekOfSeason
        })

        for (const tournamentDef of endingTournaments) {
            debugLog(`[Tournament] ${tournamentDef.name} finals this week!`)

            // Find the actual tournament instance (may have seasonal ID like "major_copenhagen_s1")
            const season = Math.floor((currentWeek - 1) / 52) + 1
            const seasonalId = `${tournamentDef.id}_s${season}`
            const liveTournament = idx?.tournamentIndex.get(seasonalId) ?? idx?.tournamentIndex.get(tournamentDef.id) ?? save.tournaments.find(t =>
                t.id === seasonalId || t.id === tournamentDef.id
            )

            const pointsTable = CIRCUIT_POINTS[tournamentDef.tier] as Record<number, number> | undefined
            if (!pointsTable) continue

            // Award points only from real completed instances to avoid phantom season points.
            if (liveTournament && liveTournament.isCompleted && liveTournament.playoffBracket && !liveTournament.rewardsGranted) {
                debugLog(`[Circuit] Using actual tournament placements for ${tournamentDef.name}`)

                // Get actual placements from the tournament bracket
                const placements = TournamentManager.calculatePlacements(save, liveTournament)

                // Award points based on actual tournament results
                for (const { teamId, position } of placements) {
                    const points = pointsTable[position] || 0
                    if (points > 0) {
                        this.awardPoints(save, teamId, points, tournamentDef.name, position, idx)
                    }
                }
            } else {
                debugLog(`[Circuit] Skipping points for ${tournamentDef.name}: instance not terminally complete.`)
            }
        }
    }

    private awardPoints(save: GameSave, teamId: string, points: number, tournamentName: string, placement: number = 0, idx?: SaveIndexes) {
        if (!points) return

        if (!save.circuitPoints) save.circuitPoints = []

        let entry = save.circuitPoints.find(cp => cp.teamId === teamId) // circuitPoints not indexed (small array)
        if (!entry) {
            entry = { teamId, points: 0, results: [] }
            save.circuitPoints.push(entry)
        }

        entry.points += points
        entry.results.push({
            tournamentId: (FULL_TOURNAMENT_CALENDAR.find(t => t.name === tournamentName)?.id || "unknown"), // static data
            tournamentName,
            placement,
            points,
            week: save.currentWeek
        })

        // Phase 28: Award Trophy for wins (Placement 1)
        if (placement === 1) {
            const team = idx?.teamIndex.get(teamId) ?? save.teams.find(t => t.id === teamId)
            const tournament = FULL_TOURNAMENT_CALENDAR.find(t => t.name === tournamentName) // static data
            if (team && tournament) {
                const toBaseTournamentId = (id: string) => id.replace(/_s\d+$/, "")
                const getSeason = (id: string) => {
                    const match = id.match(/_s(\d+)$/)
                    return match ? parseInt(match[1], 10) : null
                }
                const currentSeason = Math.floor((save.currentWeek - 1) / 52) + 1
                const alreadyFinalizedInSeason = save.tournaments.some(
                    t =>
                        toBaseTournamentId(t.id) === toBaseTournamentId(tournament.id) &&
                        (getSeason(t.id) ?? currentSeason) === currentSeason &&
                        t.rewardsGranted
                )
                if (alreadyFinalizedInSeason) {
                    return
                }

                if (!team.trophies) team.trophies = []

                // Avoid duplicates for same base tournament/week (handles seasonal ids)
                const alreadyHas = team.trophies.some(
                    tr =>
                        toBaseTournamentId(tr.tournamentId) === toBaseTournamentId(tournament.id) &&
                        (getSeason(tr.tournamentId) ?? currentSeason) === currentSeason
                )
                if (!alreadyHas) {
                    team.trophies.push({
                        tournamentId: tournament.id,
                        tournamentName: tournament.name,
                        week: save.currentWeek,
                        trophyPath: tournament.trophyPath,
                        tier: tournament.tier
                    })

                    // Update player legacy stats for the winners (only count Majors)
                    if (tournament.tier === "S_TIER") {
                        team.rosterIds.forEach(pid => {
                            const player = idx?.playerIndex.get(pid) ?? save.players.find(p => p.id === pid)
                            if (player) {
                                if (!player.majorWins) player.majorWins = 0
                                player.majorWins++
                            }
                        })
                    }

                    debugLog(`[Trophy] Awarded ${tournament.name} trophy to team ${team.name}`)
                }
            }
        }

        debugLog(`[Circuit] Awarded ${points} points to team ${teamId} for ${tournamentName} (P${placement})`)
    }

    private generateNarrativeNews(save: GameSave, rng: SeededRNG, idx?: SaveIndexes): void {
        // 1. Monthly Power Rankings
        if (save.currentWeek > 1 && (save.currentWeek - 1) % 4 === 0) {
            const topTeams = [...save.teams].sort((a, b) => b.elo - a.elo).slice(0, 5)
            if (topTeams.length > 0) {
                const topTeam = topTeams[0]

                save.newsFeed.unshift({
                    id: `monthly_ranking_${save.currentWeek}_${Math.floor(rng.next() * 1_000_000_000).toString(36)}`,
                    title: `HLTV Power Rankings: ${topTeam.name} Top!`,
                    content: `In this month's official power rankings, ${topTeam.name} secures the #1 spot globally. Current top 5: ${topTeams.map(t => t.name).join(', ')}.`,
                    category: "ACHIEVEMENT",
                    teamId: topTeam.id,
                    week: save.currentWeek,
                    engagement: { likes: 1200 + Math.floor(rng.next() * 800), views: 15000 + Math.floor(rng.next() * 5000) }
                })
            }
        }

        // 2. Big Match Preview (Finals)
        const playerTeam = idx?.teamIndex.get(save.playerTeamId) ?? save.teams.find(t => t.id === save.playerTeamId)
        if (playerTeam) {
            const finalsMatch = save.scheduledMatches.find(m =>
                (m.homeTeamId === save.playerTeamId || m.awayTeamId === save.playerTeamId) &&
                m.week === save.currentWeek &&
                m.tournamentId && !m.isScrim &&
                (m.stage?.toLowerCase().includes('final') || m.id.toLowerCase().includes('final'))
            )

            if (finalsMatch) {
                const tournament = idx?.tournamentIndex.get(finalsMatch.tournamentId!) ?? save.tournaments.find(t => t.id === finalsMatch.tournamentId)
                save.newsFeed.unshift({
                    id: `match_preview_${finalsMatch.id}`,
                    title: `Grand Final Alert: ${playerTeam.name} Path to Glory`,
                    content: `The world watches as ${playerTeam.name} prepares for the ${tournament?.name || 'Grand Final'}. "We are ready to leave everything on the server," says the team manager.`,
                    category: "MATCH",
                    teamId: playerTeam.id,
                    week: save.currentWeek,
                    engagement: { likes: 2500, views: 50000 }
                })
            }
        }

        // 3. Yearly Season Recap
        if (save.currentWeek > 1 && (save.currentWeek - 1) % 52 === 0) {
            const lastYear = Math.floor((save.currentWeek - 1) / 52)
            if (lastYear > 0) {
                save.pendingSeasonRecap = lastYear
            }
        }

        // 4. Post-Match Headlines (for completed matches this week)
        const recentMatches = save.completedMatches.filter(m => m.week === save.currentWeek - 1)
        for (const match of recentMatches.slice(0, 2)) { // Limit to 2 headlines per week
            const homeTeam = idx?.teamIndex.get(match.homeTeamId) ?? save.teams.find(t => t.id === match.homeTeamId)
            const awayTeam = idx?.teamIndex.get(match.awayTeamId) ?? save.teams.find(t => t.id === match.awayTeamId)
            const winner = match.result.winnerId ? (idx?.teamIndex.get(match.result.winnerId) ?? save.teams.find(t => t.id === match.result.winnerId)) : undefined
            const loser = match.result.winnerId === match.homeTeamId ? awayTeam : homeTeam

            if (winner && loser && match.tournamentId) {
                const tournament = idx?.tournamentIndex.get(match.tournamentId) ?? save.tournaments.find(t => t.id === match.tournamentId)
                let homeScore = match.result.homeScore
                let awayScore = match.result.awayScore

                // Fix: Recalculate score from maps if 0-0 (bug prevention)
                if (homeScore === 0 && awayScore === 0 && match.result.maps && match.result.maps.length > 0) {
                    // Check if maps have scores
                    match.result.maps.forEach(m => {
                        const hScore = m.homeScore || 0
                        const aScore = m.awayScore || 0
                        if (hScore > aScore) homeScore++
                        else if (aScore > hScore) awayScore++
                    })
                }

                const scoreLine = `${homeScore}-${awayScore}`
                const isUpset = (loser?.elo || 0) > (winner?.elo || 0) + 100

                const headlines = isUpset
                    ? [`UPSET! ${winner.name} Shocks ${loser.name}`, `${winner.name} Pulls Off Miracle Run`]
                    : [`${winner.name} Dominates ${loser.name}`, `Clinical Win for ${winner.name}`]

                save.newsFeed.unshift({
                    id: `headline_${match.id}_${Math.floor(rng.next() * 1_000_000_000).toString(36)}`,
                    title: headlines[Math.floor(rng.next() * headlines.length)],
                    content: `${winner.name} defeats ${loser.name} ${scoreLine} in ${tournament?.name || 'tournament play'}. ${isUpset ? 'A stunning upset that nobody saw coming!' : 'A well-deserved victory.'}`,
                    category: "MATCH",
                    teamId: winner.id,
                    week: save.currentWeek,
                    engagement: { likes: 500 + Math.floor(rng.next() * 1500), views: 8000 + Math.floor(rng.next() * 12000) }
                })
            }
        }

        // 5. Transfer Rumors (Random chance each week)
        if (rng.next() < 0.15 && save.currentWeek > 4) { // 15% chance per week
            const allPlayers = save.players.filter(p => {
                const contract = idx?.contractIndex.get(p.id) ?? save.contracts.find(c => c.playerId === p.id)
                return contract && contract.endWeek - save.currentWeek < 12 // Expiring soon
            })

            if (allPlayers.length > 0) {
                const player = allPlayers[Math.floor(rng.next() * allPlayers.length)]
                const currentTeam = save.teams.find(t => t.rosterIds.includes(player.id)) // no index for roster membership
                const interestedTeams = save.teams
                    .filter(t => t.id !== currentTeam?.id && t.budget > 100000)
                    .slice(0, 3)

                if (currentTeam && interestedTeams.length > 0) {
                    const rumoredTeam = interestedTeams[Math.floor(rng.next() * interestedTeams.length)]
                    const rumorTemplates = [
                        `RUMOR: ${rumoredTeam.name} eyes ${player.nickname}`,
                        `Transfer Watch: ${player.nickname} linked with move`,
                        `${rumoredTeam.name} in talks with ${player.nickname}?`
                    ]

                    save.newsFeed.unshift({
                        id: `rumor_${player.id}_${Math.floor(rng.next() * 1_000_000_000).toString(36)}`,
                        title: rumorTemplates[Math.floor(rng.next() * rumorTemplates.length)],
                        content: `Sources close to ${rumoredTeam.name} suggest they are monitoring ${player.nickname}'s contract situation at ${currentTeam.name}. The ${player.age}-year-old's deal expires soon.`,
                        category: "TRANSFER",
                        playerId: player.id,
                        teamId: rumoredTeam.id,
                        week: save.currentWeek,
                        engagement: { likes: 800 + Math.floor(rng.next() * 1200), views: 20000 + Math.floor(rng.next() * 30000) }
                    })
                }
            }
        }

        // 6. Rivalry Storylines (When two top teams face off)
        // Pre-compute top 10 teams by Elo once for rivalry check
        const topTeamIds = new Set([...save.teams].sort((a, b) => b.elo - a.elo).slice(0, 10).map(t => t.id))
        const upcomingRivalry = save.scheduledMatches.find(m => {
            if (m.week !== save.currentWeek || m.isScrim) return false
            return topTeamIds.has(m.homeTeamId) && topTeamIds.has(m.awayTeamId)
        })

        if (upcomingRivalry && rng.next() < 0.5) {
            const home = idx?.teamIndex.get(upcomingRivalry.homeTeamId) ?? save.teams.find(t => t.id === upcomingRivalry.homeTeamId)
            const away = idx?.teamIndex.get(upcomingRivalry.awayTeamId) ?? save.teams.find(t => t.id === upcomingRivalry.awayTeamId)

            if (home && away) {
                // Check head-to-head history
                const h2hMatches = save.completedMatches.filter(m =>
                    (m.homeTeamId === home.id && m.awayTeamId === away.id) ||
                    (m.homeTeamId === away.id && m.awayTeamId === home.id)
                )
                const homeWins = h2hMatches.filter(m => m.result.winnerId === home.id).length
                const awayWins = h2hMatches.filter(m => m.result.winnerId === away.id).length

                save.newsFeed.unshift({
                    id: `rivalry_${upcomingRivalry.id}_${Math.floor(rng.next() * 1_000_000_000).toString(36)}`,
                    title: `Classic Clash: ${home.name} vs ${away.name}`,
                    content: `Two titans collide this week! Historical record: ${home.name} ${homeWins} - ${awayWins} ${away.name}. Fans are hyped for this blockbuster matchup.`,
                    category: "MATCH",
                    teamId: home.id,
                    week: save.currentWeek,
                    engagement: { likes: 3000 + Math.floor(rng.next() * 2000), views: 75000 + Math.floor(rng.next() * 25000) }
                })
            }
        }

        // 7. Player Milestones (Career achievements based on match stats)
        if (playerTeam && rng.next() < 0.1) { // 10% chance per week
            const roster = save.players.filter(p => playerTeam.rosterIds.includes(p.id))
            for (const player of roster) {
                // Use totalKills from player stats if available
                const totalKills = player.totalKills || 0
                const milestones = [
                    { threshold: 500, name: "500 Tournament Kills" },
                    { threshold: 1000, name: "1,000 Tournament Kills" },
                    { threshold: 2500, name: "2,500 Tournament Kills" }
                ]

                for (const milestone of milestones) {
                    if (totalKills >= milestone.threshold && totalKills < milestone.threshold + 100) {
                        save.newsFeed.unshift({
                            id: `milestone_${player.id}_${milestone.threshold}_${Math.floor(rng.next() * 1_000_000_000).toString(36)}`,
                            title: `Milestone: ${player.nickname} hits ${milestone.name}!`,
                            content: `${player.nickname} has reached an incredible ${milestone.name} in their professional career. A testament to consistency and skill.`,
                            category: "ACHIEVEMENT",
                            playerId: player.id,
                            teamId: playerTeam.id,
                            week: save.currentWeek,
                            engagement: { likes: 1500, views: 25000 }
                        })
                        break
                    }
                }
            }
        }
    }

    private compactPersistentState(save: GameSave): void {
        if (save.eventsLog.length > ARRAY_CAPS.eventsLog) {
            save.eventsLog = save.eventsLog.slice(0, ARRAY_CAPS.eventsLog)
        }

        if (save.completedMatches.length > ARRAY_CAPS.completedMatches) {
            save.completedMatches = save.completedMatches.slice(-ARRAY_CAPS.completedMatches)
        }

        if (save.financeLedger.length > ARRAY_CAPS.financeLedger) {
            save.financeLedger = save.financeLedger.slice(-ARRAY_CAPS.financeLedger)
        }

        if (save.transferHistory.length > ARRAY_CAPS.transferHistory) {
            save.transferHistory = save.transferHistory.slice(-ARRAY_CAPS.transferHistory)
        }

        if (save.newsFeed.length > ARRAY_CAPS.newsFeed) {
            save.newsFeed = save.newsFeed.slice(0, ARRAY_CAPS.newsFeed)
        }

        if (save.tournamentQualifications.length > 0) {
            save.tournamentQualifications = dedupeQualifications(
                save.tournamentQualifications,
                save.currentWeek
            )
            if (save.tournamentQualifications.length > ARRAY_CAPS.tournamentQualifications) {
                save.tournamentQualifications = save.tournamentQualifications.slice(-ARRAY_CAPS.tournamentQualifications)
            }
        }

        const knownEventIds = new Set(save.eventsLog.map(e => e.id))
        save.acknowledgedEventIds = save.acknowledgedEventIds.filter(id => knownEventIds.has(id))
    }
}

export const atomicWeekProcessor = new AtomicWeekProcessor(saveManager)
