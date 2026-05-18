/**
 * FPL Engine
 * Simulates the Faceit Pro League individual player ranking system
 */

import {
    FPLPlayerStats,
    FPLMatchRecord,
    FPLMatchPlayerStats,
    FPLSeason,
    FPLSeasonEntry,
    FPLSaveData,
    FPL_CONSTANTS,
    getFPLTier,
    FPLTier,
    FPLLeagueStanding,
    FPLTierChange
} from "@/types/fpl"
import { PlayerSaveData, TournamentSaveData, MatchSaveData, ActivitySaveData } from "./save-types"
import { SeededRNG } from "./rng"
import { generateFPLNonProPlayer } from "./fpl-player-generator"
import { getAvailableFPLPlayers } from "./fpl-availability"

/**
 * Initialize FPL data for a new game
 */
export function initializeFPL(players: PlayerSaveData[], currentWeek: number): FPLSaveData {
    const playerStats: Record<string, FPLPlayerStats> = {}

    // Initialize all non-retired players with FPL stats
    players
        .filter(p => !p.isRetired)
        .forEach(player => {
            // Use initial FPL ELO if provided (non-pro players), otherwise calculate from skill
            const skillBonus = ((player.skill || 50) - 50) * 34
            const baseElo = (player as typeof player & { initialFplElo?: number }).initialFplElo ?? (FPL_CONSTANTS.BASE_ELO + skillBonus)

            playerStats[player.id] = {
                playerId: player.id,
                fplElo: Math.max(500, Math.min(2500, baseElo)),
                fplRank: 0,
                fplTier: getFPLTier(baseElo),
                matchesPlayed: 0,
                wins: 0,
                losses: 0,
                avgKD: 1.0,
                avgADR: 70,
                avgRating: 1.0,
                mvpCount: 0,
                weeklyActivity: 0,
                monthlyPoints: 0,
                lastMatchWeek: 0,
                streakWins: 0,
                streakLosses: 0,
                totalFPLEarnings: 0,
                fplChampionships: 0
            }
        })

    // Create initial season
    const currentSeason = createNewSeason(1, currentWeek)

    // Initialize standings immediately based on initial ELO/tier
    const fplPlayers = Object.values(playerStats)
        .filter(s => s.fplTier === 'FPL')
        .sort((a, b) => b.fplElo - a.fplElo)

    const fplCPlayers = Object.values(playerStats)
        .filter(s => s.fplTier === 'FPL_C')
        .sort((a, b) => b.fplElo - a.fplElo)

    return {
        playerStats,
        currentSeason,
        matchHistory: [],
        seasonHistory: [],
        globalRankings: Object.values(playerStats)
            .sort((a, b) => b.fplElo - a.fplElo)
            .map((s, idx) => ({ playerId: s.playerId, elo: s.fplElo })),
        lastProcessedWeek: currentWeek - 1, // Set to previous week so first week processes
        nonProPlayers: [],
        // Initialize with populated standings
        fplStandings: fplPlayers.map((stats, idx) => ({
            playerId: stats.playerId,
            rank: idx + 1,
            points: 0,
            wins: 0,
            losses: 0,
            matchesPlayed: 0,
            avgRating: 1.0,
            isInPromotionZone: false,
            isInRelegationZone: idx >= fplPlayers.length - FPL_CONSTANTS.RELEGATION_SLOTS
        })),
        fplCStandings: fplCPlayers.map((stats, idx) => ({
            playerId: stats.playerId,
            rank: idx + 1,
            points: 0,
            wins: 0,
            losses: 0,
            matchesPlayed: 0,
            avgRating: 1.0,
            isInPromotionZone: idx < FPL_CONSTANTS.PROMOTION_SLOTS,
            isInRelegationZone: false
        })),
        tierChanges: []
    }
}

/**
 * Create a new FPL season
 */
