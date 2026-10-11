import { generateCareerDecision } from "./career-decisions"
import { expireDecisions, normalizeDecisions } from "./decision-deadlines"
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
import { PlayerLifecycleManager, applyFormResult, applyMoraleResult } from "./player-lifecycle"
import { EconomyEngine } from "./economy-engine"
import { LegendEventsManager } from "./legend-events-manager"
import { EventsManager } from "./events-manager"
import { updateRivalries, getRivalryBetween, derbyMultiplier } from "./history-tracker"
import { psychologistMoraleDampen } from "./staff-specialization"
import { MatchAnalyzer } from "./match-analyzer"
import { TrainingManager } from "./training-manager"
import { TrainingProcessor } from "./processors/training-processor"
import { AI_SQUAD_TUNING } from "@/lib/balance-tuning"
import { FinanceProcessor } from "./processors/finance-processor"
import { EventProcessor } from "./processors/event-processor"
import { compactPersistentState } from "./processors/save-compactor"
import { garbageCollectRetiredPlayers } from "./processors/player-gc"
import {
    isTerminalBracketStage as isTerminalBracketStageFn,
    hasTerminalTournamentCompletion as hasTerminalTournamentCompletionFn,
} from "./processors/tournament-completion"
import { processFanbaseGrowth as processFanbaseGrowthFn } from "./processors/fanbase-growth"
import { processScoutingMissions as processScoutingMissionsFn } from "./processors/scouting-mission-processor"
import { processWeeklySponsorGoals as processWeeklySponsorGoalsFn } from "./processors/sponsor-goals-processor"
import { applyMatchSponsorGoalProgress as applyMatchSponsorGoalProgressFn } from "./processors/match-sponsor-goals"
import { resetStaleTournamentState } from "./processors/tournament-state-cleanup"
import { detectAchievementFlags } from "./processors/match-achievement-flags"
import { processForfeitMatch } from "./processors/match-forfeit"
import { processMatchWeaponMastery } from "./processors/match-weapon-mastery"
import { applyMatchManagerXP } from "./processors/match-manager-xp"
import { settlePlayerContractBonuses } from "./processors/player-contract-bonuses"
import { generateNarrativeNews as generateNarrativeNewsFn } from "./processors/narrative-news"
import { processDressingRoom } from "./processors/dressing-room"
import { assignPersonalities, isOfficialMatch, lineupDefeatShield, playerResultMorale, recordAppearances } from "./personality"
import { processAIWorldLogic as processAIWorldLogicFn } from "./processors/ai-world-processor"
import { updateStandings as updateStandingsFn } from "./processors/standings-processor"
import { LeagueEngine } from "./league-engine"
import { applyTierBands, tiersAreBanded } from "./world-ranking"
import { competitionLabel, rankMovementEntries } from "./ranking-report"
import { FULL_TOURNAMENT_CALENDAR, TournamentDefinition } from "@/data/tournament-calendar"
import { TournamentManager } from "./tournament-manager"
import { JobOfferGenerator } from "./job-offer-generator"
import { QualificationEngine, CircuitPointsManager } from "./tournament-qualification"
import { LEGENDARY_PLAYERS } from "./legendary-players-data"
import { buildAnnualAwards, shouldTriggerAwards, addProAwardsEvent } from "./pro-awards-engine"
import { recordOfficialMatch, recordTierMove } from "./official-stats"
import { closeSeason } from "./season-honours"
import { closeStint } from "./manager-timeline"
import { buildQualificationGraph, isQualificationForTournament } from "./circuit-engine"
import { ManagerProgression } from "./manager-progression"
import { StaffGenerator } from "./staff-generator"
import { isSeasonEnd, getSeasonNumber, updateCareerStats, migrateCareerStats } from "./career-stats"
import { processWeeklyBoard } from "./board-expectations"
import { drawDueLeagueSplit, processLeagueWeek } from "./season/regional-league"
import { processAIAdministration } from "./season/club-finances"
import { ensureAIRosterViability } from "./ai/club-budget"
import { buildSaveIndexes, type SaveIndexes } from "@/store/indexes"
import { WeekChangeRecorder, sideScore, type ChangeCause, type ChangeEntry, type CauseResolver } from "@/lib/week-changes"

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
    /**
     * What changed for the managed club this tick and why, one entry per
     * (subject, value, cause). Additive and transient: the store folds it
     * into the weekly report; it is never written to the save as-is.
     */
    changes?: ChangeEntry[]
}

