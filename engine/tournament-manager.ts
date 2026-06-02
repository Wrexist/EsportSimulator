import { SeededRNG } from "./rng"
import { debug } from "@/lib/debug-logger"
import {
    GameSave,
    TournamentSaveData,
    BracketMatchSaveData,
    TournamentGroupSaveData,
    MatchSaveData,
    CompletedMatchSaveData,
    PlayerSaveData
} from "./save-types"
import { MatchFormat } from "@/types"
import { LeagueEngine } from "./league-engine"
import { STAFF_EFFECTS } from "@/types"
import { QualificationEngine } from "./tournament-qualification"
import { getTournamentMVP } from "./tournament-stats"
import { getSeasonFromWeek, resolveTournamentIdentity } from "./circuit-engine"
import { buildSaveIndexes, buildBracketIndex, type SaveIndexes } from "@/store/indexes"
import type { TournamentDefinition } from "@/data/tournament-calendar"
import {
    stableTeamIdNumber,
    resolveCompletedWinner as resolveCompletedWinnerFn,
    normalizeStage as normalizeStageFn,
    getBracketRoundNumber as getBracketRoundNumberFn,
} from "./tournament/seeding-helpers"
import {
    addBracketMatch as addBracketMatchFn,
    assignMatchDay as assignMatchDayFn,
    scheduleBracketMatch as scheduleBracketMatchFn,
} from "./tournament/bracket-scheduling"
import {
    handleOpeningResult as handleOpeningResultFn,
    handleUpperSemiResult as handleUpperSemiResultFn,
    handleUpperFinalResult as handleUpperFinalResultFn,
    handleLowerResult as handleLowerResultFn,
} from "./tournament/double-elim-handlers"
import {
    setupSwissStage as setupSwissStageFn,
    generateSwissRound as generateSwissRoundFn,
    handleSwissResult as handleSwissResultFn,
    generateSwissPlayoffs as generateSwissPlayoffsFn,
} from "./tournament/swiss-handlers"
import { setupLeagueSchedule as setupLeagueScheduleFn } from "./tournament/league-schedule"

// Lazy-cached require to avoid circular import at module load time
import type { MatchEngine } from "./match-engine"
import type { MatchAnalyzer } from "./match-analyzer"
let _matchEngineInstance: MatchEngine | null = null
let _MatchAnalyzer: typeof MatchAnalyzer | null = null
function getMatchEngine(): MatchEngine {
    if (!_matchEngineInstance) {
        const { MatchEngine } = require("./match-engine")
        _matchEngineInstance = new MatchEngine()
    }
    return _matchEngineInstance!
}
function getMatchAnalyzer(): typeof MatchAnalyzer {
    if (!_MatchAnalyzer) {
        _MatchAnalyzer = require("./match-analyzer").MatchAnalyzer
    }
    return _MatchAnalyzer!
}

/** Get coach tactical bonus for a team from save data */
function getCoachTacticalBonus(save: GameSave, team: { staffIds: string[] }): number {
    const coach = save.staff?.find(s => team.staffIds?.includes(s.id) && s.role === "coach")
    return coach ? STAFF_EFFECTS.COACH.tacticBonus(coach.level) : 0
}

export class TournamentManager {
    /** Generate an elimination event if the eliminated team is the player's team */
    private static notifyPlayerElimination(save: GameSave, tournament: TournamentSaveData, teamId: string): void {
        if (teamId !== save.playerTeamId) return
        const elimId = `elim_${tournament.id}_${save.currentWeek}`
        if (save.eventsLog.some(e => e.id === elimId)) return
        save.eventsLog.unshift({
            id: elimId,
            type: "MEDIA",
            week: save.currentWeek,
            data: {
                title: "Tournament Elimination",
                message: `Your team has been eliminated from ${tournament.name}`,
                tournamentId: tournament.id
            },
            acknowledged: false
        })
    }

    private static resolveCompletedWinner(
        completed: CompletedMatchSaveData,
        homeTeamId?: string,
        awayTeamId?: string,
    ): string | undefined {
        return resolveCompletedWinnerFn(completed, homeTeamId, awayTeamId)
    }

    static repairTournamentProgression(save: GameSave, tournamentId?: string): void {
        const idx = buildSaveIndexes(save)
        const tournaments = tournamentId
            ? save.tournaments.filter(t => t.id === tournamentId)
            : save.tournaments

        tournaments.forEach((tournament) => {
            if (!tournament.playoffBracket || tournament.playoffBracket.length === 0) return

            let guard = 0
            let changed = true
            while (changed && guard < 20) {
                changed = false
                guard++

                const byId = new Map<string, BracketMatchSaveData>(
                    tournament.playoffBracket.map(match => [match.id, match])
                )

                const orderedMatches = [...tournament.playoffBracket].sort((a, b) => {
                    if ((a.week || 0) !== (b.week || 0)) return (a.week || 0) - (b.week || 0)
                    return a.id.localeCompare(b.id)
                })

                for (const match of orderedMatches) {
                    // Backfill from completed records if available.
                    const completedRecord = idx.completedMatchIndex.get(match.id) ?? save.completedMatches.find(m => m.id === match.id)
                    if (completedRecord && !match.isCompleted) {
                        const resolvedWinner = this.resolveCompletedWinner(completedRecord, match.homeTeamId, match.awayTeamId)
                        if (resolvedWinner) {
                            match.isCompleted = true
                            match.winnerId = resolvedWinner
                            if (match.homeTeamId && match.awayTeamId) {
                                match.loserId = resolvedWinner === match.homeTeamId ? match.awayTeamId : match.homeTeamId
                            }
                            save.scheduledMatches = save.scheduledMatches.filter(m => m.id !== match.id)
                            this.handlePlayoffProgression(save, tournament, match, resolvedWinner, match.loserId)
                            changed = true
                        }
                        continue
                    }

                    if (match.isCompleted) continue

                    // Repair participant assignment from source winners.
                    if ((!match.homeTeamId || !match.awayTeamId) && match.sourceMatchIds && match.sourceMatchIds.length > 0) {
                        const sourceMatches = match.sourceMatchIds
                            .map(id => byId.get(id))
                            .filter((m): m is BracketMatchSaveData => !!m)

                        const sourceWinners = sourceMatches
                            .map(m => m.winnerId)
                            .filter((id): id is string => typeof id === "string" && id.length > 0)

                        if (!match.homeTeamId && sourceWinners[0]) {
                            match.homeTeamId = sourceWinners[0]
                            changed = true
                        }
                        if (!match.awayTeamId) {
                            // Note: if this produces a self-match (awayCandidate === homeTeamId),
                            // the guard at line ~154 will detect and auto-advance
                            const awayCandidate = sourceWinners.find(id => id !== match.homeTeamId) || sourceWinners[1]
                            if (awayCandidate) {
                                match.awayTeamId = awayCandidate
                                changed = true
                            }
                        }
                    }

                    if (!match.homeTeamId || !match.awayTeamId) continue

                    // Invalid self-match branch; auto-advance once instead of deadlocking bracket.
                    if (match.homeTeamId === match.awayTeamId) {
                        match.isCompleted = true
                        const autoWinnerId = match.homeTeamId
                        match.winnerId = autoWinnerId
                        save.scheduledMatches = save.scheduledMatches.filter(m => m.id !== match.id)
                        this.handlePlayoffProgression(save, tournament, match, autoWinnerId)
                        changed = true
                        continue
                    }

                    const alreadyScheduled = save.scheduledMatches.some(m => m.id === match.id)
                    const alreadyCompleted = save.completedMatches.some(m => m.id === match.id)
                    if (!alreadyScheduled && !alreadyCompleted) {
                        this.scheduleBracketMatch(save, match)
                        changed = true
                    }
                }
            }

            const grandFinal = tournament.playoffBracket.find(m => m.stage === "Grand Final")
            if (grandFinal?.isCompleted && grandFinal.winnerId && !tournament.isCompleted) {
                tournament.isCompleted = true
                tournament.winnerId = grandFinal.winnerId

                // Calculate Tournament MVP if not already set
                if (!tournament.mvpPlayerId) {
                    const mvp = getTournamentMVP(save.completedMatches, tournament.id, save.players, save.teams)
                    if (mvp) {
                        tournament.mvpPlayerId = mvp.playerId
                        tournament.mvpRating = mvp.avgRating
                    }
                }
            }
        })
    }

