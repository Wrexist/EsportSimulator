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
    TacticalStrategy,
    PlayerLoadout,
} from "@/types"
import { WeaponMasteryManager, WeaponType, WEAPON_TYPES, getMasteryLevel, MASTERY_LEVELS } from "@/engine/weapon-mastery-system"

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
const T_SIDE_ADVANTAGE = 0.02 // T side slight advantage in CS2 economy transition? (actually CT more expensive)
const CT_SIDE_ADVANTAGE = 0.03 // Standard map balance
const MOMENTUM_WEIGHT = 0.02
const MOMENTUM_MAX_ROUNDS = 5
const TILT_THRESHOLD = 3
const TILT_PENALTY = 0.03
const CLUTCH_BASE_CHANCE = 0.05

// ===== PLAYSTYLE COUNTER SYSTEM =====
// Rock-Paper-Scissors tactical counters:
// - AGGRESSIVE beats STRUCTURED (catches slow setups off-guard, forces mistakes)
// - STRUCTURED beats BALANCED (methodical play overwhelms standard defense)
// - BALANCED beats AGGRESSIVE (trades well, punishes over-aggression)
// - DEFAULT is neutral (no counter bonus/penalty)

type PlaystyleType = "balanced" | "aggressive" | "structured" | "default" | undefined

const PLAYSTYLE_COUNTER_BONUS = 0.04 // +4% strength when you counter opponent
const PLAYSTYLE_COUNTER_PENALTY = 0.03 // -3% when countered

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
const UTIL_POWER: Record<string, number> = {
    smoke: 6,
    molotov: 8,
    flash: 5,
    he: 4,
}
const UTIL_POWER_DEFAULT = 1

function getUtilPower(util: string[] = []): number {
    return (util || []).reduce((sum, u) => sum + (UTIL_POWER[u] ?? UTIL_POWER_DEFAULT), 0)
}

// ===== SIMULATION ENGINE =====