function createNewSeason(seasonNumber: number, startWeek: number): FPLSeason {
    return {
        id: `fpl_season_${seasonNumber}`,
        seasonNumber,
        startWeek,
        endWeek: startWeek + FPL_CONSTANTS.SEASON_LENGTH - 1,
        isActive: true,
        prizePool: FPL_CONSTANTS.PRIZE_POOL_BASE,
        leaderboard: [],
        rewards: [
            { placement: 1, prize: FPL_CONSTANTS.PRIZE_POOL_BASE * 0.5, xpBonus: 500, prestigeBonus: 10 },
            { placement: 2, prize: FPL_CONSTANTS.PRIZE_POOL_BASE * 0.3, xpBonus: 300, prestigeBonus: 5 },
            { placement: 3, prize: FPL_CONSTANTS.PRIZE_POOL_BASE * 0.2, xpBonus: 150, prestigeBonus: 2 }
        ]
    }
}

/**
 * Process FPL for a week
 * Simulates matches for active players with smart scheduling
 */
export function processFPLWeek(
    fplData: FPLSaveData,
    players: PlayerSaveData[],
    currentWeek: number,
    rng: SeededRNG,
    // Optional parameters for smart scheduling
    tournaments: TournamentSaveData[] = [],
    scheduledMatches: MatchSaveData[] = [],
    scheduledActivities: ActivitySaveData[] = [],
    teams: { id: string; rosterIds: string[] }[] = []
): { fplData: FPLSaveData; matchesPlayed: FPLMatchRecord[]; tierChanges?: FPLTierChange[] } {
    // Skip if already processed this week
    if (fplData.lastProcessedWeek >= currentWeek) {
        return { fplData, matchesPlayed: [], tierChanges: [] }
    }

    // Off-season: no matches during break period
    if (fplData.offSeasonEndWeek && currentWeek <= fplData.offSeasonEndWeek) {
        fplData.lastProcessedWeek = currentWeek
        return { fplData, matchesPlayed: [], tierChanges: [] }
    }
    // Clear off-season marker once past it
    if (fplData.offSeasonEndWeek && currentWeek > fplData.offSeasonEndWeek) {
        fplData.offSeasonEndWeek = undefined
    }

    // Use smart availability checking if scheduling context is provided
    const playersWithStats = players.filter(p => fplData.playerStats[p.id])

    let activePlayers: PlayerSaveData[]
    if (teams.length > 0) {
        // Smart scheduling - check tournaments, matches, activities
        activePlayers = getAvailableFPLPlayers(
            playersWithStats,
            currentWeek,
            tournaments,
            scheduledMatches,
            scheduledActivities,
            teams
        )
    } else {
        // Fallback to basic checks
        activePlayers = playersWithStats.filter(p =>
            !p.isRetired &&
            !p.injury &&
            (p.fatigue || 0) < 80
        )
    }

    // Reset weekly activity
    Object.values(fplData.playerStats).forEach(stats => {
        stats.weeklyActivity = 0
    })

    const matchesPlayed: FPLMatchRecord[] = []

    // Simulate matches for each tier separately
    const tiers: FPLTier[] = ['FPL', 'FPL_C', 'HUBS']

    for (const tier of tiers) {
        const tierPlayers = activePlayers.filter(p => {
            const stats = fplData.playerStats[p.id]
            return stats && stats.fplTier === tier
        })

        // Need at least 10 players for a match
        if (tierPlayers.length < 10) continue

        // Simulate more matches per tier per week for automatic full coverage
        // With 100+ players per tier, this allows more activity
        const numMatches = Math.min(
            Math.floor(tierPlayers.length / 10) * 2, // Double the capacity
            rng.int(5, 15) // 5-15 matches per tier
        )

        for (let i = 0; i < numMatches; i++) {
            // Select 10 random players who haven't hit max weekly matches
            const availablePlayers = tierPlayers.filter(p => {
                const stats = fplData.playerStats[p.id]
                return stats.weeklyActivity < FPL_CONSTANTS.MAX_WEEKLY_MATCHES
            })

            if (availablePlayers.length < 10) break

            // Shuffle and pick 10
            const shuffled = [...availablePlayers].sort(() => rng.next() - 0.5)
            const matchPlayers = shuffled.slice(0, 10)

            // Create balanced teams based on ELO
            const sorted = [...matchPlayers].sort((a, b) => {
                const eloA = fplData.playerStats[a.id]?.fplElo || 1000
                const eloB = fplData.playerStats[b.id]?.fplElo || 1000
                return eloB - eloA
            })

            // Snake draft for balance
            const teamA: PlayerSaveData[] = []
            const teamB: PlayerSaveData[] = []
            sorted.forEach((p, idx) => {
                if (idx % 4 < 2) {
                    teamA.length <= teamB.length ? teamA.push(p) : teamB.push(p)
                } else {
                    teamB.length <= teamA.length ? teamB.push(p) : teamA.push(p)
                }
            })

            // Simulate the match
            const match = simulateFPLMatch(
                teamA,
                teamB,
                fplData.playerStats,
                currentWeek,
                tier,
                rng
            )

            matchesPlayed.push(match)
            fplData.matchHistory.push(match)

            // Update player stats
            updatePlayerStatsFromMatch(fplData.playerStats, match, currentWeek)
        }
    }

    // Update rankings
    updateGlobalRankings(fplData)

    // Update season leaderboard
    updateSeasonLeaderboard(fplData)

    // Update league standings with zone indicators
    updateLeagueStandings(fplData)

    // Check for season end
    if (currentWeek > fplData.currentSeason.endWeek) {
        const endedSeasonNumber = fplData.currentSeason.seasonNumber
        const tierChanges = endSeason(fplData, players)

        // After every SEASONS_PER_CYCLE seasons, schedule an off-season break
        const isEndOfCycle = endedSeasonNumber % FPL_CONSTANTS.SEASONS_PER_CYCLE === 0
        let nextStartWeek = currentWeek
        if (isEndOfCycle) {
            fplData.offSeasonEndWeek = currentWeek + FPL_CONSTANTS.OFF_SEASON_LENGTH - 1
            nextStartWeek = currentWeek + FPL_CONSTANTS.OFF_SEASON_LENGTH

            // Refresh retired non-pro players at end of each cycle
            refreshRetiredNonPros(fplData, players, currentWeek, rng)
        }

        fplData.currentSeason = createNewSeason(
            endedSeasonNumber + 1,
            nextStartWeek
        )
        // Return tier changes so game store can generate news
        return { fplData, matchesPlayed, tierChanges }
    }

    fplData.lastProcessedWeek = currentWeek

    return { fplData, matchesPlayed, tierChanges: [] }
}