    private static addRegistrationQualification(
        save: GameSave,
        tournamentId: string,
        teamId: string,
        qualifiedVia: string
    ): void {
        save.tournamentQualifications = QualificationEngine.registerTeam(
            save.tournamentQualifications,
            tournamentId,
            teamId,
            qualifiedVia
        )
    }

    /**
     * Initialize a new tournament with groups and brackets
     */
    static initializeTournament(
        save: GameSave,
        tournamentId: string,
        teamIds: string[],
        rng: SeededRNG
    ): void {
        const idx = buildSaveIndexes(save)
        const tournament = idx.tournamentIndex.get(tournamentId) ?? save.tournaments.find(t => t.id === tournamentId)
        if (!tournament) {
            debug.error(`[Tournament] initializeTournament failed: Tournament ${tournamentId} not found!`)
            return
        }

        const identity = resolveTournamentIdentity(tournament.id, tournament.startWeek)
        tournament.seriesId = tournament.seriesId || identity.seriesId
        tournament.instanceId = tournament.instanceId || identity.instanceId
        tournament.seasonNumber = tournament.seasonNumber || identity.seasonNumber

        // Safety: Deduplicate team IDs
        const uniqueTeamIds = [...new Set(teamIds)]
        if (uniqueTeamIds.length !== teamIds.length) {
            debug.warn(`[Tournament] Removed ${teamIds.length - uniqueTeamIds.length} duplicate teams from ${tournament.name}`)
        }

        tournament.teamIds = uniqueTeamIds
        tournament.isCompleted = false
        tournament.currentStage = "Bracket"
        tournament.playoffBracket = []

        // 1. Check Format First
        if (tournament.format === "league") {
            tournament.currentStage = "League Play"
            this.setupLeagueSchedule(save, tournament, uniqueTeamIds, rng)
            return
        }

        // Double-elim and generic bracket formats skip Swiss regardless of team count
        if (tournament.format === "double_elim" || tournament.format === "bracket") {
            this.setupGenericBracket(save, tournament, uniqueTeamIds, rng)
            return
        }

        // 2. Initialize Groups/Brackets based on participant count (Swiss for 16/24)
        if (uniqueTeamIds.length === 24) {
            // majors: Preliminary Swiss (16 teams) + Top 8 Legends
            // For now, let's do a 24-team Swiss or 16-team Swiss with 8 byes
            // Better: Simple 16-team Swiss for the current tournament context if 16, 
            // but for 24, we'll do 3 groups of 8 or a 24-team Swiss.
            // USER specifically asked for Swiss.
            tournament.currentStage = "Swiss Stage"
            this.setupSwissStage(save, tournament, uniqueTeamIds, rng)
        } else if (uniqueTeamIds.length === 16) {
            tournament.currentStage = "Swiss Stage"
            this.setupSwissStage(save, tournament, uniqueTeamIds, rng)
        } else {
            // Generic Bracket for all other power-of-2 sizes (8, 32, 64, 128)
            this.setupGenericBracket(save, tournament, uniqueTeamIds, rng)
        }
    }

    private static setupSwissStage(
        save: GameSave,
        tournament: TournamentSaveData,
        teamIds: string[],
        rng: SeededRNG,
    ): void {
        setupSwissStageFn(save, tournament, teamIds, rng)
    }

    private static generateSwissRound(
        save: GameSave,
        tournament: TournamentSaveData,
        roundNum: number,
        rng: SeededRNG,
    ): void {
        generateSwissRoundFn(save, tournament, roundNum, rng)
    }

    private static createDoubleElimGroup(
        save: GameSave,
        tournament: TournamentSaveData,
        groupName: string,
        teamIds: string[],
        rng: SeededRNG
    ): TournamentGroupSaveData {
        const groupId = `${tournament.id}_${groupName.replace(" ", "_")}`
        const matchIds: string[] = []
        const startWeek = tournament.startWeek
        const openingMatchCount = Math.floor(teamIds.length / 2)

        if (teamIds.length < 2 || teamIds.length % 2 !== 0) {
            debug.warn(`[Tournament] createDoubleElimGroup requires even number of teams, got ${teamIds.length}`)
            return { id: groupId, name: groupName, teamIds, matches: [] }
        }

        // Setup Opening Matches (N teams -> N/2 matches)
        for (let i = 0; i < openingMatchCount; i++) {
            const matchId = `${groupId}_opening_${i}`
            const match: BracketMatchSaveData = {
                id: matchId,
                tournamentId: tournament.id,
                stage: `${groupName} Opening`,
                homeTeamId: teamIds[i * 2],
                awayTeamId: teamIds[i * 2 + 1],
                isCompleted: false,
                week: startWeek,
                format: "BO3",
                seed: rng.int(0, 999999),
                sourceMatchIds: []
            }
            this.addBracketMatch(tournament, match)
            this.scheduleBracketMatch(save, match)
            matchIds.push(matchId)
        }

        // Setup Upper Semis (N/2 opening matches -> N/4 upper semi matches)
        const upperSemiCount = Math.floor(openingMatchCount / 2)
        for (let i = 0; i < upperSemiCount; i++) {
            const matchId = `${groupId}_upper_semi_${i}`
            const match: BracketMatchSaveData = {
                id: matchId,
                tournamentId: tournament.id,
                stage: `${groupName} Upper Semi`,
                isCompleted: false,
                week: startWeek + 1,
                format: "BO3",
                seed: rng.int(0, 999999),
                sourceMatchIds: [`${groupId}_opening_${i * 2}`, `${groupId}_opening_${i * 2 + 1}`]
            }
            this.addBracketMatch(tournament, match)
            matchIds.push(matchId)
        }

        // Setup Upper Final (1 match) — only if there are 2+ upper semi matches
        if (upperSemiCount >= 2) {
            const upperFinalId = `${groupId}_upper_final`
            const upperFinal: BracketMatchSaveData = {
                id: upperFinalId,
                tournamentId: tournament.id,
                stage: `${groupName} Upper Final`,
                isCompleted: false,
                week: startWeek + 1,
                format: "BO3",
                seed: rng.int(0, 999999),
                sourceMatchIds: [`${groupId}_upper_semi_0`, `${groupId}_upper_semi_1`]
            }
            this.addBracketMatch(tournament, upperFinal)
            matchIds.push(upperFinalId)
        }

        return {
            id: groupId,
            name: groupName,
            teamIds,
            matches: matchIds
        }
    }

    private static addBracketMatch(tournament: TournamentSaveData, match: BracketMatchSaveData): void {
        addBracketMatchFn(tournament, match)
    }

    private static normalizeStage(stage: string): string {
        return normalizeStageFn(stage)
    }

    private static getBracketRoundNumber(match: BracketMatchSaveData): number {
        return getBracketRoundNumberFn(match)
    }

