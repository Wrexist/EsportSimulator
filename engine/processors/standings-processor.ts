/**
 * Tournament standings + completion processor.
 *
 * Runs every tick for every tournament:
 *   1. Recompute per-team standings (matches/wins/losses, map +/-, round +/-)
 *      from save.completedMatches.
 *   2. Sort by points → wins → head-to-head → mapDiff → roundDiff →
 *      deterministic tiebreaker.
 *   3. Detect terminal completion (via tournament-completion module).
 *      Locks the winner (first terminal-stage winner found; falls back to
 *      standings[0]) so it doesn't shift on re-runs.
 *   4. Award trophy (season-aware dedup), distribute prize pool by
 *      placement, award circuit points by tier table.
 *   5. Bump winner reputation + followers (tier-scaled).
 *   6. Surface MEDIA event for the win.
 *   7. On player-team wins, queue a title moment (engine/moments.ts); on
 *      S_TIER wins, also queue a pendingLegendPick of 3 candidate legends.
 *      A title won on the result screen was queued there already
 *      (queueDecidedTitle); the keys dedupe both, so neither fires twice.
 *
 * Extracted from atomic-week-processor.ts. Signature unchanged.
 */

import type { GameSave, TournamentSaveData, CompletedMatchSaveData } from "../save-types"
import { EventType } from "@/types"
import type { SaveIndexes } from "@/store/indexes"
import { SeededRNG } from "../rng"
import { QualificationEngine } from "../tournament-qualification"
import { TournamentManager } from "../tournament-manager"
import { LEGENDARY_PLAYERS } from "../legendary-players-data"
import { CIRCUIT_POINTS, getTournamentById } from "@/data/tournament-calendar"
import { recordTitle } from "../official-stats"
import {
    isTerminalBracketStage,
    terminalTournamentWinner,
} from "./tournament-completion"
import { hasMomentKey, markMomentKey, queueMoment, type TitleMoment } from "../moments"

// Field-size-aware prize tables, the way real events publish them: each table
// sums to exactly 1.0 so a field is never paid more than the advertised pool.
// (The old single table summed to 1.12 — a full 16-team event paid 112%.)
// Compact fields (≤8 placed) keep the historical top-8 split unchanged.
const PRIZE_DISTRIBUTION_8: Record<number, number> = {
    1: 0.40, 2: 0.20, 3: 0.10, 4: 0.10, 5: 0.05, 6: 0.05, 7: 0.05, 8: 0.05,
}
// Modeled on real Major payouts: top-heavy, every placed team paid.
const PRIZE_DISTRIBUTION_16: Record<number, number> = {
    1: 0.36, 2: 0.18, 3: 0.09, 4: 0.09,
    5: 0.04, 6: 0.04, 7: 0.04, 8: 0.04,
    9: 0.02, 10: 0.02, 11: 0.02, 12: 0.02,
    13: 0.01, 14: 0.01, 15: 0.01, 16: 0.01,
}

const TIER_FAN_MULTIPLIER: Record<string, number> = {
    S_TIER: 200,
    A_TIER: 100,
    B_TIER: 50,
    C_TIER: 20,
}

const toBaseTournamentId = (id: string) => id.replace(/_s\d+$/, "")

/** Reputation a title adds before the 100 cap. */
const TITLE_REPUTATION = 10

/**
 * Prize per placed team, the way the week tick pays it: the field-size table
 * (16-place split once anyone is placed past 8th), each share rounded, and
 * the rounding drift folded into 1st place so the total matches the pool.
 */
export function computePrizeAwards(prizePool: number, placements: { teamId: string; position: number }[]): { teamId: string; position: number; amount: number }[] {
    if (!(prizePool > 0)) return []
    const deepField = placements.some(p => p.position > 8)
    const prizeTable = deepField ? PRIZE_DISTRIBUTION_16 : PRIZE_DISTRIBUTION_8
    const awards = placements
        .map(p => ({ p, pct: prizeTable[p.position] ?? 0 }))
        .filter(a => a.pct > 0)
        .map(a => ({ p: a.p, pct: a.pct, amount: Math.round(prizePool * a.pct) }))
    const exactTotal = Math.round(awards.reduce((s, a) => s + prizePool * a.pct, 0))
    const roundedTotal = awards.reduce((s, a) => s + a.amount, 0)
    const drift = exactTotal - roundedTotal
    if (drift !== 0) {
        const champ = awards.find(a => a.p.position === 1)
        if (champ) champ.amount += drift
    }
    return awards.map(a => ({ teamId: a.p.teamId, position: a.p.position, amount: a.amount }))
}

