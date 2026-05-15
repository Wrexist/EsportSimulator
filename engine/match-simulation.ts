/**
 * Phase 4 Simulation Engine
 * Deterministic, inspectable match simulation for CS2
 * 
 * FEATURES:
 * - Seeded RNG passed explicitly (no global randomness)
 * - Team factors: average skill, role coverage, chemistry, morale, fatigue
 * - Map factors: map-specific strength, tactical rating
 * - Dynamic modifiers: momentum, tilt, clutch probability
 * - Full round history with clutch events and momentum shifts
 */

import { SeededRNG, createMatchRNG } from "./rng"
import { EconomyManager, WEAPONS, Weapon, WeaponType as EconomyWeaponType } from "./economy-manager"
import { TeamSaveData } from "./index"
import {
    Player,
    Team,
    Match,
    MatchResult,
    MapResult,
    RoundResult,
    MapVeto,
    PlayerMatchStats,
    MapId,
    MatchFormat,
    PlayerRole,
    calculateTeamChemistry,
    Coach,
    Analyst,
    Psychologist,
    StaffType,
    MatchEvent,
    CustomTactics,
} from "@/types"
import { WeaponMasteryManager, WeaponType, WEAPON_TYPES, getMasteryLevel, MASTERY_LEVELS } from "@/engine/weapon-mastery-system"
import { perfTrace } from "./perf-trace"
import { MATCH_BALANCE, MATCH_STRUCTURE, UTIL_POWER as UTIL_POWER_MAP, UTIL_POWER_DEFAULT as UTIL_POWER_FALLBACK } from "@/lib/constants"
import { logger } from "@/lib/logger"
import {
    calculateMapStrengths as calculateMapStrengthsFn,
    selectMapForVeto as selectMapForVetoFn,
    simulateMapVeto as simulateMapVetoFn,
} from "./match/map-veto"
import {
    determineMapMVP as determineMapMVPFn,
    generateMatchStats as generateMatchStatsFn,
    determineMVP as determineMVPFn,
} from "./match/match-stats"
import {
    determineWinType as determineWinTypeFn,
    generateRoundStats as generateRoundStatsFn,
    addKillEvent as addKillEventFn,
    pickWeighted as pickWeightedFn,
    type PlayerSimulationState as RoundPlayerSimulationState,
} from "./match/round-outcome"
import { performBuyPhase as performBuyPhaseFn, type BuyStrategy } from "./match/buy-phase"

// ===== TYPES =====

export interface RoundSimulationResult {
    winner: "HOME" | "AWAY"
    winType: "ELIMINATION" | "BOMB_EXPLODED" | "BOMB_DEFUSE" | "TIME"
    clutchEvent: boolean
    clutchPlayerId?: string
    momentumShift: number // -1 to +1
    kills: { playerId: string; kills: number; weapon: string }[]
    deaths: { playerId: string; deaths: number }[]
    events: MatchEvent[]
}

export interface MapSimulationResult extends MapResult {
    homeScore: number
    awayScore: number
}

export interface MatchStats {
    homeTeamStrength: number
    awayTeamStrength: number
    homeChemistry: number
    awayChemistry: number
}

// ===== CONSTANTS =====
const T_SIDE_ADVANTAGE_MAPS: MapId[] = [MapId.ANUBIS, MapId.ANCIENT]
const T_SIDE_ADVANTAGE = MATCH_BALANCE.T_SIDE_ADVANTAGE
const CT_SIDE_ADVANTAGE = MATCH_BALANCE.CT_SIDE_ADVANTAGE
const MOMENTUM_WEIGHT = MATCH_BALANCE.MOMENTUM_WEIGHT
const MOMENTUM_MAX_ROUNDS = MATCH_BALANCE.MOMENTUM_MAX_ROUNDS
const TILT_THRESHOLD = MATCH_BALANCE.TILT_THRESHOLD
const TILT_PENALTY = MATCH_BALANCE.TILT_PENALTY
const CLUTCH_BASE_CHANCE = MATCH_BALANCE.CLUTCH_BASE_CHANCE

// ===== PLAYSTYLE COUNTER SYSTEM =====
// Rock-Paper-Scissors tactical counters:
// - AGGRESSIVE beats STRUCTURED (catches slow setups off-guard, forces mistakes)
// - STRUCTURED beats BALANCED (methodical play overwhelms standard defense)
// - BALANCED beats AGGRESSIVE (trades well, punishes over-aggression)
// - DEFAULT is neutral (no counter bonus/penalty)

type PlaystyleType = "balanced" | "aggressive" | "structured" | "default" | undefined

const PLAYSTYLE_COUNTER_BONUS = MATCH_BALANCE.PLAYSTYLE_COUNTER_BONUS
const PLAYSTYLE_COUNTER_PENALTY = MATCH_BALANCE.PLAYSTYLE_COUNTER_PENALTY

/**
 * Calculate playstyle counter modifier
 * @returns Multiplier (1.0 = neutral, >1 = advantage, <1 = disadvantage)
 */
function calculatePlaystyleCounterMod(myStyle: PlaystyleType, opponentStyle: PlaystyleType): number {
    // Default style is neutral
    if (!myStyle || myStyle === "default" || !opponentStyle || opponentStyle === "default") {
        return 1.0
    }

    // Check if my style counters opponent
    const counters: Record<string, string> = {
        aggressive: "structured",  // Aggressive beats Structured
        structured: "balanced",    // Structured beats Balanced
        balanced: "aggressive",    // Balanced beats Aggressive
    }

    if (counters[myStyle] === opponentStyle) {
        return 1.0 + PLAYSTYLE_COUNTER_BONUS // I counter them
    }

    if (counters[opponentStyle] === myStyle) {
        return 1.0 - PLAYSTYLE_COUNTER_PENALTY // They counter me
    }

    return 1.0 // Same style or no counter relationship
}


// ===== UTILITY POWER VALUES (class-level, not redefined per round) =====
const UTIL_POWER = UTIL_POWER_MAP
const UTIL_POWER_DEFAULT = UTIL_POWER_FALLBACK

