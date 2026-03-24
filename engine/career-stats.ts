/**
 * Career Statistics Engine
 *
 * Computes and updates cross-season career statistics at season boundaries.
 * Called at the end of each 52-week season cycle.
 */

import type { GameSave, CareerStats, SeasonSummary } from "./save-types"

const WEEKS_PER_SEASON = 52

/**
 * Check if the current week is a season boundary
 */
export function isSeasonEnd(currentWeek: number): boolean {
  return currentWeek > 0 && currentWeek % WEEKS_PER_SEASON === 0
}

/**
 * Get the season number from a week number (1-indexed)
 */
export function getSeasonNumber(week: number): number {
  return Math.ceil(week / WEEKS_PER_SEASON)
}

/**
 * Compute a season summary from the current game state
 */
export function computeSeasonSummary(save: GameSave): SeasonSummary {
  const seasonNumber = getSeasonNumber(save.currentWeek)
  const seasonStartWeek = (seasonNumber - 1) * WEEKS_PER_SEASON + 1
  const seasonEndWeek = seasonNumber * WEEKS_PER_SEASON

  const playerTeam = save.teams.find(t => t.id === save.playerTeamId)
  if (!playerTeam) {
    return createEmptySeasonSummary(seasonNumber, seasonStartWeek, seasonEndWeek, save.playerTeamId, "Unknown")
  }

  // Matches this season
  const seasonMatches = save.completedMatches.filter(m =>
    m.week >= seasonStartWeek &&
    m.week <= seasonEndWeek &&
    (m.homeTeamId === save.playerTeamId || m.awayTeamId === save.playerTeamId)
  )

  let wins = 0
  let losses = 0

  for (const match of seasonMatches) {
    const isHome = match.homeTeamId === save.playerTeamId
    const won = isHome
      ? match.result.homeScore > match.result.awayScore
      : match.result.awayScore > match.result.homeScore
    if (won) wins++
    else losses++
  }

  // Trophies won this season
  const trophiesWon = (playerTeam.trophies || [])
    .filter(t => t.week >= seasonStartWeek && t.week <= seasonEndWeek)
    .map(t => ({
      tournamentId: t.tournamentId,
      tournamentName: t.tournamentName,
      tier: t.tier || "B_TIER",
    }))

  // Financial summary for the season
  const seasonLedger = save.financeLedger.filter(e =>
    e.week >= seasonStartWeek &&
    e.week <= seasonEndWeek &&
    e.teamId === save.playerTeamId
  )
  const totalIncome = seasonLedger
    .filter(e => e.type === "INCOME")
    .reduce((sum, e) => sum + e.amount, 0)
  const totalExpenses = seasonLedger
    .filter(e => e.type === "EXPENSE")
    .reduce((sum, e) => sum + e.amount, 0)

  // Find MVP (best avg rating among roster players)
  const rosterPlayers = save.players.filter(p =>
    playerTeam.rosterIds.includes(p.id)
  )
  let mvpPlayer = rosterPlayers[0]
  for (const p of rosterPlayers) {
    if (p.avgRating > (mvpPlayer?.avgRating || 0)) {
      mvpPlayer = p
    }
  }

  return {
    seasonNumber,
    startWeek: seasonStartWeek,
    endWeek: seasonEndWeek,
    teamId: playerTeam.id,
    teamName: playerTeam.name,
    matches: seasonMatches.length,
    wins,
    losses,
    winRate: seasonMatches.length > 0 ? Math.round((wins / seasonMatches.length) * 100) : 0,
    trophiesWon,
    finalWorldRanking: playerTeam.worldRanking || 30,
    finalElo: playerTeam.elo || 1000,
    leagueTier: playerTeam.leagueTier || "C_TIER",
    totalIncome,
    totalExpenses,
    endBudget: playerTeam.budget,
    rosterSize: playerTeam.rosterIds.length,
    mvpPlayerId: mvpPlayer?.id,
    mvpPlayerName: mvpPlayer?.nickname,
  }
}

/**
 * Update career stats with a new season summary.
 * Called at end of each season (every 52 weeks).
 */
export function updateCareerStats(save: GameSave): CareerStats {
  const existing = save.careerStats || createEmptyCareerStats()
  const seasonSummary = computeSeasonSummary(save)

  // Check if this season was already recorded
  const alreadyRecorded = existing.seasons.some(s => s.seasonNumber === seasonSummary.seasonNumber)
  if (alreadyRecorded) {
    return existing
  }

  const playerTeam = save.teams.find(t => t.id === save.playerTeamId)

  // Append season summary
  const seasons = [...existing.seasons, seasonSummary]

  // Update aggregates
  const totalSeasons = seasons.length
  const totalMatches = seasons.reduce((s, ss) => s + ss.matches, 0)
  const totalWins = seasons.reduce((s, ss) => s + ss.wins, 0)
  const totalLosses = seasons.reduce((s, ss) => s + ss.losses, 0)
  const totalTournamentWins = seasons.reduce((s, ss) => s + ss.trophiesWon.length, 0)
  const totalPrizeMoney = seasons.reduce((s, ss) => s + ss.totalIncome, 0)

  // Peak tracking
  const peakWorldRanking = Math.min(
    existing.peakWorldRanking,
    seasonSummary.finalWorldRanking
  )
  const peakElo = Math.max(
    existing.peakElo,
    seasonSummary.finalElo
  )

  // Teams managed
  const teamsManaged = [...new Set([...existing.teamsManaged, save.playerTeamId])]

  return {
    seasons,
    totalSeasons,
    totalMatches,
    totalWins,
    totalLosses,
    totalTournamentWins,
    totalPrizeMoney,
    peakWorldRanking,
    peakElo,
    teamsManaged,
    lastUpdatedWeek: save.currentWeek,
  }
}