/**
 * Calculate individual player power rating for FPL
 * Uses multiple stats for comprehensive evaluation
 */
function calculatePlayerPower(player: PlayerSaveData, fplStats: FPLPlayerStats | undefined, rng: SeededRNG): number {
    const skill = player.skill || 50
    const form = player.form || 50
    const rifle = player.rifle || 50
    const awp = player.awp || 50
    const clutch = player.clutch || 50
    const reaction = player.reaction || 50
    const stressResistance = player.stressResistance || 50

    // Base power from core stats (weighted heavily)
    const basePower = (
        skill * 0.30 +           // Overall skill matters most
        rifle * 0.15 +           // Primary weapon skill
        awp * 0.10 +             // AWP skill
        clutch * 0.10 +          // Clutch ability
        reaction * 0.10 +        // Reaction time
        stressResistance * 0.05  // Mental fortitude
    )

    // Form modifier (-20% to +20% based on form)
    const formMod = 1 + ((form - 50) / 250)

    // FPL experience modifier (players with more matches are more consistent)
    const matchExperience = fplStats?.matchesPlayed || 0
    const experienceMod = Math.min(1.1, 1 + matchExperience / 500)

    // Momentum from win/loss streak
    const streakWins = fplStats?.streakWins || 0
    const streakLosses = fplStats?.streakLosses || 0
    const momentumMod = 1 + (streakWins * 0.02) - (streakLosses * 0.015)

    // ELO contribution (higher ELO = proven performer)
    const elo = fplStats?.fplElo || 1000
    const eloBonus = (elo - 1000) / 500 * 5 // Up to +10 for 2000+ ELO

    // Variance based on consistency (younger players more variable)
    const age = player.age || 22
    const consistencyMod = age < 20 ? 0.8 : age > 28 ? 1.1 : 1.0
    const variance = (rng.next() - 0.5) * (20 / consistencyMod)

    return (basePower * formMod * experienceMod * momentumMod + eloBonus + variance)
}

/**
 * Simulate a single FPL match with intelligent stat-based outcomes
 */