function getUtilPower(util: string[] = []): number {
    return (util || []).reduce((sum, u) => sum + (UTIL_POWER[u] ?? UTIL_POWER_DEFAULT), 0)
}

// ===== SIMULATION ENGINE =====

// PlayerSimulationState moved to engine/match/round-outcome.ts (Phase I4)
// alongside its primary consumer. Re-aliased here for in-file use.
type PlayerSimulationState = RoundPlayerSimulationState

export class SimulationEngineV2 {
    /**
     * Simulate a complete match with deterministic replay
     */
    simulateMatch(
        match: Match,
        homeTeam: Team,
        awayTeam: Team,
        homePlayers: Player[],
        awayPlayers: Player[],
        homeStaff?: { coach?: Coach; analyst?: Analyst; psychologist?: Psychologist },
        awayStaff?: { coach?: Coach; analyst?: Analyst; psychologist?: Psychologist },
        forcedMaps?: MapId[],
        customTactics?: CustomTactics
    ): MatchResult {
      const __perfT0 = perfTrace.enabled ? perfTrace.now() : 0
      try {
        const matchSeed = (typeof match.seed === 'number' && Number.isFinite(match.seed) && match.seed > 0)
            ? Math.floor(match.seed) : 12345
        const rng = createMatchRNG(matchSeed)

        // Enforce 5-man rosters (Active Squad)
        // If more than 5, take the first 5 (assumed to be active lineup by caller)
        const activeHomePlayers = homePlayers.slice(0, 5)
        const activeAwayPlayers = awayPlayers.slice(0, 5)

        // Use provided staff or fallback to lookup
        const hStaff = homeStaff || this.getTeamStaff(homeTeam)
        const aStaff = awayStaff || this.getTeamStaff(awayTeam)

        // Cache map strengths once (used by veto and map simulation)
        const cachedHomeMapStrengths = this.calculateMapStrengths(activeHomePlayers)
        const cachedAwayMapStrengths = this.calculateMapStrengths(activeAwayPlayers)

        // Perform map veto
        let maps: MapId[] = []

        if (forcedMaps && forcedMaps.length > 0) {
            maps = forcedMaps
        } else {
            const vetoResult = this.simulateMapVeto(
                rng,
                homeTeam.id,
                awayTeam.id,
                activeHomePlayers,
                activeAwayPlayers,
                hStaff.analyst,
                aStaff.analyst,
                cachedHomeMapStrengths,
                cachedAwayMapStrengths
            )
            maps = vetoResult.maps
        }

        // Simulate maps
        const mapResults: MapResult[] = []
        let homeScore = 0
        let awayScore = 0
        const mapsToWin = match.format === MatchFormat.BO1 ? 1 :
            match.format === MatchFormat.BO3 ? 2 : 3

        // Bug fix: mentalPrep was always applied to the home team, but the
        // player can be either side. `mentalPrepTeamId` tells the simulator
        // which side paid for it; legacy saves without that field fall back
        // to home (the prior behaviour).
        const homeMentalPrep = !!match.mentalPrep && (
            !match.mentalPrepTeamId || match.mentalPrepTeamId === homeTeam.id
        )
        const awayMentalPrep = !!match.mentalPrep && match.mentalPrepTeamId === awayTeam.id

        for (let i = 0; i < maps.length && homeScore < mapsToWin && awayScore < mapsToWin; i++) {
            const mapResult = this.simulateMap(
                rng,
                maps[i],
                homeTeam,
                awayTeam,
                activeHomePlayers,
                activeAwayPlayers,
                hStaff,
                aStaff,
                !!match.isHighPressure,
                customTactics,
                matchSeed,
                i, // mapIndex
                match.stage, // matchStage
                homeMentalPrep,
                awayMentalPrep,
                cachedHomeMapStrengths,
                cachedAwayMapStrengths
            )

            mapResults.push(mapResult)

            if (mapResult.finalScore.team1 > mapResult.finalScore.team2) {
                homeScore++
            } else {
                awayScore++
            }
        }

        // Generate player stats
        const playerStats = this.generateMatchStats(
            rng,
            activeHomePlayers,
            activeAwayPlayers,
            mapResults,
            homeScore > awayScore
        )

        // Determine MVP
        const winningPlayers = homeScore > awayScore ? activeHomePlayers : activeAwayPlayers
        const mvpPlayerId = this.determineMVP(playerStats, winningPlayers)

        if (perfTrace.enabled) {
            perfTrace.record("simulateMatch", __perfT0, {
                matchId: match.id,
                format: match.format,
                maps: mapResults.length,
            })
        }
        return {
            homeScore,
            awayScore,
            maps: mapResults,
            mvpPlayerId,
            playerStats,
            winnerId: homeScore > awayScore ? homeTeam.id : awayTeam.id
        }
      } catch (error) {
        logger.error('[SimulationEngineV2] simulateMatch failed', error, { matchId: match.id, homeTeam: homeTeam.id, awayTeam: awayTeam.id })
        throw error
      }
    }

    /**
     * Simulate map veto process
     * Order: Ban, Ban, Pick, Pick, Remaining is decider
     */
    // Veto / map-strength implementation lives in engine/match/map-veto.ts
    // (Phase I1). Facades preserved so existing callers — useLiveMatch +
    // match-simulation-slice + this class's own simulateMatch — keep
    // their import paths.
    private simulateMapVeto(
        rng: SeededRNG,
        homeTeamId: string,
        awayTeamId: string,
        homePlayers: Player[],
        awayPlayers: Player[],
        homeAnalyst?: Analyst,
        awayAnalyst?: Analyst,
        cachedHomeMapStrengths?: Map<MapId, number>,
        cachedAwayMapStrengths?: Map<MapId, number>
    ): { veto: MapVeto[]; maps: MapId[] } {
        return simulateMapVetoFn(
            rng, homeTeamId, awayTeamId, homePlayers, awayPlayers,
            homeAnalyst, awayAnalyst,
            cachedHomeMapStrengths, cachedAwayMapStrengths,
        )
    }

