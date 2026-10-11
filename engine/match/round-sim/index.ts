/**
 * script-v1 round engine (Phase 2B): rounds are decided by plans,
 * positions, utility, duels and the bomb instead of a weighted coin flip.
 *
 * `ScriptRoundEngine` implements the stepper seam (`LegacyRoundEngine` in
 * engine/match/legacy-series.ts): same buy-phase / simulateRound calls and
 * return shape, plus additive data the stepper records on the RoundResult
 * (plan, per-player damage, utility thrown). Per-series data (profiles, IGL
 * quality, team edge, day form) is built once by `buildScriptSeries` and
 * passed with every round (`ScriptRoundExtra`).
 *
 * Modules: simulate (round flow, duels, trades, utility, bomb), profile
 * (attributes → duel points), weapons, team-edge (capped non-player
 * factors), zones (baked round-map timings and ids), buy (grenades), economy
 * (competitive money rules), tuning (all constants).
 */

import type { CustomTactics, MapId, Player, Team } from "@/types"
import { SeededRNG, deriveSeed } from "../../rng"
import type { BuyStrategy } from "../buy-phase"
import type { PlayerSimulationState } from "../round-outcome"
import { scriptBuyPhase } from "./buy"
import { buildProfile, callQuality, type SimProfile } from "./profile"
import { simulateScriptRound, type SimOutput, type SimSide } from "./simulate"
import { cappedEdge, teamEdgeBreakdown, type StaffBundle, type TeamEdgeBreakdown } from "./team-edge"
import { TUNING } from "./tuning"
import { zonesFor } from "./zones"

export { applyScriptRoundEconomy, ECON_OVERTIME_START_CASH, ECON_START_LOSS_LEVEL, lossBonusAt, nextLossLevel } from "./economy"
export { teamEdgeBreakdown, type TeamEdgeBreakdown } from "./team-edge"
export type { SimOutput } from "./simulate"


export interface ScriptSeriesSide {
    teamId: string
    playstyle?: string
    /** This team's anti-strat target (a player of the other team). */
    targetPlayerId?: string
    profiles: Map<string, SimProfile>
    call: number
    edge: TeamEdgeBreakdown
}

export interface ScriptSeries {
    seed: number
    matchId: string
    home: ScriptSeriesSide
    away: ScriptSeriesSide
    dayForm: Map<string, number>
}

export interface ScriptSeriesTeamInput {
    team: Team
    players: Player[]
    staff: StaffBundle
    counterMod: number
    mentalPrep: boolean
    implicitGear: boolean
}

export function buildScriptSeries(args: { seed: number; matchId: string; home: ScriptSeriesTeamInput; away: ScriptSeriesTeamInput }): ScriptSeries {
    const side = (s: ScriptSeriesTeamInput): ScriptSeriesSide => {
        const profiles = new Map(s.players.map(p => [p.id, buildProfile(p)]))
        return {
            teamId: s.team.id,
            playstyle: s.team.playstyle,
            targetPlayerId: s.team.targetPlayerId,
            profiles,
            call: callQuality([...profiles.values()]),
            edge: teamEdgeBreakdown(s.team, s.players, s.staff, { counterMod: s.counterMod, mentalPrep: s.mentalPrep, implicitGear: s.implicitGear }),
        }
    }
    return { seed: args.seed, matchId: args.matchId, home: side(args.home), away: side(args.away), dayForm: new Map() }
}

export interface ScriptRoundExtra {
    series: ScriptSeries
    mapIndex: number
}

function normal(series: ScriptSeries, label: string, mapIndex: number, id: string, sd: number): number {
    const key = `${label}:${mapIndex}:${id}`
    let v = series.dayForm.get(key)
    if (v === undefined) {
        const rng = new SeededRNG(deriveSeed(series.seed, series.matchId, label, mapIndex, id))
        const u = Math.max(1e-9, rng.next())
        v = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.next()) * sd
        series.dayForm.set(key, v)
    }
    return v
}

/** A player's day on this map: own form plus the team's. */
function dayForm(series: ScriptSeries, mapIndex: number, playerId: string, teamId: string): number {
    return normal(series, "form", mapIndex, playerId, TUNING.DAY_FORM_SD) + normal(series, "team-form", mapIndex, teamId, TUNING.TEAM_DAY_FORM_SD)
}