function simulateFPLMatch(
    teamA: PlayerSaveData[],
    teamB: PlayerSaveData[],
    playerStats: Record<string, FPLPlayerStats>,
    week: number,
    tier: FPLTier,
    rng: SeededRNG
): FPLMatchRecord {
    // Calculate team average ELO for proper ELO changes
    const avgEloA = teamA.reduce((sum, p) => sum + (playerStats[p.id]?.fplElo || 1000), 0) / 5
    const avgEloB = teamB.reduce((sum, p) => sum + (playerStats[p.id]?.fplElo || 1000), 0) / 5

    // Calculate team power ratings using comprehensive player evaluation
    const powerA = teamA.reduce((sum, p) => {
        return sum + calculatePlayerPower(p, playerStats[p.id], rng)
    }, 0) / 5

    const powerB = teamB.reduce((sum, p) => {
        return sum + calculatePlayerPower(p, playerStats[p.id], rng)
    }, 0) / 5

    // Check for best player carrying (star player factor)
    const bestPlayerA = Math.max(...teamA.map(p => calculatePlayerPower(p, playerStats[p.id], rng)))
    const bestPlayerB = Math.max(...teamB.map(p => calculatePlayerPower(p, playerStats[p.id], rng)))
    const starCarryBonus = bestPlayerA > bestPlayerB + 15 ? 0.08 : bestPlayerB > bestPlayerA + 15 ? -0.08 : 0

    // Calculate win probability with upset potential
    const powerDiff = powerA - powerB
    const baseWinChance = 0.5 + (powerDiff / 80) + starCarryBonus

    // Add controlled randomness for upsets (better teams still favored)
    const upsetFactor = (rng.next() - 0.5) * 0.25
    const winChanceA = Math.max(0.15, Math.min(0.85, baseWinChance + upsetFactor))
    const teamAWins = rng.next() < winChanceA

    // Generate score based on team dominance
    const dominance = Math.abs(powerDiff) / 30
    let winnerScore: number
    let loserScore: number

    if (dominance > 1.5) {
        // Dominant victory
        winnerScore = rng.int(13, 16)
        loserScore = rng.int(3, 8)
    } else if (dominance > 0.8) {
        // Comfortable win
        winnerScore = rng.int(13, 16)
        loserScore = rng.int(7, 11)
    } else {
        // Close game
        winnerScore = rng.int(13, 16)
        loserScore = rng.int(10, 14)
        // Overtime possible for very close games
        if (loserScore >= 13 && rng.next() < 0.3) {
            winnerScore = rng.int(16, 19)
            loserScore = rng.int(14, winnerScore - 2)
        }
    }

    const scoreA = teamAWins ? winnerScore : loserScore
    const scoreB = teamAWins ? loserScore : winnerScore
    const totalRounds = scoreA + scoreB

    // Generate player stats
    const allPlayerStats: FPLMatchPlayerStats[] = []
    let bestRating = 0
    let mvpId = ""

    const generatePlayerMatchStats = (player: PlayerSaveData, isWinningTeam: boolean): FPLMatchPlayerStats => {
        const skill = player.skill || 50
        const rifle = player.rifle || 50
        const awp = player.awp || 50
        const clutch = player.clutch || 50
        const form = player.form || 50
        const creativity = player.creativity || 50

        // Calculate player's expected contribution
        const weaponSkill = Math.max(rifle, awp)
        const impactRating = (skill * 0.4 + weaponSkill * 0.3 + clutch * 0.15 + creativity * 0.15) / 100

        // Base kills/deaths scaled to total rounds
        const avgKillsPerRound = 0.7 + (impactRating * 0.4)
        const baseKills = Math.floor(totalRounds * avgKillsPerRound * (0.8 + rng.next() * 0.4))

        // Form affects consistency
        const formVariance = (100 - form) / 100
        const variance = (rng.next() - 0.5) * 8 * formVariance

        const kills = Math.max(5, Math.floor(baseKills + variance))

        // Deaths inversely related to skill/clutch
        const survivalSkill = (clutch + skill) / 200
        const deathBase = totalRounds * (0.65 - survivalSkill * 0.15)
        const deaths = Math.max(4, Math.floor(deathBase + (rng.next() - 0.5) * 5))

        // Assists based on teamwork
        const teamwork = player.teamwork || 50
        const assists = Math.floor(kills * 0.25 + (teamwork / 100) * 5 + rng.next() * 3)

        // ADR calculation
        const baseADR = 50 + (skill * 0.4) + (weaponSkill * 0.2)
        const adr = Math.floor(baseADR + (rng.next() - 0.5) * 25)

        // Pro-style rating calculation
        const kpr = kills / totalRounds
        const dpr = deaths / totalRounds
        const apr = assists / totalRounds
        const impact = 0.7 + kpr * 0.5 - dpr * 0.3 + apr * 0.1

        // Winning team bonus
        const winBonus = isWinningTeam ? 0.08 : -0.02

        // Clutch bonus for clutch players in close games
        const closeGame = Math.abs(scoreA - scoreB) <= 3
        const clutchBonus = closeGame ? (clutch - 50) / 500 : 0

        const rating = parseFloat((impact + winBonus + clutchBonus + (adr - 70) * 0.002).toFixed(2))

        if (rating > bestRating) {
            bestRating = rating
            mvpId = player.id
        }

        // Calculate proper ELO change using average opponent team ELO
        const currentStats = playerStats[player.id]
        const playerElo = currentStats?.fplElo || 1000
        const opponentAvgElo = isWinningTeam ? avgEloB : avgEloA
        const kFactor = getKFactor(tier)
        const expectedScore = getExpectedScore(playerElo, opponentAvgElo)
        const eloChange = Math.round(kFactor * ((isWinningTeam ? 1 : 0) - expectedScore))

        return {
            playerId: player.id,
            kills,
            deaths,
            assists,
            adr,
            rating: Math.max(0.3, Math.min(2.5, rating)), // Clamp rating
            mvp: false,
            eloChange
        }
    }

    teamA.forEach(p => allPlayerStats.push(generatePlayerMatchStats(p, teamAWins)))
    teamB.forEach(p => allPlayerStats.push(generatePlayerMatchStats(p, !teamAWins)))

    // Set MVP
    const mvpStats = allPlayerStats.find(s => s.playerId === mvpId)
    if (mvpStats) mvpStats.mvp = true

    const maps = ["Mirage", "Inferno", "Dust2", "Ancient", "Nuke", "Anubis", "Vertigo"]

    return {
        id: `fpl_match_${week}_${Date.now()}_${rng.int(1000, 9999)}`,
        week,
        mapPlayed: maps[rng.int(0, maps.length - 1)],
        teamA: teamA.map(p => p.id),
        teamB: teamB.map(p => p.id),
        scoreA,
        scoreB,
        winningTeam: teamAWins ? 'A' : 'B',
        playerStats: allPlayerStats,
        duration: rng.int(FPL_CONSTANTS.MATCH_DURATION_MIN, FPL_CONSTANTS.MATCH_DURATION_MAX)
    }
}