    public calculateMapStrengths(players: Player[]): Map<MapId, number> {
        return calculateMapStrengthsFn(players)
    }

    public selectMapForVeto(
        rng: SeededRNG,
        availableMaps: MapId[],
        targetStrengths: Map<MapId, number>,
        action: "BAN" | "PICK",
        analystLevel: number
    ): MapId {
        return selectMapForVetoFn(rng, availableMaps, targetStrengths, action, analystLevel)
    }

    /**
     * Simulate a single map
     */
    private simulateMap(
        rng: SeededRNG,
        map: MapId,
        homeTeam: Team,
        awayTeam: Team,
        homePlayers: Player[],
        awayPlayers: Player[],
        homeStaff: { coach?: Coach; analyst?: Analyst; psychologist?: Psychologist } = {},
        awayStaff: { coach?: Coach; analyst?: Analyst; psychologist?: Psychologist } = {},
        isHighPressure: boolean = false,
        customTactics?: CustomTactics,
        matchSeed: number = 0,
        mapIndex: number = 0,
        matchStage?: string,
        homeMentalPrep?: boolean,
        awayMentalPrep?: boolean,
        cachedHomeMapStrengths?: Map<MapId, number>,
        cachedAwayMapStrengths?: Map<MapId, number>
    ): MapResult {
        const rounds: RoundResult[] = []
        let homeRounds = 0
        let awayRounds = 0

        // Determine starting sides (knife round)
        const homeStartsCT = rng.bool()
        let currentCTTeam = homeStartsCT ? homeTeam.id : awayTeam.id
        let currentTTeam = homeStartsCT ? awayTeam.id : homeTeam.id

        // Calculate base team strengths
        const homeBaseStrength = this.calculateTeamStrength(homeTeam, homePlayers, homeStaff, homeMentalPrep)
        const awayBaseStrength = this.calculateTeamStrength(awayTeam, awayPlayers, awayStaff, awayMentalPrep)

        // Apply playstyle counter modifiers (rock-paper-scissors tactical system)
        const homePlaystyleMod = calculatePlaystyleCounterMod(homeTeam.playstyle, awayTeam.playstyle)
        const awayPlaystyleMod = calculatePlaystyleCounterMod(awayTeam.playstyle, homeTeam.playstyle)
        const homeStrength = homeBaseStrength * homePlaystyleMod
        const awayStrength = awayBaseStrength * awayPlaystyleMod

        // Map-specific adjustments (use cached strengths to avoid recalculation)
        const homeMapStr = cachedHomeMapStrengths || this.calculateMapStrengths(homePlayers)
        const awayMapStr = cachedAwayMapStrengths || this.calculateMapStrengths(awayPlayers)
        const mapStrengths = {
            home: homeMapStr.get(map) || 50,
            away: awayMapStr.get(map) || 50,
        }

        // Initialize economy
        const homeEconomy: Record<string, PlayerSimulationState> = {}
        const awayEconomy: Record<string, PlayerSimulationState> = {}
        homePlayers.forEach(p => homeEconomy[p.id] = { id: p.id, cash: 800, weapon: homeStartsCT ? "usp" : "glock", hasArmor: false, hasHelmet: false, hasKit: false, utility: [] })
        awayPlayers.forEach(p => awayEconomy[p.id] = { id: p.id, cash: 800, weapon: homeStartsCT ? "glock" : "usp", hasArmor: false, hasHelmet: false, hasKit: false, utility: [] })

        // Momentum trackers
        let homeWinStreak = 0
        let awayWinStreak = 0
        let homeLossStreak = 0
        let awayLossStreak = 0
        // Match constants - MR12 Format
        const REGULATION_MAX_ROUNDS = MATCH_STRUCTURE.REGULATION_ROUNDS
        const OT_HALF_ROUNDS = MATCH_STRUCTURE.OT_ROUNDS_PER_HALF
        const OT_TOTAL_ROUNDS = OT_HALF_ROUNDS * 2

        let roundNum = 0
        let currentOTSet = 0
        let isOvertime = false

        // Momentum Tracking (0-100 Impact)
        let homeMomentumScore = 0
        let awayMomentumScore = 0

        // Pre-built lookup set for O(1) home-player checks in the round loop
        const homePlayerIdSet = new Set(homePlayers.map(p => p.id))

        // Pre-built player map for O(1) lookups in calculateEquipPower
        const playerMap = new Map(homePlayers.concat(awayPlayers).map(p => [p.id, p]))

        // Cache stress resistance averages (used every round when isHighPressure)
        const homeStressRes = homePlayers.length > 0 ? homePlayers.reduce((sum, p) => sum + (p.stressResistance || 50), 0) / homePlayers.length : 50
        const awayStressRes = awayPlayers.length > 0 ? awayPlayers.reduce((sum, p) => sum + (p.stressResistance || 50), 0) / awayPlayers.length : 50

        // Loop until a team reaches a win condition
        while (true) {
            roundNum++
            // Safety guard: prevent infinite loops in edge cases
            if (roundNum > 100) break

            // Deterministic Round RNG
            // Seed = MatchSeed + (MapIndex * 1000) + RoundNum
            const roundSeed = matchSeed + (mapIndex * 1000) + roundNum
            const roundRng = createMatchRNG(roundSeed)

            // Check for Regulation Win (MR12)
            if (!isOvertime) {
                if (homeRounds >= 13) break
                if (awayRounds >= 13) break

                // Regulation finished 12-12
                if (homeRounds === 12 && awayRounds === 12) {
                    isOvertime = true
                    currentOTSet = 1
                }
            } else {
                // Overtime Win (OT MR3)
                const targetScore = 12 + (3 * (currentOTSet - 1)) + 4

                if (homeRounds >= targetScore) break
                if (awayRounds >= targetScore) break

                // Check for tie at end of set
                const endOfSetRound = 24 + (currentOTSet * 6)
                if (roundNum > endOfSetRound) {
                    currentOTSet++
                    // Cap at 3 OT sets, then sudden death
                    if (currentOTSet > 3) {
                        if (homeRounds !== awayRounds) {
                            // Whoever is ahead wins
                            break
                        }
                        // If still tied, force a winner via coin flip
                        const totalStr = homeStrength + awayStrength
                        if (rng.bool(totalStr > 0 ? homeStrength / totalStr : 0.5)) homeRounds++
                        else awayRounds++
                        break
                    }
                }
            }

            // Determine Sides
            let homeIsCT: boolean
            if (!isOvertime) {
                // Regulation: swap at 12
                homeIsCT = roundNum <= REGULATION_MAX_ROUNDS / 2 ? homeStartsCT : !homeStartsCT

                // HALF-TIME RESET (Round 13) - CS2 resets economy and equipment at half-time
                if (roundNum === REGULATION_MAX_ROUNDS / 2 + 1) {
                    [currentCTTeam, currentTTeam] = [currentTTeam, currentCTTeam]

                    // Reset economy to $800 for all players (pistol round economy)
                    Object.values(homeEconomy).forEach(p => {
                        p.cash = 800
                        p.weapon = homeIsCT ? "usp" : "glock"
                        p.hasArmor = false
                        p.hasHelmet = false
                        p.hasKit = false
                        p.utility = []
                    })
                    Object.values(awayEconomy).forEach(p => {
                        p.cash = 800
                        p.weapon = !homeIsCT ? "usp" : "glock"
                        p.hasArmor = false
                        p.hasHelmet = false
                        p.hasKit = false
                        p.utility = []
                    })

                    // Reset win/loss streaks for fresh second half
                    homeWinStreak = 0
                    awayWinStreak = 0
                    homeLossStreak = 0
                    awayLossStreak = 0
                }
            } else {
                // Overtime: 3 rounds per side
                const otRoundInSet = (roundNum - REGULATION_MAX_ROUNDS - 1) % OT_TOTAL_ROUNDS
                const otHalf = Math.floor(otRoundInSet / OT_HALF_ROUNDS)

                homeIsCT = otHalf === 0 ? homeStartsCT : !homeStartsCT

                // Update currentCTTeam/currentTTeam for the round based on homeIsCT
                if (homeIsCT) {
                    currentCTTeam = homeTeam.id
                    currentTTeam = awayTeam.id
                } else {
                    currentCTTeam = awayTeam.id
                    currentTTeam = homeTeam.id
                }
            }

            // 1. Determine Buying Strategy
            // OT Money Reset Logic: Reset to 10k at start of OT and Half-Time of OT
            const isOTStart = roundNum === 25 || (isOvertime && (roundNum - 24 - 1) % 6 === 0)
            const isOTHalf = isOvertime && (roundNum - 24 - 1) % 3 === 0 && (roundNum - 24 - 1) % 6 !== 0

            // Standard CS2: Reset at start of OT (Round 25) and Half (Round 28)
            if (isOTStart || isOTHalf) {
                Object.values(homeEconomy).forEach(p => p.cash = 10000) // CS2 OT money is 10k usually
                Object.values(awayEconomy).forEach(p => p.cash = 10000)
            }

            const homeAvgCash = Object.values(homeEconomy).reduce((s, p) => s + p.cash, 0) / 5
            const awayAvgCash = Object.values(awayEconomy).reduce((s, p) => s + p.cash, 0) / 5

            // In OT, strategy is always FULL
            const homeStrategy = isOvertime ? "FULL" : EconomyManager.getTeamStrategy(homeAvgCash, homeTeam.economyStyle)
            const awayStrategy = isOvertime ? "FULL" : EconomyManager.getTeamStrategy(awayAvgCash, awayTeam.economyStyle)

            // 2. Perform Buys (Use unified method with RoundRNG)
            // Snapshot pre-buy cash so we can compute actual spend
            const preBuyCash: Record<string, number> = {}
            homePlayers.forEach(p => preBuyCash[p.id] = homeEconomy[p.id].cash)
            awayPlayers.forEach(p => preBuyCash[p.id] = awayEconomy[p.id].cash)

            this.performBuyPhase(homePlayers, homeEconomy, homeStrategy, homeIsCT, roundRng, customTactics)
            this.performBuyPhase(awayPlayers, awayEconomy, awayStrategy, !homeIsCT, roundRng, customTactics)

            // Calculate round win probability
            const roundResult = this.simulateRound(
                roundRng,
                homePlayers,
                awayPlayers,
                homeStrength,
                awayStrength,
                mapStrengths.home,
                mapStrengths.away,
                homeIsCT,
                homeWinStreak,
                awayWinStreak,
                homeLossStreak,
                awayLossStreak,
                roundNum,
                homeEconomy,
                awayEconomy,
                homeStrategy,
                awayStrategy,
                isHighPressure,
                homeTeam,
                awayTeam,
                currentCTTeam,
                currentTTeam,
                customTactics,
                homeMomentumScore,
                awayMomentumScore,
                homeStaff,
                awayStaff,
                map,
                matchStage,
                homeStressRes,
                awayStressRes,
                playerMap
            )

            // Update Momentum
            const winnerId = roundResult.winner === "HOME" ? homeTeam.id : awayTeam.id
            const isHomeWin = roundResult.winner === "HOME"
            const winningStrategy = isHomeWin ? homeStrategy : awayStrategy

            // Base: Reset loser, Increment winner
            if (isHomeWin) {
                awayMomentumScore = 0
                homeMomentumScore += 1
                if (winningStrategy === "ECO") homeMomentumScore += 3 // Eco Win Bonus
            } else {
                homeMomentumScore = 0
                awayMomentumScore += 1
                if (winningStrategy === "ECO") awayMomentumScore += 3
            }

            // Clutch Bonus
            const clutchEvent = roundResult.events?.find(e => e.type === "CLUTCH")
            if (clutchEvent) {
                if (isHomeWin) homeMomentumScore += 2
                else awayMomentumScore += 2
            }

            // Cap Momentum
            homeMomentumScore = Math.min(homeMomentumScore, 10)
            awayMomentumScore = Math.min(awayMomentumScore, 10)

            // Update scores and streaks
            if (roundResult.winner === "HOME") {
                homeRounds++
                homeWinStreak++
                awayWinStreak = 0
                homeLossStreak = 0
                awayLossStreak++

                // Immediate break for MR12
                if (!isOvertime && homeRounds >= 13) break
            } else {
                awayRounds++
                awayWinStreak++
                homeWinStreak = 0
                awayLossStreak = 0
                homeLossStreak++

                // Immediate break for MR12
                if (!isOvertime && awayRounds >= 13) break
            }

            rounds.push({
                roundNumber: roundNum,
                winner: roundResult.winner === "HOME" ? (currentCTTeam === homeTeam.id ? "ct" : "t") : (currentCTTeam === awayTeam.id ? "ct" : "t"),
                winningTeamId: roundResult.winner === "HOME" ? homeTeam.id : awayTeam.id,
                winType: roundResult.winType,
                ctTeam: currentCTTeam,
                tTeam: currentTTeam,
                kills: roundResult.kills,
                deaths: roundResult.deaths,
                playerEconomy: [
                    ...homePlayers.map(p => ({
                        playerId: p.id,
                        spent: (preBuyCash[p.id] || 0) - homeEconomy[p.id].cash,
                        remaining: homeEconomy[p.id].cash,
                        weapon: homeEconomy[p.id].weapon,
                        hasArmor: homeEconomy[p.id].hasArmor,
                        hasHelmet: homeEconomy[p.id].hasHelmet,
                        hasKit: homeEconomy[p.id].hasKit
                    })),
                    ...awayPlayers.map(p => ({
                        playerId: p.id,
                        spent: (preBuyCash[p.id] || 0) - awayEconomy[p.id].cash,
                        remaining: awayEconomy[p.id].cash,
                        weapon: awayEconomy[p.id].weapon,
                        hasArmor: awayEconomy[p.id].hasArmor,
                        hasHelmet: awayEconomy[p.id].hasHelmet,
                        hasKit: awayEconomy[p.id].hasKit
                    }))
                ],
                events: roundResult.events
            })

            // 3. Round End Financials
            const homeWonRound = roundResult.winner === "HOME"
            const winType = roundResult.winType
            // Loss streaks are already incremented (lines 616/626), so subtract 1 to get
            // the correct 0-indexed loss bonus (first loss = streak 1, getLossBonus(0) = $1900)
            const homeBonus = homeWonRound ? EconomyManager.getWinBonus(winType) : EconomyManager.getLossBonus(homeLossStreak - 1)
            const awayBonus = !homeWonRound ? EconomyManager.getWinBonus(winType) : EconomyManager.getLossBonus(awayLossStreak - 1)

            // Kill Rewards
            roundResult.kills.forEach(k => {
                const isHome = homePlayerIdSet.has(k.playerId)
                const economy = isHome ? homeEconomy : awayEconomy
                const state = economy[k.playerId]
                const weapon = WEAPONS[state.weapon.toUpperCase()] || WEAPONS.AK47
                state.cash = Math.min(EconomyManager.MAX_CASH, state.cash + (weapon.killReward * k.kills))

                // CT Team Bonus (July 2025 Meta)
                if ((isHome && homeIsCT) || (!isHome && !homeIsCT)) {
                    Object.values(economy).forEach(p => {
                        p.cash = Math.min(EconomyManager.MAX_CASH, p.cash + (EconomyManager.getCTTeamKillBonus() * k.kills))
                    })
                }
            })

            // T Plant Loss Bonus - T-side gets $800 if bomb was planted but they lost (defused)
            // This happens when winType is BOMB_DEFUSE (CT won after plant)
            if (winType === "BOMB_DEFUSE") {
                const tEconomy = homeIsCT ? awayEconomy : homeEconomy
                // If CT won by defuse, T lost - give T the plant bonus
                Object.values(tEconomy).forEach(p => {
                    p.cash = Math.min(EconomyManager.MAX_CASH, p.cash + EconomyManager.getTPlantLossBonus())
                })
            }

            // Distribute bonuses
            homePlayers.forEach(p => homeEconomy[p.id].cash = Math.min(EconomyManager.MAX_CASH, homeEconomy[p.id].cash + homeBonus))
            awayPlayers.forEach(p => awayEconomy[p.id].cash = Math.min(EconomyManager.MAX_CASH, awayEconomy[p.id].cash + awayBonus))

            // Weapon Loss Logic (if dead, lose weapon)
            roundResult.deaths.forEach(d => {
                const isHome = homePlayerIdSet.has(d.playerId)
                const state = isHome ? homeEconomy[d.playerId] : awayEconomy[d.playerId]
                if (d.deaths > 0) {
                    state.weapon = (isHome === homeIsCT) ? "usp" : "glock" // Reset to default based on side
                    state.hasArmor = false
                    state.hasHelmet = false
                    state.hasKit = false
                    state.utility = []
                }
            })
        }

        // Note: Overtime is handled by the MR12 OT system (12-12 trigger with MR3 rounds,
        // economy resets, and side swaps). Dead MR15 code removed.

        // Determine map MVP
        const mvpPlayerId = this.determineMapMVP(rounds, homePlayers, awayPlayers)

        return {
            map,
            ctStartTeamId: homeStartsCT ? homeTeam.id : awayTeam.id,
            tStartTeamId: homeStartsCT ? awayTeam.id : homeTeam.id,
            rounds,
            finalScore: {
                team1: homeRounds,
                team2: awayRounds,
            },
            mvpPlayerId,
        }
    }

