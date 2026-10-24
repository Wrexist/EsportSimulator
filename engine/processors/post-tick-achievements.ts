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
import { isMajorTournament } from "../official-stats"

const WEEKS_PER_SEASON = 52

export function evaluatePostTickAchievements(save: GameSave): void {
    const playerTeam = save.teams.find(t => t.id === save.playerTeamId)
    if (!playerTeam) return

    // === Aggregates ===
    const totalWins = countTotalWins(save)
    const tournamentsWon = playerTeam.trophies?.map(t => {
        const tournament = save.tournaments.find(tour => tour.id === t.tournamentId)
        return {
            tier: t.tier || tournament?.tier || "",
            id: t.tournamentId,
            major: isMajorTournament(t.tournamentId),
            flawless: wonWithoutDroppingAMap(save, t.tournamentId),
        }
    }) || []

    const seasonStartWeek = Math.floor((save.currentWeek - 1) / WEEKS_PER_SEASON) * WEEKS_PER_SEASON + 1
    const majorWinsInSeason = (playerTeam.trophies || []).filter(t =>
        isMajorTournament(t.tournamentId) &&
        t.week >= seasonStartWeek &&
        t.week <= save.currentWeek
    ).length

    // Steam Rich Presence: team name, week and world ranking.
    steamService.updateGameStatePresence({
        teamName: playerTeam.name,
        week: save.currentWeek,
        ranking: playerTeam.worldRanking,
    })

    if (playerTeam.leagueTier === "S_TIER") {
        steamService.pushLeaderboardStats({ weeksToSTier: save.currentWeek })
    }

    // This week's player-team matches — used by comeback/underdog/14-16 checks.
    const thisWeekMatches = save.completedMatches.filter(m =>
        m.week === save.currentWeek &&
        (m.homeTeamId === save.playerTeamId || m.awayTeamId === save.playerTeamId)
    )
    const hasComebackWin = thisWeekMatches.some(m => m._comebackWin)
    const hasUnderdogWin = thisWeekMatches.some(m => m._underdogWin)

    // Roster kill/headshot tallies + total matches.
    const playerTeamPlayers = save.players.filter(p => playerTeam.rosterIds.includes(p.id))
    const totalKills = playerTeamPlayers.reduce((s, p) => s + (p.totalKills || 0), 0)
    const totalHS = playerTeamPlayers.reduce((s, p) => s + (p.totalHeadshots || 0), 0)
    const matchesPlayed = save.completedMatches.filter(m =>
        m.homeTeamId === save.playerTeamId || m.awayTeamId === save.playerTeamId
    ).length

    const totalMajorWins = (playerTeam.trophies || []).filter(t => isMajorTournament(t.tournamentId)).length

    // LOYAL_TEAM: years since last roster change. Default to season 1 if missing.
    const loyalTeamYears = Math.floor(
        (save.currentWeek - (playerTeam.lastRosterChangeWeek ?? 1)) / WEEKS_PER_SEASON
    )

    // REDEMPTION_ARC: won a Major this season after losing a Major Grand Final the season before.
    const seasonStart = Math.floor((save.currentWeek - 1) / WEEKS_PER_SEASON) * WEEKS_PER_SEASON + 1
    const priorSeasonStart = Math.max(1, seasonStart - WEEKS_PER_SEASON)

    const lostMajorGrandFinalPriorYear = save.completedMatches.some(m => {
        if (m.week < priorSeasonStart || m.week >= seasonStart) return false
        const isPlayerTeam = m.homeTeamId === save.playerTeamId || m.awayTeamId === save.playerTeamId
        if (!isPlayerTeam || !m.result) return false
        const isHome = m.homeTeamId === save.playerTeamId
        const lost = isHome
            ? m.result.homeScore < m.result.awayScore
            : m.result.awayScore < m.result.homeScore
        return lost && m.stage === "Grand Final" && isMajorTournament(m.tournamentId)
    })
    const wonMajorThisSeason = (playerTeam.trophies || []).some(
        t => isMajorTournament(t.tournamentId) && t.week >= seasonStart && t.week <= save.currentWeek
    )
    const redemptionArc = lostMajorGrandFinalPriorYear && wonMajorThisSeason

    // UNLUCKY: lost a Grand Final this week on a map that went to overtime 14-16.
    // Series results store map counts, so a BO3/BO5 final is read map by map.
    const lostGrandFinal1614 = thisWeekMatches.some(m => {
        if (m.stage !== "Grand Final" || !m.result) return false
        const isHome = m.homeTeamId === save.playerTeamId
        const own = isHome ? m.result.homeScore : m.result.awayScore
        const opp = isHome ? m.result.awayScore : m.result.homeScore
        if (own >= opp) return false
        const maps = Array.isArray(m.result.maps) ? m.result.maps : []
        if (maps.length === 0) return own === 14 && opp === 16
        return maps.some(map => {
            const home = map.homeScore ?? map.finalScore?.team1
            const away = map.awayScore ?? map.finalScore?.team2
            const mapOwn = isHome ? home : away
            const mapOpp = isHome ? away : home
            return mapOwn === 14 && mapOpp === 16
        })
    })

    checkAchievements({
        totalWins,
        worldRanking: playerTeam.worldRanking,
        leagueTier: playerTeam.leagueTier,
        startingLeagueTier: playerTeam.startingLeagueTier,
        budget: playerTeam.budget,
        tournamentsWon,
        hallOfFamePlayers: save.legendaryPlayers?.length || 0,
        firstTournamentParticipation: save.completedMatches.some(
            match => !!match.tournamentId && match.tournamentId !== "SCRIM"
        ),
        developedStar: save.players.some(player => !!player.isAcademyGraduate && player.skill >= 90),
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
        titlesWon: (playerTeam.trophies || []).length,
        matchesLost: countTotalLosses(save),
        prizeMoney: save.financeLedger
            .filter(e => e.type === "INCOME" && e.category === "PRIZE" && e.teamId === save.playerTeamId)
            .reduce((sum, e) => sum + e.amount, 0),
    })

    pushLeaderboardSnapshot(save, playerTeam, totalMajorWins)
}

/** True when the player won every series they played in this tournament without losing a map. */
function wonWithoutDroppingAMap(save: GameSave, tournamentId: string): boolean {
    const series = save.completedMatches.filter(m =>
        m.tournamentId === tournamentId &&
        (m.homeTeamId === save.playerTeamId || m.awayTeamId === save.playerTeamId)
    )
    return series.length > 0 && series.every(m => {
        if (!m.result) return false
        const isHome = m.homeTeamId === save.playerTeamId
        const own = isHome ? m.result.homeScore : m.result.awayScore
        const opp = isHome ? m.result.awayScore : m.result.homeScore
        return own > opp && opp === 0
    })
}

function countTotalLosses(save: GameSave): number {
    return save.completedMatches.filter(m => {
        if (!m.result) return false
        if (m.homeTeamId === save.playerTeamId) return m.result.homeScore < m.result.awayScore
        if (m.awayTeamId === save.playerTeamId) return m.result.awayScore < m.result.homeScore
        return false
    }).length
}

/** Only the player's matches count; every other club's results are in completedMatches too. */
function countTotalWins(save: GameSave): number {
    return save.completedMatches.filter(m => {
        if (!m.result) return false
        if (m.homeTeamId === save.playerTeamId) return m.result.homeScore > m.result.awayScore
        if (m.awayTeamId === save.playerTeamId) return m.result.awayScore > m.result.homeScore
        return false
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