function createEmptyCareerStats(): CareerStats {
  return {
    seasons: [],
    totalSeasons: 0,
    totalMatches: 0,
    totalWins: 0,
    totalLosses: 0,
    totalTournamentWins: 0,
    totalPrizeMoney: 0,
    peakWorldRanking: 30,
    peakElo: 1000,
    teamsManaged: [],
    lastUpdatedWeek: 0,
  }
}

function createEmptySeasonSummary(
  seasonNumber: number,
  startWeek: number,
  endWeek: number,
  teamId: string,
  teamName: string
): SeasonSummary {
  return {
    seasonNumber,
    startWeek,
    endWeek,
    teamId,
    teamName,
    matches: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    trophiesWon: [],
    finalWorldRanking: 30,
    finalElo: 1000,
    leagueTier: "C_TIER",
    totalIncome: 0,
    totalExpenses: 0,
    endBudget: 0,
    rosterSize: 0,
  }
}

/**
 * Migrate existing saves to include careerStats.
 * Scans historical data to reconstruct past seasons.
 */
export function migrateCareerStats(save: GameSave): CareerStats {
  if (save.careerStats && save.careerStats.seasons.length > 0) {
    return save.careerStats
  }

  const stats = createEmptyCareerStats()

  // Reconstruct past seasons from historical data
  const totalSeasons = getSeasonNumber(save.currentWeek)

  for (let s = 1; s <= totalSeasons; s++) {
    const startWeek = (s - 1) * WEEKS_PER_SEASON + 1
    const endWeek = s * WEEKS_PER_SEASON

    // Only reconstruct if we have data for this season
    const seasonMatches = save.completedMatches.filter(m =>
      m.week >= startWeek &&
      m.week <= endWeek &&
      (m.homeTeamId === save.playerTeamId || m.awayTeamId === save.playerTeamId)
    )

    if (seasonMatches.length === 0 && s < totalSeasons) continue

    let wins = 0
    let losses = 0
    for (const match of seasonMatches) {
      const isHome = match.homeTeamId === save.playerTeamId
      const won = isHome
        ? match.result.homeScore > match.result.awayScore
        : match.result.awayScore > match.result.homeScore
      if (won) wins++
      else losses++
    }

    const playerTeam = save.teams.find(t => t.id === save.playerTeamId)
    const trophies = (playerTeam?.trophies || [])
      .filter(t => t.week >= startWeek && t.week <= endWeek)
      .map(t => ({
        tournamentId: t.tournamentId,
        tournamentName: t.tournamentName,
        tier: t.tier || "B_TIER",
      }))

    stats.seasons.push({
      seasonNumber: s,
      startWeek,
      endWeek,
      teamId: save.playerTeamId,
      teamName: playerTeam?.name || "Unknown",
      matches: seasonMatches.length,
      wins,
      losses,
      winRate: seasonMatches.length > 0 ? Math.round((wins / seasonMatches.length) * 100) : 0,
      trophiesWon: trophies,
      finalWorldRanking: playerTeam?.worldRanking || 30,
      finalElo: playerTeam?.elo || 1000,
      leagueTier: playerTeam?.leagueTier || "C_TIER",
      totalIncome: 0, // Can't reconstruct from pruned ledger
      totalExpenses: 0,
      endBudget: s === totalSeasons ? (playerTeam?.budget || 0) : 0,
      rosterSize: playerTeam?.rosterIds.length || 0,
    })
  }

  // Aggregate
  stats.totalSeasons = stats.seasons.length
  stats.totalMatches = stats.seasons.reduce((s, ss) => s + ss.matches, 0)
  stats.totalWins = stats.seasons.reduce((s, ss) => s + ss.wins, 0)
  stats.totalLosses = stats.seasons.reduce((s, ss) => s + ss.losses, 0)
  stats.totalTournamentWins = stats.seasons.reduce((s, ss) => s + ss.trophiesWon.length, 0)
  stats.peakWorldRanking = Math.min(...stats.seasons.map(s => s.finalWorldRanking), 30)
  stats.peakElo = Math.max(...stats.seasons.map(s => s.finalElo), 1000)
  stats.teamsManaged = [save.playerTeamId]
  stats.lastUpdatedWeek = save.currentWeek

  return stats
}