/** Title-ish text of an event, for report causes. */
function eventCauseLabel(event: GameEventSaveData): string {
    const d = (event.data ?? {}) as { title?: unknown; headline?: unknown; description?: unknown; message?: unknown }
    const text = [d.title, d.headline, d.description, d.message].find(v => typeof v === "string" && v.trim()) as string | undefined
    const clean = (text ?? String(event.type)).replace(/[^\p{L}\p{N}\s.,:;'!?()&+\-–—$%#/]/gu, "").trim()
    return clean.length > 70 ? `${clean.slice(0, 67)}...` : clean
}

// ===== DEBUG =====
// Routes through lib/logger so dev/prod gating + history capture (used by
// the in-game debug panel) work uniformly with the rest of the engine
// instead of side-channelling direct console.log calls.
const AWP_DEBUG = process.env.NODE_ENV === "development"
const debugLog = (...args: any[]) => {
    if (!AWP_DEBUG) return
    // Logger.debug only emits when VERBOSE_LOGGING=true; for ambient
    // development logging fall through to console.log so existing
    // workflows aren't broken, but explicitly tag the namespace.
    if (typeof window !== "undefined" && process.env.VERBOSE_LOGGING === "true") {
        // eslint-disable-next-line no-console
        console.log("[AWP]", ...args)
    } else {
        // eslint-disable-next-line no-console
        console.log("[AWP]", ...args)
    }
}

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

        // Phase O perf fix — intra-tick checkpoints removed.
        //
        // Previously this processor wrote save state to storage 11 times
        // per tick (pre-tick + after each of 10 steps). JSON.stringify
        // of a season-50 save costs ~88ms; 11 × 88ms = ~1 second wasted
        // per tick on serialization alone. Micro-bench confirmed this
        // was 3,400× more expensive than the actual storage write.
        //
        // New model: previous tick's final saveGame() is the durable
        // pre-tick state. Mid-tick crash = re-run the entire tick from
        // step 1; the save in memory at the time of the crash is lost,
        // but the previous tick's save on disk + the captured RNG seed
        // (in save.lastRngSeed) deterministically produce the same end
        // state on retry. We trade rare crash-recovery cost (one tick
        // re-execution) for cheap normal-path ticks.
        //
        // On detecting an in-progress transaction, discard its
        // step-complete bookkeeping. The match-loop's completedMatchIds
        // is also cleared so resumed ticks re-simulate any matches that
        // weren't yet committed to save.completedMatches.
        let transaction = await this.saveManager.getIncompleteTransaction(save.saveId)
        const tickCommitted =
            transaction != null &&
            (save.lastCommittedWeekTick ?? 0) >= transaction.weekNumber
        if (transaction && tickCommitted) {
            // Post-commit crash: save.lastCommittedWeekTick is written into the
            // same atomic saveGame() that commits the tick, so its presence
            // proves the final save landed on disk but completeWeekTick()
            // didn't run before the process died. The week is DONE —
            // re-running it would double-charge salaries/contract expiry,
            // re-apply training/fatigue/morale, re-simulate matches, and
            // re-age every player at a season boundary. Clear the committed
            // transaction and begin a FRESH tick for the next week.
            // (weekNumber comparisons can't distinguish this case: the
            // in-memory increment guard makes weekNumber === currentWeek
            // during a mid-tick crash too.)
            debugLog(`Week tick ${transaction.weekNumber} already committed on disk; clearing stale transaction and starting a fresh tick`)
            await this.saveManager.completeWeekTick(save.saveId)
            transaction = await this.saveManager.beginWeekTick(save)
        } else if (
            transaction &&
            (
                transaction.weekNumber === save.currentWeek ||
                transaction.weekNumber === save.currentWeek + 1
            )
        ) {
            // Pre-commit crash: the tick died before its final saveGame()
            // committed (no lastCommittedWeekTick marker for this week).
            // weekNumber === currentWeek + 1 is the on-disk resume (save
            // still holds the pre-tick week); weekNumber === currentWeek is
            // the in-memory resume (the increment guard already advanced the
            // live save object before the crash). Either way, discard the
            // step-complete bookkeeping and re-run the whole tick from step 1;
            // the increment guard below advances currentWeek exactly once.
            // completedMatchIds is also cleared so resumed ticks re-simulate
            // any matches not yet committed to save.completedMatches.
            debugLog(`Resuming pre-commit tick at week ${save.currentWeek}; re-running from step 1`)
            transaction.trainingComplete = false
            transaction.fatigueRecoveryComplete = false
            transaction.injuryChecksComplete = false
            transaction.financeComplete = false
            transaction.tournamentProcessingComplete = false
            transaction.matchSimulationComplete = false
            transaction.standingsUpdateComplete = false
            transaction.eventGenerationComplete = false
            transaction.worldLogicComplete = false
            transaction.restDayProcessingComplete = false
            transaction.completedMatchIds = []
            transaction.generatedEventIds = []
        } else {
            transaction = await this.saveManager.beginWeekTick(save)
        }
        const resumeStep = 1 // Always re-run from start; resume is whole-tick, not step-level.

        // Build O(1) lookup indexes for this tick (rebuilt once, used throughout)
        let idx: SaveIndexes

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
            // Phase 5.2 safety net: any player created without a personality
            // (older code paths, mods) gets his deterministic one now.
            assignPersonalities(save.players)
            // Weekly report: snapshot the managed club between steps and
            // attribute each movement to the step that caused it. Reads only;
            // never consumes RNG, so the tick stays deterministic.
            const changes = new WeekChangeRecorder(config.playerTeamId)
            changes.begin(save)
            const mark = (cause: CauseResolver) => changes.mark(save, cause)

            // Unanswered decisions (Phase 4.9): a request whose deadline has
            // passed gets the default it stated, through the same effects as
            // answering it by hand; the report names it "Unanswered: …".
            expireDecisions(save, d => mark({ type: "decision", label: `Unanswered: ${d.label}` }))

            // Expired players/staff cannot train, receive wages, or appear in
            // cached match rosters. Build the indexes from the surviving contracts.
            FinanceProcessor.processContractExpiry(save, config.playerTeamId)
            mark({ type: "contract", label: "Contract expired" })
            // Roster invariant (Phase 4.6): an AI club whose contracts just
            // ran out fills to five before this week's fixtures.
            ensureAIRosterViability(save, config.playerTeamId)
            idx = buildSaveIndexes(save)

            // ===== STEP 1: Training Effects =====
            if (resumeStep <= 1) {
                debugLog(`[Week ${save.currentWeek}] Step 1: Training...`)
                const __s = perfTrace.stepsEnabled ? perfTrace.now() : 0
                // AI clubs follow the same default weekly regimen as the managed club
                // (AI_SQUAD_TUNING.TRAINING_*), through the same processor: staff and
                // facility modifiers, potential cap and training fatigue included.
                const weeklyTraining = new Map(config.trainingFocus)
                for (const team of save.teams) {
                    if (team.id !== config.playerTeamId && !weeklyTraining.has(team.id)) {
                        weeklyTraining.set(team.id, { focus: AI_SQUAD_TUNING.TRAINING_FOCUS as TrainingFocus, intensity: AI_SQUAD_TUNING.TRAINING_INTENSITY })
                    }
                }
                const trainingCauses = TrainingProcessor.describeCauses(save, config.playerTeamId, weeklyTraining.get(config.playerTeamId), idx)
                TrainingProcessor.processTraining(save, weeklyTraining, idx)
                TrainingManager.processWeeklyTraining(save) // Process Role Training
                mark(e => trainingCauses.get(e.subjectId) ?? { type: "training", label: "Training" })
                perfTrace.step("step.1_training", __s)
                await this.saveManager.markStepComplete(transaction, "trainingComplete")
            }

            // ===== STEP 2: Fatigue Recovery =====
            if (resumeStep <= 2) {
                debugLog(`[Week ${save.currentWeek}] Step 2: Fatigue recovery...`)
                const __s = perfTrace.stepsEnabled ? perfTrace.now() : 0
                const recoveryCause = TrainingProcessor.describeRecovery(save, config.playerTeamId, idx)
                TrainingProcessor.processFatigueRecovery(save, rng, idx)
                mark(e => {
                    const age = idx.playerIndex.get(e.subjectId)?.age
                    if (e.kind === "attribute") return e.delta > 0
                        ? { type: "development", label: `Natural growth${age ? ` (age ${age})` : ""}` }
                        : { type: "age", label: `Age decline${age ? ` (age ${age})` : ""}` }
                    if (e.kind === "fatigue" || e.kind === "energy") return recoveryCause
                    if (e.kind === "morale" || e.kind === "form") return { type: "decay", label: "Drift toward baseline" }
                    return { type: "other", label: "Weekly update" }
                })
                perfTrace.step("step.2_fatigue", __s)
                await this.saveManager.markStepComplete(transaction, "fatigueRecoveryComplete")
            }

            // ===== STEP 3: Injury Checks =====
            if (resumeStep <= 3) {
                debugLog(`[Week ${save.currentWeek}] Step 3: Injury checks...`)
                const __s = perfTrace.stepsEnabled ? perfTrace.now() : 0
                result.injuriesOccurred = EventProcessor.processInjuryChecks(save, rng)
                mark(e => e.kind === "injury" && e.delta > 0
                    ? { type: "injury", label: "Weekly injury roll (risk rises with fatigue)" }
                    : { type: "recovery", label: "Rehab" })
                perfTrace.step("step.3_injuries", __s)
                await this.saveManager.markStepComplete(transaction, "injuryChecksComplete")
            }

            // ===== STEP 4: Finance Processing =====
            if (resumeStep <= 4) {
                debugLog(`[Week ${save.currentWeek}] Step 4: Finance...`)
                const __s = perfTrace.stepsEnabled ? perfTrace.now() : 0
                result.financeSummary = FinanceProcessor.processFinance(save, config.playerTeamId, eventIdSet, ledgerIdSet)
                mark(e => e.kind === "morale"
                    ? { type: "finance", label: "Club finances in crisis" }
                    : { type: "finance", label: "Weekly settlement" })
                perfTrace.step("step.4_finance", __s)
                await this.saveManager.markStepComplete(transaction, "financeComplete")
            }

            // ===== STEP 4.5: Tournament Processing (MOVED BEFORE MATCHES) =====
            // This must run before matches so tournament matches are scheduled first
            if (resumeStep <= 5) {
                debugLog(`[Week ${save.currentWeek}] Step 4.5: Tournament Processing...`)
                const __s = perfTrace.stepsEnabled ? perfTrace.now() : 0
                this.processTournaments(save, config.playerTeamId, rng, idx, eventIdSet, ledgerIdSet)
                mark({ type: "world", label: "Tournament updates" })
                perfTrace.step("step.5_tournaments", __s)
                await this.saveManager.markStepComplete(transaction, "tournamentProcessingComplete")
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
                result.matchesPlayed = await this.processMatches(save, transaction, rng, config.playerTeamId, idx, eventIdSet, ledgerIdSet, mark)
                mark({ type: "world", label: "Other results" })
                perfTrace.step("step.6_matches", __s)
                await this.saveManager.markStepComplete(transaction, "matchSimulationComplete")
            }

            // ===== STEP 6: Standings Update =====
            if (resumeStep <= 7) {
                debugLog(`[Week ${save.currentWeek}] Step 6: Standings...`)
                const __s = perfTrace.stepsEnabled ? perfTrace.now() : 0
                this.updateStandings(save, idx, eventIdSet, ledgerIdSet)
                mark(e => e.kind === "ranking"
                    ? { type: "world", label: "Weekly ranking update" }
                    : { type: "world", label: "Tournament standings" })

                // Regional league: read this week's results into the tables;
                // a finished division pays its split prizes (Phase 4.4).
                processLeagueWeek(save, config.playerTeamId, ledgerIdSet, eventIdSet)
                mark(e => e.kind === "reputation" ? { type: "world", label: "League title" } : { type: "world", label: "League table" })

                // League tiers are world-rank bands set at season end (Phase
                // 4.8); a save whose tiers came from the old Elo thresholds is
                // banded once here. (A weekly Elo sync made tiers inflate.)
                if (!tiersAreBanded(save)) applyTierBands(save)

                // Phase 19: Check for season end and process promotions/relegations
                if (LeagueEngine.isSeasonEnd(save.currentWeek)) {
                    debugLog(`[Week ${save.currentWeek}] Season End! Processing promotions/relegations...`)
                    const managedTierBefore = idx.teamIndex.get(config.playerTeamId)?.leagueTier
                    LeagueEngine.processSeasonEnd(save, config.playerTeamId)
                    const managed = idx.teamIndex.get(config.playerTeamId)
                    if (managed && managedTierBefore) recordTierMove(save, getSeasonNumber(save.currentWeek), managed.id, managedTierBefore, managed.leagueTier, managed.worldRanking ?? 0)

                    // Decay circuit points 25% at season rollover so they don't
                    // accumulate unbounded across seasons (was implemented but
                    // never called — POINTS-gated eligibility never reset).
                    save.circuitPoints = CircuitPointsManager.applySeasonalDecay(save.circuitPoints || [])
                }

                // Phase 5.1: the first week of a season closes the last one:
                // season lines, awards and the Top 20 from real official stats.
                if (shouldTriggerAwards(save.currentWeek)) {
                    const closing = getSeasonNumber(save.currentWeek) - 1
                    debugLog(`[Week ${save.currentWeek}] Closing season ${closing}: honours and Top 20...`)
                    const honours = closeSeason(save, closing)
                    if (honours) addProAwardsEvent(save, buildAnnualAwards(save, honours, config.playerTeamId))
                }

                const seasonEnd = LeagueEngine.isSeasonEnd(save.currentWeek)
                mark(e => e.kind === "ranking"
                    ? { type: "world", label: seasonEnd ? "Season end: promotion & relegation" : "Weekly ranking update" }
                    : { type: "world", label: seasonEnd ? "Season end" : "Standings" })
                perfTrace.step("step.7_standings", __s)
                await this.saveManager.markStepComplete(transaction, "standingsUpdateComplete")
            }

            // ===== STEP 7: Event Generation =====
            if (resumeStep <= 8) {
                debugLog(`[Week ${save.currentWeek}] Step 7: Events...`)
                const __s = perfTrace.stepsEnabled ? perfTrace.now() : 0
                const eventIdsBefore = new Set(save.eventsLog.map(e => e.id))
                result.eventsGenerated = await EventProcessor.generateEvents(save, transaction, rng, config.playerTeamId, this.saveManager)

                // Phase 23: Legend Events (Mentorship, Coach Opportunities)
                LegendEventsManager.processWeeklyLegendEvents(save, config.playerTeamId, rng)

                // Modern events: media interviews, fan milestones, transfer rumors, birthdays, rivalries, equipment deals
                EventsManager.generateModernEvents(save, rng)

                // Phase 9: Check scouting mission completion
                this.processScoutingMissions(save, idx)

                // Phase 60: Job Market - Generate job offers based on performance
                JobOfferGenerator.processWeeklyJobOffers(save, rng)

                // Name the event that moved a player when one names them.
                const freshByPlayer = new Map<string, ChangeCause>()
                let teamEvent: ChangeCause | null = null
                for (const e of save.eventsLog) {
                    if (eventIdsBefore.has(e.id)) continue
                    const pid = (e.data as { playerId?: unknown } | undefined)?.playerId
                    const cause: ChangeCause = { type: "event", label: eventCauseLabel(e) }
                    if (typeof pid === "string" && !freshByPlayer.has(pid)) freshByPlayer.set(pid, cause)
                    else if (!pid && !teamEvent && (e.data as { teamId?: unknown } | undefined)?.teamId === config.playerTeamId) teamEvent = cause
                }
                mark(e => freshByPlayer.get(e.subjectId) ?? teamEvent ?? { type: "event", label: "Week events" })

                // Phase 5.2 dressing room (morale v2): playing time, wage
                // fairness, promises, transfer requests. Each driver marks its
                // own cause ("Benched 3 matches", "Promise kept: started").
                processDressingRoom(save, config.playerTeamId, mark)
                perfTrace.step("step.8_events", __s)
                await this.saveManager.markStepComplete(transaction, "eventGenerationComplete")
            }

            // ===== STEP 7.5: AI World Logic (Phase 19/24) =====
            if (resumeStep <= 9) {
                debugLog(`[Week ${save.currentWeek}] Step 7.5: World Logic (AI / Fans)...`)
                const __s = perfTrace.stepsEnabled ? perfTrace.now() : 0
                // The world ranking refreshes inside the AI world step; split
                // the managed club's move into its own results and everyone
                // else's before it does (Phase 4.8).
                const rankItems = rankMovementEntries(save, config.playerTeamId)
                this.processAIWorldLogic(save, config.playerTeamId, rng)
                // AI clubs face the managed club's insolvency rule (Phase 4.4).
                processAIAdministration(save, config.playerTeamId)
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
                        // Dedup by id: a legend can surface from both retirement
                        // passes in the same tick; without this guard the heavy
                        // full-player clone is pushed twice and the array bloats.
                        if (player && player.isLegendary && !save.legendaryPlayers.some(lp => lp.id === player.id)) {
                            save.legendaryPlayers.push({ ...player })
                        }
                    })
                }

                // Mid-season surprise retirements (every 4 weeks, old declining AI players)
                const midSeasonResult = EventProcessor.processMidSeasonRetirements(save, config.playerTeamId, rng)
                midSeasonResult.legends.forEach(playerId => {
                    const player = idx.playerIndex.get(playerId) ?? save.players.find(p => p.id === playerId)
                    if (player?.isLegendary && !save.legendaryPlayers.some(lp => lp.id === player.id)) {
                        save.legendaryPlayers.push({ ...player })
                    }
                })
                // Retirements can take an AI club below five: refill now.
                ensureAIRosterViability(save, config.playerTeamId)

                changes.markItemized(save, rankItems, e => {
                    if (e.kind === "contract" && e.delta < 0) {
                        return idx.playerIndex.get(e.subjectId)?.isRetired
                            ? { type: "age", label: "Retired" }
                            : { type: "transfer", label: "Transfer" }
                    }
                    if (e.kind === "reputation") return { type: "world", label: "Fan growth" }
                    return { type: "world", label: "World update" }
                })
                perfTrace.step("step.9_worldAI", __s)
                await this.saveManager.markStepComplete(transaction, "worldLogicComplete")
            }

            // ===== STEP 8: Rest Day Processing =====
            if (resumeStep <= 10) {
                debugLog(`[Week ${save.currentWeek}] Step 8: Rest days...`)
                const __s = perfTrace.stepsEnabled ? perfTrace.now() : 0
                TrainingProcessor.processRestDays(save, config.playerTeamId)
                const restPrefix = `rest_w${save.currentWeek - 1}_d`
                const restDays = save.scheduledActivities.filter(a => a.id.startsWith(restPrefix) && a.id.endsWith(`_${config.playerTeamId}`)).length
                mark({ type: "recovery", label: restDays > 0 ? `${restDays} rest day${restDays === 1 ? "" : "s"}` : "Rest days" })
                perfTrace.step("step.10_restDays", __s)
                await this.saveManager.markStepComplete(transaction, "restDayProcessingComplete")
            }

            // ===== STEP 9: Finalize =====
            // (Renamed from "Step 9" because step.10_restDays already exists;
            // this label is the post-rest-days bucket — manager levelup,
            // chemistry, career stats, compaction, final save).
            debugLog(`[Week ${save.currentWeek}] Step 9: Finalizing...`)
            const __sFinalize = perfTrace.stepsEnabled ? perfTrace.now() : 0

            // Reset daily/weekly counters
            save.teams.forEach(t => {
                // Role-training sessions reserve a slot for their whole 8-week
                // duration, so re-reserve one slot per still-active session
                // instead of zeroing. Flat-zeroing let a team stack far more
                // concurrent role trainings than maxTrainingSlots by starting
                // one per week (each start bumped the counter, the weekly reset
                // wiped it, the reservation was never re-charged). Single-week
                // team drills hold no persistent session, so they correctly
                // free their slot here. (STEP 1 already completed/removed any
                // finished sessions before this reset runs.)
                t.trainingSlotsUsed = t.activeRoleTraining?.length || 0
                // VOD-review prep applies to the match it was bought for, then
                // expires — otherwise tacticalPrep accrues to a permanent +25%.
                t.tacticalPrep = 0
                processWeeklyChemistryGrowth(t, save.currentWeek)
            })
            mark(e => e.kind === "chemistry"
                ? { type: "stability", label: "Settled roster" }
                : { type: "other", label: "End of week" })

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
                // 10 baseline + 1 per 3 manager levels (→ 16 at the L20 cap).
                // This is the player's main tangible reward for levelling, so it
                // unlocks on a tighter cadence (every 3 levels, not 5) to feel
                // like a steady climb (C9). Bounded: extra slots only speed
                // progress toward potential (drills are potential-capped, G3).
                // Synced every week so existing saves heal on first tick.
                const playerTeam = save.teams.find(t => t.id === config.playerTeamId)
                const derivedMaxSlots = 10 + Math.floor((save.managerDetails.level || 1) / 3)
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

            perfTrace.step("step.11_finalize", __sFinalize)

            // Finance runs before tournaments/matches. Decide solvency using
            // all settled income before narrative and board career outcomes.
            FinanceProcessor.reconcileWeeklySolvency(save, config.playerTeamId)

            // ===== STEP 8C: Narrative & News =====
            debugLog(`[Week ${save.currentWeek}] Step 8C: Processing Narrative Features...`)
            const __sNarrative = perfTrace.stepsEnabled ? perfTrace.now() : 0
            this.generateNarrativeNews(save, rng, idx)
            generateCareerDecision(save)
            mark({ type: "other", label: "End of week" })
            perfTrace.step("step.12_narrative", __sNarrative)

            // === Cross-Season Career Statistics ===
            // Compute at season boundaries (every 52 weeks)
            if (isSeasonEnd(save.currentWeek)) {
                // Annual aging — the only place player.age advances. Without
                // this, decline curves and the age>=33 retirement filter only
                // ever caught the initial old cohort and 16-year-old prospects
                // stayed 16 forever (no career arcs across seasons).
                for (const p of save.players) {
                    if (!p.isRetired) p.age = (p.age || 20) + 1
                }

                save.careerStats = updateCareerStats(save)
                debug.log(`[Week ${save.currentWeek}] Season ${getSeasonNumber(save.currentWeek)} career stats updated`)

                // Reclaim retired AI players nothing references anymore. save.players
                // otherwise only grows (retirement never splices + youth intake each
                // season), creeping toward the 32 MiB unloadable ceiling and slowing
                // every per-tick full-pool scan. Runs here so retirements, legend
                // snapshots and careerStats MVPs are all already populated.
                const gcRemoved = garbageCollectRetiredPlayers(save)
                if (gcRemoved > 0) {
                    debug.log(`[Week ${save.currentWeek}] GC reclaimed ${gcRemoved} unreferenced retired player(s)`)
                }
                mark({ type: "age", label: "New season" })
            } else if (!save.careerStats) {
                // First-time migration for existing saves
                save.careerStats = migrateCareerStats(save)
            }

            // Board (Phase 4.4): objectives, weekly confidence moves with
            // causes (results, league table vs objective, finances), the
            // mid-season and season reviews, warnings and dismissal. Each move
            // goes into the weekly report with its own cause.
            const board = processWeeklyBoard(save)
            changes.markItemized(save, board.moves.map(m => ({
                kind: "board" as const, subjectId: config.playerTeamId, label: "Board confidence", delta: m.delta,
                cause: { type: "board" as const, label: m.cause },
            })), e => e.kind === "money" ? { type: "board", label: "Board backing" } : { type: "board", label: board.review ? "Board review" : "Board" })
            if (board.review?.reviewed) debug.log(`[Week ${save.currentWeek}] Board review: ${board.review.outcome ?? "mid-season"}, confidence ${board.review.confidence}${board.sacked ? " — MANAGER SACKED" : ""}`)
            // A dismissed manager (sacked, or the club folded) gets the job
            // market instead of a dead end.
            if (save.gameOverReason === "SACKED" || save.gameOverReason === "BANKRUPTCY") {
                // The manager's spell at the club ends here (Phase 5.1 timeline).
                closeStint(save, save.gameOverReason === "SACKED" ? "sacked" : "folded")
                JobOfferGenerator.createDismissalOffers(save, new SeededRNG(rng.int(1, 2147483646)))
            }
            // Every open request gets its deadline and default; a repeat of an
            // open request refreshes it instead of stacking (Phase 4.9).
            normalizeDecisions(save)
            result.changes = changes.result()

            // Guard long-running saves against unbounded log growth.
            compactPersistentState(save)

            // Week was already incremented at start of processWeek
            save.lastRngSeed = rng.getState()

            // Final save — the ONE authoritative full-save write per tick
            // (Phase O perf fix). Previously this was the 11th saveGame
            // call per tick; the other 10 intra-tick checkpoints were
            // removed because their JSON.stringify cost dominated wall
            // time at high tick counts.
            const __sFinalSave = perfTrace.stepsEnabled ? perfTrace.now() : 0
            // Stamp the commit marker INSIDE the bytes this saveGame()
            // persists: if the write lands, resume can prove the tick
            // committed even when completeWeekTick() below never ran.
            const prevCommittedWeekTick = save.lastCommittedWeekTick
            save.lastCommittedWeekTick = transaction.weekNumber
            let saveResult: { success: boolean; error?: string }
            try {
                saveResult = await this.saveManager.saveGame(save)
            } catch (saveError) {
                save.lastCommittedWeekTick = prevCommittedWeekTick
                throw saveError
            }
            perfTrace.step("step.13_finalSave", __sFinalSave)
            if (!saveResult.success) {
                // The atomic write never committed — un-stamp the in-memory
                // marker so a same-process resume re-runs this tick instead
                // of skipping it as already committed.
                save.lastCommittedWeekTick = prevCommittedWeekTick
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
        ledgerIdSet?: Set<string>,
        mark?: (cause: CauseResolver) => unknown,
    ): Promise<number> {
        // Weekly report: a managed-club match gets its own snapshot pair so its
        // morale/form/fatigue/Elo swing is attributed to that result.
        const matchCause = (matchId: string): ChangeCause => {
            const cm = save.completedMatches.find(m => m.id === matchId)
            const oppId = cm ? (cm.homeTeamId === playerTeamId ? cm.awayTeamId : cm.homeTeamId) : ""
            const opp = (idx?.teamIndex.get(oppId) ?? save.teams.find(t => t.id === oppId))?.name ?? "opponent"
            if (!cm?.result) return { type: "match", label: `Match vs ${opp}` }
            const won = cm.result.winnerId === playerTeamId
            const where = competitionLabel(save, cm)
            if (!cm.result.maps?.length) return { type: "match", label: `Forfeit ${won ? "win" : "loss"} vs ${opp}${where}` }
            return { type: "match", label: `${won ? "Beat" : "Lost to"} ${opp} ${sideScore(cm.result, cm.homeTeamId === playerTeamId)}${where}` }
        }
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
            const tracksManagedClub = !!mark && (match.homeTeamId === playerTeamId || match.awayTeamId === playerTeamId)
            if (tracksManagedClub) mark({ type: "world", label: "Other results" })
            try {

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

            try {
            // Team staff drive the match exactly as on the managed path
            // (coach/analyst/psychologist levels + talents); the playstyle
            // counter is applied inside the engine. No extra tactical bonus:
            // the old analyst-stat + RPS bonus here was scaled x10 by the
            // engine and double-counted the counter.
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
                0,
                0,
                homeTeamStaff,
                awayTeamStaff,
                playerTeamId,
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

            // Record result.
            //
            // Phase O.2 save-size fix: AI-vs-AI matches were averaging
            // 123 KB each — almost entirely from result.maps[].rounds[]
            // event detail that the player never sees. At week 52 of a
            // smoke save, this was ballooning the on-disk save to 18 MB.
            //
            // Player-team matches keep full round detail (the result
            // page reads it for the play-by-play view). AI-vs-AI matches
            // strip rounds[] — the scoreboard (finalScore, MVP, etc.)
            // survives intact for stats pages, ranking, and trophy
            // tracking, which only read summary fields.
            const isPlayerMatch =
                match.homeTeamId === playerTeamId ||
                match.awayTeamId === playerTeamId
            const resultForSave = isPlayerMatch
                ? result
                : {
                    ...result,
                    maps: result.maps.map(m => ({ ...m, rounds: [] })),
                }
            const completedMatch: CompletedMatchSaveData = {
                ...match,
                result: resultForSave,
                analysis,
            }

            save.completedMatches.push(completedMatch)
            removedMatchIds.add(match.id)

            // Phase 5.1: careers, season tallies and records from the full
            // result (before its rounds were stripped). Friendlies don't count.
            recordOfficialMatch(save, match, result, {
                player: id => idx?.playerIndex.get(id) ?? save.players.find(p => p.id === id),
                team: id => idx?.teamIndex.get(id) ?? save.teams.find(t => t.id === id),
                tournamentTier: match.tournamentId
                    ? (idx?.tournamentIndex.get(match.tournamentId) ?? save.tournaments.find(t => t.id === match.tournamentId))?.tier ?? null
                    : null,
            })

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
                // Level-ups apply world-wide, but only the managed club's
                // reach the inbox: AI rosters produced ~60 PLAYER_LEVEL_UP
                // items (each also a toast) in busy tournament weeks.
                const applyTournamentXP = (players: typeof save.players, won: boolean, teamId: string) => {
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
                            if (teamId === playerTeamId) save.eventsLog.unshift({
                                id: `evt_lvl_${save.currentWeek}_${p.id}_t`,
                                type: "PLAYER_LEVEL_UP",
                                week: save.currentWeek,
                                data: { playerName: p.nickname || p.id, newLevel: p.level },
                                acknowledged: false
                            })
                        }
                    })
                }
                applyTournamentXP(homePlayers, homeWon, match.homeTeamId)
                applyTournamentXP(awayPlayers, !homeWon, match.awayTeamId)
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

            // Phase 11b: Derby stakes — an established rivalry amplifies the morale
            // swing of the result, both ways. Read the intensity BEFORE
            // updateRivalries() increments it below, so it reflects the heat
            // coming INTO the match. Rivalry is symmetric, so the home view suffices.
            const derbyStakes = derbyMultiplier(getRivalryBetween(homeTeam, awayTeam.id)?.intensity)

            // Psychologist stressResistance softens the morale hit of a defeat
            // (per team — each side's own staff). 0 when no psychologist.
            const homeStaff = idx?.staffByTeamId.get(homeTeam.id) ?? save.staff.filter(s => s.teamId === homeTeam.id)
            const awayStaff = idx?.staffByTeamId.get(awayTeam.id) ?? save.staff.filter(s => s.teamId === awayTeam.id)
            const homeMoraleDampen = psychologistMoraleDampen(homeStaff)
            const awayMoraleDampen = psychologistMoraleDampen(awayStaff)
            // Phase 5.2: the captain, when he plays, spares his lineup part of
            // a defeat's morale; each player's archetype scales his swing.
            const lookupPlayer = (id: string) => idx?.playerIndex.get(id) ?? save.players.find(p => p.id === id)
            const homeShield = lineupDefeatShield(homeTeam, homePlayers.map(p => p.id), lookupPlayer)
            const awayShield = lineupDefeatShield(awayTeam, awayPlayers.map(p => p.id), lookupPlayer)

            const updateStats = (players: typeof save.players, won: boolean, moraleLossDampen: number, shield: number) => {
                players.forEach(p => {
                    const pStat = result.playerStats[p.id]
                    p.matchesPlayed++
                    // Kills/deaths/rating totals: recordOfficialMatch (official matches only).
                    if (pStat) {
                        p.headshots = (p.headshots || 0) + (pStat.headshots || 0)
                        p.totalHeadshots = (p.totalHeadshots || 0) + (pStat.headshots || 0)
                    }

                    p.fatigue = Math.min(100, p.fatigue + fatigueCost)

                    // Phase 55: Energy drain from matches (-15 per match)
                    p.energy = Math.max(0, (p.energy ?? 100) - 15)

                    let moraleDelta = getMoraleChange(won) * derbyStakes
                    if (moraleDelta < 0) moraleDelta *= (1 - moraleLossDampen)
                    p.morale = applyMoraleResult(p.morale, playerResultMorale(p, moraleDelta, shield))
                    p.form = applyFormResult(p.form, won)

                    // Phase 6: Skill Point Progression
                    // 5% chance on win, 1% on loss to simulate learning
                    const spChance = won ? 0.05 : 0.01
                    if (rng.next() < spChance) {
                        p.availableSkillPoints = (p.availableSkillPoints || 0) + 1
                        // Optional: Log an event for this? Might be too spammy.
                    }
                })
            }

            updateStats(homePlayers, homeWon, homeMoraleDampen, homeShield)
            updateStats(awayPlayers, !homeWon, awayMoraleDampen, awayShield)
            // Phase 5.2: official appearances (starters / fit players left out).
            if (isOfficialMatch(match)) {
                recordAppearances(homeTeam, homePlayers.map(p => p.id), lookupPlayer)
                recordAppearances(awayTeam, awayPlayers.map(p => p.id), lookupPlayer)
            }

            this.applyMatchSponsorGoalProgress(save, homeTeam, homeWon, result.homeScore, match.id, eventIdSet, ledgerIdSet)
            this.applyMatchSponsorGoalProgress(save, awayTeam, !homeWon, result.awayScore, match.id, eventIdSet, ledgerIdSet)
            settlePlayerContractBonuses(save, match.id, homeTeam.id, homeWon, Object.keys(result.playerStats ?? {}), result.mvpPlayerId, ledgerIdSet)
            settlePlayerContractBonuses(save, match.id, awayTeam.id, !homeWon, Object.keys(result.playerStats ?? {}), result.mvpPlayerId, ledgerIdSet)

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

                // Resolve the event tier: it sets the match's rating weight
                let tournamentTier: string | undefined
                if (match.tournamentId && match.tournamentId !== "SCRIM") {
                    const tournament = idx?.tournamentIndex.get(match.tournamentId) ?? save.tournaments.find(t => t.id === match.tournamentId)
                    if (tournament) tournamentTier = tournament.tier
                }

                // Phase 4.8: no per-club "calibration" K. It was read from the
                // completed-match log, which the league compacts to four weeks,
                // so most clubs stayed on the volatile K forever; new clubs
                // get a provisional K from their own rated-match counter.

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
                    undefined,
                    undefined,
                    roundDiff,
                    { tournamentId: match.tournamentId, stage: match.stage, maps: result.maps.length },
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
            } catch (matchErr) {
                // A single match throwing must not abort the entire week.
                debug.error('[atomic-week-processor] match processing failed', matchErr)
                if (!removedMatchIds.has(match.id)) {
                    // simulateMatch (or pre-record processing) threw before the
                    // result was saved — forfeit the match so the week still
                    // completes instead of aborting every remaining match.
                    try {
                        const { matchesPlayed: forfeitDelta } = processForfeitMatch({
                            save, match, homeTeam, awayTeam, homePlayers, awayPlayers,
                            playerTeamId, removedMatchIds,
                        })
                        matchesPlayed += forfeitDelta
                    } catch (forfeitErr) {
                        debug.error('[atomic-week-processor] forfeit fallback failed; dropping match', forfeitErr)
                        removedMatchIds.add(match.id)
                    }
                }
                // If the match WAS already recorded, a post-result step
                // (Elo, tournament progression) threw — keep the result and
                // move on rather than re-forfeiting a duplicate.
            }
            } finally {
                if (tracksManagedClub) mark?.(matchCause(match.id))
            }
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
        save.sponsorOffers = SponsorGenerator.generateVariedOffers(team, save.currentWeek, offerRng,
            EconomyEngine.sponsorCostBase(team, save.contracts, save.staff || [], save.currentWeek + 1))
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

        // Regional league draw at the start of each split (Phase 4.4). Runs
        // before events start this week so their scheduling sees the league
        // nights and books other days.
        drawDueLeagueSplit(save)

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

        // Circuit points are awarded SOLELY by standings-processor.updateStandings
        // (Step 6) — the single idempotent owner, gated by + setting
        // tournament.rewardsGranted, and covering every completed tournament
        // (bracket/league/swiss alike). A duplicate award loop used to live here
        // but never set rewardsGranted, so any tournament that became complete
        // within this step (e.g. via the bracket-repair pass above) had its
        // circuit points awarded twice. Removed to keep one source of truth.
    }

    private generateNarrativeNews(save: GameSave, rng: SeededRNG, idx?: SaveIndexes): void {
        generateNarrativeNewsFn(save, rng, idx)
    }

}

export const atomicWeekProcessor = new AtomicWeekProcessor(saveManager)
