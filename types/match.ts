/**
 * Match and Tournament models for CS2 Esports Manager Simulation
 * Phase 3: Complete match simulation with veto, rounds, and deterministic replay
 */

import { MatchFormat, MapId, TournamentTier, TournamentFormat } from "./enums"
import { PlayerMatchStats } from "./player"

export interface MatchEvent {
    type: "BUY" | "KILL" | "PLANT" | "DEFUSE" | "EXPLODE" | "ROUND_END" | "SAVE" | "CLUTCH"

    time: number // seconds since round start
    playerId?: string
    details?: string
    killerId?: string
    victimId?: string
    assisterId?: string
    weapon?: string
    isHeadshot?: boolean
    isUtility?: boolean
    isTrade?: boolean
    isFlashAssist?: boolean
    side?: "ct" | "t"
}

export type MatchEventType = "KILL" | "PLANT" | "DEFUSE" | "ROUND_END" | "SAVE" | "CLUTCH"

/**
 * Match model with complete simulation data
 */
export interface Match {
    id: string
    homeTeamId: string
    awayTeamId: string

    // Match context
    tournamentId?: string
    stage?: string // "Group Stage", "Quarterfinals", etc.
    date: Date

    // Format
    format: MatchFormat

    // Map veto process
    mapVeto: MapVeto[]
    vetoComplete: boolean // New: Track if veto is done
    maps: MapId[] // New: Selected maps for the series

    // Results (populated after simulation)
    mapResults: MapResult[]

    // Round-by-round history for detailed replay
    roundHistory: RoundResult[]

    // Deterministic replay seed
    seed: number

    // Overall match result
    result?: MatchResult

    // Phase 20: Tactical Perfection
    isHighPressure?: boolean // Finals/Semi-finals
    mentalPrep?: boolean // Mental preparation bonus for the home team
}

/**
 * Map veto phase
 */
export interface MapVeto {
    teamId: string
    action: "BAN" | "PICK"
    map: MapId
    order: number // Veto order (1, 2, 3, etc.)
}

/**
 * Result of a single map
 */
export interface MapResult {
    map: MapId

    // Which team started on which side
    ctStartTeamId: string
    tStartTeamId: string

    // Round-by-round results
    rounds: RoundResult[]

    // Final score
    finalScore: {
        team1: number
        team2: number
    }
    homeScore?: number
    awayScore?: number
    winner?: string // Team ID

    // Map MVP
    mvpPlayerId: string
}

/**
 * Single round result
 */
export interface RoundResult {
    roundNumber: number // 1-30 (or more in OT)

    // Which side won
    winner: "ct" | "t"

    // Which team won (resolved based on side assignments)
    winningTeamId?: string

    // How the round ended
    winType: "ELIMINATION" | "BOMB_EXPLODED" | "BOMB_DEFUSE" | "TIME"

    // Current side assignments (swap at half)
    ctTeam: string
    tTeam: string

    // Player performance and economy in this round
    kills: {
        playerId: string
        kills: number
        weapon?: string // ID from WEAPONS
    }[]
    deaths?: {
        playerId: string
        deaths: number
    }[]
    playerEconomy?: {
        playerId: string
        spent: number
        remaining: number
        weapon: string
        hasArmor: boolean
        hasHelmet: boolean
        hasKit: boolean
    }[]
    events?: MatchEvent[]
}

/**
 * Overall match result
 */
export interface MatchResult {
    winnerId: string | null // ID of the winning team
    homeScore: number // Maps won by home team
    awayScore: number // Maps won by away team

    // Map-by-map results
    maps: MapResult[]

    // Overall match MVP
    mvpPlayerId: string

    // Player statistics for the entire match
    playerStats: Record<string, PlayerMatchStats>

    // XP Gains for players (Phase 60: Talent Trees)
    xpGains?: Record<string, number>
}

export interface Tournament {
    id: string
    name: string
    tier: TournamentTier

    // Participating teams
    teams: string[] // Team IDs

    // Format
    format: TournamentFormat

    // Current state
    currentStage: string // "Group Stage", "Playoffs", "Finals"

    // Standings (for league/swiss formats)
    standings: TeamStanding[]

    // Prize pool
    prizePool: number

    // Dates
    startDate: Date
    endDate: Date

    // NEW: Groups and Playoffs
    groups?: TournamentGroup[]
    playoffBracket?: BracketMatch[]
    isCompleted?: boolean
}

/**
 * Tournament group (e.g. Group A, Group B)
 */
export interface TournamentGroup {
    id: string
    name: string
    teamIds: string[]
    matchIds: string[]
    standings: TeamStanding[]
}

/**
 * Team standing in a tournament
 */
export interface TeamStanding {
    teamId: string

    // Match record
    matchesPlayed: number
    wins: number
    losses: number

    // Map record
    firstDeaths: number
    mapsPlayed: number
    mapsWon: number
    mapsLost: number

    // Points (for league format)
    points: number

