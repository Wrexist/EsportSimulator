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
 *   7. On player-team wins, queue a pendingCelebration; on S_TIER wins,
 *      also queue a pendingLegendPick of 3 candidate legends.
 *
 * Extracted from atomic-week-processor.ts. Signature unchanged.
 */

import type { GameSave, TournamentSaveData, CompletedMatchSaveData } from "../save-types"
import { EventType } from "@/types"
import type { SaveIndexes } from "@/store/indexes"
import { SeededRNG } from "../rng"
import { TournamentManager } from "../tournament-manager"
import { LEGENDARY_PLAYERS } from "../legendary-players-data"
import { CIRCUIT_POINTS } from "@/data/tournament-calendar"
import {
    isTerminalBracketStage,
    hasTerminalTournamentCompletion,
} from "./tournament-completion"

const TROPHY_PRIZE_DISTRIBUTION: Record<number, number> = {
    1: 0.40, 2: 0.20, 3: 0.10, 4: 0.10, 5: 0.05, 6: 0.05, 7: 0.05, 8: 0.05,
    9: 0.025, 10: 0.025, 11: 0.025, 12: 0.025,
    13: 0.005, 14: 0.005, 15: 0.005, 16: 0.005,
}

const TIER_FAN_MULTIPLIER: Record<string, number> = {
    S_TIER: 200,
    A_TIER: 100,
    B_TIER: 50,
    C_TIER: 20,
}

const toBaseTournamentId = (id: string) => id.replace(/_s\d+$/, "")

function compareStandings(
    a: TournamentSaveData["standings"][number],
    b: TournamentSaveData["standings"][number],
    tournamentMatches: CompletedMatchSaveData[],
): number {
    if (b.points !== a.points) return b.points - a.points
    if (b.wins !== a.wins) return b.wins - a.wins

    // Head-to-head wins (desc) — only when teams have actually played.
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

    tournament.standings.sort((a, b) => compareStandings(a, b, tournamentMatches))
}

export function updateStandings(
    save: GameSave,
    idx?: SaveIndexes,
    eventIdSet?: Set<string>,
    ledgerIdSet?: Set<string>,
): void {
    save.tournaments.forEach(tournament => {
        const tournamentMatches = save.completedMatches.filter(
            m => m.tournamentId === tournament.id
        )

        recomputeStandings(tournament, tournamentMatches)

        // Completion now requires a terminal competitive state — not just
        // end-week — so a stalled bracket doesn't auto-award.
        if (!tournament.isCompleted && hasTerminalTournamentCompletion(save, tournament)) {
            let resolvedWinnerId = tournament.winnerId
            if (!resolvedWinnerId) {
                const terminalMatch = tournament.playoffBracket
                    ?.filter(m => isTerminalBracketStage(m.stage) && m.isCompleted && m.winnerId)
                    .sort((a, b) => (b.week || 0) - (a.week || 0))[0]
                resolvedWinnerId = terminalMatch?.winnerId || tournament.standings[0]?.teamId
            }
            // Only lock the tournament as complete once a concrete champion is
            // resolvable. Flipping isCompleted=true with no winnerId would
            // permanently lock a stalled bracket with no trophy/prizes/
            // qualifications and no way to finish it via the repair pass.
            if (resolvedWinnerId) {
                tournament.isCompleted = true
                tournament.winnerId = resolvedWinnerId
            }
        }

        if (!tournament.isCompleted || tournament.rewardsGranted) return
        if (tournamentMatches.length === 0) return

        const winnerTeamId = tournament.winnerId || tournament.standings[0]?.teamId
        if (!winnerTeamId) return

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
            })
        }

        const placements = TournamentManager.calculatePlacements(save, tournament)

        // Prize distribution by placement (UI-matching percentages).
        if (tournament.prizePool > 0) {
            for (const p of placements) {
                const prizePct = TROPHY_PRIZE_DISTRIBUTION[p.position] ?? 0
                if (prizePct <= 0) continue
                const prizeAmount = Math.round(tournament.prizePool * prizePct)
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
        winningTeam.reputation = Math.min(100, winningTeam.reputation + 10)
        const mult = TIER_FAN_MULTIPLIER[tournament.tier] || 10
        const fanGain = (mult * 100) + (winningTeam.reputation * mult)
        winningTeam.followers = (winningTeam.followers || 0) + fanGain

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

        // Celebration + legend-pick offer on player-team wins.
        if (winningTeam.id === save.playerTeamId) {
            save.pendingCelebration = {
                tournamentId: tournament.id,
                tournamentName: tournament.name,
                tier: tournament.tier,
                prize: tournament.prizePool,
                repGain: 10,
                fanGain,
                week: save.currentWeek,
                logoPath: tournament.logoPath,
                trophyPath: tournament.trophyPath,
            }

            if (tournament.tier === "S_TIER") {
                queueLegendPick(save, winningTeam, tournament)
            }
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