/** Followers a title adds for a club at this (post-title) reputation. */
function titleFanGain(tier: string, reputation: number): number {
    const mult = TIER_FAN_MULTIPLIER[tier] || 10
    return (mult * 100) + (reputation * mult)
}

/** The deciding match (the latest terminal-stage result) of a tournament, if recorded. */
function decidingMatch(save: GameSave, tournament: TournamentSaveData): CompletedMatchSaveData | undefined {
    return save.completedMatches
        .filter(m => m.tournamentId === tournament.id && !!m.stage && isTerminalBracketStage(m.stage))
        .sort((a, b) => b.week - a.week || b.id.localeCompare(a.id))[0]
}

/** The title moment for a tournament the managed club won. */
function buildTitleMoment(
    save: GameSave,
    tournament: TournamentSaveData,
    winnerId: string,
    rewards: { prize: number; prizeBooked: boolean; repGain: number; fanGain?: number },
): TitleMoment {
    const final = decidingMatch(save, tournament)
    const homeWon = final ? final.homeTeamId === winnerId : false
    const opponentId = final ? (homeWon ? final.awayTeamId : final.homeTeamId) : undefined
    const opponent = opponentId ? save.teams.find(t => t.id === opponentId) : undefined
    const score = final ? (homeWon ? `${final.result.homeScore}-${final.result.awayScore}` : `${final.result.awayScore}-${final.result.homeScore}`) : undefined
    return {
        key: `title:${tournament.id}`,
        kind: "title",
        week: save.currentWeek,
        tournamentId: tournament.id,
        tournamentName: tournament.name,
        tier: tournament.tier,
        major: tournament.tier === "S_TIER",
        prize: rewards.prize,
        prizeBooked: rewards.prizeBooked,
        repGain: rewards.repGain,
        ...(rewards.fanGain !== undefined ? { fanGain: rewards.fanGain } : {}),
        ...(final ? { matchId: final.id, finalStage: final.stage ?? undefined, finalScore: score } : {}),
        ...(opponent ? { finalOpponentName: opponent.name } : {}),
        ...(tournament.logoPath ? { logoPath: tournament.logoPath } : {}),
        ...(tournament.trophyPath ? { trophyPath: tournament.trophyPath } : {}),
    }
}

/**
 * Title decided by a result the manager just recorded (a grand final played
 * live or simulated): queue its moment now, so it shows on the result screen
 * instead of after the next week tick, with the exact prize share the tick
 * will pay. S-tier titles also offer the legend pick now. League-format
 * events are left to the week tick (their table is recomputed there).
 * Returns true when a moment was queued.
 */
export function queueDecidedTitle(save: GameSave, tournamentId: string | null | undefined): boolean {
    if (!tournamentId || !save.playerTeamId) return false
    const tournament = save.tournaments.find(t => t.id === tournamentId)
    if (!tournament || tournament.rewardsGranted || tournament.format === "league") return false
    if (hasMomentKey(save, `title:${tournament.id}`)) return false
    if (terminalTournamentWinner(save, tournament) !== save.playerTeamId) return false
    const team = save.teams.find(t => t.id === save.playerTeamId)
    if (!team) return false
    const placements = TournamentManager.calculatePlacements(save, tournament)
    const prize = computePrizeAwards(tournament.prizePool, placements).find(a => a.teamId === team.id)?.amount ?? 0
    const trophyExists = (team.trophies ?? []).some(t => t.tournamentId === tournament.id)
    const repGain = trophyExists ? 0 : Math.min(100, (team.reputation ?? 0) + TITLE_REPUTATION) - (team.reputation ?? 0)
    const queued = queueMoment(save, buildTitleMoment(save, tournament, team.id, { prize, prizeBooked: false, repGain }))
    if (queued) offerLegendPick(save, team, tournament)
    return queued
}

/** S-tier titles offer three legends, once per title. */
function offerLegendPick(save: GameSave, team: { rosterIds: string[] }, tournament: TournamentSaveData): void {
    if (tournament.tier !== "S_TIER") return
    const key = `legend:${tournament.id}`
    if (hasMomentKey(save, key)) return
    markMomentKey(save, key)
    queueLegendPick(save, team, tournament)
}

function compareStandings(
    a: TournamentSaveData["standings"][number],
    b: TournamentSaveData["standings"][number],
    headToHeadWins: Map<string, number>,
): number {
    if (b.points !== a.points) return b.points - a.points
    if (b.wins !== a.wins) return b.wins - a.wins

    const h2h = (headToHeadWins.get(b.teamId) || 0) - (headToHeadWins.get(a.teamId) || 0)
    if (h2h) return h2h
    if (b.mapDiff !== a.mapDiff) return b.mapDiff - a.mapDiff
    if (b.roundDiff !== a.roundDiff) return b.roundDiff - a.roundDiff
    // Deterministic fallback for fully tied teams.
    return a.teamId.localeCompare(b.teamId)
}

