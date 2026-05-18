/**
 * FPL (Faceit Pro League) Types
 * Individual player ranking system that operates outside team tournaments
 */

/**
 * FPL Tier based on individual ELO
 */
export type FPLTier = 'FPL' | 'FPL_C' | 'HUBS'

/**
 * Non-pro player types for FPL participants not on pro teams
 */
export type FPLPlayerType =
    | 'PRO'            // On a professional team
    | 'STREAMER'       // Content creator/streamer
    | 'SEMI_PRO'       // Skilled player seeking team
    | 'ACADEMY_REJECT' // Failed academy prospect
    | 'GRINDER'        // Dedicated FPL climber
    | 'RETIRED_PRO'    // Former professional player
    | 'RISING_TALENT'  // Young prospect climbing ranks

/**
 * Metadata for non-pro FPL players
 */
export interface FPLNonProPlayer {
    playerId: string
    playerType: FPLPlayerType
    streamFollowers?: number      // For streamers
    previousTeam?: string         // For retired pros/academy rejects
    monthsGrinding: number        // How long in FPL system
    isRecruitableBy: 'ALL' | 'TIER_2' | 'TIER_1'  // Recruitment restrictions
}

/**
 * League standing entry with zone indicators
 */
export interface FPLLeagueStanding {
    playerId: string
    rank: number
    points: number
    wins: number
    losses: number
    matchesPlayed: number
    avgRating: number
    isInPromotionZone: boolean
    isInRelegationZone: boolean
}

/**
 * Record of tier changes (promotion/demotion)
 */
export interface FPLTierChange {
    playerId: string
    playerName: string
    previousTier: FPLTier
    newTier: FPLTier
    seasonNumber: number
    week: number
    reason: 'PROMOTION' | 'DEMOTION'
}

/**
 * Individual player's FPL statistics
 */
export interface FPLPlayerStats {
    playerId: string
    fplElo: number           // Individual ELO (starts at 1000)
    fplRank: number          // Global FPL rank
    fplTier: FPLTier         // Tier based on ELO
    matchesPlayed: number
    wins: number
    losses: number
    avgKD: number            // Average Kill/Death ratio
    avgADR: number           // Average Damage per Round
    avgRating: number        // Average Pro-style rating
    mvpCount: number         // MVP awards in FPL matches
    weeklyActivity: number   // Matches played this week
    monthlyPoints: number    // Points for monthly leaderboard
    lastMatchWeek: number    // Last week player was active
    streakWins: number       // Current win streak
    streakLosses: number     // Current loss streak
    totalFPLEarnings: number // Cumulative prize money won
    fplChampionships: number // Number of FPL season wins
}

/**
 * Player stats from a single FPL match
 */
export interface FPLMatchPlayerStats {
    playerId: string
    kills: number
    deaths: number
    assists: number
    adr: number              // Damage per round
    rating: number           // Pro-style rating for this match
    mvp: boolean             // Was MVP of this match
    eloChange: number        // ELO gained/lost
}

/**
 * A single FPL match record
 */
export interface FPLMatchRecord {
    id: string
    week: number
    mapPlayed: string
    teamA: string[]          // 5 player IDs
    teamB: string[]          // 5 player IDs
    scoreA: number
    scoreB: number
    winningTeam: 'A' | 'B'
    playerStats: FPLMatchPlayerStats[]
    duration: number         // Match duration in minutes
}

/**
 * Monthly FPL Season
 */
export interface FPLSeason {
    id: string
    seasonNumber: number
    startWeek: number
    endWeek: number
    isActive: boolean
    prizePool: number
    leaderboard: FPLSeasonEntry[]
    champion?: string        // Player ID of winner
    rewards: FPLSeasonReward[]
}

/**
 * Entry in season leaderboard
 */
export interface FPLSeasonEntry {
    playerId: string
    points: number
    matchesPlayed: number
    winRate: number
}

/**
 * Season reward for top players
 */
export interface FPLSeasonReward {
    placement: number        // 1st, 2nd, 3rd
    prize: number            // Money reward
    xpBonus: number          // XP bonus
    prestigeBonus: number    // Reputation boost
}

/**
 * FPL data stored in game save
 */
export interface FPLSaveData {
    playerStats: Record<string, FPLPlayerStats>
    currentSeason: FPLSeason
    matchHistory: FPLMatchRecord[]
    seasonHistory: FPLSeason[]
    globalRankings: { playerId: string; elo: number }[]
    lastProcessedWeek: number

    // Non-pro players
    nonProPlayers: FPLNonProPlayer[]

    // Separate league standings
    fplStandings: FPLLeagueStanding[]
    fplCStandings: FPLLeagueStanding[]

    // Tier change history
    tierChanges: FPLTierChange[]

    // Off-season tracking
    offSeasonEndWeek?: number  // If set, weeks <= this value are off-season
}

/**
 * FPL Constants
 */