/**
 * Update player stats after a match
 */
function updatePlayerStatsFromMatch(
    playerStats: Record<string, FPLPlayerStats>,
    match: FPLMatchRecord,
    currentWeek: number
): void {
    const winningTeam = match.winningTeam === 'A' ? match.teamA : match.teamB
    const losingTeam = match.winningTeam === 'A' ? match.teamB : match.teamA

    match.playerStats.forEach(matchStats => {
        const stats = playerStats[matchStats.playerId]
        if (!stats) return

        const isWinner = winningTeam.includes(matchStats.playerId)

        // Update ELO
        stats.fplElo = Math.max(100, stats.fplElo + matchStats.eloChange)
        stats.fplTier = getFPLTier(stats.fplElo)

        // Update match counts
        stats.matchesPlayed++
        stats.weeklyActivity++
        stats.lastMatchWeek = currentWeek
        if (isWinner) {
            stats.wins++
            stats.streakWins++
            stats.streakLosses = 0
        } else {
            stats.losses++
            stats.streakLosses++
            stats.streakWins = 0
        }

        // Update averages (rolling)
        const n = stats.matchesPlayed
        stats.avgKD = ((stats.avgKD * (n - 1)) + (matchStats.kills / Math.max(1, matchStats.deaths))) / n
        stats.avgADR = ((stats.avgADR * (n - 1)) + matchStats.adr) / n
        stats.avgRating = ((stats.avgRating * (n - 1)) + matchStats.rating) / n

        // Update MVP count
        if (matchStats.mvp) stats.mvpCount++

        // Update monthly points
        stats.monthlyPoints += isWinner ? FPL_CONSTANTS.WIN_POINTS : FPL_CONSTANTS.LOSS_POINTS
        if (matchStats.mvp) stats.monthlyPoints += FPL_CONSTANTS.MVP_BONUS
    })
}