    /**
     * Simulate pending AI bracket matches, but ONLY from rounds that the player has completed.
     * This prevents bracket skipping by ensuring rounds complete in order.
     */
    private static simulateAllPendingBracketMatches(
        save: GameSave,
        tournament: TournamentSaveData,
        playerTeamId: string,
        rng: SeededRNG
    ): void {
        if (!tournament.playoffBracket) return
        const idx = buildSaveIndexes(save)

        // Find the player's CURRENT incomplete match (earliest incomplete round they're in)
        const playerIncompleteMatches = tournament.playoffBracket.filter(m =>
            !m.isCompleted &&
            (m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId)
        )

        // Get the player's current round (the earliest incomplete round they need to play)
        let playerCurrentRound = Infinity
        if (playerIncompleteMatches.length > 0) {
            playerCurrentRound = Math.min(...playerIncompleteMatches.map(m => this.getBracketRoundNumber(m)))
        }

        const matchEngine = getMatchEngine()
        const MatchAnalyzer = getMatchAnalyzer()
        let simulatedCount = 0

        // Keep looping until no more matches can be simulated
        // (handles dependency chains where simulating one match enables another)
        let madeProgress = true
        while (madeProgress) {
            madeProgress = false

            for (const bracketMatch of tournament.playoffBracket) {
                // Skip if already completed
                if (bracketMatch.isCompleted) continue

                // Skip if missing teams
                if (!bracketMatch.homeTeamId || !bracketMatch.awayTeamId) continue

                // Skip player matches
                if (bracketMatch.homeTeamId === playerTeamId || bracketMatch.awayTeamId === playerTeamId) continue

                // ROUND SYNCHRONIZATION: Only simulate AI matches from rounds BEFORE the player's current round
                // This prevents the bracket from skipping ahead while the player is still playing
                const matchRound = this.getBracketRoundNumber(bracketMatch)
                if (matchRound >= playerCurrentRound) {
                    // This match is in the same round or later than the player - wait for player to complete their round
                    continue
                }

                // This is an AI vs AI match from a previous round that's ready to be simulated
                const homeTeam = idx.teamIndex.get(bracketMatch.homeTeamId!) ?? save.teams.find(t => t.id === bracketMatch.homeTeamId)
                const awayTeam = idx.teamIndex.get(bracketMatch.awayTeamId!) ?? save.teams.find(t => t.id === bracketMatch.awayTeamId)
                if (!homeTeam || !awayTeam) continue

                const homePlayers = homeTeam.rosterIds.map(id => idx.playerIndex.get(id) ?? save.players.find(p => p.id === id)).filter((p): p is PlayerSaveData => p !== undefined)
                const awayPlayers = awayTeam.rosterIds.map(id => idx.playerIndex.get(id) ?? save.players.find(p => p.id === id)).filter((p): p is PlayerSaveData => p !== undefined)
                if (homePlayers.length < 5 || awayPlayers.length < 5) continue

                // Simulate the match
                const matchForSim = {
                    id: bracketMatch.id,
                    homeTeamId: bracketMatch.homeTeamId,
                    awayTeamId: bracketMatch.awayTeamId,
                    tournamentId: bracketMatch.tournamentId,
                    stage: bracketMatch.stage,
                    week: bracketMatch.week,
                    format: bracketMatch.format,
                    seed: bracketMatch.seed
                }

                const homeTeamStaff = (save.staff || []).filter(s => s.teamId === homeTeam.id)
                const awayTeamStaff = (save.staff || []).filter(s => s.teamId === awayTeam.id)
                const result = matchEngine.simulateMatch(matchForSim, homeTeam, awayTeam, homePlayers, awayPlayers, rng, getCoachTacticalBonus(save, homeTeam), getCoachTacticalBonus(save, awayTeam), homeTeamStaff, awayTeamStaff)

                // Mark as complete
                bracketMatch.isCompleted = true
                const homeWon = result.homeScore > result.awayScore
                bracketMatch.winnerId = homeWon ? homeTeam.id : awayTeam.id
                bracketMatch.loserId = homeWon ? awayTeam.id : homeTeam.id

                // Add to completed matches
                const completedMatch: CompletedMatchSaveData = {
                    ...matchForSim,
                    result,
                    analysis: MatchAnalyzer.analyze(matchForSim, result, homeTeam.name, awayTeam.name, homePlayers, awayPlayers)
                }
                save.completedMatches.push(completedMatch)

                // Remove from scheduled if present
                save.scheduledMatches = save.scheduledMatches.filter(m => m.id !== bracketMatch.id)

                // Update ELO
                const scoreDiff = Math.abs(result.homeScore - result.awayScore)
                LeagueEngine.updateEloAfterMatch(save, bracketMatch.winnerId, bracketMatch.loserId!, scoreDiff, tournament.tier, undefined, undefined)

                // Process progression (assigns winner to next round)
                this.handlePlayoffProgression(save, tournament, bracketMatch, bracketMatch.winnerId, bracketMatch.loserId)

                simulatedCount++
                madeProgress = true
            }
        }

    }

    /**
     * Simulate all AI matches in the same stage as the player team
     * This ensures all teams complete their round before anyone advances
     */
    static simulateConcurrentMatches(
        save: GameSave,
        tournamentId: string,
        playerTeamId: string,
        playerMatchStage: string,
        rng: SeededRNG
    ): void {
        const idx = buildSaveIndexes(save)
        const tournament = idx.tournamentIndex.get(tournamentId) ?? save.tournaments.find(t => t.id === tournamentId)
        if (!tournament || !tournament.playoffBracket) return

        // First, simulate ALL pending AI bracket matches (catches stragglers from previous rounds)
        this.simulateAllPendingBracketMatches(save, tournament, playerTeamId, rng)

        // Normalize the player's match stage for comparison
        const playerStageNormalized = this.normalizeStage(playerMatchStage)

        // Find ALL matches in the SAME STAGE that are AI vs AI (regardless of week)
        // Also match by round number from match ID if stage comparison fails
        const playerRoundMatch = playerMatchStage.match(/r(\d+)/i) || (tournamentId + "_" + playerMatchStage).match(/r(\d+)/i)
        const playerRound = playerRoundMatch ? playerRoundMatch[1] : null

        const concurrentMatches = save.scheduledMatches.filter(m => {
            if (m.tournamentId !== tournamentId) return false
            if (m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId) return false

            // Match by stage name
            if (m.stage && this.normalizeStage(m.stage) === playerStageNormalized) return true

            // Also match by round number in match ID (e.g., "tournament_r1_m2")
            if (playerRound) {
                const matchRound = m.id.match(/_r(\d+)_m/i)
                if (matchRound && matchRound[1] === playerRound) return true
            }

            return false
        })

        if (concurrentMatches.length === 0) {
            // Already handled by simulateAllPendingBracketMatches
            return
        }

        const matchEngine = getMatchEngine()

        for (const match of concurrentMatches) {
            const homeTeam = idx.teamIndex.get(match.homeTeamId) ?? save.teams.find(t => t.id === match.homeTeamId)
            const awayTeam = idx.teamIndex.get(match.awayTeamId) ?? save.teams.find(t => t.id === match.awayTeamId)
            if (!homeTeam || !awayTeam) continue

            const homePlayers = homeTeam.rosterIds.map(id => idx.playerIndex.get(id) ?? save.players.find(p => p.id === id)).filter((p): p is PlayerSaveData => p !== undefined)
            const awayPlayers = awayTeam.rosterIds.map(id => idx.playerIndex.get(id) ?? save.players.find(p => p.id === id)).filter((p): p is PlayerSaveData => p !== undefined)

            if (homePlayers.length < 5 || awayPlayers.length < 5) continue

            const homeTeamStaff = (save.staff || []).filter(s => s.teamId === homeTeam.id)
            const awayTeamStaff = (save.staff || []).filter(s => s.teamId === awayTeam.id)
            const result = matchEngine.simulateMatch(match, homeTeam, awayTeam, homePlayers, awayPlayers, rng, getCoachTacticalBonus(save, homeTeam), getCoachTacticalBonus(save, awayTeam), homeTeamStaff, awayTeamStaff)

            const completedMatch: CompletedMatchSaveData = {
                ...match,
                result,
                analysis: getMatchAnalyzer().analyze(match, result, homeTeam.name, awayTeam.name, homePlayers, awayPlayers)
            }

            save.completedMatches.push(completedMatch)
            save.scheduledMatches = save.scheduledMatches.filter(m => m.id !== match.id)

            const winnerId = result.homeScore > result.awayScore ? homeTeam.id : awayTeam.id
            const loserId = result.homeScore > result.awayScore ? awayTeam.id : homeTeam.id

            // Process progression for this AI match
            this.processMatchResult(save, tournamentId, match.id, winnerId, loserId)

            // Phase 19: Elo Update (Unified)
            const scoreDiff = Math.abs(result.homeScore - result.awayScore)
            const isDraw = scoreDiff === 0

            // Update Recent Form
            const updateForm = (teamId: string, outcome: "W" | "L" | "D") => {
                const team = idx.teamIndex.get(teamId) ?? save.teams.find(t => t.id === teamId)
                if (team) {
                    if (!team.recentForm) team.recentForm = []
                    team.recentForm.push(outcome)
                    if (team.recentForm.length > 5) team.recentForm.shift()
                }
            }

            if (isDraw) {
                updateForm(homeTeam.id, "D")
                updateForm(awayTeam.id, "D")
            } else {
                updateForm(winnerId, "W")
                updateForm(loserId, "L")

                // Calculate matches played
                const getMatchesPlayed = (tid: string) =>
                    save.completedMatches.filter(m => m.homeTeamId === tid || m.awayTeamId === tid).length

                LeagueEngine.updateEloAfterMatch(
                    save,
                    winnerId,
                    loserId,
                    scoreDiff,
                    tournament.tier,
                    getMatchesPlayed(winnerId),
                    getMatchesPlayed(loserId)
                )
            }
        }
    }