interface PlayerSimulationState {
    id: string
    cash: number
    weapon: string // weapon.id
    hasArmor: boolean
    hasHelmet: boolean
    hasKit: boolean
    utility: string[]
}

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
                !!match.mentalPrep, // homeMentalPrep
                false, // awayMentalPrep
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

        return {
            homeScore,
            awayScore,
            maps: mapResults,
            mvpPlayerId,
            playerStats,
            winnerId: homeScore > awayScore ? homeTeam.id : awayTeam.id
        }
      } catch (error) {
        console.error('[SimulationEngineV2] simulateMatch failed:', error, { matchId: match.id, homeTeam: homeTeam.id, awayTeam: awayTeam.id })
        throw error
      }
    }

    /**
     * Simulate map veto process
     * Order: Ban, Ban, Pick, Pick, Remaining is decider
     */
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
        const allMaps: MapId[] = [
            MapId.DUST2, MapId.MIRAGE, MapId.INFERNO, MapId.NUKE,
            MapId.OVERPASS, MapId.VERTIGO, MapId.ANCIENT, MapId.ANUBIS
        ]
        let availableMaps = [...allMaps]
        const veto: MapVeto[] = []
        const selectedMaps: MapId[] = []

        // Analyst level affects veto intelligence (1-5)
        const homeVetoSkill = homeAnalyst ? homeAnalyst.level : 1
        const awayVetoSkill = awayAnalyst ? awayAnalyst.level : 1

        // Use cached map strengths if provided, otherwise calculate
        const homeMapStrengths = cachedHomeMapStrengths || this.calculateMapStrengths(homePlayers)
        const awayMapStrengths = cachedAwayMapStrengths || this.calculateMapStrengths(awayPlayers)

        // BAN PHASE: Each team bans 1 map (ban opponent's best)
        // Home team bans away's strongest map
        const homeBan = this.selectMapForVeto(rng, availableMaps, awayMapStrengths, "BAN", awayVetoSkill)
        veto.push({ teamId: homeTeamId, action: "BAN", map: homeBan, order: 1 })
        availableMaps = availableMaps.filter(m => m !== homeBan)

        // Away team bans home's strongest map
        const awayBan = this.selectMapForVeto(rng, availableMaps, homeMapStrengths, "BAN", homeVetoSkill)
        veto.push({ teamId: awayTeamId, action: "BAN", map: awayBan, order: 2 })
        availableMaps = availableMaps.filter(m => m !== awayBan)

        // PICK PHASE: Each team picks their best remaining map
        // Home team picks their best
        const homePick = this.selectMapForVeto(rng, availableMaps, homeMapStrengths, "PICK", homeVetoSkill)
        veto.push({ teamId: homeTeamId, action: "PICK", map: homePick, order: 3 })
        selectedMaps.push(homePick)
        availableMaps = availableMaps.filter(m => m !== homePick)

        // Away team picks their best
        const awayPick = this.selectMapForVeto(rng, availableMaps, awayMapStrengths, "PICK", awayVetoSkill)
        veto.push({ teamId: awayTeamId, action: "PICK", map: awayPick, order: 4 })
        selectedMaps.push(awayPick)
        availableMaps = availableMaps.filter(m => m !== awayPick)

        // DECIDER: Random from remaining (or competitive balance)
        const decider = rng.pick(availableMaps)
        veto.push({ teamId: "SYSTEM", action: "PICK", map: decider, order: 5 })
        selectedMaps.push(decider)

        return { veto, maps: selectedMaps }
    }

    /**
     * Calculate team's strength on each map based on player skills
     */
    public calculateMapStrengths(players: Player[]): Map<MapId, number> {
        const strengths = new Map<MapId, number>()
        const allMaps: MapId[] = [
            MapId.DUST2, MapId.MIRAGE, MapId.INFERNO, MapId.NUKE,
            MapId.OVERPASS, MapId.VERTIGO, MapId.ANCIENT, MapId.ANUBIS
        ]

        if (players.length === 0) {
            allMaps.forEach(map => strengths.set(map, 50))
            return strengths
        }

        const avgSkill = players.reduce((sum, p) => sum + p.skill, 0) / players.length
        const avgTactic = players.reduce((sum, p) => sum + p.tactic, 0) / players.length

        allMaps.forEach(map => {
            // Base strength from skill
            let strength = avgSkill

            // Map-specific modifiers based on tactical vs aim maps
            switch (map) {
                case MapId.NUKE:
                case MapId.OVERPASS:
                    // Tactical maps favor tactic stat
                    strength = avgSkill * 0.4 + avgTactic * 0.6
                    break
                case MapId.DUST2:
                case MapId.MIRAGE:
                    // Aim maps favor skill
                    strength = avgSkill * 0.7 + avgTactic * 0.3
                    break
                default:
                    // Balanced maps
                    strength = avgSkill * 0.5 + avgTactic * 0.5
            }

            strengths.set(map, strength)
        })

        return strengths
    }

    /**
     * Select a map for veto based on strengths and analyst skill
     */
    public selectMapForVeto(
        rng: SeededRNG,
        availableMaps: MapId[],
        targetStrengths: Map<MapId, number>,
        action: "BAN" | "PICK",
        analystLevel: number
    ): MapId {
        // Higher analyst = less randomness in decision
        const randomFactor = (6 - analystLevel) * 0.1 // 0.5 at level 1, 0.1 at level 5

        const scored = availableMaps.map(map => ({
            map,
            score: (targetStrengths.get(map) || 50) + rng.range(-randomFactor * 20, randomFactor * 20)
        }))

        // BAN: Target opponent's best (highest score)
        // PICK: Choose own best (highest score)
        // Both sort descending and pick first, but BAN uses opponent's strengths
        scored.sort((a, b) => b.score - a.score)

        return scored[0].map
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
        const REGULATION_MAX_ROUNDS = 24
        const OT_HALF_ROUNDS = 3
        const OT_TOTAL_ROUNDS = 6

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
        const homeStressRes = homePlayers.reduce((sum, p) => sum + (p.stressResistance || 50), 0) / homePlayers.length
        const awayStressRes = awayPlayers.reduce((sum, p) => sum + (p.stressResistance || 50), 0) / awayPlayers.length

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
                        if (rng.bool(homeStrength / (homeStrength + awayStrength))) homeRounds++
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
    public performBuyPhase(
        players: Player[],
        economy: Record<string, { id: string; cash: number; weapon: string; hasArmor: boolean; hasHelmet: boolean; hasKit: boolean; utility: string[] }>,
        strategy: "ECO" | "FORCE" | "SEMIBUY" | "FULL" | "PISTOL" | "DOUBLE AWP",
        isCT: boolean,
        rng: SeededRNG,
        customTactics?: CustomTactics
    ): void {
        // PISTOL is not a key in CustomTactics; when strategy is PISTOL, the lookup returns undefined (safe via optional chaining)
        const tacticsForStrategy = customTactics ? customTactics[strategy as keyof CustomTactics] : undefined
        const customTactic: TacticalStrategy | undefined = tacticsForStrategy?.[isCT ? "ct" : "t"]
        const playerLoadouts: PlayerLoadout[] | undefined = customTactic?.playerLoadouts

        // PISTOL ROUND OVERRIDE - USER REQUESTED STRICT LOGIC
        // "everyone should have $800 and their starting pistol (glock for T & USP-S for CT) buy light kev all players for first round thats it."
        if (strategy === "PISTOL") {
            players.forEach(p => {
                const state = economy[p.id]
                if (!state) return

                // Ensure starting pistol
                state.weapon = isCT ? "usp" : "glock"

                // Buy Kevlar Vest ($650) if affordable
                if (state.cash >= 650) {
                    state.cash -= 650
                    state.hasArmor = true
                    state.hasHelmet = false // No helmet on pistol round
                }

                // "thats it" - No kits, no grenades, no upgrades
                state.hasKit = false
                state.utility = []
            })
            return
        }

        let awpsToBuy = strategy === "DOUBLE AWP" ? 2 : (strategy === "FULL" ? 1 : 0)

        // Pre-allocate AWP slots: prioritize AWPER-role players, then by cash
        const awpRecipients = new Set<string>()
        if (awpsToBuy > 0) {
            const candidates = [...players]
                .filter(p => {
                    const loadout = playerLoadouts?.[players.indexOf(p)] || playerLoadouts?.find((l) => l.slotIndex === players.indexOf(p))
                    return !loadout && economy[p.id]?.cash >= 4750
                })
                .sort((a, b) => {
                    // AWPER role first, then by cash
                    if (a.role === PlayerRole.AWPER && b.role !== PlayerRole.AWPER) return -1
                    if (b.role === PlayerRole.AWPER && a.role !== PlayerRole.AWPER) return 1
                    return economy[b.id].cash - economy[a.id].cash
                })
            for (let i = 0; i < Math.min(awpsToBuy, candidates.length); i++) {
                awpRecipients.add(candidates[i].id)
            }
        }

        players.forEach((p, idx) => {
            const state = economy[p.id]
            if (!state) return

            let effectiveRole = p.role
            const personalLoadout = playerLoadouts?.[idx] || playerLoadouts?.find((l) => l.slotIndex === idx)

            if (!personalLoadout) {
                if (awpRecipients.has(p.id)) {
                    effectiveRole = PlayerRole.AWPER
                } else if (effectiveRole === PlayerRole.AWPER && !awpRecipients.has(p.id)) {
                    effectiveRole = PlayerRole.RIFLER
                }
            }

            // Phase 43: Use per-player loadout if available
            // NEW V2: Handling armorLevel for precise cost
            const buy = EconomyManager.getPlayerBuyV2(state.cash, strategy, effectiveRole, isCT, rng, personalLoadout || customTactic)

            // Determine if we should buy the weapon (upgrade or sidegrade, but never downgrade tier unless forced)
            const currentWeapon = WEAPONS[state.weapon.toUpperCase()] || WEAPONS.GLOCK
            const newWeapon = buy.weapon

            const currentLevel = weaponToLevel(state.weapon)
            const newLevel = weaponToLevel(newWeapon.id)

            // Upgrade Logic
            const isStrictUpgrade = newLevel > currentLevel
            const isSideUpgrade = newLevel === currentLevel && newWeapon.price > currentWeapon.price
            const allowedUpgrade = isStrictUpgrade || (isSideUpgrade && currentLevel < 3)

            if (newWeapon.id !== state.weapon && allowedUpgrade && state.cash >= newWeapon.price) {
                state.cash -= newWeapon.price
                state.weapon = newWeapon.id
            }

            // Armor Logic (Precise Deduction)
            // Buy.armorLevel: 0 (None), 1 (Vest $650), 2 (Helmet $1000 or $350 upgrade)
            if (buy.armorLevel > 0) {
                const currentArmorLevel = state.hasHelmet ? 2 : (state.hasArmor ? 1 : 0)

                if (buy.armorLevel > currentArmorLevel) {
                    // Need to upgrade
                    if (buy.armorLevel === 1 && currentArmorLevel === 0 && state.cash >= 650) {
                        state.cash -= 650
                        state.hasArmor = true
                    } else if (buy.armorLevel === 2) {
                        if (currentArmorLevel === 1 && state.cash >= 350) {
                            state.cash -= 350 // Upgrade Vest to Helm
                            state.hasHelmet = true
                        } else if (currentArmorLevel === 0 && state.cash >= 1000) {
                            state.cash -= 1000 // Buy full
                            state.hasArmor = true
                            state.hasHelmet = true
                        }
                    }
                }
            }

            if (buy.kit && !state.hasKit && state.cash >= 400) {
                state.cash -= 400
                state.hasKit = true
            }

            // Grenade Logic (Same as before, preserving it)
            if (personalLoadout && personalLoadout.utility && personalLoadout.utility.length > 0) {
                const desiredUtil = [...personalLoadout.utility]
                const currentUtilCounts = (state.utility || []).reduce((acc: any, u: string) => {
                    acc[u] = (acc[u] || 0) + 1
                    return acc
                }, {} as Record<string, number>)

                desiredUtil.forEach((utilId: string) => {
                    if ((currentUtilCounts[utilId] || 0) > 0) {
                        currentUtilCounts[utilId]--
                        return
                    }
                    let cost = 0
                    switch (utilId) {
                        case "flash": cost = 200; break
                        case "smoke": cost = 300; break
                        case "he": cost = 300; break
                        case "molotov": cost = isCT ? 600 : 400; break
                        case "decoy": cost = 50; break
                    }

                    if (state.cash >= cost && (state.utility || []).length < 4) {
                        state.cash -= cost
                        if (!state.utility) state.utility = []
                        state.utility.push(utilId)
                    }
                })
            }
        })
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
        // Base win probability from strength
        // Upset Mechanics: Introduction of Chaos Factor
        // Controlled chaos: +/- 8% for realistic variance without wild swings
        const chaosFactor = rng.range(-0.08, 0.08)

        let homeWinProb = homeBaseStrength / (homeBaseStrength + awayBaseStrength)
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
            const homeStressRes = cachedHomeStressRes ?? homePlayers.reduce((sum, p) => sum + (p.stressResistance || 50), 0) / homePlayers.length
            const awayStressRes = cachedAwayStressRes ?? awayPlayers.reduce((sum, p) => sum + (p.stressResistance || 50), 0) / awayPlayers.length

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
        const winType = this.determineWinType(rng, homeWins === homeIsCT)

        // Generate events for this round
        const { kills, deaths, events, winType: validatedWinType } = this.generateRoundStats(rng, homePlayers, awayPlayers, homeWins, homeEconomy, awayEconomy, winType)

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
     * Determine how the round was won
     */
    private determineWinType(
        rng: SeededRNG,
        ctWins: boolean
    ): "ELIMINATION" | "BOMB_EXPLODED" | "BOMB_DEFUSE" | "TIME" {
        const roll = rng.next()

        if (ctWins) {
            // Favor objective play: 50% Defuse, 40% Elim, 10% Time
            if (roll < 0.40) return "ELIMINATION"
            if (roll < 0.90) return "BOMB_DEFUSE"
            return "TIME"
        } else {
            // Favor objective play: 70% Plants (Explosion), 30% Elim
            if (roll < 0.30) return "ELIMINATION"
            return "BOMB_EXPLODED"
        }
    }

    /**
     * Generate kill and death distribution for a round
     */
    private generateRoundStats(
        rng: SeededRNG,
        homePlayers: Player[],
        awayPlayers: Player[],
        homeWins: boolean,
        homeEconomy: Record<string, PlayerSimulationState>,
        awayEconomy: Record<string, PlayerSimulationState>,
        winType: "ELIMINATION" | "BOMB_EXPLODED" | "BOMB_DEFUSE" | "TIME"
    ): {
        kills: { playerId: string; kills: number; weapon: string }[];
        deaths: { playerId: string; deaths: number }[];
        events: MatchEvent[];
        winType: "ELIMINATION" | "BOMB_EXPLODED" | "BOMB_DEFUSE" | "TIME";
    } {
        const kills: { playerId: string; kills: number; weapon: string }[] = []
        const deaths: { playerId: string; deaths: number }[] = []
        const events: MatchEvent[] = []
        const winningPlayers = homeWins ? [...homePlayers] : [...awayPlayers]
        const losingPlayers = homeWins ? [...awayPlayers] : [...homePlayers]

        // Clutch Tracking
        let isClutchScenario = false
        let clutchStartEnemies = 0

        // 1. Determine Timings
        let currentTime = rng.int(5, 12)

        // Loser deaths: 2-5 weighted toward 3-4
        let loserDeathCount: number
        if (winType === "ELIMINATION") {
            loserDeathCount = 5
        } else {
            const loserRoll = rng.next()
            if (loserRoll < 0.10) loserDeathCount = 2       // 10%
            else if (loserRoll < 0.45) loserDeathCount = 3  // 35%
            else if (loserRoll < 0.80) loserDeathCount = 4  // 35%
            else loserDeathCount = 5                         // 20%
        }

        // Smart Constraint: If winning by Objective, ensure opposing team has enough deaths to make it realistic
        // E.g. Defuse win: Ts must have lost most players unless it's a ninja defuse
        if (winType === "BOMB_DEFUSE") {
            // CTs Win by Defuse. Ts (Losers) must be eliminated or nearly eliminated.
            // Force loserDeathCount to be high (e.g. 4 or 5)
            // 5% chance of Ninja Defuse (allowing 1-3 deaths)
            if (!rng.bool(0.05)) {
                loserDeathCount = rng.int(4, 5)
            }
        }

        // Winner deaths: 0-3 weighted toward 1-2
        let winnerDeathCount: number
        const winnerRoll = rng.next()
        if (winnerRoll < 0.15) winnerDeathCount = 0       // 15%
        else if (winnerRoll < 0.50) winnerDeathCount = 1  // 35%
        else if (winnerRoll < 0.85) winnerDeathCount = 2  // 35%
        else winnerDeathCount = 3                          // 15%
        winnerDeathCount = Math.min(winnerDeathCount, Math.max(0, loserDeathCount - 1))

        const winnersAlive = [...winningPlayers]
        const losersAlive = [...losingPlayers]

        let winnerDeathsRemaining = winnerDeathCount
        let loserDeathsRemaining = loserDeathCount

        // Check for Clutch Potential Start (if winners start 1vX)
        // Usually improbable to START 1vX unless disconnects, but logic holds.
        // Real tracking happens in loop.

        let plantTime = (winType === "BOMB_EXPLODED" || winType === "BOMB_DEFUSE") ? rng.int(45, 75) : 0
        let hasPlanted = false

        // Track stats for this round to dampen snowballing
        const roundKills = new Map<string, number>()
        let lastDeath: { time: number; victimId: string; killerId: string } | null = null

        while (winnerDeathsRemaining > 0 || loserDeathsRemaining > 0) {

            // Clutch Detection: Check strictly alive counts
            // WinnersAlive vs LosersAlive
            // Since we use 'Remaining' counters, we calculate alive from initial - dead
            const winnersAliveCount = winnersAlive.length
            const losersAliveCount = losersAlive.length

            if (winnersAliveCount === 1 && losersAliveCount >= 2 && !isClutchScenario) {
                isClutchScenario = true
                clutchStartEnemies = losersAliveCount
            }
            if (currentTime > 110) break

            // PANIC LOGIC: Increase trade probability late in round
            const isLateRound = currentTime > 90
            const isTradeOpportunity = events.length > 0 && (events[events.length - 1].time + (isLateRound ? 5 : 3) >= currentTime)
            const tradeChance = isTradeOpportunity ? (isLateRound ? 0.9 : 0.7) : (isLateRound ? 0.4 : 0.1) // Much higher engagement chance late
            const isTrade = rng.bool(tradeChance)

            let killer: Player | undefined
            let victim: Player | undefined
            let isWinnerKill = false

            const totalRemaining = winnerDeathsRemaining + loserDeathsRemaining
            let winnerDeathWeight = winnerDeathsRemaining / (totalRemaining || 1)

            // MAN ADVANTAGE MODIFIER: Team with more alive players has higher chance to get kills
            // This makes 4v2 situations favor the 4-player team significantly
            // 1 player advantage = 15% shift, 2 = 30%, 3 = 40%, 4 = 50%
            const manAdvantage = winnersAlive.length - losersAlive.length
            if (manAdvantage > 0) {
                // Winners have numbers advantage - reduce their death probability
                // ULTRA REALISM: Significant dampening of skill if outnumbered
                const advantageBonus = Math.min(0.50, manAdvantage * 0.12)
                winnerDeathWeight = Math.max(0.05, winnerDeathWeight - advantageBonus) // Floor at 5%
            } else if (manAdvantage < 0) {
                // Losers have numbers advantage (clutch situation) - but winners can still clutch
                const disadvantagePenalty = Math.min(0.50, Math.abs(manAdvantage) * 0.15) // Increased from 0.40/0.12
                winnerDeathWeight = Math.min(0.95, winnerDeathWeight + disadvantagePenalty)
            }

            // SAVE LOGIC: Check if losing team should save
            // Trigger if: severe disadvantage (1v3+) and not early round
            // USER REQUEST: Too much saving. 
            // FIX: Increase man advantage requirement to 4 (e.g. 1v5 or 2v6) and reduce prob.
            if (manAdvantage >= 4 && losersAlive.length > 0 && losersAlive.length <= 2 && currentTime > 35) {
                // Check if they present any value to save?
                // Don't save if on pistols or low eco
                const isHomeLoser = homePlayerIdSet.has(losersAlive[0].id)
                const economy = isHomeLoser ? homeEconomy : awayEconomy

                const hasValuableGun = losersAlive.some(p => {
                    const state = economy[p.id]
                    if (!state) return false
                    const weapon = WEAPONS[state.weapon?.toUpperCase()]
                    return (weapon?.price || 0) > 2000
                })

                if (hasValuableGun) {
                    // 7% chance to save in 1v5+ — realistic CS2 save rate
                    if (rng.bool(0.07)) {
                        const names = losersAlive.map(p => p.nickname).join(", ")
                        events.push({ type: "SAVE", time: currentTime, details: `${names} saving` })
                        break
                    }
                }
            }

            if (rng.bool(winnerDeathWeight) && winnerDeathsRemaining > 0 && losersAlive.length > 0) {
                killer = this.pickWeighted(rng, losersAlive, "KILL", roundKills)
                victim = this.pickWeighted(rng, winnersAlive, "DEATH")
                isWinnerKill = false
            } else if (loserDeathsRemaining > 0 && winnersAlive.length > 0) {
                killer = this.pickWeighted(rng, winnersAlive, "KILL", roundKills)
                victim = this.pickWeighted(rng, losersAlive, "DEATH")
                isWinnerKill = true
            }

            if (killer && victim) {
                const weapon = homePlayers.includes(killer) ? homeEconomy[killer.id]?.weapon || "glock" : awayEconomy[killer.id]?.weapon || "usp"

                // Time Step Calculation (PANIC LOGIC INTEGRATED)
                let timeStep = isTrade ? rng.int(1, 4) : rng.int(8, 25)

                // PANIC LOGIC: If time is running out (> 90s), force faster events
                if (currentTime > 90) {
                    timeStep = rng.int(2, 6) // Very fast engagements
                }

                if (!hasPlanted && plantTime > 0 && currentTime + timeStep > plantTime) {
                    // Smart Plant Logic: Determine if Ts can safely plant
                    // Identify Ts based on winType (EXPLODED = Ts Win, DEFUSE = Ts Lose)
                    const isTWinning = winType === "BOMB_EXPLODED"
                    const activeTs = isTWinning ? winnersAlive : losersAlive
                    const activeCTs = isTWinning ? losersAlive : winnersAlive

                    const tDisadvantage = activeCTs.length - activeTs.length

                    // Smart Logic: Don't plant if severely outnumbered (e.g. 1v3, 2v4)
                    // Disadvantage >= 2 means 3v1, 4v2, etc.
                    // Allow 10% chance for "Sneaky Plant"
                    let canPlant = true
                    if (activeTs.length === 0) { // FIXED: Cannot plant if no Ts alive
                        canPlant = false
                    } else if (tDisadvantage >= 2 && !rng.bool(0.1)) {
                        canPlant = false
                    }

                    if (canPlant) {
                        currentTime = plantTime
                        events.push({ type: "PLANT", time: plantTime, side: "t", details: "Bomb has been planted" })
                        hasPlanted = true
                        timeStep = rng.int(2, 5)
                    } else {
                        // Delay plant, force focus on kills first
                        plantTime += rng.int(10, 20)
                    }
                }

                currentTime += timeStep

                if (isWinnerKill) {
                    const idx = losersAlive.findIndex(p => p.id === victim!.id)
                    if (idx !== -1) losersAlive.splice(idx, 1)
                    loserDeathsRemaining--

                    // Track Round Kills
                    roundKills.set(killer!.id, (roundKills.get(killer!.id) || 0) + 1)

                    // Update Last Death for Trade Logic
                    lastDeath = { time: currentTime, victimId: victim!.id, killerId: killer!.id }
                } else {
                    const idx = winnersAlive.findIndex(p => p.id === victim!.id)
                    if (idx !== -1) winnersAlive.splice(idx, 1)
                    winnerDeathsRemaining--

                    // Track Round Kills
                    roundKills.set(killer!.id, (roundKills.get(killer!.id) || 0) + 1)

                    // Update Last Death for Trade Logic
                    lastDeath = { time: currentTime, victimId: victim!.id, killerId: killer!.id }
                }

                // Phase 61: Advanced Stat-Weighted Assists
                let assister: Player | undefined

                // 1. Trade Kill Logic (Guaranteed Assist)
                const isTradeKill = lastDeath &&
                    (currentTime - lastDeath.time <= 4) && // 4s trade window
                    (victim!.id === lastDeath.killerId) && // Revenge on the killer
                    (killer!.id !== lastDeath.victimId)    // Not self-revenge (impossible if dead)

                if (isTradeKill && lastDeath) {
                    // Award assist to the fallen teammate
                    const fallenTeammate = [...homePlayers, ...awayPlayers].find(p => p.id === lastDeath!.victimId)
                    if (fallenTeammate) assister = fallenTeammate
                }

                // 2. Standard Damage/Flash Assist
                if (!assister) {
                    // Base 40% (increased from 25%)
                    let assistProb = 0.40
                    const weaponData = WEAPONS[weapon.toUpperCase()]
                    if (weaponData?.type === EconomyWeaponType.SNIPER) assistProb = 0.15

                    if (rng.bool(assistProb)) {
                        const teammates = isWinnerKill ? winnersAlive : losersAlive
                        const potentialAssisters = teammates.filter(p => p.id !== killer!.id)

                        if (potentialAssisters.length > 0) {
                            // Weight assister choice
                            // Entry weight -> reaction/rifle, Utility weight -> grenades
                            const assisterWeights = potentialAssisters.map(p => 0.5 + ((p.reaction ?? 10) / 100) * 1.5 + ((p.grenades ?? 10) / 100) * 1.0)
                            const totalAssisterWeight = assisterWeights.reduce((a, b) => a + b, 0)
                            let r2 = rng.next() * totalAssisterWeight

                            for (let i = 0; i < potentialAssisters.length; i++) {
                                r2 -= assisterWeights[i]
                                if (r2 <= 0) {
                                    assister = potentialAssisters[i]
                                    break
                                }
                            }
                        }
                    }
                }

                // Phase 61.1: Headshot & Utility Logic
                const killWeaponData = WEAPONS[weapon.toUpperCase()]
                const killerSkill = killer.skill ?? 10

                let hsChance = 0.2 // Base fallback
                if (killWeaponData?.type === EconomyWeaponType.SNIPER) {
                    hsChance = 0.08 // Snipers aim for body (8% hs chance)
                } else if (killWeaponData?.type === EconomyWeaponType.RIFLE) {
                    // Skill 0->0.3, Skill 100->0.6
                    hsChance = 0.3 + (killerSkill / 100) * 0.3
                } else {
                    // SMGs/Pistols: Skill 0->0.15, Skill 100->0.35
                    hsChance = 0.15 + (killerSkill / 100) * 0.2
                }
                const isHeadshot = rng.bool(hsChance)
                const isUtility = killWeaponData?.type === EconomyWeaponType.UTILITY
                const isFlashAssist = !isTradeKill && assister && rng.bool(0.3) // 30% chance of assist being flash

                this.addKillEvent(kills, deaths, events, killer!, victim!, weapon, currentTime, assister?.id, isHeadshot, isUtility, isTradeKill, isFlashAssist)
            } else {
                break
            }

        }

        // Post-Loop: Check if Clutch occurred
        if (isClutchScenario && winnersAlive.length === 1) {
            const clutcher = winnersAlive[0]
            events.push({
                type: "CLUTCH",
                time: currentTime + 1,
                playerId: clutcher.id,
                details: `1v${clutchStartEnemies}`
            })
        }

        if (!hasPlanted && (winType === "BOMB_EXPLODED" || winType === "BOMB_DEFUSE")) {
            // Check if any Terrorists are alive to plant
            // Logic: BOMB_EXPLODED => Ts Won => winnersAlive are Ts
            //        BOMB_DEFUSE  => CTs Won => losersAlive are Ts
            const isTWinning = winType === "BOMB_EXPLODED"
            const activeTs = isTWinning ? winnersAlive : losersAlive

            if (activeTs.length > 0) {
                const time = Math.max(currentTime + 2, plantTime > 0 ? plantTime : 55)
                events.push({ type: "PLANT", time, side: "t", details: "Bomb has been planted" })
                currentTime = time
                hasPlanted = true
            } else {
                // FALLBACK: If no Ts are alive to plant, but the win type was BOMB_x, convert to elimination
                // This prevents "Ghost Plants" or nonsensical states
                winType = "ELIMINATION"
            }
        }

        if (hasPlanted && winType === "BOMB_DEFUSE") {
            const defuseTime = currentTime + rng.int(5, 10)
            events.push({ type: "DEFUSE", time: defuseTime, side: "ct", details: "Bomb has been defused" })
            currentTime = defuseTime
        }

        if (hasPlanted && winType === "BOMB_EXPLODED") {
            // OPTIMIZATION: If all CTs are eliminated, don't wait the full 40s
            // In BOMB_EXPLODED, the losers are always the CTs.
            const allCTsDead = losersAlive.length === 0
            const waitTime = allCTsDead ? 3 : 40

            const explodeTime = currentTime + waitTime
            events.push({
                type: "EXPLODE",
                time: explodeTime,
                side: "t",
                details: allCTsDead ? "Bomb exploded (All CTs eliminated)" : "Bomb has exploded"
            })
            currentTime = explodeTime
        }

        if (winType === "TIME") {
            currentTime = 115
        }

        events.sort((a, b) => a.time - b.time)
        const displayType = winType === "TIME" ? "TIME" : winType.replace('_', ' ')
        events.push({ type: "ROUND_END", time: currentTime + 2, details: `Round won via ${displayType}` })

        return { kills, deaths, events, winType }
    }

    private addKillEvent(
        kills: { playerId: string; kills: number; weapon: string }[],
        deaths: { playerId: string; deaths: number }[],
        events: MatchEvent[],
        killer: Player,
        victim: Player,
        weapon: string,
        time: number,
        assisterId?: string,
        isHeadshot?: boolean,
        isUtility?: boolean,
        isTrade?: boolean,
        isFlashAssist?: boolean
    ) {
        // Track stats
        const existingKill = kills.find(k => k.playerId === killer.id)
        if (existingKill) existingKill.kills++
        else kills.push({ playerId: killer.id, kills: 1, weapon })

        const existingDeath = deaths.find(d => d.playerId === victim.id)
        if (existingDeath) existingDeath.deaths++
        else deaths.push({ playerId: victim.id, deaths: 1 })

        let details = "secured a solo kill"
        if (isHeadshot) details = "secured a headshot kill"
        else if (isTrade) details = "traded their teammate"
        else if (isFlashAssist) details = "secured a blinded kill"
        else if (assisterId) details = "secured an assisted kill"

        events.push({
            type: "KILL",
            time,
            playerId: killer.id,
            victimId: victim.id,
            assisterId,
            weapon,
            isHeadshot,
            isUtility,
            isTrade,
            isFlashAssist,
            details
        })
    }

    /**
     * Determine MVP for a map based on kill performance
     */
    private determineMapMVP(
        rounds: RoundResult[],
        homePlayers: Player[],
        awayPlayers: Player[]
    ): string {
        const killCounts: Record<string, number> = {}

        rounds.forEach(round => {
            round.kills.forEach(k => {
                killCounts[k.playerId] = (killCounts[k.playerId] || 0) + k.kills
            })
        })

        let mvpId = homePlayers[0]?.id || awayPlayers[0]?.id
        let maxKills = 0

        Object.entries(killCounts).forEach(([playerId, kills]) => {
            if (kills > maxKills) {
                maxKills = kills
                mvpId = playerId
            }
        })

        return mvpId
    }

    /**
     * Generate player stats for entire match
     */
    public generateMatchStats(
        rng: SeededRNG,
        homePlayers: Player[],
        awayPlayers: Player[],
        mapResults: MapResult[],
        homeWon: boolean
    ): Record<string, PlayerMatchStats> {
        const stats: Record<string, PlayerMatchStats> = {}
        const allPlayers = [...homePlayers, ...awayPlayers]

        // Count total rounds
        const totalRounds = mapResults.reduce((sum, m) => sum + m.rounds.length, 0)

        // Aggregate kills and deaths from rounds
        const killCounts: Record<string, number> = {}
        const deathCounts: Record<string, number> = {}
        mapResults.forEach(map => {
            map.rounds.forEach(round => {
                round.kills.forEach(k => {
                    killCounts[k.playerId] = (killCounts[k.playerId] || 0) + k.kills
                })
                round.deaths?.forEach(d => {
                    deathCounts[d.playerId] = (deathCounts[d.playerId] || 0) + d.deaths
                })
            })
        })

        allPlayers.forEach(player => {
            const isWinner = homePlayers.includes(player) ? homeWon : !homeWon
            const performanceMod = rng.range(0.95, 1.05)

            // Primary stats from events
            const kills = killCounts[player.id] || 0
            const deaths = deathCounts[player.id] || 0

            // Derive assists from events
            let assists = 0
            mapResults.forEach(map => {
                map.rounds.forEach(round => {
                    round.events?.forEach(e => {
                        if (e.type === "KILL" && e.assisterId === player.id) {
                            assists++
                        }
                    })
                })
            })

            // Derive ADR from kills/assists/rounds (approx 85 damage per kill, 20 per assist)
            const adr = totalRounds > 0
                ? Math.round(((kills * 85 + assists * 20) / totalRounds) * (isWinner ? 1.05 : 0.95) * performanceMod)
                : 0

            // Derive KAST from round events (Kill/Assist/Survived/Traded)
            let kastRounds = 0
            mapResults.forEach(map => {
                map.rounds.forEach(round => {
                    const gotKill = round.kills?.some(k => k.playerId === player.id && k.kills > 0) ?? false
                    const gotAssist = round.events?.some(e => e.type === "KILL" && e.assisterId === player.id) ?? false
                    const died = round.deaths?.some(d => d.playerId === player.id && d.deaths > 0) ?? false
                    if (gotKill || gotAssist || !died) kastRounds++
                })
            })
            const kast = totalRounds > 0 ? Math.round((kastRounds / totalRounds) * 100) : 0

            // First Blood & Headshot tracking
            let fKills = 0
            let fDeaths = 0
            let headshots = 0
            mapResults.forEach(map => {
                map.rounds.forEach(round => {
                    if (round.events) {
                        const killEvents = round.events.filter(e => e.type === "KILL").sort((a, b) => a.time - b.time)
                        if (killEvents.length > 0) {
                            if (killEvents[0].playerId === player.id) fKills++
                            if (killEvents[0].victimId === player.id) fDeaths++
                        }

                        // Count headshots
                        round.events.forEach(e => {
                            if (e.type === "KILL" && e.playerId === player.id && e.isHeadshot) {
                                headshots++
                            }
                        })
                    }
                })
            })

            // Rating calculation (HLTV 2.0 style approximation)
            const kd = deaths > 0 ? kills / deaths : kills
            const impact = (kills * 1.5 + assists * 0.5) / Math.max(1, totalRounds)
            const rating = Math.max(0.3, Math.min(2.0,
                (kd * 0.35 + (kast / 100) * 0.35 + impact * 0.3) * performanceMod
            ))

            stats[player.id] = {
                playerId: player.id,
                matchId: "",
                kills,
                deaths,
                assists,
                headshots,
                adr,
                kast,
                rating,
                clutches: rng.int(0, 2),
                firstKills: fKills,
                firstDeaths: fDeaths,
                mapsPlayed: mapResults.length,
            }
        })

        return stats
    }

    /**
     * Determine overall match MVP
     */
    private determineMVP(
        stats: Record<string, PlayerMatchStats>,
        winningPlayers: Player[]
    ): string {
        let mvpId = winningPlayers[0]?.id || ""
        let bestRating = 0

        winningPlayers.forEach(player => {
            const playerStats = stats[player.id]
            if (playerStats && playerStats.rating > bestRating) {
                bestRating = playerStats.rating
                mvpId = player.id
            }
        })

        return mvpId
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

    /**
     * Pick a player weighted by traits
     */
    private pickWeighted(rng: SeededRNG, players: Player[], context: "KILL" | "DEATH", roundKills?: Map<string, number>): Player {
        if (players.length === 0) throw new Error("[pickWeighted] No players to pick from")
        if (players.length === 1) return players[0]

        const weights = players.map(p => {
            let w = 1.0
            const traits = p.traits || []

            // Phase 62: Normalized skill-based weighting
            // Safeguard for missing stats
            const skill = p.skill ?? 10
            const teamwork = p.teamwork ?? 10

            const skillFactor = (skill / 100)
            const formFactor = ((p.form ?? 70) / 100)
            const staminaFactor = 1.1 - ((p.fatigue ?? 0) / 100)

            // Weapon Mastery bonus (accuracy bonus from trained weapons)
            const mastery = p.weaponMastery
            if (mastery && context === "KILL") {
                // Use RIFLE mastery as primary (most common weapon)
                // Player.weaponMastery values are always numbers (normalized by adaptPlayerSaveToPlayer)
                const rifleXP = mastery.RIFLE ?? 0
                const masteryLevel = getMasteryLevel(rifleXP)
                const accuracyBonus = MASTERY_LEVELS[masteryLevel].accuracyBonus
                w *= 1.0 + (accuracyBonus / 100) // e.g., Master = +12% kill weight
            }

            // Base weight from individual performance metrics
            w *= (skillFactor * formFactor * staminaFactor)

            if (context === "KILL") {
                if (traits.includes("AGGRESSIVE")) w *= 1.25
                if (traits.includes("PASSIVE")) w *= 0.8

                // Trading contribution
                w *= 0.9 + (teamwork / 100) * 0.2
                if (traits.includes("TRADE_FRAGGER")) w *= 1.2

                // Diminishing Returns for Multi-Kills in same round
                if (roundKills) {
                    const currentKills = roundKills.get(p.id) || 0
                    if (currentKills > 0) {
                        // Reduce weight by 40% for each kill they already have
                        // e.g. 1 kill -> 0.6x, 2 kills -> 0.36x
                        w *= Math.pow(0.6, currentKills)
                    }
                }
            } else {
                // if (traits.includes("AGGRESSIVE")) w *= 1.15
                // if (traits.includes("PASSIVE")) w *= 0.9

                // Entry risk -> Use Reaction time
                const reaction = p.reaction ?? 10
                w *= 1.0 + (reaction / 100) * 0.3
            }

            // Random variance to ensure a star doesn't hog EVERY kill
            w *= rng.range(0.7, 1.3)

            return Math.max(0.1, w)
        })

        const total = weights.reduce((a, b) => a + b, 0)
        let r = rng.next() * total
        for (let i = 0; i < players.length; i++) {
            r -= weights[i]
            if (r <= 0) return players[i]
        }
        return players[players.length - 1]
    }
}

export const simulationEngineV2 = new SimulationEngineV2()

// Helpers
function weaponToLevel(weaponId: string): number {
    const w = WEAPONS[weaponId.toUpperCase()]
    if (!w) return 0
    if (w.type === "PISTOL") return 1
    if (w.type === "SMG") return 2
    if (w.type === "RIFLE") return 3
    if (w.type === "SNIPER") return 4
    return 0
}