/**
 * Update global rankings based on ELO
 */
function updateGlobalRankings(fplData: FPLSaveData): void {
    const rankings = Object.values(fplData.playerStats)
        .sort((a, b) => b.fplElo - a.fplElo)
        .map((stats, index) => {
            stats.fplRank = index + 1
            return { playerId: stats.playerId, elo: stats.fplElo }
        })

    fplData.globalRankings = rankings
}

/**
 * Update season leaderboard
 */
function updateSeasonLeaderboard(fplData: FPLSaveData): void {
    const entries: FPLSeasonEntry[] = Object.values(fplData.playerStats)
        .filter(stats => stats.weeklyActivity > 0 || stats.monthlyPoints > 0)
        .map(stats => ({
            playerId: stats.playerId,
            points: stats.monthlyPoints,
            matchesPlayed: stats.matchesPlayed,
            winRate: stats.matchesPlayed > 0
                ? Math.round((stats.wins / stats.matchesPlayed) * 100)
                : 0
        }))
        .sort((a, b) => b.points - a.points)

    fplData.currentSeason.leaderboard = entries.slice(0, 100)
}

/**
 * Update league standings with promotion/relegation zone indicators
 */
function updateLeagueStandings(fplData: FPLSaveData): void {
    // Update FPL standings
    const fplPlayers = Object.values(fplData.playerStats)
        .filter(s => s.fplTier === 'FPL')
        .sort((a, b) => b.monthlyPoints - a.monthlyPoints)

    const fplCount = fplPlayers.length
    fplData.fplStandings = fplPlayers.map((stats, idx): FPLLeagueStanding => ({
        playerId: stats.playerId,
        rank: idx + 1,
        points: stats.monthlyPoints,
        wins: stats.wins,
        losses: stats.losses,
        matchesPlayed: stats.matchesPlayed,
        avgRating: stats.avgRating,
        isInPromotionZone: false, // FPL has no promotion zone
        isInRelegationZone: idx >= fplCount - FPL_CONSTANTS.RELEGATION_SLOTS
    }))

    // Update FPL-C standings
    const fplCPlayers = Object.values(fplData.playerStats)
        .filter(s => s.fplTier === 'FPL_C')
        .sort((a, b) => b.monthlyPoints - a.monthlyPoints)

    fplData.fplCStandings = fplCPlayers.map((stats, idx): FPLLeagueStanding => ({
        playerId: stats.playerId,
        rank: idx + 1,
        points: stats.monthlyPoints,
        wins: stats.wins,
        losses: stats.losses,
        matchesPlayed: stats.matchesPlayed,
        avgRating: stats.avgRating,
        isInPromotionZone: idx < FPL_CONSTANTS.PROMOTION_SLOTS,
        isInRelegationZone: false // FPL-C has no relegation (just drops to HUBS via ELO)
    }))
}

/**
 * End the current season and award prizes
 * Also handles promotion/demotion between FPL and FPL-C
 */