    /**
     * Assign a day (0-6) to a match, avoiding conflicts for the same teams
     * Prefers weekend days (Sat=5, Sun=6, Fri=4) then works backwards
     */
    private static assignMatchDay(
        save: GameSave,
        teamIds: string[],
        week: number,
        preferredDays?: number[],
    ): number {
        return assignMatchDayFn(save, teamIds, week, preferredDays)
    }

    private static scheduleBracketMatch(save: GameSave, match: BracketMatchSaveData): void {
        scheduleBracketMatchFn(save, match)
    }

    /**
     * Simulate a single bracket match immediately (used to progress brackets when sibling match is pending)
     */
    private static simulateSingleBracketMatch(save: GameSave, tournament: TournamentSaveData, bracketMatch: BracketMatchSaveData): void {
        if (!bracketMatch.homeTeamId || !bracketMatch.awayTeamId) return
        if (bracketMatch.isCompleted) return

        const idx = buildSaveIndexes(save)
        const homeTeam = idx.teamIndex.get(bracketMatch.homeTeamId) ?? save.teams.find(t => t.id === bracketMatch.homeTeamId)
        const awayTeam = idx.teamIndex.get(bracketMatch.awayTeamId) ?? save.teams.find(t => t.id === bracketMatch.awayTeamId)
        if (!homeTeam || !awayTeam) {
            debug.warn(`[Tournament] Cannot simulate ${bracketMatch.id}: Teams not found`)
            // Award walkover to whichever team exists
            if (homeTeam && !awayTeam) {
                bracketMatch.winnerId = bracketMatch.homeTeamId
                bracketMatch.isCompleted = true
            } else if (awayTeam && !homeTeam) {
                bracketMatch.winnerId = bracketMatch.awayTeamId
                bracketMatch.isCompleted = true
            }
            return
        }

        const homePlayers = homeTeam.rosterIds.map(id => idx.playerIndex.get(id) ?? save.players.find(p => p.id === id)).filter((p): p is PlayerSaveData => p !== undefined)
        const awayPlayers = awayTeam.rosterIds.map(id => idx.playerIndex.get(id) ?? save.players.find(p => p.id === id)).filter((p): p is PlayerSaveData => p !== undefined)

        if (homePlayers.length < 5 || awayPlayers.length < 5) {
            debug.warn(`[Tournament] Cannot simulate ${bracketMatch.id}: Not enough players (${homePlayers.length} vs ${awayPlayers.length})`)
            // Award walkover to the team with enough players.
            if (homePlayers.length >= 5) {
                bracketMatch.winnerId = bracketMatch.homeTeamId
                bracketMatch.isCompleted = true
            } else if (awayPlayers.length >= 5) {
                bracketMatch.winnerId = bracketMatch.awayTeamId
                bracketMatch.isCompleted = true
            } else {
                // BOTH teams understaffed: bracket would otherwise stall
                // forever waiting for a winner that never arrives. Use a
                // deterministic tiebreaker (higher roster count → higher
                // ELO → coin-flip seeded by match ID) so the bracket
                // progresses and remains reproducible across saves.
                let winnerId: string
                if (homePlayers.length !== awayPlayers.length) {
                    winnerId = homePlayers.length > awayPlayers.length
                        ? bracketMatch.homeTeamId
                        : bracketMatch.awayTeamId
                } else if (homeTeam.elo !== awayTeam.elo) {
                    winnerId = homeTeam.elo > awayTeam.elo
                        ? bracketMatch.homeTeamId
                        : bracketMatch.awayTeamId
                } else {
                    const matchSeed = Array.from(bracketMatch.id).reduce(
                        (acc, ch) => ((acc * 31) + ch.charCodeAt(0)) >>> 0,
                        0,
                    )
                    winnerId = (matchSeed & 1) === 0
                        ? bracketMatch.homeTeamId
                        : bracketMatch.awayTeamId
                }
                debug.warn(`[Tournament] Both teams in ${bracketMatch.id} understaffed (${homePlayers.length} vs ${awayPlayers.length}) — forced walkover to ${winnerId}`)
                bracketMatch.winnerId = winnerId
                bracketMatch.isCompleted = true
            }
            return
        }

        const matchEngine = getMatchEngine()
        const MatchAnalyzer = getMatchAnalyzer()
        const fallbackSeed = Math.max(
            1,
            Array.from(bracketMatch.id).reduce((acc, ch) => ((acc * 31) + ch.charCodeAt(0)) >>> 0, 0)
        )
        const resolvedSeed = (typeof bracketMatch.seed === "number" && bracketMatch.seed > 0)
            ? bracketMatch.seed
            : fallbackSeed
        bracketMatch.seed = resolvedSeed
        const rng = new SeededRNG(resolvedSeed)

        // Create a match object for simulation
        const matchForSim = {
            id: bracketMatch.id,
            homeTeamId: bracketMatch.homeTeamId,
            awayTeamId: bracketMatch.awayTeamId,
            tournamentId: bracketMatch.tournamentId,
            stage: bracketMatch.stage,
            week: bracketMatch.week,
            format: bracketMatch.format,
            seed: bracketMatch.seed
        }

        const homeTeamStaff = (save.staff || []).filter(s => s.teamId === homeTeam.id)
        const awayTeamStaff = (save.staff || []).filter(s => s.teamId === awayTeam.id)
        const result = matchEngine.simulateMatch(matchForSim, homeTeam, awayTeam, homePlayers, awayPlayers, rng, getCoachTacticalBonus(save, homeTeam), getCoachTacticalBonus(save, awayTeam), homeTeamStaff, awayTeamStaff)

        // Mark bracket match as complete
        bracketMatch.isCompleted = true
        const homeWon = result.homeScore > result.awayScore
        bracketMatch.winnerId = homeWon ? homeTeam.id : awayTeam.id
        bracketMatch.loserId = homeWon ? awayTeam.id : homeTeam.id

        // Create completed match record
        const completedMatch: CompletedMatchSaveData = {
            ...matchForSim,
            result,
            analysis: MatchAnalyzer.analyze(matchForSim, result, homeTeam.name, awayTeam.name, homePlayers, awayPlayers)
        }
        save.completedMatches.push(completedMatch)

        // Remove from scheduled if it was there
        save.scheduledMatches = save.scheduledMatches.filter(m => m.id !== bracketMatch.id)

        // Update ELO
        const scoreDiff = Math.abs(result.homeScore - result.awayScore)
        LeagueEngine.updateEloAfterMatch(
            save,
            bracketMatch.winnerId,
            bracketMatch.loserId!,
            scoreDiff,
            tournament.tier,
            undefined,
            undefined
        )

        // Process this match's progression (will add winner to next round)
        this.handlePlayoffProgression(save, tournament, bracketMatch, bracketMatch.winnerId, bracketMatch.loserId)
    }

