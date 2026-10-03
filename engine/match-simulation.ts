import { runLegacySeries, finalizeLegacySeries, type LegacySeriesContext, type LegacyDecisionPolicy } from "./match/legacy-series"
/**
 * Phase 4 Simulation Engine
 * Deterministic, inspectable match simulation for the tactical FPS engine
 * 
 * FEATURES:
 * - Seeded RNG passed explicitly (no global randomness)
 * - Team factors: average skill, role coverage, chemistry, morale, fatigue
 * - Map factors: map-specific strength, tactical rating
 * - Dynamic modifiers: momentum, tilt, clutch probability
 * - Full round history with clutch events and momentum shifts
 */

import { resolveCanonicalSeriesMaps } from '@/lib/live-match-utils'
import { LEGACY_MATCH_ENGINE } from './match/live-checkpoint'
import { SeededRNG, createMatchRNG } from "./rng"
import { WEAPONS } from "./economy-manager"
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
    PlayerRole,
    Coach,
    Analyst,
    Psychologist,
    StaffType,
    MatchEvent,
    CustomTactics,
} from "@/types"
import { WeaponMasteryManager, WeaponType, WEAPON_TYPES, getMasteryLevel, MASTERY_LEVELS } from "@/engine/weapon-mastery-system"
import { perfTrace } from "./perf-trace"
import { MATCH_BALANCE, UTIL_POWER as UTIL_POWER_MAP, UTIL_POWER_DEFAULT as UTIL_POWER_FALLBACK, UTIL_POWER_CAP } from "@/lib/constants"
import { logger } from "@/lib/logger"
import {
    calculateMapStrengths as calculateMapStrengthsFn,
    selectMapForVeto as selectMapForVetoFn,
    simulateMapVeto as simulateMapVetoFn,
} from "./match/map-veto"
import { generateMatchStats as generateMatchStatsFn } from "./match/match-stats"
import {
    determineWinType as determineWinTypeFn,
    generateRoundStats as generateRoundStatsFn,
    addKillEvent as addKillEventFn,
    pickWeighted as pickWeightedFn,
    type PlayerSimulationState as RoundPlayerSimulationState,
} from "./match/round-outcome"
import { performBuyPhase as performBuyPhaseFn, type BuyStrategy } from "./match/buy-phase"
import { calculateTeamStrength as calculateTeamStrengthFn } from "./match/team-strength"

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
export function calculatePlaystyleCounterMod(myStyle: PlaystyleType, opponentStyle: PlaystyleType): number {
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

export function getUtilPower(util: string[] = []): number {
    const raw = (util || []).reduce((sum, u) => sum + (UTIL_POWER[u] ?? UTIL_POWER_DEFAULT), 0)
    return UTIL_POWER_CAP * (1 - Math.exp(-raw / UTIL_POWER_CAP))
}

// ===== SIMULATION ENGINE =====

// PlayerSimulationState moved to engine/match/round-outcome.ts (Phase I4)
// alongside its primary consumer. Re-aliased here for in-file use.
type PlayerSimulationState = RoundPlayerSimulationState

export class SimulationEngineV2 {
    /**
     * Simulate a complete match with deterministic replay.
     *
     * Delegates to the canonical legacy series runner shared with live
     * playback (engine/match/legacy-series.ts), so instant, live, skip and
     * resumed paths agree for the same seed and decisions. `options.policy`
     * lets a pre-match plan or a recorded live decision log drive the managed
     * team's buy calls and timeouts.
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
        customTactics?: CustomTactics,
        managedTeamId?: string,
        options?: { policy?: LegacyDecisionPolicy },
    ): MatchResult {
      const __perfT0 = perfTrace.enabled ? perfTrace.now() : 0
      try {
        const ctx = this.createSeriesContext(match, homeTeam, awayTeam, homePlayers, awayPlayers, homeStaff, awayStaff, forcedMaps, customTactics, managedTeamId)
        const run = runLegacySeries(ctx, options?.policy)
        const result = finalizeLegacySeries(ctx, run.state)
        if (perfTrace.enabled) {
            perfTrace.record("simulateMatch", __perfT0, {
                matchId: match.id,
                format: match.format,
                maps: result.maps.length,
            })
        }
        return result
      } catch (error) {
        logger.error('[SimulationEngineV2] simulateMatch failed', error, { matchId: match.id, homeTeam: homeTeam.id, awayTeam: awayTeam.id })
        throw error
      }
    }

    /**
     * Build the fixed per-series context: starters, staff, map order and
     * base strengths (team strength x playstyle counter). Map order: forced
     * maps, else the saved veto (canonicalised), else an engine veto from
     * the match seed.
     */
    public createSeriesContext(
        match: Match,
        homeTeam: Team,
        awayTeam: Team,
        homePlayers: Player[],
        awayPlayers: Player[],
        homeStaff?: { coach?: Coach; analyst?: Analyst; psychologist?: Psychologist },
        awayStaff?: { coach?: Coach; analyst?: Analyst; psychologist?: Psychologist },
        forcedMaps?: MapId[],
        customTactics?: CustomTactics,
        managedTeamId?: string,
    ): LegacySeriesContext {
        if (match.engineVersion && match.engineVersion !== LEGACY_MATCH_ENGINE) throw Error('Unsupported match engine')
        const matchSeed = (typeof match.seed === 'number' && Number.isFinite(match.seed) && match.seed >= 0)
            ? Math.floor(match.seed) : 12345
        const activeHomePlayers = homePlayers.slice(0, 5)
        const activeAwayPlayers = awayPlayers.slice(0, 5)
        if (!activeHomePlayers.length || !activeAwayPlayers.length) throw Error('Both teams need players')
        const hStaff = homeStaff || this.getTeamStaff(homeTeam)
        const aStaff = awayStaff || this.getTeamStaff(awayTeam)
        const homeMapStrengths = this.calculateMapStrengths(activeHomePlayers)
        const awayMapStrengths = this.calculateMapStrengths(activeAwayPlayers)

        let maps: MapId[]
        if (forcedMaps && forcedMaps.length > 0) {
            maps = forcedMaps
        } else if (match.maps?.length) {
            if (match.maps.some(m => !Object.values(MapId).includes(m))) throw Error('Saved veto contains an invalid map')
            maps = resolveCanonicalSeriesMaps({ format: match.format, seed: matchSeed, savedMaps: match.maps })
        } else {
            maps = this.simulateMapVeto(createMatchRNG(matchSeed), homeTeam.id, awayTeam.id, activeHomePlayers, activeAwayPlayers,
                hStaff.analyst, aStaff.analyst, homeMapStrengths, awayMapStrengths, match.format).maps
        }

        // mentalPrep belongs to the side that paid (legacy saves: home).
        const homeMentalPrep = !!match.mentalPrep && (!match.mentalPrepTeamId || match.mentalPrepTeamId === homeTeam.id)
        const awayMentalPrep = !!match.mentalPrep && match.mentalPrepTeamId === awayTeam.id
        const stress = (players: Player[]) => players.length > 0 ? players.reduce((sum, p) => sum + (p.stressResistance || 50), 0) / players.length : 50

        return {
            engine: this,
            seed: matchSeed,
            format: match.format,
            maps,
            mapStartingSides: match.mapStartingSides,
            home: {
                team: homeTeam, players: activeHomePlayers, staff: hStaff, mapStrengths: homeMapStrengths, stressRes: stress(activeHomePlayers),
                strength: this.calculateTeamStrength(homeTeam, activeHomePlayers, hStaff, homeMentalPrep) * calculatePlaystyleCounterMod(homeTeam.playstyle, awayTeam.playstyle),
            },
            away: {
                team: awayTeam, players: activeAwayPlayers, staff: aStaff, mapStrengths: awayMapStrengths, stressRes: stress(activeAwayPlayers),
                strength: this.calculateTeamStrength(awayTeam, activeAwayPlayers, aStaff, awayMentalPrep) * calculatePlaystyleCounterMod(awayTeam.playstyle, homeTeam.playstyle),
            },
            isHighPressure: !!match.isHighPressure,
            matchStage: match.stage,
            managedTeamId: managedTeamId ?? homeTeam.id,
            customTactics,
            playerMap: new Map(activeHomePlayers.concat(activeAwayPlayers).map(p => [p.id, p])),
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
        cachedAwayMapStrengths?: Map<MapId, number>,
        format: string = 'BO3',
    ): { veto: MapVeto[]; maps: MapId[] } {
        return simulateMapVetoFn(
            rng, homeTeamId, awayTeamId, homePlayers, awayPlayers,
            homeAnalyst, awayAnalyst,
            cachedHomeMapStrengths, cachedAwayMapStrengths, format,
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
     * Calculate team overall strength
     * Factors: average skill, role coverage, chemistry, morale, fatigue
     */
    // Team-strength implementation extracted to engine/match/team-strength.ts
    // (Phase J3). Facade preserved — useLiveMatch + match-simulation-slice
    // call simulationEngineV2.calculateTeamStrength(...) directly.
    public calculateTeamStrength(
        team: Team,
        players: Player[],
        staff: { coach?: Coach; analyst?: Analyst; psychologist?: Psychologist },
        mentalPrep?: boolean
    ): number {
        return calculateTeamStrengthFn(team, players, staff, mentalPrep)
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
        cachedPlayerMap?: Map<string, Player>,

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


    // Stats aggregation lives in engine/match/match-stats.ts (Phase I2);
    // generateMatchStats stays on the public API for external callers.
    public generateMatchStats(
        rng: SeededRNG,
        homePlayers: Player[],
        awayPlayers: Player[],
        mapResults: MapResult[],
        homeWon: boolean
    ): Record<string, PlayerMatchStats> {
        return generateMatchStatsFn(rng, homePlayers, awayPlayers, mapResults, homeWon)
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


