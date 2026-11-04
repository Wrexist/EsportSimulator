/**
 * One auto-simulated fixture (a match nobody plays by hand): an AI-vs-AI
 * fixture, or a managed-club match the manager missed. Shared by the week tick
 * (AtomicWeekProcessor.processMatches) and the daily calendar
 * (store simulateDueAIMatchesForDay), so a fixture is prepared and settled the
 * same way whichever path plays it: injured players skipped, staff talents,
 * the managed club's gear, fatigue/morale/form/XP, Elo, careers and
 * tournament progression.
 */
import type { GameSave, MatchSaveData, TeamSaveData, CompletedMatchSaveData, StaffSaveData, ContractSaveData } from "../save-types"
import type { SeededRNG } from "../rng"
import { MatchEngine } from "../match-engine"
import { debug } from "@/lib/debug-logger"
import { MatchAnalyzer } from "../match-analyzer"
import { updateRivalries, getRivalryBetween, derbyMultiplier } from "../history-tracker"
import { psychologistMoraleDampen } from "../staff-specialization"
import { applyFormResult, applyMoraleResult, resultSurpriseFactor } from "../player-lifecycle"
import { applyMatchSponsorGoalProgress } from "./match-sponsor-goals"
import { detectAchievementFlags } from "./match-achievement-flags"
import { processForfeitMatch } from "./match-forfeit"
import { processMatchWeaponMastery } from "./match-weapon-mastery"
import { applyMatchManagerXP } from "./match-manager-xp"
import { settlePlayerContractBonuses } from "./player-contract-bonuses"
import { isOfficialMatch, lineupDefeatShield, playerResultMorale, recordAppearances } from "../personality"
import { LeagueEngine } from "../league-engine"
import { expectedScore } from "../world-ranking"
import { TournamentManager } from "../tournament-manager"
import { recordOfficialMatch } from "../official-stats"
import type { SaveIndexes } from "@/store/indexes"

const defaultEngine = new MatchEngine()

export interface AutoMatchContext {
    rng: SeededRNG
    playerTeamId: string
    idx?: SaveIndexes
    /** Staff by club for this pass (falls back to idx, then a scan). */
    staffByTeamId?: Map<string, StaffSaveData[]>
    /** Contracts by club, when the caller has them (else the whole list is scanned). */
    contractsByTeamId?: Map<string, ContractSaveData[]>
    eventIdSet?: Set<string>
    ledgerIdSet?: Set<string>
    /** Receives the id of every fixture settled (played or forfeited). */
    removedMatchIds: Set<string>
    engine?: MatchEngine
}

export interface AutoMatchOutcome {
    /** Count toward the tick's matchesPlayed (forfeits report their own delta). */
    matchesPlayed: number
    /** True when the match was played and its result recorded. */
    recorded: boolean
}

/** Plays and settles one auto-simulated fixture. Never throws for a single bad match. */
export function playAutoMatch(
    save: GameSave,
    match: MatchSaveData,
    homeTeam: TeamSaveData,
    awayTeam: TeamSaveData,
    ctx: AutoMatchContext,
): AutoMatchOutcome {
    const { rng, playerTeamId, idx, eventIdSet, ledgerIdSet, removedMatchIds } = ctx
    const engine = ctx.engine ?? defaultEngine
    const staffFor = (teamId: string): StaffSaveData[] =>
        ctx.staffByTeamId?.get(teamId) ?? idx?.staffByTeamId.get(teamId) ?? save.staff.filter(s => s.teamId === teamId)

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
        return { matchesPlayed: forfeitDelta, recorded: false }
    }

    try {
        // Team staff drive the match exactly as on the managed path
        // (coach/analyst/psychologist levels + talents); the playstyle
        // counter is applied inside the engine. No extra tactical bonus:
        // the old analyst-stat + RPS bonus here was scaled x10 by the
        // engine and double-counted the counter.
        const homeTeamStaff = staffFor(homeTeam.id)
        const awayTeamStaff = staffFor(awayTeam.id)

        // Simulate using full engine
        const result = engine.simulateMatch(
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

        // C1: the result is judged against the odds (pre-match Elo; the
        // Elo exchange below runs after this).
        const homeExpected = expectedScore(homeTeam.elo ?? 1000, awayTeam.elo ?? 1000)
        if (isPlayerMatch) completedMatch.homeExpected = Math.round(homeExpected * 1000) / 1000

        const updateStats = (players: typeof save.players, won: boolean, moraleLossDampen: number, shield: number, expected: number) => {
            const surprise = resultSurpriseFactor(expected, won)
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

                let moraleDelta = getMoraleChange(won) * derbyStakes * surprise
                if (moraleDelta < 0) moraleDelta *= (1 - moraleLossDampen)
                p.morale = applyMoraleResult(p.morale, playerResultMorale(p, moraleDelta, shield))
                p.form = applyFormResult(p.form, won, surprise)

                // Phase 6: Skill Point Progression
                // 5% chance on win, 1% on loss to simulate learning
                const spChance = won ? 0.05 : 0.01
                if (rng.next() < spChance) {
                    p.availableSkillPoints = (p.availableSkillPoints || 0) + 1
                    // Optional: Log an event for this? Might be too spammy.
                }
            })
        }

        updateStats(homePlayers, homeWon, homeMoraleDampen, homeShield, homeExpected)
        updateStats(awayPlayers, !homeWon, awayMoraleDampen, awayShield, 1 - homeExpected)
        // Phase 5.2: official appearances (starters / fit players left out).
        if (isOfficialMatch(match)) {
            recordAppearances(homeTeam, homePlayers.map(p => p.id), lookupPlayer)
            recordAppearances(awayTeam, awayPlayers.map(p => p.id), lookupPlayer)
        }

        applyMatchSponsorGoalProgress(save, homeTeam, homeWon, result.homeScore, match.id, eventIdSet, ledgerIdSet)
        applyMatchSponsorGoalProgress(save, awayTeam, !homeWon, result.awayScore, match.id, eventIdSet, ledgerIdSet)
        // The settlement only reads the club's own contracts.
        const bonusBook = (teamId: string) => {
            const contracts = ctx.contractsByTeamId?.get(teamId)
            return contracts ? { teams: save.teams, contracts, financeLedger: save.financeLedger, currentWeek: save.currentWeek } : save
        }
        settlePlayerContractBonuses(bonusBook(homeTeam.id), match.id, homeTeam.id, homeWon, Object.keys(result.playerStats ?? {}), result.mvpPlayerId, ledgerIdSet, isOfficialMatch(match))
        settlePlayerContractBonuses(bonusBook(awayTeam.id), match.id, awayTeam.id, !homeWon, Object.keys(result.playerStats ?? {}), result.mvpPlayerId, ledgerIdSet, isOfficialMatch(match))

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

            // Store ELO change (Phase 19 improvement) on the record pushed above.
            if (eloResult) {
                completedMatch.eloChange = {
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


        return { matchesPlayed: 1, recorded: true }
    } catch (matchErr) {
        // A single match throwing must not abort the entire week.
        debug.error('[auto-match] match processing failed', matchErr)
        let matchesPlayed = 0
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
                debug.error('[auto-match] forfeit fallback failed; dropping match', forfeitErr)
                removedMatchIds.add(match.id)
            }
        }
        // If the match WAS already recorded, a post-result step
        // (Elo, tournament progression) threw — keep the result and
        // move on rather than re-forfeiting a duplicate.
        return { matchesPlayed, recorded: false }
    }
}
