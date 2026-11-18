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
 *   - generateSwissPlayoffs — top-8 seed for the bracket stage, seeded in
 *     Swiss order. Pads with best 2-win teams if fewer than 8 have 3 wins
 *     (standard Swiss tiebreaker).
 *
 * A stage is played out: it ends when every club has 3 wins or 3 losses (or
 * after round 5), never earlier. A 24-club Major plays two 16-club stages the
 * way real Majors do: stage 1 is the 16 RMR clubs, 8 advance and meet the 8
 * invited clubs in stage 2, whose 8 advancing clubs play the playoff. A Swiss
 * qualifier (RMR) has no playoff: its 3-win clubs qualify in Swiss order.
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
import { isQualificationForTournament } from "../circuit-engine"
import { getTournamentById } from "@/data/tournament-calendar"
import {
    addBracketMatch as addBracketMatchFn,
    scheduleBracketMatch as scheduleBracketMatchFn,
} from "./bracket-scheduling"
import { stableTeamIdNumber } from "./seeding-helpers"

const SWISS_WINS_TO_ADVANCE = 3
const SWISS_LOSSES_TO_ELIMINATE = 3
const SWISS_PLAYOFF_BRACKET_SIZE = 8
const SWISS_MAX_ROUNDS = 5
/** A Major's field: 16 RMR clubs (stage 1) + 8 invited clubs (join in stage 2). */
const MAJOR_FIELD = 24
const MAJOR_STAGE2_INVITES = 8
const SWISS_STAGE_SIZE = 16

type SwissRow = TournamentSaveData["standings"][number]

/** Swiss order: wins, then record, then round and map difference. */
export function swissOrder<T extends Pick<SwissRow, "teamId" | "wins" | "losses" | "roundDiff" | "mapDiff">>(rows: T[]): T[] {
    return [...rows].sort((a, b) =>
        b.wins - a.wins
        || (b.wins - b.losses) - (a.wins - a.losses)
        || b.roundDiff - a.roundDiff
        || b.mapDiff - a.mapDiff
        || (stableTeamIdNumber(a.teamId) - stableTeamIdNumber(b.teamId))
        || a.teamId.localeCompare(b.teamId))
}

/** First round number of the Swiss stage now being played (stage 2 of a Major starts later). */
function stageFirstRound(tournament: TournamentSaveData): number {
    return tournament.swissStage2Round ?? 1
}

/** Week of a Swiss round: one round a week; a two-stage Major plays two a week (on different days). */
function swissRoundWeek(tournament: TournamentSaveData, roundNum: number): number {
    return tournament.swissInvites?.length
        ? tournament.startWeek + Math.floor((roundNum - 1) / 2)
        : tournament.startWeek + roundNum - 1
}

/**
 * Days a Swiss round prefers. A two-stage Major plays two rounds a week: the
 * first midweek, the second at the weekend, so both fit in the week. Other
 * Swiss events keep the usual weekend-first order.
 */
function swissRoundDays(tournament: TournamentSaveData, roundNum: number): number[] | undefined {
    if (!tournament.swissInvites?.length) return undefined
    return roundNum % 2 === 1 ? [2, 3, 1, 4, 0, 5, 6] : [5, 6, 4, 3, 2, 1, 0]
}

const freshRow = (teamId: string): SwissRow => ({
    teamId, matchesPlayed: 0, wins: 0, losses: 0, mapsWon: 0, mapsLost: 0, points: 0, mapDiff: 0, roundDiff: 0,
})

/**
 * The 8 clubs a 24-club Major seeds into stage 2: its ranked invites, then
 * (if fewer than 8 invites are in the field) the best-ranked other clubs.
 */
function majorStage2Clubs(save: GameSave, tournament: TournamentSaveData, teamIds: string[]): string[] {
    const invited = new Set((save.tournamentQualifications ?? [])
        .filter(q => q.qualifiedVia === "Direct Invite" && q.status !== "REGISTERED" && isQualificationForTournament(q, tournament.id))
        .map(q => q.teamId))
    const rank = (id: string) => save.teams.find(t => t.id === id)?.worldRanking ?? 999
    return [...teamIds]
        .sort((a, b) => Number(invited.has(b)) - Number(invited.has(a)) || rank(a) - rank(b) || a.localeCompare(b))
        .slice(0, MAJOR_STAGE2_INVITES)
}

/** Marks clubs out of the event (qualification row + the managed club's notice). */
function eliminate(save: GameSave, tournament: TournamentSaveData, teamIds: string[], deps: SwissHandlerDeps): void {
    for (const teamId of teamIds) {
        save.tournamentQualifications = QualificationEngine.updateStatus(save.tournamentQualifications, tournament.id, teamId, "ELIMINATED")
        deps.notifyPlayerElimination(save, tournament, teamId)
    }
}

/** The best `count` clubs of the stage: 3-win clubs in Swiss order, padded with the best 2-win clubs. */
function swissAdvancers(tournament: TournamentSaveData, count: number): string[] {
    const order = swissOrder(tournament.standings)
    const advancing = order.filter(s => s.wins >= SWISS_WINS_TO_ADVANCE).map(s => s.teamId)
    for (const s of order) {
        if (advancing.length >= count) break
        if (s.wins === SWISS_WINS_TO_ADVANCE - 1 && s.losses < SWISS_LOSSES_TO_ELIMINATE && !advancing.includes(s.teamId)) advancing.push(s.teamId)
    }
    return advancing.slice(0, count)
}