function endSeason(fplData: FPLSaveData, players: PlayerSaveData[]): FPLTierChange[] {
    const season = fplData.currentSeason
    season.isActive = false
    const tierChanges: FPLTierChange[] = []

    // Award prizes to top 3
    const topPlayers = season.leaderboard.slice(0, 3)

    if (topPlayers.length > 0) {
        season.champion = topPlayers[0].playerId
    }

    // Apply rewards
    topPlayers.forEach((entry, index) => {
        const player = players.find(p => p.id === entry.playerId)
        const reward = season.rewards[index]
        const stats = fplData.playerStats[entry.playerId]

        if (player && reward) {
            // XP bonus
            player.xp = (player.xp || 0) + reward.xpBonus
        }
        if (stats && reward) {
            stats.totalFPLEarnings = (stats.totalFPLEarnings || 0) + reward.prize
            if (index === 0) {
                stats.fplChampionships = (stats.fplChampionships || 0) + 1
            }
        }
    })

    // === PROMOTION: Top 3 from FPL-C get promoted to FPL ===
    const fplCEligible = fplData.fplCStandings
        .filter(s => s.matchesPlayed >= FPL_CONSTANTS.MIN_MATCHES_FOR_ELIGIBILITY)
        .slice(0, FPL_CONSTANTS.PROMOTION_SLOTS)

    fplCEligible.forEach(standing => {
        const stats = fplData.playerStats[standing.playerId]
        if (stats) {
            const player = players.find(p => p.id === standing.playerId)
            const playerName = player?.nickname || player?.name || 'Unknown'

            // Promote to FPL
            stats.fplTier = 'FPL'
            // Boost ELO to ensure they stay in FPL initially
            stats.fplElo = Math.max(stats.fplElo, FPL_CONSTANTS.FPL_THRESHOLD + 50)

            tierChanges.push({
                playerId: standing.playerId,
                playerName,
                previousTier: 'FPL_C',
                newTier: 'FPL',
                seasonNumber: season.seasonNumber,
                week: season.endWeek,
                reason: 'PROMOTION'
            })
        }
    })

    // === DEMOTION: Bottom 3 non-pros from FPL get demoted to FPL-C ===
    // Only non-pro players can be demoted (pro players are protected)
    const fplEligibleForDemotion = fplData.fplStandings
        .filter(s => s.matchesPlayed >= FPL_CONSTANTS.MIN_MATCHES_FOR_ELIGIBILITY)
        .filter(s => fplData.nonProPlayers.some(np => np.playerId === s.playerId))
        .slice(-FPL_CONSTANTS.RELEGATION_SLOTS) // Get bottom N

    fplEligibleForDemotion.forEach(standing => {
        const stats = fplData.playerStats[standing.playerId]
        if (stats) {
            const player = players.find(p => p.id === standing.playerId)
            const playerName = player?.nickname || player?.name || 'Unknown'

            // Demote to FPL-C
            stats.fplTier = 'FPL_C'
            // Reduce ELO to ensure they stay in FPL-C initially
            stats.fplElo = Math.min(stats.fplElo, FPL_CONSTANTS.FPL_THRESHOLD - 50)

            tierChanges.push({
                playerId: standing.playerId,
                playerName,
                previousTier: 'FPL',
                newTier: 'FPL_C',
                seasonNumber: season.seasonNumber,
                week: season.endWeek,
                reason: 'DEMOTION'
            })
        }
    })

    // Store tier changes
    fplData.tierChanges.push(...tierChanges)

    // Enforce FPL tier cap of MAX_FPL_TIER_PLAYERS
    const currentFPLCount = Object.values(fplData.playerStats)
        .filter(s => s.fplTier === 'FPL').length

    if (currentFPLCount > FPL_CONSTANTS.MAX_FPL_TIER_PLAYERS) {
        // Demote lowest ELO players to FPL-C until at cap
        const excess = currentFPLCount - FPL_CONSTANTS.MAX_FPL_TIER_PLAYERS
        const toDemote = Object.values(fplData.playerStats)
            .filter(s => s.fplTier === 'FPL')
            .sort((a, b) => a.fplElo - b.fplElo) // Lowest ELO first
            .slice(0, excess)

        toDemote.forEach(stats => {
            const player = players.find(p => p.id === stats.playerId)
            const playerName = player?.nickname || player?.name || 'Unknown'

            stats.fplTier = 'FPL_C'
            stats.fplElo = Math.min(stats.fplElo, FPL_CONSTANTS.FPL_THRESHOLD - 50)

            tierChanges.push({
                playerId: stats.playerId,
                playerName,
                previousTier: 'FPL',
                newTier: 'FPL_C',
                seasonNumber: season.seasonNumber,
                week: season.endWeek,
                reason: 'DEMOTION'
            })
        })

        // Store additional tier changes from cap enforcement
        fplData.tierChanges.push(...tierChanges.slice(-excess))
    }

    // Reset monthly points for all players
    Object.values(fplData.playerStats).forEach(stats => {
        stats.monthlyPoints = 0
    })

    // Archive season
    fplData.seasonHistory.push({ ...season })

    return tierChanges
}