function recomputeStandings(
    tournament: TournamentSaveData,
    tournamentMatches: CompletedMatchSaveData[],
): void {
    // Swiss standings are owned incrementally by handleSwissResult — including
    // BYE wins, which have NO completed match. A from-scratch rebuild from
    // `tournamentMatches` would set wins = match-wins-only and erase those BYE
    // wins, corrupting Swiss qualification (teams advance at exactly 3 wins).
    // So for Swiss we leave the incrementally-maintained wins/losses/maps/rounds
    // intact and only keep `points` in sync with the wins*3 convention the UI
    // expects; everything is still sorted below.
    // A league's champion is standings[0]. initializeTournament builds the
    // round-robin schedule but never seeded a row per entrant, so leagues
    // started in-career finished every match yet never crowned a winner
    // (no trophy, prizes or circuit points). Seed missing rows here so new
    // and already-stuck saves both resolve from their recorded matches.
    if (tournament.format === "league") {
        const present = new Set(tournament.standings.map(s => s.teamId))
        for (const teamId of new Set(tournament.teamIds)) {
            if (present.has(teamId)) continue
            tournament.standings.push({ teamId, matchesPlayed: 0, wins: 0, losses: 0, mapsWon: 0, mapsLost: 0, points: 0, mapDiff: 0, roundDiff: 0 })
        }
    }
    if (tournament.format !== "swiss") {
        tournament.standings.forEach(standing => {
            const teamMatches = tournamentMatches.filter(
                m => m.homeTeamId === standing.teamId || m.awayTeamId === standing.teamId
            )

            standing.matchesPlayed = teamMatches.length
            standing.wins = teamMatches.filter(m => {
                const isHome = m.homeTeamId === standing.teamId
                return isHome
                    ? m.result.homeScore > m.result.awayScore
                    : m.result.awayScore > m.result.homeScore
            }).length
            standing.losses = standing.matchesPlayed - standing.wins
            standing.points = standing.wins * 3

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
    } else {
        // handleSwissResult maintains wins/losses/maps/rounds (incl. BYEs) but
        // not points — keep it consistent so the standings sort is correct.
        tournament.standings.forEach(standing => {
            standing.points = standing.wins * 3
        })
    }

    // A mini-table across every tied team is transitive even for A > B > C > A.
    const headToHeadWins = new Map<string, number>()
    for (const standing of tournament.standings) {
        const tied = new Set(tournament.standings.filter(other => other.points === standing.points && other.wins === standing.wins).map(other => other.teamId))
        headToHeadWins.set(standing.teamId, tournamentMatches.filter(match => tied.has(match.homeTeamId) && tied.has(match.awayTeamId) && match.result.winnerId === standing.teamId).length)
    }
    tournament.standings.sort((a, b) => compareStandings(a, b, headToHeadWins))
}

export function updateStandings(
    save: GameSave,
    idx?: SaveIndexes,
    eventIdSet?: Set<string>,
    ledgerIdSet?: Set<string>,
): void {
    save.tournaments.forEach(tournament => {
        const seen = new Set<string>()
        const tournamentMatches = save.completedMatches.filter(m => {
            if (m.tournamentId !== tournament.id || seen.has(m.id)) return false
            seen.add(m.id)
            return true
        })

        recomputeStandings(tournament, tournamentMatches)

        if (tournament.rewardsGranted) return
        const winnerTeamId = terminalTournamentWinner(save, tournament)
        if (!winnerTeamId) return
        tournament.isCompleted = true
        tournament.winnerId = winnerTeamId

        const winningTeam = idx?.teamIndex.get(winnerTeamId)
            ?? save.teams.find(t => t.id === winnerTeamId)
        if (!winningTeam) return
        if (!winningTeam.trophies) winningTeam.trophies = []

        // Season-aware trophy dedup: same series in the same season can't
        // award twice even if completion logic re-enters.
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
                ...(tournament.mvpPlayerId ? { mvpId: tournament.mvpPlayerId } : {}),
            })
            // Phase 5.1: the roster's players (and the manager) win it too.
            recordTitle(save, winningTeam, {
                tournamentId: tournament.id, name: tournament.name, tier: tournament.tier, week: save.currentWeek,
                season: tournament.seasonNumber ?? Math.floor(((tournament.endWeek ?? save.currentWeek) - 1) / 52) + 1,
            }, id => idx?.playerIndex.get(id) ?? save.players.find(p => p.id === id))
        }

        const placements = TournamentManager.calculatePlacements(save, tournament)
        const definition = getTournamentById(toBaseTournamentId(tournament.id))
        if (definition) {
            save.tournamentQualifications = QualificationEngine.processQualifierResults(
                save.tournamentQualifications || [], { ...definition, id: tournament.id }, placements,
            )
        }

        // Prize distribution by placement (UI-matching percentages): deep
        // fields (anything placed past 8th) use the 16-place split, compact
        // fields the historical top-8 split; rounding drift goes to 1st place
        // so the awarded total matches the intended total to the dollar
        // (small fields legitimately don't pay the full pool).
        const awards = computePrizeAwards(tournament.prizePool, placements)
        if (tournament.prizePool > 0) {
            for (const { teamId, position, amount: prizeAmount } of awards) {
                const p = { teamId, position }
                if (prizeAmount <= 0) continue

                const prizeLedgerId = `prize_${tournament.id}_${p.teamId}_p${p.position}`
                if (ledgerIdSet?.has(prizeLedgerId)
                    ?? save.financeLedger.some(entry => entry.id === prizeLedgerId)) continue

                const team = idx?.teamIndex.get(p.teamId)
                    ?? save.teams.find(t => t.id === p.teamId)
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

        // Circuit points by tier table. circuitPoints isn't indexed (small
        // array), so linear find is fine.
        if (!save.circuitPoints) save.circuitPoints = []
        const tierKey = tournament.tier as keyof typeof CIRCUIT_POINTS
        const pointsTable = (CIRCUIT_POINTS[tierKey] || {}) as Record<number, number>
        for (const p of placements) {
            const points = pointsTable[p.position] ?? 0
            if (points <= 0) continue

            let entry = save.circuitPoints.find(cp => cp.teamId === p.teamId)
            if (entry?.results.some(r => r.tournamentId === tournament.id)) continue
            if (entry) {
                entry.points += points
                entry.results.push({
                    tournamentId: tournament.id,
                    tournamentName: tournament.name,
                    placement: p.position,
                    points,
                    week: save.currentWeek,
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
                        week: save.currentWeek,
                    }],
                })
            }
        }

        // Reputation + follower gains for the champion.
        const reputationBefore = winningTeam.reputation
        if (!seasonAwareTrophyExists) winningTeam.reputation = Math.min(100, winningTeam.reputation + TITLE_REPUTATION)
        const fanGain = titleFanGain(tournament.tier, winningTeam.reputation)
        if (!seasonAwareTrophyExists) winningTeam.followers = (winningTeam.followers || 0) + fanGain

        // MEDIA event for the win (idempotent via eventIdSet).
        const trophyEventId = `trophy_${tournament.id}_${winnerTeamId}`
        if (!(eventIdSet?.has(trophyEventId) ?? save.eventsLog.some(event => event.id === trophyEventId))) {
            save.eventsLog.push({
                id: trophyEventId,
                type: EventType.MEDIA,
                week: save.currentWeek,
                data: { teamId: winningTeam.id, tournamentName: tournament.name, fanGain },
                acknowledged: false,
            })
            eventIdSet?.add(trophyEventId)
        }

        // Title moment + legend-pick offer on player-team wins (each once:
        // a grand final won on the result screen queued both already).
        if (winningTeam.id === save.playerTeamId) {
            const prize = awards.find(a => a.teamId === winningTeam.id)?.amount ?? 0
            queueMoment(save, buildTitleMoment(save, tournament, winningTeam.id, {
                prize,
                prizeBooked: prize > 0,
                repGain: seasonAwareTrophyExists ? 0 : winningTeam.reputation - reputationBefore,
                fanGain: seasonAwareTrophyExists ? 0 : fanGain,
            }))
            offerLegendPick(save, winningTeam, tournament)
        }

        tournament.rewardsGranted = true
    })
}

/**
 * S_TIER major reward: offer the player 3 legends to sign. Skips legends
 * already signed *and* legends whose namesake is still actively playing
 * on another team (we don't want a duplicate active-vs-legend pair).
 */
function queueLegendPick(
    save: GameSave,
    winningTeam: { rosterIds: string[] },
    tournament: TournamentSaveData,
): void {
    const alreadySigned = save.signedLegendIds || []
    const stillActiveLegendIds = (save.activelyPlayingLegendIds || []).filter(lid => {
        // If the original namesake still has an active (non-retired) clone
        // on the world, keep this legend out of the pool.
        const legendData = LEGENDARY_PLAYERS.find(lp => lp.id === lid)
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
    if (availableLegends.length < 3) return

    // Deterministic Fisher-Yates: same seed → same shuffle on save reload.
    const pickRng = new SeededRNG(save.currentWeek * 31337 + (save.lastRngSeed ?? 1))
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
