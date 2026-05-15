/**
 * Post-tick Steam achievement evaluation + leaderboard push.
 *
 * Runs after the week processor returns and the new state has landed.
 * Computes a snapshot of player-team metrics — total wins, kills,
 * trophies, S_TIER counts, loyalty years, redemption-arc detection,
 * 14-16 Grand Final loss detection — and hands them to
 * `checkAchievements`. Also updates Steam Rich Presence and pushes
 * the latest leaderboard stats.
 *
 * Extracted from store/game-store.ts so this big snapshot-collection
 * block lives alongside the other tick phases. Pure read of the
 * supplied GameSave; no state mutations.
 */

import type { GameSave, TeamSaveData } from "../save-types"
import { checkAchievements, steamService } from "../steam-service"

const WEEKS_PER_SEASON = 52

export function evaluatePostTickAchievements(save: GameSave): void {
    const playerTeam = save.teams.find(t => t.id === save.playerTeamId)
    if (!playerTeam) return

    // === Aggregates ===
    const totalWins = countTotalWins(save)
    const tournamentsWon = playerTeam.trophies?.map(t => {
        const tournament = save.tournaments.find(tour => tour.id === t.tournamentId)
        return { tier: tournament?.tier || "B_TIER", id: t.tournamentId }
    }) || []

    const seasonStartWeek = Math.floor((save.currentWeek - 1) / WEEKS_PER_SEASON) * WEEKS_PER_SEASON + 1
    const majorWinsInSeason = (playerTeam.trophies || []).filter(t =>
        t.tier === "S_TIER" &&
        t.week >= seasonStartWeek &&
        t.week <= save.currentWeek
    ).length

    // Steam Rich Presence: surface team name + week + ranking + activity.
    steamService.updateGameStatePresence({
        teamName: playerTeam.name,
        week: save.currentWeek,
        ranking: playerTeam.worldRanking,
        activity: playerTeam.leagueTier === "S_TIER" ? "S-Tier League" : "Pro League",
    })

    if (playerTeam.leagueTier === "S_TIER") {
        steamService.pushLeaderboardStats({ weeksToSTier: save.currentWeek })
    }

    // This week's player-team matches — used by comeback/underdog/14-16 checks.
    const thisWeekMatches = save.completedMatches.filter(m =>
        m.week === save.currentWeek &&
        (m.homeTeamId === save.playerTeamId || m.awayTeamId === save.playerTeamId)
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasComebackWin = thisWeekMatches.some(m => (m as any)._comebackWin)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasUnderdogWin = thisWeekMatches.some(m => (m as any)._underdogWin)

    // Roster kill/headshot tallies + total matches.
    const playerTeamPlayers = save.players.filter(p => playerTeam.rosterIds.includes(p.id))
    const totalKills = playerTeamPlayers.reduce((s, p) => s + (p.totalKills || 0), 0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const totalHS = playerTeamPlayers.reduce((s, p) => s + ((p as any).totalHeadshots || 0), 0)
    const matchesPlayed = save.completedMatches.filter(m =>
        m.homeTeamId === save.playerTeamId || m.awayTeamId === save.playerTeamId
    ).length

    const totalMajorWins = (playerTeam.trophies || []).filter(t => t.tier === "S_TIER").length

    // LOYAL_TEAM: years since last roster change. Default to season 1 if missing.
    const loyalTeamYears = Math.floor(
        (save.currentWeek - (playerTeam.lastRosterChangeWeek ?? 1)) / WEEKS_PER_SEASON
    )

    // REDEMPTION_ARC: won S_TIER this season after losing one in prior year.
    const seasonStart = Math.floor((save.currentWeek - 1) / WEEKS_PER_SEASON) * WEEKS_PER_SEASON + 1
    const priorSeasonStart = Math.max(1, seasonStart - WEEKS_PER_SEASON)

    // Pre-build a tournamentId → tier lookup so we can resolve match tier
    // without an O(n) find per match (and so we don't depend on a
    // `tournamentTier` field that is NOT actually written onto the match
    // record — earlier this check used `(m as any).tournamentTier` which
    // is always undefined, making REDEMPTION unreachable).
    const tournamentTierById = new Map<string, string | undefined>()
    for (const t of save.tournaments) {
        tournamentTierById.set(t.id, t.tier)
    }

    const lostSTierGrandFinalPriorYear = save.completedMatches.some(m => {
        if (m.week < priorSeasonStart || m.week >= seasonStart) return false
        const isPlayerTeam = m.homeTeamId === save.playerTeamId || m.awayTeamId === save.playerTeamId
        if (!isPlayerTeam) return false
        const isHome = m.homeTeamId === save.playerTeamId
        const lost = isHome
            ? m.result.homeScore < m.result.awayScore
            : m.result.awayScore < m.result.homeScore
        if (!lost) return false
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stage = (m as any).stage
        if (stage !== "Grand Final") return false
        const tier = m.tournamentId ? tournamentTierById.get(m.tournamentId) : undefined
        return tier === "S_TIER"
    })
    const wonSTierThisSeason = (playerTeam.trophies || []).some(
        t => t.tier === "S_TIER" && t.week >= seasonStart && t.week <= save.currentWeek
    )
    const redemptionArc = lostSTierGrandFinalPriorYear && wonSTierThisSeason

    // UNLUCKY (14-16 Grand Final loss this week).
    const lostGrandFinal1614 = thisWeekMatches.some(m => {
        const isHome = m.homeTeamId === save.playerTeamId
        const lost = isHome
            ? m.result.homeScore < m.result.awayScore
            : m.result.awayScore < m.result.homeScore
        if (!lost) return false
        const loserScore = isHome ? m.result.homeScore : m.result.awayScore
        const winnerScore = isHome ? m.result.awayScore : m.result.homeScore
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (m as any).stage === "Grand Final" && loserScore === 14 && winnerScore === 16
    })

    checkAchievements({
        totalWins,
        worldRanking: playerTeam.worldRanking,
        leagueTier: playerTeam.leagueTier,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        startingLeagueTier: (playerTeam as any).startingLeagueTier,
        budget: playerTeam.budget,
        tournamentsWon,
        hallOfFamePlayers: save.legendaryPlayers?.length || 0,
        firstTournamentParticipation: save.completedMatches.some(
            match => !!match.tournamentId && match.tournamentId !== "SCRIM"
        ),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        developedStar: save.players.some(player => !!(player as any).isAcademyGraduate && player.skill >= 90),
        majorWinsInSeason,
        totalMajorWins,
        seasonComplete: save.currentWeek > 0 && save.currentWeek % WEEKS_PER_SEASON === 0,
        comebackWin: hasComebackWin,
        underdogWin: hasUnderdogWin,
        totalKills,
        totalHS,
        matchesPlayed,
        loyalTeamYears,
        redemptionArc,
        lostGrandFinal1614,
    })

    pushLeaderboardSnapshot(save, playerTeam, totalMajorWins)
}

function countTotalWins(save: GameSave): number {
    return save.completedMatches.filter(m => {
        const isHome = m.homeTeamId === save.playerTeamId
        return isHome
            ? m.result.homeScore > m.result.awayScore
            : m.result.awayScore > m.result.homeScore
    }).length
}

function pushLeaderboardSnapshot(save: GameSave, playerTeam: TeamSaveData, totalMajorWins: number): void {
    const totalEarnings = save.financeLedger
        .filter(e => e.type === "INCOME" && e.teamId === save.playerTeamId)
        .reduce((sum, e) => sum + e.amount, 0)

    // Longest win streak across recentForm.
    const form = playerTeam.recentForm || []
    let maxStreak = 0
    let curStreak = 0
    for (const r of form) {
        if (r === "W") {
            curStreak++
            maxStreak = Math.max(maxStreak, curStreak)
        } else {
            curStreak = 0
        }
    }

    steamService.pushLeaderboardStats({
        maxElo: playerTeam.elo,
        totalEarnings,
        longestWinStreak: maxStreak,
        tournamentsWon: (playerTeam.trophies || []).length,
        majorWins: totalMajorWins,
    })
}
