/**
 * Swiss-stage handlers.
 *
 * Four functions covering the full Swiss-format lifecycle:
 *   - setupSwissStage — initialize per-team standings, schedule round 1.
 *   - generateSwissRound — pair teams by W-L record bucket, BO3 when
 *     close to elimination (2+ wins or losses), schedule the round.
 *     Odd team in a bucket gets a BYE win.
 *   - handleSwissResult — update standings (matches/wins/losses, map +/-,
 *     round +/-), advance to next round or playoffs, mark 3-loss
 *     ELIMINATED for tournament qualification tracking.
 *   - generateSwissPlayoffs — top-8 seed for the bracket stage. Pads
 *     with best 2-win teams if fewer than 8 have 3 wins (standard
 *     Swiss tiebreaker).
 *
 * Extracted from tournament-manager.ts. Three TournamentManager
 * methods are injected through SwissHandlerDeps to avoid circular
 * imports (addBracketMatch / scheduleBracketMatch / setupGenericBracket
 * / notifyPlayerElimination).
 */

import type { GameSave, TournamentSaveData, BracketMatchSaveData } from "../save-types"
import { buildSaveIndexes } from "@/store/indexes"
import { QualificationEngine } from "../tournament-qualification"
import { SeededRNG } from "../rng"
import {
    addBracketMatch as addBracketMatchFn,
    scheduleBracketMatch as scheduleBracketMatchFn,
} from "./bracket-scheduling"
import { stableTeamIdNumber } from "./seeding-helpers"

const SWISS_WINS_TO_ADVANCE = 3
const SWISS_LOSSES_TO_ELIMINATE = 3
const SWISS_PLAYOFF_BRACKET_SIZE = 8
const SWISS_MAX_ROUNDS = 5

export interface SwissHandlerDeps {
    /** TournamentManager.setupGenericBracket — used to seed playoffs from Swiss qualifiers. */
    setupGenericBracket: (
        save: GameSave,
        tournament: TournamentSaveData,
        teamIds: string[],
        rng: SeededRNG,
        startWeek: number,
    ) => void
    /** TournamentManager.notifyPlayerElimination — surfaces the elimination event. */
    notifyPlayerElimination: (save: GameSave, tournament: TournamentSaveData, teamId: string) => void
}

/**
 * Initialize per-team standings, schedule round 1.
 */
export function setupSwissStage(
    save: GameSave,
    tournament: TournamentSaveData,
    teamIds: string[],
    rng: SeededRNG,
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
        roundDiff: 0,
    }))

    generateSwissRound(save, tournament, 1, rng)
}

/**
 * Pair active teams (still alive — not yet at 3 wins or 3 losses) by W-L
 * bucket. Each pairing inside a bucket is shuffled. BO3 when either side
 * is at 2+ wins or 2+ losses (i.e. one match away from advance/elim).
 * Odd team in a bucket gets a BYE win.
 */