    /**
     * Process match result and move teams forward in the tournament
     */
    static processMatchResult(save: GameSave, tournamentId: string, matchId: string, winnerId: string, loserId: string): void {
        const idx = buildSaveIndexes(save)
        const tournament = idx.tournamentIndex.get(tournamentId) ?? save.tournaments.find(t => t.id === tournamentId)
        if (!tournament || !tournament.playoffBracket) return

        const bracketMap = buildBracketIndex(tournament.playoffBracket)
        const bracketMatch = bracketMap.get(matchId) ?? tournament.playoffBracket.find((m: BracketMatchSaveData) => m.id === matchId)
        if (!bracketMatch) return

        // Idempotency guard. processMatchResult is called from both
        // atomic-week-processor and tournament-manager.simulateConcurrent,
        // and the same match can flow through both paths in adjacent
        // ticks. Without this check, MVP calculation, qualification and
        // placement would run a second time and double-write tournament
        // state. Re-applying winnerId is fine — re-running progression
        // handlers (handleOpeningResult etc) is not.
        if (bracketMatch.isCompleted && bracketMatch.winnerId === winnerId) {
            return
        }

        bracketMatch.isCompleted = true
        bracketMatch.winnerId = winnerId
        bracketMatch.loserId = loserId

        // Logical progression
        if (bracketMatch.id.includes("opening")) {
            this.handleOpeningResult(save, tournament, bracketMatch, winnerId, loserId)
        } else if (bracketMatch.id.includes("upper_semi")) {
            this.handleUpperSemiResult(save, tournament, bracketMatch, winnerId, loserId)
        } else if (bracketMatch.id.includes("upper_final")) {
            this.handleUpperFinalResult(save, tournament, bracketMatch, winnerId, loserId)
        } else if (bracketMatch.id.includes("lower")) {
            this.handleLowerResult(save, tournament, bracketMatch, winnerId, loserId)
        } else if (bracketMatch.id.includes("swiss")) {
            this.handleSwissResult(save, tournament, bracketMatch, winnerId, loserId)
        } else {
            // Generic Bracket Progression (QF, SF, Rounds, etc)
            // This handles "Quarter-final", "Semi-final", "Round of 64", etc.
            this.handlePlayoffProgression(save, tournament, bracketMatch, winnerId, loserId)

            // CHECK FOR TOURNAMENT COMPLETION
            if (bracketMatch.stage === "Grand Final" && bracketMatch.isCompleted) {
                tournament.isCompleted = true
                tournament.winnerId = winnerId

                // Calculate Tournament MVP
                const mvp = getTournamentMVP(save.completedMatches, tournament.id, save.players, save.teams)
                if (mvp) {
                    tournament.mvpPlayerId = mvp.playerId
                    tournament.mvpRating = mvp.avgRating
                }

                // Calculate Placements
                const placements = this.calculatePlacements(save, tournament)

                // Process Qualifications (Open -> Closed -> Main)
                const baseTournamentId = tournament.id.replace(/_s\d+$/, "")
                const baseDefinition =
                    require("@/data/tournament-calendar").getTournamentById(baseTournamentId)
                const qualifierContext = baseDefinition
                    ? { ...baseDefinition, id: tournament.id }
                    : { id: tournament.id }
                save.tournamentQualifications = QualificationEngine.processQualifierResults(
                    save.tournamentQualifications,
                    qualifierContext,
                    placements
                )
            }
        }
    }

    static calculatePlacements(save: GameSave, tournament: TournamentSaveData): { teamId: string, position: number }[] {
        const placements: { teamId: string, position: number }[] = []
        if (!tournament.playoffBracket) return placements

        // 1. Winner & Runner-up (Grand Final)
        const bracketMap = buildBracketIndex(tournament.playoffBracket)
        const grandFinal = tournament.playoffBracket.find(m => m.stage === "Grand Final")
        if (grandFinal && grandFinal.isCompleted && grandFinal.winnerId && grandFinal.loserId) {
            placements.push({ teamId: grandFinal.winnerId, position: 1 })
            placements.push({ teamId: grandFinal.loserId, position: 2 })
        }

        // 2. 3rd Place (Decider if exists, else Semis losers)
        const thirdDecider = tournament.playoffBracket.find(m => m.stage === "3rd Place Decider")
        if (thirdDecider && thirdDecider.isCompleted && thirdDecider.winnerId && thirdDecider.loserId) {
            placements.push({ teamId: thirdDecider.winnerId, position: 3 })
            placements.push({ teamId: thirdDecider.loserId, position: 4 })
        } else {
            // Find Semi-final losers — assign positions 3 and 4 sequentially
            const semis = tournament.playoffBracket.filter(m => m.stage.includes("Semi-final"))
            let semiPosition = 3
            semis.forEach(m => {
                if (m.isCompleted && m.loserId) {
                    if (!placements.find(p => p.teamId === m.loserId)) {
                        placements.push({ teamId: m.loserId, position: semiPosition++ })
                    }
                }
            })
        }

        // 3. Quarter-final losers (5th-8th) — assign unique positions
        const qfs = tournament.playoffBracket.filter(m => m.stage.includes("Quarter-final"))
        let qfPosition = 5
        qfs.forEach(m => {
            if (m.isCompleted && m.loserId) {
                placements.push({ teamId: m.loserId, position: qfPosition++ })
            }
        })

        // 4. Swiss Failures (if Swiss)
        if (tournament.standings) {
            const eliminatedInSwiss = tournament.standings
                .filter(s => s.losses >= 3)
                .sort((a, b) => b.wins - a.wins) // More wins = higher placement

            eliminatedInSwiss.forEach((s, idx) => {
                // Start placing after the bracket teams (usually top 8 make playoffs)
                placements.push({ teamId: s.teamId, position: 9 + idx })
            })
        }

        return placements.sort((a, b) => a.position - b.position)
    }