    // Map differential
    mapDiff: number

    // Round differential (tiebreaker)
    roundDiff: number
}

/**
 * Bracket match (for elimination tournaments)
 */
export interface BracketMatch {
    id: string
    tournamentId: string
    stage: string // "Quarterfinals", "Semifinals", "Grand Final", "3rd Place Decider"
    homeTeamId?: string
    awayTeamId?: string
    homeScore?: number
    awayScore?: number
    winnerId?: string
    loserId?: string
    isCompleted: boolean
    nextMatchId?: string
    sourceMatchIds?: string[]
    matchId?: string // Actual Match ID (scheduled/completed)
    week: number
    format: MatchFormat
    seed: number
}

/**
 * Helper: Create initial map veto for BO3
 * Standard CS2 veto: Ban, Ban, Pick, Pick, Ban, Ban, Decider
 */
export function createBO3Veto(team1Id: string, team2Id: string): MapVeto[] {
    // This will be populated during match simulation
    // Returns empty array, to be filled by veto logic
    return []
}

/**
 * Helper: Determine match winner
 */
export function getMatchWinner(result: MatchResult): "HOME" | "AWAY" | "DRAW" {
    if (result.homeScore > result.awayScore) return "HOME"
    if (result.awayScore > result.homeScore) return "AWAY"
    return "DRAW"
}

/**
 * Helper: Calculate player rating from match stats
 * Simplified HLTV-style rating formula
 */
export function calculatePlayerRating(stats: PlayerMatchStats): number {
    const deaths = Math.max(1, stats.deaths)
    const kd = stats.kills / deaths

    // Impact calculation: (Kills + 0.5 * Assists + Clutches + Opening Kills) / Deaths
    const impact = (stats.kills + (0.5 * stats.assists) + (stats.clutches || 0) + (stats.firstKills || 0)) / deaths

    // ADR factor: standard is 80 ADR = 1.0 rating contribution
    const adrFactor = (stats.adr || 75) / 75

    const kast = (stats.kast || 70) / 100

    // Final rating: weighted combination
    // 35% KD, 25% Impact, 20% ADR, 20% KAST
    const rating = (0.35 * kd) + (0.25 * impact) + (0.20 * adrFactor) + (0.20 * kast)

    // Clamp to 0-2.5 range
    return Math.max(0, Math.min(2.5, rating))
}

/**
 * Phase 39/43: Customizable Tactical Loadouts with Per-Player Configuration
 */
export interface PlayerLoadout {
    slotIndex: number           // 0-4 (roster position)
    roleHint?: string           // AWPER, RIFLER, SUPPORT, etc.
    primaryWeaponId: string
    secondaryWeaponId: string
    armorTier: "NONE" | "LIGHT" | "HEAVY"
    hasKit: boolean
    utility: string[]
}

export interface TacticalStrategy {
    // Custom name for the strategy (e.g. "Rush B")
    name?: string
    // Legacy single-loadout fields (for backward compat)
    primaryWeaponId?: string
    secondaryWeaponId?: string
    armorTier?: "NONE" | "LIGHT" | "HEAVY"
    hasKit?: boolean
    utility?: string[]
    // New per-player loadouts
    playerLoadouts?: PlayerLoadout[]
}

export interface CustomTactics {
    ECO: { ct: TacticalStrategy; t: TacticalStrategy }
    FORCE: { ct: TacticalStrategy; t: TacticalStrategy }
    SEMIBUY: { ct: TacticalStrategy; t: TacticalStrategy }
    FULL: { ct: TacticalStrategy; t: TacticalStrategy }
    "DOUBLE AWP": { ct: TacticalStrategy; t: TacticalStrategy }
}

/**
 * Tournament Stats - HLTV-style player stats aggregation
 */
export interface TournamentPlayerStats {
    playerId: string
    playerName: string
    teamId: string
    teamName: string
    nationality: string
    portraitPath?: string

    // Aggregated stats
    mapsPlayed: number
    kills: number
    deaths: number
    assists: number
    adr: number           // Average across maps
    rating: number        // Average rating
    kast: number          // Average KAST
    headshots: number
    clutches: number
    firstKills: number
    firstDeaths: number

    // Calculated
    kdRatio: number
    winRate: number
    impactRating: number
}

/**
 * Tournament Stats - Team stats aggregation
 */
export interface TournamentTeamStats {
    teamId: string
    teamName: string
    logoPath?: string

    mapsPlayed: number
    mapsWon: number
    mapsLost: number
    roundsWon: number
    roundsLost: number
    avgRating: number     // Team average player rating

    // Derived
    mapWinRate: number
    roundDiff: number
}

/**
 * Tournament MVP data
 */
export interface TournamentMVP {
    playerId: string
    playerName: string
    teamId: string
    teamName: string
    nationality: string
    portraitPath?: string

    // MVP stats
    avgRating: number
    totalKills: number
    mapsPlayed: number
    mvpMaps: number       // Maps where player was MVP
}