/** Stage pressure scale for high-pressure matches (grand final 1.6, semi 1, group 0.6). */
export function stagePressure(isHighPressure: boolean, stage?: string): number {
    if (!isHighPressure) return 0
    const s = (stage ?? "").toLowerCase()
    if (s.includes("grand final") || (s.includes("final") && !s.includes("semi") && !s.includes("quarter"))) return 1.6
    if (s.includes("semi")) return 1
    if (s.includes("group") || s.includes("stage")) return 0.6
    return 1
}

/** Tactical maps weigh the IGL's read more (same weights as the veto's map strength). */
export function tacticalWeight(mapId: string | undefined): number {
    if (mapId === "Nuke" || mapId === "Overpass") return 1.2
    if (mapId === "Mirage" || mapId === "Sandstone") return 0.6
    return 1
}

function profileFor(side: ScriptSeriesSide | undefined, p: Player): SimProfile {
    let prof = side?.profiles.get(p.id)
    if (!prof) {
        prof = buildProfile(p)
        side?.profiles.set(p.id, prof)
    }
    return prof
}

export class ScriptRoundEngine {
    performBuyPhase(players: Player[], economy: Record<string, PlayerSimulationState>, strategy: BuyStrategy, isCT: boolean, rng: SeededRNG, customTactics?: CustomTactics): void {
        scriptBuyPhase(players, economy, strategy, isCT, rng, customTactics)
    }

    simulateRound(
        rng: SeededRNG, homePlayers: Player[], awayPlayers: Player[], _homeBaseStrength: number, _awayBaseStrength: number,
        _homeMapStrength: number, _awayMapStrength: number, homeIsCT: boolean, _homeWinStreak: number, _awayWinStreak: number,
        _homeLossStreak: number, _awayLossStreak: number, roundNum: number,
        homeEconomy: Record<string, PlayerSimulationState>, awayEconomy: Record<string, PlayerSimulationState>,
        homeStrategy: BuyStrategy = "FULL", awayStrategy: BuyStrategy = "FULL", isHighPressure = false, homeTeam?: Team, awayTeam?: Team,
        _currentCTTeamId?: string, _currentTTeamId?: string, _customTactics?: CustomTactics,
        _homeMomentumScore?: number, _awayMomentumScore?: number, homeStaff?: StaffBundle, awayStaff?: StaffBundle,
        mapId?: MapId, matchStage?: string, _cachedHomeStressRes?: number, _cachedAwayStressRes?: number, _cachedPlayerMap?: Map<string, Player>,
        homeRegroupEdge = 0, awayRegroupEdge = 0, extra?: ScriptRoundExtra,
    ): SimOutput {
        const series = extra?.series ?? buildScriptSeries({
            seed: 0, matchId: "",
            home: { team: homeTeam ?? ({ id: "home" } as Team), players: homePlayers, staff: homeStaff ?? {}, counterMod: 1, mentalPrep: false, implicitGear: false },
            away: { team: awayTeam ?? ({ id: "away" } as Team), players: awayPlayers, staff: awayStaff ?? {}, counterMod: 1, mentalPrep: false, implicitGear: false },
        })
        const mapIndex = extra?.mapIndex ?? 0
        const edge = cappedEdge(series.home.edge.total, series.away.edge.total) * TUNING.EDGE_DUEL_POINTS / 2
        const regroup = TUNING.REGROUP_POINTS_PER_PROB
        const side = (players: Player[], s: ScriptSeriesSide, other: ScriptSeriesSide, economy: Record<string, PlayerSimulationState>, strategy: BuyStrategy, sign: 1 | -1, regroupEdge: number): SimSide => ({
            teamId: s.teamId,
            players,
            profiles: players.map(p => profileFor(s, p)),
            economy,
            strategy,
            playstyle: s.playstyle,
            call: s.call,
            edge: sign * edge + regroupEdge * regroup,
            targetedId: other.targetPlayerId && players.some(p => p.id === other.targetPlayerId) ? other.targetPlayerId : undefined,
            dayForm: players.map(p => dayForm(series, mapIndex, p.id, s.teamId)),
        })
        return simulateScriptRound({
            rng,
            zones: zonesFor(mapId),
            round: roundNum,
            home: side(homePlayers, series.home, series.away, homeEconomy, homeStrategy, 1, homeRegroupEdge),
            away: side(awayPlayers, series.away, series.home, awayEconomy, awayStrategy, -1, awayRegroupEdge),
            homeIsCT,
            pressure: stagePressure(isHighPressure, matchStage),
            tacticalWeight: tacticalWeight(mapId),
        })
    }
}

export const scriptRoundEngine = new ScriptRoundEngine()
