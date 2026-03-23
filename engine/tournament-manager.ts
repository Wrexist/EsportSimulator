import { SeededRNG } from "./rng"
import { debug } from "@/lib/debug-logger"
import {
    GameSave,
    TournamentSaveData,
    BracketMatchSaveData,
    TournamentGroupSaveData,
    MatchSaveData,
    CompletedMatchSaveData
} from "./save-types"
import { MatchFormat } from "@/types"
import { LeagueEngine } from "./league-engine"
import { STAFF_EFFECTS } from "@/types"
import { QualificationEngine } from "./tournament-qualification"
import { getTournamentMVP } from "./tournament-stats"
import { getSeasonFromWeek, resolveTournamentIdentity } from "./circuit-engine"

/** Deterministic numeric ID for tiebreaking — works for both numeric and string IDs */
function stableTeamIdNumber(id: string): number {
    const m = id.match(/\d+/)
    if (m) return parseInt(m[0])
    let h = 0
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
    return h
}

// Lazy-cached require to avoid circular import at module load time
let _matchEngineInstance: any = null
let _MatchAnalyzer: any = null
function getMatchEngine() {
    if (!_matchEngineInstance) {
        const { MatchEngine } = require("./match-engine")
        _matchEngineInstance = new MatchEngine()
    }
    return _matchEngineInstance
}
function getMatchAnalyzer() {
    if (!_MatchAnalyzer) {
        _MatchAnalyzer = require("./match-analyzer").MatchAnalyzer
    }
    return _MatchAnalyzer
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
        awayTeamId?: string
    ): string | undefined {
        if (completed.result?.winnerId) return completed.result.winnerId
        if (!completed.result) return undefined
        if (!homeTeamId || !awayTeamId) return undefined
        if (completed.result.homeScore > completed.result.awayScore) return homeTeamId
        if (completed.result.awayScore > completed.result.homeScore) return awayTeamId
        return undefined
    }

    static repairTournamentProgression(save: GameSave, tournamentId?: string): void {
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
                    const completedRecord = save.completedMatches.find(m => m.id === match.id)
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
        const tournament = save.tournaments.find(t => t.id === tournamentId)
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
        rng: SeededRNG
    ): void {
        tournament.standings = teamIds.map(tid => ({
            teamId: tid,
            matchesPlayed: 0,
            wins: 0,
            losses: 0,
            mapsWon: 0,
            mapsLost: 0,
            points: 0,
            mapDiff: 0,
            roundDiff: 0
        }))

        // Schedule Round 1
        this.generateSwissRound(save, tournament, 1, rng)
    }

    private static generateSwissRound(
        save: GameSave,
        tournament: TournamentSaveData,
        roundNum: number,
        rng: SeededRNG
    ): void {
        const teams = tournament.standings.filter(s => s.wins < 3 && s.losses < 3)
        if (teams.length === 0) return

        // Sort by record
        const buckets: Record<string, string[]> = {}
        teams.forEach(s => {
            const key = `${s.wins}-${s.losses}`
            if (!buckets[key]) buckets[key] = []
            buckets[key].push(s.teamId)
        })

        const matchedTeams = new Set<string>()
        const week = tournament.startWeek + roundNum - 1

        Object.keys(buckets).sort().forEach(key => {
            const bucketTeams = rng.shuffle(buckets[key].filter(tid => !matchedTeams.has(tid)))

            while (bucketTeams.length >= 2) {
                const home = bucketTeams.pop()!
                const away = bucketTeams.pop()!
                matchedTeams.add(home)
                matchedTeams.add(away)

                const matchId = `${tournament.id}_swiss_r${roundNum}_${home}_${away}`
                const match: BracketMatchSaveData = {
                    id: matchId,
                    tournamentId: tournament.id,
                    stage: `Swiss Round ${roundNum} (${key})`,
                    homeTeamId: home,
                    awayTeamId: away,
                    isCompleted: false,
                    week: week,
                    format: (() => { const [w, l] = key.split("-").map(Number); return (w >= 2 || l >= 2) ? "BO3" : "BO1"; })(), // BO3 when close to elimination (2+ wins or losses)
                    seed: rng.int(0, 999999),
                    sourceMatchIds: []
                }
                this.addBracketMatch(tournament, match)
                this.scheduleBracketMatch(save, match)
            }

            // Handle odd team in bucket: auto-advance with BYE win
            if (bucketTeams.length === 1) {
                const loneTeam = bucketTeams.pop()!
                matchedTeams.add(loneTeam)
                const byeRecord = tournament.standings?.find(s => s.teamId === loneTeam)
                if (byeRecord) {
                    byeRecord.wins++
                    byeRecord.matchesPlayed++
                }
            }
        })
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
        if (!tournament.playoffBracket) tournament.playoffBracket = []
        tournament.playoffBracket.push(match)
    }

    /**
     * Normalize stage name for comparison (e.g., "Round of 32 Match 1" -> "round of 32")
     */
    private static normalizeStage(stage: string): string {
        if (!stage) return ""
        const lower = stage.toLowerCase()
        // Extract base round name (e.g., "Round of 32 Match 1" -> "round of 32")
        const roMatch = stage.match(/^(Round of \d+)/i)
        if (roMatch) return roMatch[1].toLowerCase()
        if (lower.includes("quarter-final")) return "quarter-final"
        if (lower.includes("semi-final")) return "semi-final"
        if (lower.includes("grand final")) return "grand final"
        if (lower === "final" || lower === "finals") return "final"
        if (lower.includes("3rd") || lower.includes("third")) return "3rd place"
        return lower
    }

    /**
     * Get the round number for a bracket match (lower = earlier round)
     * Returns a numeric priority: lower numbers = earlier rounds that should be simulated first
     */
    private static getBracketRoundNumber(match: BracketMatchSaveData): number {
        const stage = match.stage.toLowerCase()
        const id = match.id.toLowerCase()

        // Extract round number from ID like "tournament_r1_m1" or "r2_m3"
        const roundFromId = id.match(/_r(\d+)_m/i) || id.match(/^r(\d+)_/i)
        if (roundFromId) {
            return parseInt(roundFromId[1])
        }

        // Extract from "Round of X" stages
        const roundOfMatch = stage.match(/round of (\d+)/i)
        if (roundOfMatch) {
            const size = parseInt(roundOfMatch[1])
            // Larger "Round of X" = earlier round (Round of 32 before Round of 16)
            return Math.log2(size) // 32->5, 16->4, 8->3, etc.
        }

        // Named stages get higher numbers (later rounds)
        if (stage.includes("quarter")) return 100
        if (stage.includes("semi")) return 200
        if (stage.includes("3rd") || stage.includes("third")) return 299 // 3rd place happens alongside final
        if (stage === "final" || stage === "finals" || stage.includes("grand final")) return 300

        // Default: use week as fallback
        return match.week || 50
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
                const homeTeam = save.teams.find(t => t.id === bracketMatch.homeTeamId)
                const awayTeam = save.teams.find(t => t.id === bracketMatch.awayTeamId)
                if (!homeTeam || !awayTeam) continue

                const homePlayers = homeTeam.rosterIds.map(id => save.players.find(p => p.id === id)).filter(Boolean) as any[]
                const awayPlayers = awayTeam.rosterIds.map(id => save.players.find(p => p.id === id)).filter(Boolean) as any[]
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

                const result = matchEngine.simulateMatch(matchForSim, homeTeam as any, awayTeam as any, homePlayers, awayPlayers, rng, getCoachTacticalBonus(save, homeTeam), getCoachTacticalBonus(save, awayTeam))

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
        const tournament = save.tournaments.find(t => t.id === tournamentId)
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
            const homeTeam = save.teams.find(t => t.id === match.homeTeamId)
            const awayTeam = save.teams.find(t => t.id === match.awayTeamId)
            if (!homeTeam || !awayTeam) continue

            const homePlayers = homeTeam.rosterIds.map(id => save.players.find(p => p.id === id)).filter(Boolean) as any[]
            const awayPlayers = awayTeam.rosterIds.map(id => save.players.find(p => p.id === id)).filter(Boolean) as any[]

            if (homePlayers.length < 5 || awayPlayers.length < 5) continue

            const result = matchEngine.simulateMatch(match, homeTeam as any, awayTeam as any, homePlayers, awayPlayers, rng, getCoachTacticalBonus(save, homeTeam), getCoachTacticalBonus(save, awayTeam))

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
                const team = save.teams.find(t => t.id === teamId)
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
        preferredDays: number[] = [5, 6, 4, 3, 2, 1, 0] // Sat, Sun, Fri, Thu, Wed, Tue, Mon
    ): number {
        // Find days already used by these teams in this week
        const existingDaysUsed = save.scheduledMatches
            .filter(m => m.week === week &&
                (teamIds.includes(m.homeTeamId) || teamIds.includes(m.awayTeamId)))
            .map(m => m.day)
            .filter((d): d is number => d !== undefined)

        // Return first available preferred day
        for (const day of preferredDays) {
            if (!existingDaysUsed.includes(day)) {
                return day
            }
        }
        return 5 // Default to Saturday if all days taken (shouldn't happen with 1 match/day)
    }

    private static scheduleBracketMatch(save: GameSave, match: BracketMatchSaveData): void {
        const existing = save.scheduledMatches.find((m: MatchSaveData) => m.id === match.id)
        if (existing) {
            return
        }

        if (match.homeTeamId && match.awayTeamId) {
            // Safety check: Skip if a team is playing itself
            if (match.homeTeamId === match.awayTeamId) {
                debug.warn(`[Match] SKIPPING - Team playing itself: ${match.id} (${match.homeTeamId} vs ${match.awayTeamId})`)
                return
            }

            // Assign a day that doesn't conflict with either team's existing matches
            const day = this.assignMatchDay(save, [match.homeTeamId, match.awayTeamId], match.week)

            const scheduledMatch: MatchSaveData = {
                id: match.id,
                homeTeamId: match.homeTeamId,
                awayTeamId: match.awayTeamId,
                tournamentId: match.tournamentId,
                stage: match.stage,
                week: match.week,
                day: day, // Added day assignment to enforce 1 game per day
                format: match.format,
                seed: match.seed,
                isHighPressure: match.stage.includes("Final") || match.stage.includes("Semi")
            }
            save.scheduledMatches.push(scheduledMatch)
        }
    }

    /**
     * Simulate a single bracket match immediately (used to progress brackets when sibling match is pending)
     */
    private static simulateSingleBracketMatch(save: GameSave, tournament: TournamentSaveData, bracketMatch: BracketMatchSaveData): void {
        if (!bracketMatch.homeTeamId || !bracketMatch.awayTeamId) return
        if (bracketMatch.isCompleted) return

        const homeTeam = save.teams.find(t => t.id === bracketMatch.homeTeamId)
        const awayTeam = save.teams.find(t => t.id === bracketMatch.awayTeamId)
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

        const homePlayers = homeTeam.rosterIds.map(id => save.players.find(p => p.id === id)).filter(Boolean) as any[]
        const awayPlayers = awayTeam.rosterIds.map(id => save.players.find(p => p.id === id)).filter(Boolean) as any[]

        if (homePlayers.length < 5 || awayPlayers.length < 5) {
            debug.warn(`[Tournament] Cannot simulate ${bracketMatch.id}: Not enough players (${homePlayers.length} vs ${awayPlayers.length})`)
            // Award walkover to the team with enough players
            if (homePlayers.length >= 5) {
                bracketMatch.winnerId = bracketMatch.homeTeamId
                bracketMatch.isCompleted = true
            } else if (awayPlayers.length >= 5) {
                bracketMatch.winnerId = bracketMatch.awayTeamId
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

        const result = matchEngine.simulateMatch(matchForSim, homeTeam as any, awayTeam as any, homePlayers, awayPlayers, rng, getCoachTacticalBonus(save, homeTeam), getCoachTacticalBonus(save, awayTeam))

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
        const tournament = save.tournaments.find(t => t.id === tournamentId)
        if (!tournament || !tournament.playoffBracket) return

        const bracketMatch = tournament.playoffBracket.find((m: BracketMatchSaveData) => m.id === matchId)
        if (!bracketMatch) return

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
                    : ({ id: tournament.id } as any)
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
        // Update standings record
        const wRecord = tournament.standings?.find(s => s.teamId === winnerId)
        const lRecord = tournament.standings?.find(s => s.teamId === loserId)

        if (wRecord) {
            wRecord.wins++
            wRecord.matchesPlayed++
        }
        if (lRecord) {
            lRecord.losses++
            lRecord.matchesPlayed++
        }

        // Update map and round differential from completed match data
        const completedMatch = save.completedMatches.find(cm => cm.id === match.id)
        if (completedMatch?.result) {
            const homeScore = completedMatch.result.homeScore ?? 0
            const awayScore = completedMatch.result.awayScore ?? 0
            const isWinnerHome = completedMatch.homeTeamId === winnerId

            if (wRecord) {
                wRecord.mapsWon += isWinnerHome ? homeScore : awayScore
                wRecord.mapsLost += isWinnerHome ? awayScore : homeScore
                wRecord.mapDiff = wRecord.mapsWon - wRecord.mapsLost
            }
            if (lRecord) {
                lRecord.mapsWon += isWinnerHome ? awayScore : homeScore
                lRecord.mapsLost += isWinnerHome ? homeScore : awayScore
                lRecord.mapDiff = lRecord.mapsWon - lRecord.mapsLost
            }

            const maps = completedMatch.result.maps || []
            const totalHomeRounds = maps.reduce((s: number, mp: any) => s + (mp.homeScore || 0), 0)
            const totalAwayRounds = maps.reduce((s: number, mp: any) => s + (mp.awayScore || 0), 0)
            if (wRecord) wRecord.roundDiff += isWinnerHome ? (totalHomeRounds - totalAwayRounds) : (totalAwayRounds - totalHomeRounds)
            if (lRecord) lRecord.roundDiff += isWinnerHome ? (totalAwayRounds - totalHomeRounds) : (totalHomeRounds - totalAwayRounds)
        }

        // Check if round is finished
        const swissMatch = match.id.match(/_swiss_r(\d+)_/)
        const roundNum = swissMatch ? parseInt(swissMatch[1]) : 1
        const roundMatches = tournament.playoffBracket?.filter(m => m.id.includes(`_swiss_r${roundNum}_`))
        const allFinished = roundMatches?.every(m => m.isCompleted)

        if (allFinished) {
            const qualified = tournament.standings?.filter(s => s.wins === 3).length || 0
            const eliminated = tournament.standings?.filter(s => s.losses === 3).length || 0

            if (qualified >= 8 || roundNum >= 5) {
                this.generateSwissPlayoffs(save, tournament)
            } else {
                const rng = new SeededRNG((save.lastRngSeed ?? 1) + roundNum)
                this.generateSwissRound(save, tournament, roundNum + 1, rng)
            }
        }

        // ELIMINATION CHECK (Swiss)
        if (lRecord && lRecord.losses >= 3) {
            save.tournamentQualifications = QualificationEngine.updateStatus(
                save.tournamentQualifications,
                tournament.id,
                loserId,
                "ELIMINATED"
            )
            this.notifyPlayerElimination(save, tournament, loserId)
        }
    }

    private static generateSwissPlayoffs(save: GameSave, tournament: TournamentSaveData): void {
        tournament.currentStage = "Playoffs"
        const qualified = tournament.standings
            .filter(s => s.wins === 3)
            .sort((a, b) => (b.wins - b.losses) - (a.wins - a.losses) || b.roundDiff - a.roundDiff || (stableTeamIdNumber(a.teamId) - stableTeamIdNumber(b.teamId)))
            .map(s => s.teamId)

        // If fewer than 8 teams have 3 wins, pad with best 2-win teams (standard Swiss tiebreaker)
        if (qualified.length < 8) {
            const twoWinTeams = tournament.standings
                .filter(s => s.wins === 2 && s.losses < 3 && !qualified.includes(s.teamId))
                .sort((a, b) => b.roundDiff - a.roundDiff || b.mapDiff - a.mapDiff || (stableTeamIdNumber(a.teamId) - stableTeamIdNumber(b.teamId)))
                .map(s => s.teamId)
            while (qualified.length < 8 && twoWinTeams.length > 0) {
                qualified.push(twoWinTeams.shift()!)
            }
        }

        const playoffSeed = Math.max(
            1,
            ((save.lastRngSeed ?? 1) ^ (save.currentWeek * 2654435761)) >>> 0
        )
        this.setupGenericBracket(
            save,
            tournament,
            qualified.slice(0, 8),
            new SeededRNG(playoffSeed),
            save.currentWeek
        )
    }

    private static handleOpeningResult(save: GameSave, tournament: TournamentSaveData, match: BracketMatchSaveData, winnerId: string, loserId: string): void {
        const groupId = match.id.split("_opening")[0]
        const matchIdx = parseInt(match.id.split("_").pop() || "0")
        const semiIdx = Math.floor(matchIdx / 2)

        // Winner to Upper Semi
        const semiId = `${groupId}_upper_semi_${semiIdx}`
        const semi = tournament.playoffBracket?.find((m: BracketMatchSaveData) => m.id === semiId)
        if (semi) {
            if (matchIdx % 2 === 0) semi.homeTeamId = winnerId
            else semi.awayTeamId = winnerId
            if (semi.homeTeamId && semi.awayTeamId) this.scheduleBracketMatch(save, semi)
        }

        // Loser to Lower Round 1
        const lowerR1Id = `${groupId}_lower_r1_${semiIdx}`
        let lowerR1 = tournament.playoffBracket?.find((m: BracketMatchSaveData) => m.id === lowerR1Id)
        if (!lowerR1) {
            lowerR1 = {
                id: lowerR1Id,
                tournamentId: tournament.id,
                stage: `${match.stage.split(" ")[0]} Lower Round 1`,
                isCompleted: false,
                week: match.week + 1,
                format: "BO3",
                seed: match.seed + 1,
                sourceMatchIds: []
            }
            this.addBracketMatch(tournament, lowerR1)
        }
        if (matchIdx % 2 === 0) lowerR1.homeTeamId = loserId
        else lowerR1.awayTeamId = loserId
        if (lowerR1.homeTeamId && lowerR1.awayTeamId) this.scheduleBracketMatch(save, lowerR1)
    }

    private static handleUpperSemiResult(save: GameSave, tournament: TournamentSaveData, match: BracketMatchSaveData, winnerId: string, loserId: string): void {
        const groupId = match.id.split("_upper_semi")[0]
        const matchIdx = parseInt(match.id.split("_").pop() || "0")

        // Winner to Upper Final
        const upperFinalId = `${groupId}_upper_final`
        const upperFinal = tournament.playoffBracket?.find((m: BracketMatchSaveData) => m.id === upperFinalId)
        if (upperFinal) {
            if (matchIdx === 0) upperFinal.homeTeamId = winnerId
            else upperFinal.awayTeamId = winnerId
            if (upperFinal.homeTeamId && upperFinal.awayTeamId) this.scheduleBracketMatch(save, upperFinal)
        }

        // Loser to Lower Semi
        const lowerSemiId = `${groupId}_lower_semi_${matchIdx}`
        let lowerSemi = tournament.playoffBracket?.find((m: BracketMatchSaveData) => m.id === lowerSemiId)
        if (!lowerSemi) {
            lowerSemi = {
                id: lowerSemiId,
                tournamentId: tournament.id,
                stage: `${match.stage.split(" ")[0]} Lower Semi`,
                isCompleted: false,
                week: match.week + 1,
                format: "BO3",
                seed: match.seed + 1,
                sourceMatchIds: []
            }
            this.addBracketMatch(tournament, lowerSemi)
        }
        lowerSemi.homeTeamId = loserId
        // Find winner of corresponding lower R1
        const lowerR1 = tournament.playoffBracket?.find((m: BracketMatchSaveData) => m.id === `${groupId}_lower_r1_${matchIdx}`)
        if (lowerR1?.winnerId) {
            lowerSemi.awayTeamId = lowerR1.winnerId
            this.scheduleBracketMatch(save, lowerSemi)
        }
    }

    private static handleUpperFinalResult(save: GameSave, tournament: TournamentSaveData, match: BracketMatchSaveData, winnerId: string, loserId: string): void {
        const groupId = match.id.split("_upper_final")[0]
        const lowerFinalId = `${groupId}_lower_final`
        let lowerFinal = tournament.playoffBracket?.find((m: BracketMatchSaveData) => m.id === lowerFinalId)
        if (!lowerFinal) {
            lowerFinal = {
                id: lowerFinalId,
                tournamentId: tournament.id,
                stage: `${match.stage.split(" ")[0]} Lower Final`,
                isCompleted: false,
                week: match.week + 2,
                format: "BO3",
                seed: match.seed + 1,
                sourceMatchIds: []
            }
            this.addBracketMatch(tournament, lowerFinal)
        }
        lowerFinal.homeTeamId = loserId
        const lowerSemi = tournament.playoffBracket?.find((m: BracketMatchSaveData) => m.id === `${groupId}_lower_semi_0`) // Simplified
        if (lowerSemi?.winnerId) {
            lowerFinal.awayTeamId = lowerSemi.winnerId
            this.scheduleBracketMatch(save, lowerFinal)
        }
    }

    private static handleLowerResult(save: GameSave, tournament: TournamentSaveData, match: BracketMatchSaveData, winnerId: string, loserId: string): void {
        const groupId = match.id.split("_lower")[0]
        if (match.id.includes("lower_r1")) {
            const matchIdx = parseInt(match.id.split("_").pop() || "0")
            const semi = tournament.playoffBracket?.find((m: BracketMatchSaveData) => m.id === `${groupId}_lower_semi_${matchIdx}`)
            if (semi) {
                semi.awayTeamId = winnerId
                if (semi.homeTeamId && semi.awayTeamId) this.scheduleBracketMatch(save, semi)
            }
        } else if (match.id.includes("lower_semi")) {
            const final = tournament.playoffBracket?.find((m: BracketMatchSaveData) => m.id === `${groupId}_lower_final`)
            if (final) {
                final.awayTeamId = winnerId
                if (final.homeTeamId && final.awayTeamId) this.scheduleBracketMatch(save, final)
            }
        } else if (match.id.includes("lower_final")) {
            this.checkAndStartPlayoffs(save, tournament.id)
        }

        // ELIMINATION CHECK (Lower Bracket)
        // Losing in lower bracket = Eliminated
        save.tournamentQualifications = QualificationEngine.updateStatus(
            save.tournamentQualifications,
            tournament.id,
            loserId,
            "ELIMINATED"
        )
        this.notifyPlayerElimination(save, tournament, loserId)
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
        const tournament = save.tournaments.find(t => t.id === tournamentId)
        if (!tournament || !tournament.groups || tournament.groups.length < 2) return

        const getPlacements = (groupId: string) => {
            const uf = tournament.playoffBracket?.find((m: BracketMatchSaveData) => m.id === `${groupId}_upper_final`)
            const lf = tournament.playoffBracket?.find((m: BracketMatchSaveData) => m.id === `${groupId}_lower_final`)
            if (uf?.isCompleted && lf?.isCompleted) {
                return { first: uf.winnerId!, second: lf.winnerId!, third: lf.loserId! }
            }
            return null
        }

        const pA = getPlacements(tournament.groups[0].id)
        const pB = getPlacements(tournament.groups[1].id)

        if (pA && pB) this.generatePlayoffs(save, tournament, pA, pB)
    }

    private static generatePlayoffs(save: GameSave, tournament: TournamentSaveData, pA: any, pB: any): void {
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
            const teamA = save.teams.find(t => t.id === a)
            const teamB = save.teams.find(t => t.id === b)
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
        rng: SeededRNG
    ): void {
        const teams = [...teamIds]
        // Add dummy team if odd number of teams
        if (teams.length % 2 !== 0) {
            teams.push("BYE")
        }

        const numTeams = teams.length
        const numRounds = numTeams - 1
        const matchesPerRound = numTeams / 2
        const startWeek = tournament.startWeek
        const duration = Math.max(1, tournament.endWeek - tournament.startWeek)

        // Circle Method for Round Robin
        const rounds: { home: string, away: string }[][] = []

        for (let round = 0; round < numRounds; round++) {
            const roundMatches: { home: string, away: string }[] = []

            for (let i = 0; i < matchesPerRound; i++) {
                const homeIdx = i
                const awayIdx = numTeams - 1 - i

                const home = teams[homeIdx]
                const away = teams[awayIdx]

                if (home !== "BYE" && away !== "BYE") {
                    roundMatches.push({ home, away })
                }
            }
            rounds.push(roundMatches)

            // Rotate teams (keep index 0 fixed)
            // [0, 1, 2, 3] -> [0, 3, 1, 2] (example)
            // Implementation: Move last element to index 1, shift everything else up
            teams.splice(1, 0, teams.pop()!)
        }

        // Distribute rounds across weeks
        // We have `numRounds` to play over `duration` weeks.
        // Ideally 1 round per week, or multiple if short duration.

        let currentMatchIndex = 0
        rounds.forEach((roundMatches, roundIndex) => {
            // Determine week for this round
            // Linear mapping of rounds to weeks
            const weekOffset = Math.floor((roundIndex / numRounds) * duration)
            const matchWeek = startWeek + weekOffset

            roundMatches.forEach(m => {
                const matchId = `${tournament.id}_league_${currentMatchIndex++}`
                const match: BracketMatchSaveData = {
                    id: matchId,
                    tournamentId: tournament.id,
                    stage: "League Match",
                    homeTeamId: m.home,
                    awayTeamId: m.away,
                    isCompleted: false,
                    week: matchWeek,
                    format: "BO1",
                    seed: rng.int(0, 999999),
                    sourceMatchIds: []
                }

                this.addBracketMatch(tournament, match)
                this.scheduleBracketMatch(save, match)
            })
        })
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
        const upcoming = FULL_TOURNAMENT_CALENDAR.filter((t: any) =>
            t.startWeek > currentWeek &&
            t.startWeek <= currentWeek + 8 // 8 week lookahead for registration
        )

        upcoming.forEach((def: any) => {
            // Get or create dynamic tournament data
            let tournament = save.tournaments.find(t => t.id === def.id)
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

        const currentSeason = Math.floor((currentWeek - 1) / 52) + 1

        FULL_TOURNAMENT_CALENDAR.forEach((def: any) => {
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
            let tournament = save.tournaments.find(t => t.id === seasonalId)
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