export const FPL_CONSTANTS = {
    // ELO thresholds for tiers
    FPL_THRESHOLD: 2000,     // Top tier (FPL)
    FPL_C_THRESHOLD: 1500,   // Challenger tier (FPL-C)
    // Below 1500 is HUBS tier

    // Base ELO for new players
    BASE_ELO: 1000,

    // ELO K-factors
    K_FACTOR_FPL: 16,        // Slower changes in FPL
    K_FACTOR_FPL_C: 24,      // Medium changes in FPL-C
    K_FACTOR_HUBS: 32,       // Faster changes in HUBS

    // Points per match outcome
    WIN_POINTS: 3,
    LOSS_POINTS: 0,
    MVP_BONUS: 1,

    // Season length in weeks
    SEASON_LENGTH: 12,       // 12-week seasons (4 per year)

    // Prize pool distribution
    PRIZE_POOL_BASE: 10000,
    PRIZE_POOL_FPL_C: 3000,  // FPL-C has smaller prize pool
    PRIZE_DISTRIBUTION: [0.5, 0.3, 0.2],  // 1st: 50%, 2nd: 30%, 3rd: 20%

    // Minimum matches per week to be active
    MIN_WEEKLY_MATCHES: 2,

    // Max matches per week
    MAX_WEEKLY_MATCHES: 10,

    // Match simulation constants
    MATCH_DURATION_MIN: 25,
    MATCH_DURATION_MAX: 45,

    // Promotion/Demotion
    PROMOTION_SLOTS: 3,              // Top 3 from FPL-C get promoted
    RELEGATION_SLOTS: 3,             // Bottom 3 from FPL get demoted
    MIN_MATCHES_FOR_ELIGIBILITY: 24, // Must play this many matches to be eligible (~2/week over 12 weeks)

    // Non-pro player generation
    NON_PRO_PLAYER_COUNT: 250,       // Total non-pro players to generate
    NON_PRO_FPL_COUNT: 80,           // Non-pros in FPL tier (+ ~20 pros = ~100 total)
    NON_PRO_FPL_C_COUNT: 150,        // Non-pros in FPL-C tier (unlimited)
    NON_PRO_HUBS_COUNT: 20,          // Non-pros in HUBS tier (feeder)

    // FPL tier cap
    MAX_FPL_TIER_PLAYERS: 100,       // Hard cap for FPL tier

    // Off-season
    OFF_SEASON_LENGTH: 4,            // 4-week break after every cycle
    SEASONS_PER_CYCLE: 4,            // 4 seasons per year, then off-season
}

/**
 * Calculate FPL tier from ELO
 */
export function getFPLTier(elo: number): FPLTier {
    if (elo >= FPL_CONSTANTS.FPL_THRESHOLD) return 'FPL'
    if (elo >= FPL_CONSTANTS.FPL_C_THRESHOLD) return 'FPL_C'
    return 'HUBS'
}

/**
 * Get tier display name
 */
export function getFPLTierName(tier: FPLTier): string {
    switch (tier) {
        case 'FPL': return 'FPL Pro'
        case 'FPL_C': return 'FPL Challenger'
        case 'HUBS': return 'Community Hubs'
    }
}

/**
 * Get tier color class
 */
export function getFPLTierColor(tier: FPLTier): string {
    switch (tier) {
        case 'FPL': return 'text-amber-400 bg-amber-500/20 border-amber-500/30'
        case 'FPL_C': return 'text-purple-400 bg-purple-500/20 border-purple-500/30'
        case 'HUBS': return 'text-blue-400 bg-blue-500/20 border-blue-500/30'
    }
}

/**
 * Get player type display label
 */
export function getFPLPlayerTypeLabel(type: FPLPlayerType): string {
    switch (type) {
        case 'PRO': return 'Pro Player'
        case 'STREAMER': return 'Streamer'
        case 'SEMI_PRO': return 'Semi-Pro'
        case 'ACADEMY_REJECT': return 'Ex-Academy'
        case 'GRINDER': return 'Grinder'
        case 'RETIRED_PRO': return 'Former Pro'
        case 'RISING_TALENT': return 'Rising Star'
    }
}

/**
 * Get player type badge color class
 */
export function getFPLPlayerTypeColor(type: FPLPlayerType): string {
    switch (type) {
        case 'PRO': return 'text-amber-400 bg-amber-500/20 border-amber-500/30'
        case 'STREAMER': return 'text-fuchsia-400 bg-fuchsia-500/20 border-fuchsia-500/30'
        case 'SEMI_PRO': return 'text-cyan-400 bg-cyan-500/20 border-cyan-500/30'
        case 'ACADEMY_REJECT': return 'text-slate-400 bg-slate-500/20 border-slate-500/30'
        case 'GRINDER': return 'text-orange-400 bg-orange-500/20 border-orange-500/30'
        case 'RETIRED_PRO': return 'text-indigo-400 bg-indigo-500/20 border-indigo-500/30'
        case 'RISING_TALENT': return 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30'
    }
}