    /**
     * Calculate team overall strength
     * Factors: average skill, role coverage, chemistry, morale, fatigue
     */
    public calculateTeamStrength(
        team: Team,
        players: Player[],
        staff: { coach?: Coach; analyst?: Analyst; psychologist?: Psychologist },
        mentalPrep?: boolean
    ): number {
        if (players.length === 0) return 0

        const facilitiesLevel = team.facilitiesLevel || 1

        // Average skill (0-100)
        const avgSkill = players.reduce((sum, p) => sum + p.skill, 0) / players.length

        // Energy Multiplier (0.8 to 1.0, with exhausted penalty)
        const avgEnergy = players.reduce((sum, p) => sum + (p.energy ?? 100), 0) / players.length
        let energyMod = 0.8 + (avgEnergy / 100) * 0.2

        // Phase 55: Apply "exhausted" penalty when team is critically low on energy
        if (avgEnergy < 20) {
            energyMod *= 0.85 // -15% additional penalty when exhausted
        }

        // Form Multiplier (0.9 to 1.1)
        const avgForm = players.reduce((sum, p) => sum + (p.form ?? 50), 0) / players.length
        const formMod = 0.9 + (avgForm / 100) * 0.2

        // Role coverage bonus (unique roles = better)
        const roles = new Set(players.map(p => p.role))
        const roleCoverage = 0.8 + (roles.size / 5) * 0.2 // 0.8 to 1.0

        // Chemistry (0-100 -> 0.85 to 1.15)
        const chemistry = team.chemistry ?? calculateTeamChemistry(players)
        const chemistryMod = 0.85 + (chemistry / 100) * 0.3

        // Average morale (0-100 -> 0.8 to 1.2)
        const avgMorale = players.reduce((sum, p) => sum + (p.morale ?? 50), 0) / players.length
        const moraleMod = 0.8 + (avgMorale / 100) * 0.4

        // Average fatigue penalty (0-100 -> 1.0 to 0.7)
        const avgFatigue = players.reduce((sum, p) => sum + (p.fatigue ?? 0), 0) / players.length
        const fatigueMod = 1.0 - (avgFatigue / 100) * 0.3

        // Staff bonuses
        let staffMod = 1.0
        if (staff.coach) {
            staffMod += (staff.coach.tacticBonus || (staff.coach.level * 2)) / 100 // +2-10%
        }
        if (staff.analyst) {
            staffMod += (staff.analyst.level * 2.0) / 100 // +2-10%
        }
        if (staff.psychologist) {
            // Psychologist reduces tilt impact
            staffMod += (staff.psychologist.level * 1.5) / 100 // +1.5-7.5%
        }

        // Equipment Bonuses (each bonus point gives ~0.5% team strength)
        let equipMod = 1.0
        if (team.equipment && team.equipment.length > 0) {
            team.equipment.forEach((item) => {
                const bonusValue = item.bonus?.value || 0
                equipMod += (bonusValue / 80)
            })
        }

        // Facilities bonus (1-10 -> 1.0 to 1.1)
        const facilitiesMod = 1.0 + (facilitiesLevel / 100)

        // Phase 20: Tactical Preparation & Playstyles
        let tacticalMod = 1.0
        if (team.tacticalPrep) {
            tacticalMod += (team.tacticalPrep / 400) // Up to +25% bonus for 100% prep
        }

        // Mental Prep bonus ($5k mental reset): improves morale floor and clutch consistency
        if (mentalPrep) {
            tacticalMod += 0.03 // +3% team strength from mental preparation
        }

        // Playstyle specialization
        if (team.playstyle === "aggressive" && avgMorale > 80) {
            tacticalMod += 0.05
        } else if (team.playstyle === "structured" && chemistry > 80) {
            tacticalMod += 0.05
        }

        // Phase 60: Antistratting self-penalty (tunnel vision)
        // If the team is focusing on a specific target, they lose 5% map awareness
        if (team.targetPlayerId) {
            tacticalMod *= 0.95 // -5% tactical bonus
        }

        // Hybrid strength: base skill × critical multipliers, additive secondary mods
        // This prevents small debuffs cascading catastrophically
        const coreMod = energyMod * formMod * fatigueMod // These represent physical readiness (multiplicative)
        const additiveBonus = (roleCoverage - 1) + (chemistryMod - 1) + (moraleMod - 1) + (staffMod - 1) + (equipMod - 1) + (facilitiesMod - 1) + (tacticalMod - 1)
        return avgSkill * coreMod * Math.max(0.7, 1 + additiveBonus)
    }

