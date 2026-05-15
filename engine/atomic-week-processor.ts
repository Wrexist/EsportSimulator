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
    StaffSaveData,
    getResumeStep,
    CURRENT_SAVE_VERSION,
    repairSave,
} from "./save-types"
import { SponsorGenerator } from "./economy-manager"
import { MatchEngine } from "./match-engine"
import { perfTrace } from "./perf-trace"
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
import { compactPersistentState } from "./processors/save-compactor"
import {
    isTerminalBracketStage as isTerminalBracketStageFn,
    hasTerminalTournamentCompletion as hasTerminalTournamentCompletionFn,
} from "./processors/tournament-completion"
import { processFanbaseGrowth as processFanbaseGrowthFn } from "./processors/fanbase-growth"
import { processScoutingMissions as processScoutingMissionsFn } from "./processors/scouting-mission-processor"
import { processWeeklySponsorGoals as processWeeklySponsorGoalsFn } from "./processors/sponsor-goals-processor"
import { applyMatchSponsorGoalProgress as applyMatchSponsorGoalProgressFn } from "./processors/match-sponsor-goals"
import { awardCircuitPoints as awardCircuitPointsFn } from "./processors/circuit-points-awarder"
import { resetStaleTournamentState } from "./processors/tournament-state-cleanup"
import { getTacticalBonus as getTacticalBonusFn } from "./processors/match-tactical-bonus"
import { detectAchievementFlags } from "./processors/match-achievement-flags"
import { processForfeitMatch } from "./processors/match-forfeit"
import { processMatchWeaponMastery } from "./processors/match-weapon-mastery"
import { applyMatchManagerXP } from "./processors/match-manager-xp"
import { generateNarrativeNews as generateNarrativeNewsFn } from "./processors/narrative-news"
import { processAIWorldLogic as processAIWorldLogicFn } from "./processors/ai-world-processor"
import { updateStandings as updateStandingsFn } from "./processors/standings-processor"
import { LeagueEngine } from "./league-engine"
import { FULL_TOURNAMENT_CALENDAR, TournamentDefinition, CIRCUIT_POINTS } from "@/data/tournament-calendar"
import { TournamentManager } from "./tournament-manager"
import { JobOfferGenerator } from "./job-offer-generator"
import { QualificationEngine } from "./tournament-qualification"
import { LEGENDARY_PLAYERS } from "./legendary-players-data"
import { generateAnnualTop20, shouldTriggerAwards, addHLTVAwardsEvent } from "./hltv-awards-engine"
import { buildQualificationGraph, isQualificationForTournament } from "./circuit-engine"
import { ManagerProgression } from "./manager-progression"
import { StaffGenerator } from "./staff-generator"
import { isSeasonEnd, getSeasonNumber, updateCareerStats, migrateCareerStats } from "./career-stats"
import { buildSaveIndexes, type SaveIndexes } from "@/store/indexes"

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
        const __perfT0 = perfTrace.enabled ? perfTrace.now() : 0
        const __perfWeek = save.currentWeek + 1
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

        // Pre-tick checkpoint. The authoritative end-of-last-week save is
        // already on disk as the primary key (written by the previous tick's
        // final saveGame). A cheap checkpoint is enough to mark "tick in
        // progress" without paying for clone/hash/rotate/verify.
        await this.saveManager.saveGameCheckpoint(save)

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
                const __s = perfTrace.stepsEnabled ? perfTrace.now() : 0
                TrainingProcessor.processTraining(save, config.trainingFocus, idx)
                TrainingManager.processWeeklyTraining(save) // Process Role Training
                perfTrace.step("step.1_training", __s)
                await this.saveManager.markStepComplete(transaction, "trainingComplete")
                const __sv = perfTrace.stepsEnabled ? perfTrace.now() : 0
                await this.saveManager.saveGameCheckpoint(save)
                perfTrace.step("step.save", __sv)
            }

            // ===== STEP 2: Fatigue Recovery =====
            if (resumeStep <= 2) {
                debugLog(`[Week ${save.currentWeek}] Step 2: Fatigue recovery...`)
                const __s = perfTrace.stepsEnabled ? perfTrace.now() : 0
                TrainingProcessor.processFatigueRecovery(save, rng, idx)
                perfTrace.step("step.2_fatigue", __s)
                await this.saveManager.markStepComplete(transaction, "fatigueRecoveryComplete")
                const __sv = perfTrace.stepsEnabled ? perfTrace.now() : 0
                await this.saveManager.saveGameCheckpoint(save)
                perfTrace.step("step.save", __sv)
            }

            // ===== STEP 3: Injury Checks =====
            if (resumeStep <= 3) {
                debugLog(`[Week ${save.currentWeek}] Step 3: Injury checks...`)
                const __s = perfTrace.stepsEnabled ? perfTrace.now() : 0
                result.injuriesOccurred = EventProcessor.processInjuryChecks(save, rng)
                perfTrace.step("step.3_injuries", __s)
                await this.saveManager.markStepComplete(transaction, "injuryChecksComplete")
                const __sv = perfTrace.stepsEnabled ? perfTrace.now() : 0
                await this.saveManager.saveGameCheckpoint(save)
                perfTrace.step("step.save", __sv)
            }

            // ===== STEP 4: Finance Processing =====
            if (resumeStep <= 4) {
                debugLog(`[Week ${save.currentWeek}] Step 4: Finance...`)
                const __s = perfTrace.stepsEnabled ? perfTrace.now() : 0
                FinanceProcessor.processContractExpiry(save, config.playerTeamId) // Process expiring contracts
                result.financeSummary = FinanceProcessor.processFinance(save, config.playerTeamId)
                perfTrace.step("step.4_finance", __s)
                await this.saveManager.markStepComplete(transaction, "financeComplete")
                const __sv = perfTrace.stepsEnabled ? perfTrace.now() : 0
                await this.saveManager.saveGameCheckpoint(save)
                perfTrace.step("step.save", __sv)
            }

            // ===== STEP 4.5: Tournament Processing (MOVED BEFORE MATCHES) =====
            // This must run before matches so tournament matches are scheduled first
            if (resumeStep <= 5) {
                debugLog(`[Week ${save.currentWeek}] Step 4.5: Tournament Processing...`)
                const __s = perfTrace.stepsEnabled ? perfTrace.now() : 0
                this.processTournaments(save, config.playerTeamId, rng, idx, eventIdSet, ledgerIdSet)
                perfTrace.step("step.5_tournaments", __s)
                await this.saveManager.markStepComplete(transaction, "tournamentProcessingComplete")
                const __sv = perfTrace.stepsEnabled ? perfTrace.now() : 0
                await this.saveManager.saveGameCheckpoint(save)
                perfTrace.step("step.save", __sv)
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

                const __s = perfTrace.stepsEnabled ? perfTrace.now() : 0
                result.matchesPlayed = await this.processMatches(save, transaction, rng, config.playerTeamId, idx, eventIdSet, ledgerIdSet)
                perfTrace.step("step.6_matches", __s)
                await this.saveManager.markStepComplete(transaction, "matchSimulationComplete")
                const __sv = perfTrace.stepsEnabled ? perfTrace.now() : 0
                await this.saveManager.saveGameCheckpoint(save)
                perfTrace.step("step.save", __sv)
            }

            // ===== STEP 6: Standings Update =====
            if (resumeStep <= 7) {
                debugLog(`[Week ${save.currentWeek}] Step 6: Standings...`)
                const __s = perfTrace.stepsEnabled ? perfTrace.now() : 0
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

                perfTrace.step("step.7_standings", __s)
                await this.saveManager.markStepComplete(transaction, "standingsUpdateComplete")
                const __sv = perfTrace.stepsEnabled ? perfTrace.now() : 0
                await this.saveManager.saveGameCheckpoint(save)
                perfTrace.step("step.save", __sv)
            }

            // ===== STEP 7: Event Generation =====
            if (resumeStep <= 8) {
                debugLog(`[Week ${save.currentWeek}] Step 7: Events...`)
                const __s = perfTrace.stepsEnabled ? perfTrace.now() : 0
                result.eventsGenerated = await EventProcessor.generateEvents(save, transaction, rng, config.playerTeamId, this.saveManager)

                // Phase 23: Legend Events (Mentorship, Coach Opportunities)
                LegendEventsManager.processWeeklyLegendEvents(save, config.playerTeamId, rng)

                // Modern events: media interviews, fan milestones, transfer rumors, birthdays, rivalries, equipment deals
                EventsManager.generateModernEvents(save, rng)

                // Phase 9: Check scouting mission completion
                this.processScoutingMissions(save, idx)

                // Phase 60: Job Market - Generate job offers based on performance
                JobOfferGenerator.processWeeklyJobOffers(save, rng)

                perfTrace.step("step.8_events", __s)
                await this.saveManager.markStepComplete(transaction, "eventGenerationComplete")
                const __sv = perfTrace.stepsEnabled ? perfTrace.now() : 0
                await this.saveManager.saveGameCheckpoint(save)
                perfTrace.step("step.save", __sv)
            }

            // ===== STEP 7.5: AI World Logic (Phase 19/24) =====
            if (resumeStep <= 9) {
                debugLog(`[Week ${save.currentWeek}] Step 7.5: World Logic (AI / Fans)...`)
                const __s = perfTrace.stepsEnabled ? perfTrace.now() : 0
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

                perfTrace.step("step.9_worldAI", __s)
                await this.saveManager.markStepComplete(transaction, "worldLogicComplete")
                const __sv = perfTrace.stepsEnabled ? perfTrace.now() : 0
                await this.saveManager.saveGameCheckpoint(save)
                perfTrace.step("step.save", __sv)
            }

            // ===== STEP 8: Rest Day Processing =====
            if (resumeStep <= 10) {
                debugLog(`[Week ${save.currentWeek}] Step 8: Rest days...`)
                const __s = perfTrace.stepsEnabled ? perfTrace.now() : 0
                TrainingProcessor.processRestDays(save, config.playerTeamId)
                perfTrace.step("step.10_restDays", __s)
                await this.saveManager.markStepComplete(transaction, "restDayProcessingComplete")
                const __sv = perfTrace.stepsEnabled ? perfTrace.now() : 0
                await this.saveManager.saveGameCheckpoint(save)
                perfTrace.step("step.save", __sv)
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
                }

                // Manager level scales the player team's max training slots —
                // 10 baseline + 1 per 5 manager levels, capped at 14 at L20.
                // This is the player's one tangible reward for levelling:
                // each milestone unlocks another weekly training slot for
                // the roster. Synced every week so existing saves heal
                // naturally on first tick after this lands.
                const playerTeam = save.teams.find(t => t.id === config.playerTeamId)
                const derivedMaxSlots = 10 + Math.floor((save.managerDetails.level || 1) / 5)
                const oldMaxSlots = playerTeam?.maxTrainingSlots ?? 10
                const slotIncreased = playerTeam && oldMaxSlots < derivedMaxSlots
                if (playerTeam && slotIncreased) {
                    playerTeam.maxTrainingSlots = derivedMaxSlots
                }

                if (newLevel > currentLevel) {
                    save.eventsLog.push({
                        id: `mgr_lvl_${save.currentWeek}_${Math.floor(rng.next() * 1_000_000_000).toString(36)}`,
                        type: "CAREER_UPDATE",
                        week: save.currentWeek,
                        acknowledged: false,
                        data: {
                            title: "Manager Promotion!",
                            message: slotIncreased
                                ? `You have reached Manager Level ${newLevel}. Max weekly training slots increased to ${derivedMaxSlots}.`
                                : `You have reached Manager Level ${newLevel}.`,
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
            compactPersistentState(save)

            // Week was already incremented at start of processWeek
            save.lastRngSeed = rng.getState()

            // Final save
            const __sv = perfTrace.stepsEnabled ? perfTrace.now() : 0
            const saveResult = await this.saveManager.saveGame(save)
            perfTrace.step("step.save", __sv)
            if (!saveResult.success) {
                throw new Error(saveResult.error || "Failed to save")
            }

            // Clear transaction
            await this.saveManager.completeWeekTick(save.saveId)

            result.success = true
            if (perfTrace.enabled) {
                perfTrace.record("processWeek", __perfT0, {
                    week: __perfWeek,
                    matches: result.matchesPlayed,
                    events: result.eventsGenerated,
                })
            }
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

            if (perfTrace.enabled) {
                perfTrace.record("processWeek", __perfT0, {
                    week: __perfWeek,
                    matches: 0,
                    failed: 1,
                })
            }
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

        // Index staff by teamId once for this tick so the per-match
        // save.staff.filter(s => s.teamId === …) scans (3 per match — twice for
        // getTacticalBonus + once each for home/away roster) become O(1) lookups.
        const staffByTeamId = new Map<string, StaffSaveData[]>()
        for (const s of save.staff) {
            const teamId = s.teamId
            if (!teamId) continue
            const list = staffByTeamId.get(teamId)
            if (list) list.push(s)
            else staffByTeamId.set(teamId, [s])
        }

        let matchesPlayed = 0

        // Collect IDs of matches processed this week and filter scheduledMatches
        // once at the end, instead of rebuilding the array on every iteration
        // (which was O(matches × scheduled) — ~50 × 1000 = 50k element touches/week).
        const removedMatchIds = new Set<string>()

        for (const match of weekMatches) {
            const homeTeam = idx?.teamIndex.get(match.homeTeamId) ?? save.teams.find(t => t.id === match.homeTeamId)
            const awayTeam = idx?.teamIndex.get(match.awayTeamId) ?? save.teams.find(t => t.id === match.awayTeamId)
            if (!homeTeam || !awayTeam) continue

            // Select active 5, skipping injured players and pulling from bench.
            // Defensive `|| []` against corrupt/legacy saves where rosterIds
            // could be missing despite the type contract.
            const selectActivePlayers = (rosterIds: string[] | undefined) => {
                const available = (rosterIds || [])
                    .map(id => idx?.playerIndex.get(id) ?? save.players.find(p => p.id === id))
                    .filter(p => p && !p.injury) as typeof save.players
                return available.slice(0, 5)
            }

            const homePlayers = selectActivePlayers(homeTeam.rosterIds)
            const awayPlayers = selectActivePlayers(awayTeam.rosterIds)

            if (homePlayers.length < 5 || awayPlayers.length < 5) {
                // Forfeit branch extracted to processors/match-forfeit.ts
                // (Phase M7). Returns the matchesPlayed delta.
                const { matchesPlayed: forfeitDelta } = processForfeitMatch({
                    save, match, homeTeam, awayTeam, homePlayers, awayPlayers,
                    playerTeamId, removedMatchIds,
                })
                matchesPlayed += forfeitDelta
                continue
            }

            // Tactical bonus extracted to processors/match-tactical-bonus.ts
            // (Phase M5). Takes pre-indexed staff for the team + both
            // playstyles; returns analyst-stat-sum bonus + RPS counter bonus.
            const homeBonus = getTacticalBonusFn(staffByTeamId.get(homeTeam.id), homeTeam.playstyle, awayTeam.playstyle)
            const awayBonus = getTacticalBonusFn(staffByTeamId.get(awayTeam.id), awayTeam.playstyle, homeTeam.playstyle)

            // Collect team staff for talent bonus application in match sim
            const homeTeamStaff = staffByTeamId.get(homeTeam.id) ?? []
            const awayTeamStaff = staffByTeamId.get(awayTeam.id) ?? []

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

            // Weapon-mastery XP aggregation + application extracted to
            // processors/match-weapon-mastery.ts (Phase M8). The function
            // walks result.maps[].rounds[].kills[] once, buckets by weapon
            // type, then calls WeaponMasteryManager.processMatchWeaponXP
            // for every player with kills.
            processMatchWeaponMastery(save, result, idx)

            // Manager XP + win/loss + reputation extracted to
            // processors/match-manager-xp.ts (Phase M9). Analyst
            // "xp_gain" talent multiplier applied internally.
            applyMatchManagerXP(save, match, result, playerTeamId)

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
            removedMatchIds.add(match.id)

            // Achievement flag detection extracted to
            // processors/match-achievement-flags.ts (Phase M6). Returns
            // comeback + underdog flags written onto the completed match.
            const { comebackWin, underdogWin } = detectAchievementFlags(result, homeTeam, awayTeam)
            if (comebackWin) completedMatch._comebackWin = true
            if (underdogWin) completedMatch._underdogWin = true

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

                // Calculate matches played for calibration (K=50 for first 10 matches).
                // Bug fix: completedMatches.push(...) above included this match for
                // both teams, so the previous count was off-by-one — a team's 10th
                // real match read as match 11, ending the calibration window early.
                // Subtract 1 because the current match is now in the history for both
                // sides (this is also faster than re-scanning the whole array).
                const getMatchesPlayed = (tid: string) =>
                    save.completedMatches.filter(m => m.homeTeamId === tid || m.awayTeamId === tid).length

                const winnerMatches = Math.max(0, getMatchesPlayed(winnerId) - 1)
                const loserMatches = Math.max(0, getMatchesPlayed(loserId) - 1)

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

        // Drop processed matches from scheduledMatches in a single pass
        // (replaces the per-iteration `save.scheduledMatches = …filter(…)`).
        if (removedMatchIds.size > 0) {
            save.scheduledMatches = save.scheduledMatches.filter(m => !removedMatchIds.has(m.id))
        }

        return matchesPlayed
    }

    private isTerminalBracketStage(stage: string): boolean {
        return isTerminalBracketStageFn(stage)
    }

    private hasTerminalTournamentCompletion(save: GameSave, tournament: TournamentSaveData): boolean {
        return hasTerminalTournamentCompletionFn(save, tournament)
    }

    private updateStandings(save: GameSave, idx?: SaveIndexes, eventIdSet?: Set<string>, ledgerIdSet?: Set<string>): void {
        updateStandingsFn(save, idx, eventIdSet, ledgerIdSet)
    }

    // generateEvents moved to processors/event-processor.ts

    /**
     * Phase 9: Process scouting missions - complete any that are done
     */
    private processScoutingMissions(save: GameSave, idx?: SaveIndexes): void {
        processScoutingMissionsFn(save, idx)
    }
    private processAIWorldLogic(save: GameSave, playerTeamId: string, rng: SeededRNG): void {
        processAIWorldLogicFn(save, playerTeamId, rng)
    }

    /**
     * Phase 24: Process performance-based follower growth
     */
    private processFanbaseGrowth(save: GameSave, rng: SeededRNG): void {
        processFanbaseGrowthFn(save, rng)
    }

    // Per-match sponsor goal progress extracted to
    // engine/processors/match-sponsor-goals.ts (Phase M2). Facade kept
    // so processMatches still calls this.applyMatchSponsorGoalProgress.
    private applyMatchSponsorGoalProgress(
        save: GameSave,
        team: TeamSaveData,
        wonMatch: boolean,
        mapsWon: number,
        matchId: string,
        eventIdSet?: Set<string>,
        ledgerIdSet?: Set<string>
    ): void {
        applyMatchSponsorGoalProgressFn(save, team, wonMatch, mapsWon, matchId, eventIdSet, ledgerIdSet)
    }

    /**
     * Process sponsor contract lifecycle and weekly sponsor goals exactly once per week.
     */
    private processWeeklySponsorGoals(save: GameSave, eventIdSet?: Set<string>, ledgerIdSet?: Set<string>): void {
        processWeeklySponsorGoalsFn(save, eventIdSet, ledgerIdSet)
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

        // Reset stale future tournament state (Phase M4).
        resetStaleTournamentState(save)

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

    // Circuit-points + trophy awarding extracted to
    // engine/processors/circuit-points-awarder.ts (Phase M3).
    private awardPoints(save: GameSave, teamId: string, points: number, tournamentName: string, placement: number = 0, idx?: SaveIndexes) {
        awardCircuitPointsFn(save, teamId, points, tournamentName, placement, idx)
        debugLog(`[Circuit] Awarded ${points} points to team ${teamId} for ${tournamentName} (P${placement})`)
    }

    private generateNarrativeNews(save: GameSave, rng: SeededRNG, idx?: SaveIndexes): void {
        generateNarrativeNewsFn(save, rng, idx)
    }

}

export const atomicWeekProcessor = new AtomicWeekProcessor(saveManager)