/**
 * Get K-factor for ELO calculation based on tier
 */
function getKFactor(tier: FPLTier): number {
    switch (tier) {
        case 'FPL': return FPL_CONSTANTS.K_FACTOR_FPL
        case 'FPL_C': return FPL_CONSTANTS.K_FACTOR_FPL_C
        case 'HUBS': return FPL_CONSTANTS.K_FACTOR_HUBS
    }
}

/**
 * Calculate expected score for ELO calculation
 */
function getExpectedScore(playerElo: number, opponentElo: number): number {
    return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400))
}

/**
 * Get top FPL players for scouting
 */
export function getTopFPLProspects(
    fplData: FPLSaveData,
    players: PlayerSaveData[],
    limit: number = 20
): { player: PlayerSaveData; fplStats: FPLPlayerStats }[] {
    return fplData.globalRankings
        .slice(0, limit * 2)
        .map(ranking => {
            const player = players.find(p => p.id === ranking.playerId)
            const fplStats = fplData.playerStats[ranking.playerId]
            return player && fplStats ? { player, fplStats } : null
        })
        .filter((entry): entry is { player: PlayerSaveData; fplStats: FPLPlayerStats } => entry !== null)
        .slice(0, limit)
}

/**
 * Get FPL stats for a specific player
 */
export function getPlayerFPLStats(
    fplData: FPLSaveData,
    playerId: string
): FPLPlayerStats | null {
    return fplData.playerStats[playerId] || null
}

/**
 * Get recent FPL matches for a player
 */
export function getPlayerFPLMatches(
    fplData: FPLSaveData,
    playerId: string,
    limit: number = 10
): FPLMatchRecord[] {
    return fplData.matchHistory
        .filter(match =>
            match.teamA.includes(playerId) || match.teamB.includes(playerId)
        )
        .sort((a, b) => b.week - a.week)
        .slice(0, limit)
}

/**
 * Replace retired non-pro FPL players with fresh ones.
 * Called at the end of each FPL cycle (every SEASONS_PER_CYCLE seasons).
 */
function refreshRetiredNonPros(
    fplData: FPLSaveData,
    allPlayers: PlayerSaveData[],
    currentWeek: number,
    rng: SeededRNG
): void {
    const retiredNonPros = fplData.nonProPlayers.filter(np => {
        const player = allPlayers.find(p => p.id === np.playerId)
        return player?.isRetired
    })

    // Determine tier from isRecruitableBy metadata
    const tierFromMeta = (np: typeof retiredNonPros[0]): FPLTier => {
        if (np.isRecruitableBy === 'TIER_1') return 'FPL'
        if (np.isRecruitableBy === 'TIER_2') return 'FPL_C'
        return 'HUBS'
    }

    for (const np of retiredNonPros) {
        const tier = tierFromMeta(np)
        const result = generateFPLNonProPlayer(tier, currentWeek, rng)

        // Add replacement player to save
        allPlayers.push(result.player)

        // Initialize FPL stats for the new player using the correct FPLPlayerStats shape
        const initialElo = tier === 'FPL' ? 1400 : tier === 'FPL_C' ? 1200 : 1000
        fplData.playerStats[result.player.id] = {
            playerId: result.player.id,
            fplElo: initialElo,
            fplRank: 0,
            fplTier: tier,
            matchesPlayed: 0,
            wins: 0,
            losses: 0,
            avgKD: 0,
            avgADR: 0,
            avgRating: 0,
            mvpCount: 0,
            weeklyActivity: 0,
            monthlyPoints: 0,
            lastMatchWeek: 0,
            streakWins: 0,
            streakLosses: 0,
            totalFPLEarnings: 0,
            fplChampionships: 0,
        }

        // Replace metadata entry
        const idx = fplData.nonProPlayers.indexOf(np)
        if (idx !== -1) {
            fplData.nonProPlayers[idx] = result.metadata
        }

        // Clean up old player's stats
        delete fplData.playerStats[np.playerId]
    }
}