    private static handleSwissResult(save: GameSave, tournament: TournamentSaveData, match: BracketMatchSaveData, winnerId: string, loserId: string): void {
        handleSwissResultFn(save, tournament, match, winnerId, loserId, {
            setupGenericBracket: (s, t, ids, r, w) => this.setupGenericBracket(s, t, ids, r, w),
            notifyPlayerElimination: (s, t, id) => this.notifyPlayerElimination(s, t, id),
        })
    }

    private static generateSwissPlayoffs(save: GameSave, tournament: TournamentSaveData): void {
        generateSwissPlayoffsFn(save, tournament, {
            setupGenericBracket: (s, t, ids, r, w) => this.setupGenericBracket(s, t, ids, r, w),
            notifyPlayerElimination: (s, t, id) => this.notifyPlayerElimination(s, t, id),
        })
    }

    private static handleOpeningResult(save: GameSave, tournament: TournamentSaveData, match: BracketMatchSaveData, winnerId: string, loserId: string): void {
        handleOpeningResultFn(save, tournament, match, winnerId, loserId)
    }

    private static handleUpperSemiResult(save: GameSave, tournament: TournamentSaveData, match: BracketMatchSaveData, winnerId: string, loserId: string): void {
        handleUpperSemiResultFn(save, tournament, match, winnerId, loserId)
    }

    private static handleUpperFinalResult(save: GameSave, tournament: TournamentSaveData, match: BracketMatchSaveData, winnerId: string, loserId: string): void {
        handleUpperFinalResultFn(save, tournament, match, winnerId, loserId)
    }

    private static handleLowerResult(save: GameSave, tournament: TournamentSaveData, match: BracketMatchSaveData, winnerId: string, loserId: string): void {
        handleLowerResultFn(save, tournament, match, winnerId, loserId, {
            checkAndStartPlayoffs: (s, tid) => this.checkAndStartPlayoffs(s, tid),
            notifyPlayerElimination: (s, t, id) => this.notifyPlayerElimination(s, t, id),
        })
    }

    private static handlePlayoffProgression(save: GameSave, tournament: TournamentSaveData, match: BracketMatchSaveData, winnerId: string, loserId?: string): void {
        const nextMatch = tournament.playoffBracket?.find((m: BracketMatchSaveData) => m.sourceMatchIds?.includes(match.id))
        if (nextMatch) {
            if (!nextMatch.homeTeamId) nextMatch.homeTeamId = winnerId
            else nextMatch.awayTeamId = winnerId

            // NOTE: Do NOT auto-simulate sibling matches here!
            // This was causing brackets to skip rounds. Sibling matches should be simulated
            // naturally through the weekly processing or when the player's round is completed.
            // The next match will only be scheduled when BOTH source matches have completed
            // through natural progression.

            // Only schedule the next match if BOTH teams are ready (both source matches completed)
            if (nextMatch.homeTeamId && nextMatch.awayTeamId) this.scheduleBracketMatch(save, nextMatch)
        }

        // Special case for 3rd place decider
        if (match.stage.includes("Semi-final") && loserId) {
            const decider = tournament.playoffBracket?.find((m: BracketMatchSaveData) => m.stage === "3rd Place Decider")
            if (decider) {
                if (!decider.homeTeamId) decider.homeTeamId = loserId
                else decider.awayTeamId = loserId
                if (decider.homeTeamId && decider.awayTeamId) this.scheduleBracketMatch(save, decider)
            }
        }

        // ELIMINATION CHECK (Single Elimination)
        // Any loss here = Eliminated (unless it's a 3rd place decider, but even then tournament is over for them)
        if (loserId) {
            save.tournamentQualifications = QualificationEngine.updateStatus(
                save.tournamentQualifications,
                tournament.id,
                loserId,
                "ELIMINATED"
            )
            this.notifyPlayerElimination(save, tournament, loserId)
        }
    }

    private static checkAndStartPlayoffs(save: GameSave, tournamentId: string): void {
        const idx = buildSaveIndexes(save)
        const tournament = idx.tournamentIndex.get(tournamentId) ?? save.tournaments.find(t => t.id === tournamentId)
        if (!tournament || !tournament.groups || tournament.groups.length < 2) return

        const bracketMap = tournament.playoffBracket ? buildBracketIndex(tournament.playoffBracket) : undefined
        const getPlacements = (groupId: string) => {
            const uf = bracketMap?.get(`${groupId}_upper_final`) ?? tournament.playoffBracket?.find((m: BracketMatchSaveData) => m.id === `${groupId}_upper_final`)
            const lf = bracketMap?.get(`${groupId}_lower_final`) ?? tournament.playoffBracket?.find((m: BracketMatchSaveData) => m.id === `${groupId}_lower_final`)
            if (uf?.isCompleted && lf?.isCompleted) {
                return { first: uf.winnerId!, second: lf.winnerId!, third: lf.loserId! }
            }
            return null
        }

        const pA = getPlacements(tournament.groups[0].id)
        const pB = getPlacements(tournament.groups[1].id)

        if (pA && pB) this.generatePlayoffs(save, tournament, pA, pB)
    }

    private static generatePlayoffs(save: GameSave, tournament: TournamentSaveData, pA: { first: string, second: string, third: string }, pB: { first: string, second: string, third: string }): void {
        tournament.currentStage = "Playoffs"
        const startWeek = tournament.endWeek - 1

        const qf1: BracketMatchSaveData = { id: `${tournament.id}_qf_1`, tournamentId: tournament.id, stage: "Quarter-final 1", homeTeamId: pA.second, awayTeamId: pB.third, isCompleted: false, week: startWeek, format: "BO3", seed: 101, sourceMatchIds: [] }
        const qf2: BracketMatchSaveData = { id: `${tournament.id}_qf_2`, tournamentId: tournament.id, stage: "Quarter-final 2", homeTeamId: pB.second, awayTeamId: pA.third, isCompleted: false, week: startWeek, format: "BO3", seed: 102, sourceMatchIds: [] }

        this.addBracketMatch(tournament, qf1)
        this.addBracketMatch(tournament, qf2)
        this.scheduleBracketMatch(save, qf1)
        this.scheduleBracketMatch(save, qf2)

        const sf1: BracketMatchSaveData = { id: `${tournament.id}_sf_1`, tournamentId: tournament.id, stage: "Semi-final 1", awayTeamId: pB.first, isCompleted: false, week: startWeek + 1, format: "BO3", seed: 201, sourceMatchIds: [qf1.id] }
        const sf2: BracketMatchSaveData = { id: `${tournament.id}_sf_2`, tournamentId: tournament.id, stage: "Semi-final 2", awayTeamId: pA.first, isCompleted: false, week: startWeek + 1, format: "BO3", seed: 202, sourceMatchIds: [qf2.id] }
        this.addBracketMatch(tournament, sf1)
        this.addBracketMatch(tournament, sf2)

        this.addBracketMatch(tournament, { id: `${tournament.id}_grand_final`, tournamentId: tournament.id, stage: "Grand Final", isCompleted: false, week: startWeek + 2, format: "BO5", seed: 301, sourceMatchIds: [sf1.id, sf2.id] })
        this.addBracketMatch(tournament, { id: `${tournament.id}_3rd_place_decider`, tournamentId: tournament.id, stage: "3rd Place Decider", isCompleted: false, week: startWeek + 2, format: "BO3", seed: 302, sourceMatchIds: [sf1.id, sf2.id] })
    }