    /**
     * Public method to perform the buy phase for a team.
     * This mutates the economy object directly.
     * Phase 43: Now uses per-player loadouts when available.
     */
    // Buy-phase implementation extracted to engine/match/buy-phase.ts
    // (Phase J2). Facade preserved — useLiveMatch and the slice keep
    // their existing simulationEngineV2.performBuyPhase(...) call path.
    public performBuyPhase(
        players: Player[],
        economy: Record<string, PlayerSimulationState>,
        strategy: BuyStrategy,
        isCT: boolean,
        rng: SeededRNG,
        customTactics?: CustomTactics
    ): void {
        performBuyPhaseFn(players, economy, strategy, isCT, rng, customTactics)
    }

    /**
     * Simulate a single round
     */
    public simulateRound(
        rng: SeededRNG,
        homePlayers: Player[],
        awayPlayers: Player[],
        homeBaseStrength: number,
        awayBaseStrength: number,
        homeMapStrength: number,
        awayMapStrength: number,
        homeIsCT: boolean,
        homeWinStreak: number,
        awayWinStreak: number,
        homeLossStreak: number,
        awayLossStreak: number,
        roundNum: number,
        homeEconomy: Record<string, PlayerSimulationState>,
        awayEconomy: Record<string, PlayerSimulationState>,
        homeStrategy: "ECO" | "FORCE" | "SEMIBUY" | "FULL" | "PISTOL" | "DOUBLE AWP" = "FULL",
        awayStrategy: "ECO" | "FORCE" | "SEMIBUY" | "FULL" | "PISTOL" | "DOUBLE AWP" = "FULL",
        isHighPressure: boolean = false,
        homeTeam?: Team,
        awayTeam?: Team,
        currentCTTeamId?: string,
        currentTTeamId?: string,
        customTactics?: CustomTactics,
        homeMomentumScore: number = 0,
        awayMomentumScore: number = 0,
        homeStaff?: { coach?: Coach; analyst?: Analyst; psychologist?: Psychologist },
        awayStaff?: { coach?: Coach; analyst?: Analyst; psychologist?: Psychologist },
        mapId?: MapId,
        matchStage?: string,
        cachedHomeStressRes?: number,
        cachedAwayStressRes?: number,
        cachedPlayerMap?: Map<string, Player>
    ): RoundSimulationResult {
        // Pre-built lookup set for O(1) home-player checks
        const homePlayerIdSet = new Set(homePlayers.map(p => p.id))
        // Player map for O(1) lookups (use cached if available)
        const playerMap = cachedPlayerMap ?? new Map(homePlayers.concat(awayPlayers).map(p => [p.id, p]))

        // Base win probability from strength
        // Upset Mechanics: Introduction of Chaos Factor
        // Controlled chaos: +/- 8% for realistic variance without wild swings
        const chaosFactor = rng.range(-0.08, 0.08)

        const strengthSum = homeBaseStrength + awayBaseStrength
        let homeWinProb = strengthSum === 0 ? 0.5 : homeBaseStrength / strengthSum
        homeWinProb += chaosFactor

        // UPSET MECHANIC: Complacency & Grit
        // Strong teams (win prob > 70%) can get complacent
        if (homeWinProb > 0.70 && rng.bool(0.08)) {
            homeWinProb -= 0.07 // 7% complacency penalty
        } else if (homeWinProb < 0.30 && rng.bool(0.08)) {
            // Weak teams can show grit
            homeWinProb += 0.07
        }

        // Underdog Bonus (Kick in if score difference is high)
        const roundDiff = homeWinStreak - awayWinStreak
        if (Math.abs(roundDiff) > 7) {
            // Rubber banding: slight help to the losing team
            homeWinProb += roundDiff < 0 ? 0.02 : -0.02
        }

        // Hero Round Potential (0.5% base chance)
        const isHeroRound = rng.next() < 0.005
        if (isHeroRound) {
            // The team with lower win probability gets a hero moment
            if (homeWinProb < 0.5) homeWinProb += 0.12
            else homeWinProb -= 0.12
        }

        // Economy/Equipment Advantage
        // (getUtilPower is defined at module level for reuse across rounds)

        // Helper to get mastery type
        const getMasteryType = (weaponId: string): WeaponType | undefined => {
            const w = WEAPONS[weaponId.toUpperCase()]
            if (!w) return undefined
            if (w.type === "SNIPER") return "AWP"
            if (w.type === "RIFLE") return "RIFLE"
            if (w.type === "SMG") return "SMG"
            if (w.type === "PISTOL") return "PISTOL"
            return undefined
        }

        // Phase 60: Antistratting penalty constant
        const ANTISTRAT_PENALTY = 0.15 // -15% to targeted player's contribution

        const calculateEquipPower = (
            economy: Record<string, PlayerSimulationState>,
            players: Player[],
            opponentTargetId?: string // The opponent's targeted player
        ) => {
            return Object.values(economy).reduce((s, p) => {
                const weapon = WEAPONS[p.weapon.toUpperCase()]
                let power = (weapon?.power || 15)

                // MASTERY BONUS (use cached playerMap for O(1) lookup, fallback to linear search)
                const player = cachedPlayerMap ? cachedPlayerMap.get(p.id) : players.find(pl => pl.id === p.id)
                if (player && weapon) {
                    const type = getMasteryType(p.weapon)
                    if (type) {
                        const bonuses = WeaponMasteryManager.getMasteryBonuses(player, type)
                        // Accuracy converts to raw power (approx 1% acc = 0.5 power)
                        power += bonuses.accuracy * 0.5
                        // Damage bonus adds directly to power
                        power += bonuses.damage * 0.5
                    }
                }

                let finalPower = power + (p.hasArmor ? 10 : 0) + getUtilPower(p.utility)

                // Phase 60: Antistratting penalty
                // If this player is targeted by opponent, reduce their contribution
                if (opponentTargetId && p.id === opponentTargetId) {
                    finalPower *= (1 - ANTISTRAT_PENALTY)
                }

                return s + finalPower
            }, 0) / 5
        }

        // Pass opponent's targetPlayerId to apply antistratting penalty
        const homeEquipPower = calculateEquipPower(homeEconomy, homePlayers, awayTeam?.targetPlayerId)
        const awayEquipPower = calculateEquipPower(awayEconomy, awayPlayers, homeTeam?.targetPlayerId)
        const equipDiff = (homeEquipPower - awayEquipPower) / 80
        homeWinProb += equipDiff

        // Phase 20: High Pressure (Main Stage)
        // Finals and semi-finals cause nerves. Teams with lower average stressResistance take a penalty.
        // Stage-based scaling: -3% group stage, -5% semi, -8% grand final
        if (isHighPressure) {
            // Use cached stress resistance if provided, otherwise compute (fallback for public API callers)
            const homeStressRes = cachedHomeStressRes ?? (homePlayers.length > 0 ? homePlayers.reduce((sum, p) => sum + (p.stressResistance || 50), 0) / homePlayers.length : 50)
            const awayStressRes = cachedAwayStressRes ?? (awayPlayers.length > 0 ? awayPlayers.reduce((sum, p) => sum + (p.stressResistance || 50), 0) / awayPlayers.length : 50)

            // Determine pressure penalty based on match stage
            const stageLower = (matchStage || "").toLowerCase()
            let pressurePenalty = 0.05 // default semi-level
            if (stageLower.includes("grand final") || (stageLower.includes("final") && !stageLower.includes("semi") && !stageLower.includes("quarter"))) {
                pressurePenalty = 0.08
            } else if (stageLower.includes("semi")) {
                pressurePenalty = 0.05
            } else if (stageLower.includes("group") || stageLower.includes("stage")) {
                pressurePenalty = 0.03
            }

            if (homeStressRes < 40) homeWinProb -= pressurePenalty
            if (awayStressRes < 40) homeWinProb += pressurePenalty
        }

        // CT side advantage
        if (homeIsCT) {
            homeWinProb += CT_SIDE_ADVANTAGE
        } else {
            homeWinProb -= CT_SIDE_ADVANTAGE
        }

        // Map strength adjustment
        const mapDiff = (homeMapStrength - awayMapStrength) / 200
        homeWinProb += mapDiff

        // Momentum bonus (win streak)
        // Momentum bonus (win streak)
        const homeStreakMomentum = Math.min(homeWinStreak, MOMENTUM_MAX_ROUNDS) * MOMENTUM_WEIGHT
        const awayStreakMomentum = Math.min(awayWinStreak, MOMENTUM_MAX_ROUNDS) * MOMENTUM_WEIGHT

        // New Momentum Score Bonus (Max 5%)
        // Score 0-10 -> 0.00 - 0.05
        const homeScoreMomentum = homeMomentumScore * 0.005
        const awayScoreMomentum = awayMomentumScore * 0.005

        homeWinProb += (homeStreakMomentum + homeScoreMomentum) - (awayStreakMomentum + awayScoreMomentum)

        // Tilt penalty (loss streak)
        // Psychologist impact on tilt
        const homeStressReduction = homeStaff?.psychologist ? (homeStaff.psychologist.stressReduction || (homeStaff.psychologist.level * 0.1)) : 0
        const awayStressReduction = awayStaff?.psychologist ? (awayStaff.psychologist.stressReduction || (awayStaff.psychologist.level * 0.1)) : 0

        const homeTiltMitigation = homeStressReduction // stressReduction is 0.1 to 0.5
        const awayTiltMitigation = awayStressReduction

        if (homeLossStreak >= TILT_THRESHOLD) {
            homeWinProb -= (homeLossStreak - TILT_THRESHOLD + 1) * TILT_PENALTY * (1 - homeTiltMitigation)
        }
        if (awayLossStreak >= TILT_THRESHOLD) {
            homeWinProb += (awayLossStreak - TILT_THRESHOLD + 1) * TILT_PENALTY * (1 - awayTiltMitigation)
        }

        // T Side Advantage on specific maps
        if (mapId && T_SIDE_ADVANTAGE_MAPS.includes(mapId)) {
            if (homeIsCT) {
                homeWinProb -= T_SIDE_ADVANTAGE
            } else {
                homeWinProb += T_SIDE_ADVANTAGE
            }
        }

        // Clamp probability
        homeWinProb = Math.max(0.1, Math.min(0.9, homeWinProb))

        // Determine winner
        const homeWins = rng.bool(homeWinProb)

        // Check for clutch event - probability scales by player clutch stat
        let clutchEvent = false
        let clutchPlayerId: string | undefined

        {
            // First pick which player would clutch (weighted by clutch stat)
            const clutchPlayers = homeWins ? homePlayers : awayPlayers
            const clutchWeights = clutchPlayers.map(p => p.clutch ?? 0)
            const totalWeight = clutchWeights.reduce((a, b) => a + b, 0)
            let candidatePlayer: Player | undefined

            if (totalWeight === 0) {
                // All clutch stats are 0 — pick uniformly at random
                candidatePlayer = clutchPlayers[Math.floor(rng.next() * clutchPlayers.length)]
            } else {
                let r = rng.next() * totalWeight
                for (let i = 0; i < clutchPlayers.length; i++) {
                    r -= clutchWeights[i]
                    if (r <= 0) {
                        candidatePlayer = clutchPlayers[i]
                        break
                    }
                }
            }

            if (candidatePlayer) {
                // Clutch chance scales by player stat: 10%-25% based on clutch rating
                const clutchStat = candidatePlayer.clutch ?? 10
                const clutchChance = 0.15 + (clutchStat / 100) * 0.15
                clutchEvent = rng.bool(clutchChance)
                if (clutchEvent) {
                    clutchPlayerId = candidatePlayer.id
                }
            }
        }

        // Determine win type
        const winType = determineWinTypeFn(rng, homeWins === homeIsCT)

        // Generate events for this round
        const { kills, deaths, events, winType: validatedWinType } = generateRoundStatsFn(rng, homePlayers, awayPlayers, homeWins, homeEconomy, awayEconomy, winType, homePlayerIdSet, playerMap)

        // Momentum shift
        const momentumShift = homeWins ? 0.1 : -0.1

        return {
            winner: homeWins ? "HOME" : "AWAY",
            winType: validatedWinType,
            clutchEvent,
            clutchPlayerId,
            momentumShift,
            kills,
            deaths,
            events,
        }
    }