export interface SwissHandlerDeps {
    /** TournamentManager.setupGenericBracket — used to seed playoffs from Swiss qualifiers. */
    setupGenericBracket: (
        save: GameSave,
        tournament: TournamentSaveData,
        teamIds: string[],
        rng: SeededRNG,
        startWeek: number,
        /** Seed in the given (Swiss) order instead of by Elo. */
        keepSeedOrder?: boolean,
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
    // A 24-club Major: the invited clubs wait for stage 2.
    const invites = teamIds.length === MAJOR_FIELD ? majorStage2Clubs(save, tournament, teamIds) : []
    if (invites.length > 0) tournament.swissInvites = invites
    tournament.standings = teamIds.filter(tid => !invites.includes(tid)).map(freshRow)

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
    const week = swissRoundWeek(tournament, roundNum)
    // Round number inside the stage being played (stage 2 counts from 1 again).
    const stageRound = roundNum - stageFirstRound(tournament) + 1
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
            stage: `Swiss Round ${stageRound} (${bucketKey})`,
            homeTeamId: home,
            awayTeamId: away,
            isCompleted: false,
            week,
            format,
            seed: rng.int(0, 999999),
            sourceMatchIds: [],
        }
        addBracketMatchFn(tournament, match)
        scheduleBracketMatchFn(save, match, swissRoundDays(tournament, roundNum))
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
        // The stage is played out (COMP-02): it ends when every club has 3
        // wins or 3 losses, or after its 5th round, never because 8 clubs
        // reached 3 wins while others still had a match to play.
        const stillPlaying = tournament.standings?.filter(s => s.wins < SWISS_WINS_TO_ADVANCE && s.losses < SWISS_LOSSES_TO_ELIMINATE).length || 0
        const stageRound = roundNum - stageFirstRound(tournament) + 1
        if (stillPlaying === 0 || stageRound >= SWISS_MAX_ROUNDS) {
            finishSwissStage(save, tournament, roundNum, deps)
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
                finishSwissStage(save, tournament, roundNum + 1, deps)
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
 * A Swiss stage is over: a Major's stage 1 hands its 8 best clubs to stage 2,
 * a Swiss qualifier (RMR) is decided by the Swiss table, any other event
 * plays its playoff.
 */
function finishSwissStage(save: GameSave, tournament: TournamentSaveData, lastRound: number, deps: SwissHandlerDeps): void {
    if (tournament.swissInvites?.length && tournament.swissStage2Round === undefined) {
        startMajorStage2(save, tournament, lastRound, deps)
        return
    }
    if (tournament.tier === "QUALIFIER") {
        completeSwissQualifier(save, tournament, deps)
        return
    }
    generateSwissPlayoffs(save, tournament, deps)
}

/** Stage 1 of a Major is over: its 8 best clubs and the 8 invited clubs play stage 2. */
function startMajorStage2(save: GameSave, tournament: TournamentSaveData, lastRound: number, deps: SwissHandlerDeps): void {
    const invites = tournament.swissInvites ?? []
    const advancing = swissAdvancers(tournament, Math.max(0, SWISS_STAGE_SIZE - invites.length))
    eliminate(save, tournament, tournament.standings.filter(s => !advancing.includes(s.teamId) && s.losses < SWISS_LOSSES_TO_ELIMINATE).map(s => s.teamId), deps)
    tournament.swissStage1 = tournament.standings.map(s => ({ ...s }))
    tournament.swissStage2Round = lastRound + 1
    tournament.standings = [...invites, ...advancing].map(freshRow)
    generateSwissRound(save, tournament, lastRound + 1, new SeededRNG((save.lastRngSeed ?? 1) + lastRound))
}

/**
 * A Swiss qualifier (RMR) ends with its Swiss stage (COMP-03): its places go
 * to the 3-win clubs in Swiss order (3-0, 3-1, 3-2, then round difference),
 * not to a playoff whose quarter-final bracket position decided them.
 */
function completeSwissQualifier(save: GameSave, tournament: TournamentSaveData, deps: SwissHandlerDeps): void {
    const order = swissOrder(tournament.standings)
    const slots = getTournamentById(tournament.id.replace(/_s\d+$/, ""))?.qualifierSlots ?? SWISS_PLAYOFF_BRACKET_SIZE
    eliminate(save, tournament, order.slice(slots).filter(s => s.losses < SWISS_LOSSES_TO_ELIMINATE).map(s => s.teamId), deps)
    tournament.isCompleted = true
    tournament.winnerId = order[0]?.teamId
}

/**
 * Seed the top-8 playoff bracket from Swiss results, in Swiss order (3-0
 * clubs are the top seeds, as at real Majors). Pads with best 2-win teams if
 * fewer than 8 have 3 wins; clubs that miss the cut are out.
 */
export function generateSwissPlayoffs(
    save: GameSave,
    tournament: TournamentSaveData,
    deps: SwissHandlerDeps,
): void {
    tournament.currentStage = "Playoffs"

    // 3-win clubs in Swiss order, padded with the best 2-win clubs.
    const qualified = swissAdvancers(tournament, SWISS_PLAYOFF_BRACKET_SIZE)
    eliminate(save, tournament, tournament.standings.filter(s => !qualified.includes(s.teamId) && s.losses < SWISS_LOSSES_TO_ELIMINATE).map(s => s.teamId), deps)

    // Deterministic playoff seed: mix lastRngSeed with currentWeek via
    // Knuth's multiplier so consecutive seasons don't produce identical brackets.
    const playoffSeed = Math.max(
        1,
        ((save.lastRngSeed ?? 1) ^ (save.currentWeek * 2654435761)) >>> 0,
    )
    deps.setupGenericBracket(
        save,
        tournament,
        qualified,
        new SeededRNG(playoffSeed),
        save.currentWeek,
        true,
    )
}