export function generateSwissRound(
    save: GameSave,
    tournament: TournamentSaveData,
    roundNum: number,
    rng: SeededRNG,
): void {
    const teams = tournament.standings.filter(
        s => s.wins < SWISS_WINS_TO_ADVANCE && s.losses < SWISS_LOSSES_TO_ELIMINATE,
    )
    if (teams.length === 0) return

    // Bucket by W-L record so equal teams play equal teams.
    const buckets: Record<string, string[]> = {}
    teams.forEach(s => {
        const key = `${s.wins}-${s.losses}`
        if (!buckets[key]) buckets[key] = []
        buckets[key].push(s.teamId)
    })

    // Prior-opponent map for rematch avoidance. Real CS-style Swiss (which the
    // Copenhagen/Shanghai Majors explicitly model) does not re-pair teams that
    // already met — derive each team's opponent history from the completed Swiss
    // matches of THIS tournament.
    const priorOpponents = new Map<string, Set<string>>()
    const noteOpponents = (a?: string, b?: string) => {
        if (!a || !b) return
        if (!priorOpponents.has(a)) priorOpponents.set(a, new Set())
        if (!priorOpponents.has(b)) priorOpponents.set(b, new Set())
        priorOpponents.get(a)!.add(b)
        priorOpponents.get(b)!.add(a)
    }
    save.completedMatches?.forEach(cm => {
        if (cm.tournamentId === tournament.id && cm.id.includes("_swiss_r")) {
            noteOpponents(cm.homeTeamId, cm.awayTeamId)
        }
    })
    const hasPlayed = (a: string, b: string) => priorOpponents.get(a)?.has(b) ?? false

    const matchedTeams = new Set<string>()
    const week = tournament.startWeek + roundNum - 1
    const recordOf = (tid: string) => tournament.standings?.find(s => s.teamId === tid)
    const isClose = (tid: string) => {
        const r = recordOf(tid)
        return !!r && (r.wins >= 2 || r.losses >= 2)
    }

    const scheduleSwissMatch = (home: string, away: string) => {
        matchedTeams.add(home)
        matchedTeams.add(away)
        const r = recordOf(home)
        const bucketKey = r ? `${r.wins}-${r.losses}` : "?"
        // BO3 when either side is one match from advance/elim.
        const format = (isClose(home) || isClose(away)) ? "BO3" : "BO1"

        const match: BracketMatchSaveData = {
            id: `${tournament.id}_swiss_r${roundNum}_${home}_${away}`,
            tournamentId: tournament.id,
            stage: `Swiss Round ${roundNum} (${bucketKey})`,
            homeTeamId: home,
            awayTeamId: away,
            isCompleted: false,
            week,
            format,
            seed: rng.int(0, 999999),
            sourceMatchIds: [],
        }
        addBracketMatchFn(tournament, match)
        scheduleBracketMatchFn(save, match)
    }

    // Pair within each W-L bucket. Defer the odd-one-out instead of granting an
    // immediate BYE — otherwise every odd bucket would award a free win, so a
    // round with N odd buckets hands out N BYEs. Real Swiss grants at most ONE
    // BYE per round, which matters because qualification is "advance at exactly
    // 3 wins": extra BYEs push the wrong teams over the line.
    const leftovers: string[] = []
    Object.keys(buckets).sort().forEach(key => {
        const bucketTeams = rng.shuffle(buckets[key].filter(tid => !matchedTeams.has(tid)))

        while (bucketTeams.length >= 2) {
            const home = bucketTeams.pop()!
            // Prefer an opponent this team has NOT already played; only fall back
            // to a rematch when no rematch-free partner remains in the bucket.
            let awayIdx = bucketTeams.length - 1
            for (let i = bucketTeams.length - 1; i >= 0; i--) {
                if (!hasPlayed(home, bucketTeams[i])) { awayIdx = i; break }
            }
            const away = bucketTeams.splice(awayIdx, 1)[0]
            scheduleSwissMatch(home, away)
        }

        if (bucketTeams.length === 1) leftovers.push(bucketTeams.pop()!)
    })

    // Float: pair leftover teams across adjacent buckets (strongest first —
    // more wins, then fewer losses, then a stable tiebreak), so a lone team in
    // each of several buckets plays a real match instead of getting a free win.
    leftovers.sort((a, b) => {
        const ra = recordOf(a)
        const rb = recordOf(b)
        if (rb && ra && rb.wins !== ra.wins) return rb.wins - ra.wins
        if (ra && rb && ra.losses !== rb.losses) return ra.losses - rb.losses
        return stableTeamIdNumber(a) - stableTeamIdNumber(b)
    })
    while (leftovers.length >= 2) {
        const home = leftovers.shift()!
        // Same rematch avoidance across floated buckets: pick the strongest
        // not-yet-faced leftover, else the strongest remaining (rematch).
        let awayIdx = 0
        for (let i = 0; i < leftovers.length; i++) {
            if (!hasPlayed(home, leftovers[i])) { awayIdx = i; break }
        }
        const away = leftovers.splice(awayIdx, 1)[0]
        scheduleSwissMatch(home, away)
    }

    // At most ONE BYE — to the single remaining (weakest) leftover.
    if (leftovers.length === 1) {
        const loneTeam = leftovers.pop()!
        matchedTeams.add(loneTeam)
        const byeRecord = recordOf(loneTeam)
        if (byeRecord) {
            byeRecord.wins++
            byeRecord.matchesPlayed++
        }
    }
}

/**
 * Apply a Swiss match result: bump standings, advance to next round
 * or playoffs when the round finishes, mark 3-loss as ELIMINATED.
 */