    private static setupGenericBracket(
        save: GameSave,
        tournament: TournamentSaveData,
        teamIds: string[],
        rng: SeededRNG,
        startWeekOverride?: number
    ): void {
        const idx = buildSaveIndexes(save)
        let numTeams = teamIds.length
        // Pad to next power of 2 with BYE slots if needed
        const paddedTeamIds = [...teamIds]
        if ((numTeams & (numTeams - 1)) !== 0) {
            const nextPow2 = Math.pow(2, Math.ceil(Math.log2(numTeams)))
            while (paddedTeamIds.length < nextPow2) paddedTeamIds.push("BYE")
            numTeams = nextPow2
        }

        // Seed by ELO/world ranking instead of pure random shuffle
        // Secondary sort by team ID ensures deterministic ordering for teams with identical ELO
        // Sort real teams by ELO, then append BYE entries as lowest seeds
        const realTeams = paddedTeamIds.filter(id => id !== "BYE")
        const byeCount = paddedTeamIds.length - realTeams.length
        const sorted = [...realTeams].sort((a, b) => {
            const teamA = idx.teamIndex.get(a) ?? save.teams.find(t => t.id === a)
            const teamB = idx.teamIndex.get(b) ?? save.teams.find(t => t.id === b)
            const eloA = teamA?.elo ?? (teamA?.worldRanking ? (2000 - (teamA?.worldRanking ?? 50)) : 1000)
            const eloB = teamB?.elo ?? (teamB?.worldRanking ? (2000 - (teamB?.worldRanking ?? 50)) : 1000)
            if (eloB !== eloA) return eloB - eloA
            return (stableTeamIdNumber(a) - stableTeamIdNumber(b))
        })
        // BYE entries go at the bottom so top seeds get byes
        for (let b = 0; b < byeCount; b++) sorted.push("BYE")
        // Apply standard tournament seeding (1v16, 8v9, 4v13, 5v12, ...)
        const applySeeding = (teams: string[]): string[] => {
            const n = teams.length
            if (n <= 2) return teams
            const seeded: string[] = new Array(n)
            for (let i = 0; i < n; i++) {
                // Standard seeding positions
                let pos: number
                if (i === 0) pos = 0
                else if (i === 1) pos = n - 1
                else {
                    // For remaining seeds, distribute evenly
                    const half = Math.floor(n / 2)
                    if (i % 2 === 0) pos = Math.floor(i / 2)
                    else pos = n - 1 - Math.floor(i / 2)
                }
                seeded[pos] = teams[i]
            }
            // Fill any gaps with remaining teams (add slight randomness within tiers)
            const remaining = teams.filter(t => !seeded.includes(t))
            let rIdx = 0
            for (let i = 0; i < n; i++) {
                if (!seeded[i] && rIdx < remaining.length) {
                    seeded[i] = remaining[rIdx++]
                }
            }
            return seeded.filter(Boolean)
        }
        const shuffled = applySeeding(sorted)
        const totalRounds = Math.log2(numTeams)
        const duration = Math.max(1, tournament.endWeek - tournament.startWeek) // Minimum 1 week
        const startWeek = startWeekOverride ?? tournament.startWeek

        const matches: BracketMatchSaveData[] = []
        const matchesByRound: BracketMatchSaveData[][] = []

        // Helper to get stage name
        const getStageName = (teamsInRound: number, matchIndex: number): string => {
            if (teamsInRound === 2) return "Grand Final"
            if (teamsInRound === 4) return `Semi-final ${matchIndex + 1}`
            if (teamsInRound === 8) return `Quarter-final ${matchIndex + 1}`
            return `Round of ${teamsInRound} Match ${matchIndex + 1}`
        }

        // Generate Rounds
        let currentRoundTeams = numTeams
        let previousRoundMatches: BracketMatchSaveData[] = []

        for (let round = 1; round <= totalRounds; round++) {
            const numMatches = currentRoundTeams / 2
            const currentRoundMatches: BracketMatchSaveData[] = []

            // Determine Week for this round
            // Distribute rounds evenly across duration
            // simple linear mapping: (round-1) / (totalRounds-1) * duration
            // But we want Finals to be at the very end.
            let roundWeekOffset: number
            if (totalRounds === 1) {
                roundWeekOffset = 0
            } else {
                roundWeekOffset = Math.floor(((round - 1) / (totalRounds - 1)) * (duration))
            }
            // Cap at endWeek (though duration calculation should handle it)
            if (startWeek + roundWeekOffset >= tournament.endWeek) {
                roundWeekOffset = Math.max(0, tournament.endWeek - startWeek - 1)
            }

            const roundWeek = startWeek + roundWeekOffset

            for (let i = 0; i < numMatches; i++) {
                const matchId = `${tournament.id}_r${round}_m${i + 1}`
                const stageName = getStageName(currentRoundTeams, i)

                const match: BracketMatchSaveData = {
                    id: matchId,
                    tournamentId: tournament.id,
                    stage: stageName,
                    isCompleted: false,
                    week: roundWeek,
                    format: currentRoundTeams === 2 ? "BO5" : "BO3", // GF is BO5
                    seed: rng.int(0, 999999),
                    sourceMatchIds: []
                }

                // Link Logic
                if (round === 1) {
                    // First round: assign teams directly
                    match.homeTeamId = shuffled[i * 2]
                    match.awayTeamId = shuffled[i * 2 + 1]
                    // Auto-complete BYE matches so the real team advances
                    if (match.homeTeamId === "BYE" || match.awayTeamId === "BYE") {
                        match.isCompleted = true
                        match.winnerId = match.homeTeamId === "BYE" ? match.awayTeamId : match.homeTeamId
                        // Keep original team IDs intact - winnerId is what matters for progression
                    }
                } else {
                    // Subsequent rounds: link to previous matches
                    const m1 = previousRoundMatches[i * 2]
                    const m2 = previousRoundMatches[i * 2 + 1]
                    match.sourceMatchIds = [m1.id, m2.id]
                }

                currentRoundMatches.push(match)
                matches.push(match)
            }

            previousRoundMatches = currentRoundMatches
            matchesByRound.push(currentRoundMatches)
            currentRoundTeams /= 2
        }

        // Add all matches to save
        matches.forEach(m => {
            this.addBracketMatch(tournament, m)
            // Schedule only if ready and not already completed (BYE matches)
            if (m.homeTeamId && m.awayTeamId && !m.isCompleted) {
                this.scheduleBracketMatch(save, m)
            }
            // Propagate BYE winners to next round immediately
            if (m.isCompleted && m.winnerId) {
                this.handlePlayoffProgression(save, tournament, m, m.winnerId)
            }
        })

        // Add 3rd Place Decider if applicable (only for > 4 teams)
        if (numTeams >= 4) {
            const sfRound = matchesByRound[matchesByRound.length - 2]
            // SF1 and SF2
            const deciderId = `${tournament.id}_3rd_place_decider`
            const gfMatch = matches[matches.length - 1] // Last match added is GF

            const decider: BracketMatchSaveData = {
                id: deciderId,
                tournamentId: tournament.id,
                stage: "3rd Place Decider",
                isCompleted: false,
                week: gfMatch.week,
                format: "BO3",
                seed: rng.int(0, 999999),
                sourceMatchIds: sfRound.map(m => m.id)
            }
            this.addBracketMatch(tournament, decider)
            // Will be scheduled when SFs complete
        }
    }