    /**
     * Determine MVP for a map based on kill performance
     */
    // Stats aggregation extracted to engine/match/match-stats.ts (Phase I2).
    // Facades preserved — generateMatchStats is part of the public API
    // used by external callers.
    private determineMapMVP(
        rounds: RoundResult[],
        homePlayers: Player[],
        awayPlayers: Player[]
    ): string {
        return determineMapMVPFn(rounds, homePlayers, awayPlayers)
    }

    public generateMatchStats(
        rng: SeededRNG,
        homePlayers: Player[],
        awayPlayers: Player[],
        mapResults: MapResult[],
        homeWon: boolean
    ): Record<string, PlayerMatchStats> {
        return generateMatchStatsFn(rng, homePlayers, awayPlayers, mapResults, homeWon)
    }

    private determineMVP(
        stats: Record<string, PlayerMatchStats>,
        winningPlayers: Player[]
    ): string {
        return determineMVPFn(stats, winningPlayers)
    }

    /**
     * Fallback staff resolver — primary callers (game-store, useLiveMatch)
     * supply staff directly, so this only fires in edge/debug paths.
     */
    private getTeamStaff(team: Team): {
        coach?: Coach
        analyst?: Analyst
        psychologist?: Psychologist
    } {
        return {}
    }

}

export const simulationEngineV2 = new SimulationEngineV2()