export function handleSwissResult(
    save: GameSave,
    tournament: TournamentSaveData,
    match: BracketMatchSaveData,
    winnerId: string,
    loserId: string,
    deps: SwissHandlerDeps,
): void {
    const idx = buildSaveIndexes(save)
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

    // Pull map + round differentials from the completed match record.
    const completedMatch = idx.completedMatchIndex.get(match.id)
        ?? save.completedMatches.find(cm => cm.id === match.id)
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
        const totalHomeRounds = maps.reduce((s: number, mp: { homeScore?: number }) => s + (mp.homeScore || 0), 0)
        const totalAwayRounds = maps.reduce((s: number, mp: { awayScore?: number }) => s + (mp.awayScore || 0), 0)
        if (wRecord) wRecord.roundDiff += isWinnerHome ? (totalHomeRounds - totalAwayRounds) : (totalAwayRounds - totalHomeRounds)
        if (lRecord) lRecord.roundDiff += isWinnerHome ? (totalAwayRounds - totalHomeRounds) : (totalHomeRounds - totalAwayRounds)
    }

    // Round-complete check: if every match in this round is done, advance.
    const swissMatch = match.id.match(/_swiss_r(\d+)_/)
    const roundNum = swissMatch ? parseInt(swissMatch[1], 10) : 1
    const roundMatches = tournament.playoffBracket?.filter(m => m.id.includes(`_swiss_r${roundNum}_`))
    const allFinished = roundMatches?.every(m => m.isCompleted)

    if (allFinished) {
        const qualified = tournament.standings?.filter(s => s.wins === SWISS_WINS_TO_ADVANCE).length || 0
        // Move to playoffs once 8 teams qualify or we hit max rounds.
        if (qualified >= SWISS_PLAYOFF_BRACKET_SIZE || roundNum >= SWISS_MAX_ROUNDS) {
            generateSwissPlayoffs(save, tournament, deps)
        } else {
            // Derive a fresh RNG seed from the main chain so re-runs are deterministic.
            const rng = new SeededRNG((save.lastRngSeed ?? 1) + roundNum)
            generateSwissRound(save, tournament, roundNum + 1, rng)

            // Deadlock guard: if the new round scheduled no real matches (≤1
            // active team remains, so it only produced a BYE), nothing will ever
            // call handleSwissResult to advance it. Jump straight to playoffs.
            const nextRoundMatches = tournament.playoffBracket?.filter(m =>
                m.id.includes(`_swiss_r${roundNum + 1}_`),
            ) ?? []
            if (nextRoundMatches.length === 0) {
                generateSwissPlayoffs(save, tournament, deps)
            }
        }
    }

    // Elimination check — 3 losses = out, track + notify.
    if (lRecord && lRecord.losses >= SWISS_LOSSES_TO_ELIMINATE) {
        save.tournamentQualifications = QualificationEngine.updateStatus(
            save.tournamentQualifications,
            tournament.id,
            loserId,
            "ELIMINATED",
        )
        deps.notifyPlayerElimination(save, tournament, loserId)
    }
}

/**
 * Seed the top-8 playoff bracket from Swiss results. 3-win teams first
 * (sorted by W-L diff, then round diff, then stable team-ID number).
 * Pads with best 2-win teams if fewer than 8 have 3 wins.
 */
export function generateSwissPlayoffs(
    save: GameSave,
    tournament: TournamentSaveData,
    deps: SwissHandlerDeps,
): void {
    tournament.currentStage = "Playoffs"

    const qualified = tournament.standings
        .filter(s => s.wins === SWISS_WINS_TO_ADVANCE)
        .sort((a, b) =>
            (b.wins - b.losses) - (a.wins - a.losses)
            || b.roundDiff - a.roundDiff
            || (stableTeamIdNumber(a.teamId) - stableTeamIdNumber(b.teamId))
        )
        .map(s => s.teamId)

    // Standard Swiss padding: if fewer than 8 have 3 wins, pull best 2-win teams.
    if (qualified.length < SWISS_PLAYOFF_BRACKET_SIZE) {
        const twoWinTeams = tournament.standings
            .filter(s => s.wins === 2 && s.losses < SWISS_LOSSES_TO_ELIMINATE && !qualified.includes(s.teamId))
            .sort((a, b) =>
                b.roundDiff - a.roundDiff
                || b.mapDiff - a.mapDiff
                || (stableTeamIdNumber(a.teamId) - stableTeamIdNumber(b.teamId))
            )
            .map(s => s.teamId)
        while (qualified.length < SWISS_PLAYOFF_BRACKET_SIZE && twoWinTeams.length > 0) {
            qualified.push(twoWinTeams.shift()!)
        }
    }

    // Deterministic playoff seed: mix lastRngSeed with currentWeek via
    // Knuth's multiplier so consecutive seasons don't produce identical brackets.
    const playoffSeed = Math.max(
        1,
        ((save.lastRngSeed ?? 1) ^ (save.currentWeek * 2654435761)) >>> 0,
    )
    deps.setupGenericBracket(
        save,
        tournament,
        qualified.slice(0, SWISS_PLAYOFF_BRACKET_SIZE),
        new SeededRNG(playoffSeed),
        save.currentWeek,
    )
}