    private static setupLeagueSchedule(
        save: GameSave,
        tournament: TournamentSaveData,
        teamIds: string[],
        rng: SeededRNG,
    ): void {
        setupLeagueScheduleFn(save, tournament, teamIds, rng)
    }
    private static setupSimpleBracket(save: GameSave, tournament: TournamentSaveData, teamIds: string[], rng: SeededRNG): void {
        // Fallback: Pair everyone up, give bye to last team if odd count
        const shuffled = rng.shuffle([...teamIds])
        const matchCount = Math.floor(shuffled.length / 2)

        for (let i = 0; i < matchCount; i++) {
            const matchId = `${tournament.id}_match_${i}`
            const match: BracketMatchSaveData = {
                id: matchId,
                tournamentId: tournament.id,
                stage: "Round 1",
                homeTeamId: shuffled[i * 2],
                awayTeamId: shuffled[i * 2 + 1],
                isCompleted: false,
                week: tournament.startWeek,
                format: "BO1",
                seed: rng.int(0, 999999),
                sourceMatchIds: []
            }
            this.addBracketMatch(tournament, match)
            this.scheduleBracketMatch(save, match)
        }

        // Handle bye for odd team count: last team auto-advances
        if (shuffled.length % 2 !== 0) {
            const byeTeamId = shuffled[shuffled.length - 1]
            const byeMatchId = `${tournament.id}_match_bye_${matchCount}`
            const byeMatch: BracketMatchSaveData = {
                id: byeMatchId,
                tournamentId: tournament.id,
                stage: "Round 1",
                homeTeamId: byeTeamId,
                awayTeamId: "BYE",
                isCompleted: true,
                winnerId: byeTeamId,
                week: tournament.startWeek,
                format: "BO1",
                seed: rng.int(0, 999999),
                sourceMatchIds: []
            }
            this.addBracketMatch(tournament, byeMatch)
        }
    }

    /**
     * Simulate AI teams registering for upcoming tournaments
     */
    static simulateWeeklyRegistrations(save: GameSave, currentWeek: number, rng: SeededRNG): void {
        const { FULL_TOURNAMENT_CALENDAR } = require("@/data/tournament-calendar")

        // 1. Find upcoming tournaments (starting in next 1-4 weeks)
        // We only care about tournaments that haven't started yet
        const upcoming = FULL_TOURNAMENT_CALENDAR.filter((t: TournamentDefinition) =>
            t.startWeek > currentWeek &&
            t.startWeek <= currentWeek + 8 // 8 week lookahead for registration
        )

        const idx = buildSaveIndexes(save)
        upcoming.forEach((def: TournamentDefinition) => {
            // Get or create dynamic tournament data
            let tournament = idx.tournamentIndex.get(def.id) ?? save.tournaments.find(t => t.id === def.id)
            if (!tournament) {
                const duration = def.duration || 1
                tournament = {
                    id: def.id,
                    seriesId: def.id,
                    instanceId: def.id,
                    seasonNumber: getSeasonFromWeek(def.startWeek),
                    name: def.name,
                    shortName: def.shortName || def.name,
                    tier: def.tier,
                    region: def.region || "INTERNATIONAL",
                    startWeek: def.startWeek,
                    endWeek: def.startWeek + duration,
                    duration: duration,
                    format: def.format,
                    prizePool: def.prizePool,
                    isCompleted: false,
                    teamIds: [],
                    playoffBracket: [],
                    currentStage: "Registration",
                    standings: []
                }
                save.tournaments.push(tournament)
            }

            // Skip if full
            if (tournament.teamIds.length >= def.slots) return

            // Registration chance increases as we get closer to start
            const weeksUntilStart = def.startWeek - currentWeek
            const urgency = Math.max(0.1, 1 - (weeksUntilStart / 8)) // 0.1 to 1.0

            // Find eligible teams not yet registered
            const currentTournament = tournament
            const potentialTeams = save.teams.filter(team => {
                if (team.id === save.playerTeamId) return false // Player registers manually
                if (currentTournament.teamIds.includes(team.id)) return false // Already registered

                // Logic: Higher tier teams prefer higher tier tournaments
                // S, A tiers for S_TIER team
                // A, B tiers for A_TIER team etc.
                // Simplified: worldRanking check
                const ranking = team.worldRanking || 100

                if (def.tier === "S_TIER" && ranking > 30) return false
                if (def.tier === "A_TIER" && ranking > 60) return false

                return true
            })

            // Attempt to register random teams
            const availableSlots = def.slots - currentTournament.teamIds.length
            const slotsToFillNow = Math.ceil(availableSlots * urgency * rng.next())

            const candidates = rng.shuffle(potentialTeams).slice(0, slotsToFillNow)

            candidates.forEach(team => {
                tournament!.teamIds.push(team.id)
                // Add to qualifications tracking
                this.addRegistrationQualification(save, def.id, team.id, "Direct Invite")
            })
        })
    }
    static simulateWeeklyRegistrationsV2(save: GameSave, currentWeek: number, rng: SeededRNG): void {
        const { FULL_TOURNAMENT_CALENDAR } = require("@/data/tournament-calendar")
        const idx = buildSaveIndexes(save)

        const currentSeason = Math.floor((currentWeek - 1) / 52) + 1

        FULL_TOURNAMENT_CALENDAR.forEach((def: TournamentDefinition) => {
            // Calculate absolute start week for this season
            let absStartWeek = (currentSeason - 1) * 52 + def.startWeek
            let targetSeason = currentSeason

            // If the start week has already passed this season, look at next season
            if (absStartWeek < currentWeek) {
                absStartWeek += 52
                targetSeason++
            }

            // Check if within registration window (8 weeks lookahead)
            if (absStartWeek <= currentWeek || absStartWeek > currentWeek + 8) return

            // Construct Seasonal ID
            const seasonalId = `${def.id}_s${targetSeason}`

            // Get or create dynamic tournament data
            let tournament = idx.tournamentIndex.get(seasonalId) ?? save.tournaments.find(t => t.id === seasonalId)
            if (!tournament) {
                const duration = def.duration || 1
                tournament = {
                    id: seasonalId,
                    seriesId: def.id,
                    instanceId: seasonalId,
                    seasonNumber: targetSeason,
                    name: targetSeason > 1 ? `${def.name} S${targetSeason}` : def.name,
                    shortName: def.name,
                    tier: def.tier,
                    region: def.region || "INTERNATIONAL",
                    startWeek: absStartWeek,
                    endWeek: absStartWeek + duration,
                    duration: duration,
                    format: def.format,
                    prizePool: def.prizePool,
                    isCompleted: false,
                    teamIds: [],
                    playoffBracket: [],
                    currentStage: "Registration",
                    standings: []
                }
                save.tournaments.push(tournament)
            }

            // Skip if full
            if (tournament.teamIds.length >= def.slots) return

            // Registration chance increases as we get closer to start
            const weeksUntilStart = absStartWeek - currentWeek
            const urgency = Math.max(0.1, 1 - (weeksUntilStart / 8))

            // Find eligible teams not yet registered
            const currentTournament = tournament
            const potentialTeams = save.teams.filter(team => {
                if (team.id === save.playerTeamId) return false
                if (currentTournament.teamIds.includes(team.id)) return false

                const ranking = team.worldRanking || 100

                if (def.tier === "S_TIER" && ranking > 30) return false
                if (def.tier === "A_TIER" && ranking > 60) return false

                return true
            })

            const availableSlots = def.slots - currentTournament.teamIds.length
            const slotsToFillNow = Math.ceil(availableSlots * urgency * rng.next())

            const candidates = rng.shuffle(potentialTeams).slice(0, slotsToFillNow)

            candidates.forEach(team => {
                tournament!.teamIds.push(team.id)
                // Add to qualifications tracking
                this.addRegistrationQualification(save, seasonalId, team.id, "Direct Invite")
            })
        })
    }
}
