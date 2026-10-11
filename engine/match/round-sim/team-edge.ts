/**
 * Non-player factors for the script-v1 engine ("team edge").
 *
 * Everything that is not a player's own ability or condition — staff, the
 * playstyle counter, VOD prep, mental prep, chemistry, role coverage, gear,
 * facilities, style specialisation, anti-strat tunnel vision — is summed per
 * team in "team strength" units (0.06 = +6%). The DIFFERENCE between the two
 * teams is capped at ±NON_PLAYER_BONUS_CAP (10%) and enters every duel as a
 * small rating offset, so a 10% edge is worth about +2.8% of rounds and
 * ~+8 points of map-win probability (measured: see ROUND_SHARE_PER_EDGE).
 *
 * Player condition (form, morale, energy, fatigue) is per player, not here
 * (profile.ts `condition`).
 *
 * UI labels read these constants (tactics page, squad role coverage, staff
 * screen) so what the screens promise is what the engine applies.
 */

import type { Analyst, Coach, Player, Psychologist, Team } from "@/types"
import { EquipmentManager } from "../../equipment-manager"
import { NON_PLAYER_BONUS_CAP, staffStrengthBonus } from "../team-strength"

export { NON_PLAYER_BONUS_CAP }

/** VOD review adds 25 tactical prep; prep turns into team strength at prep / 400 (+6.25%). */
export const PREP_STRENGTH_PER_POINT = 1 / 400
/** Mental reset bought for this match. */
export const MENTAL_PREP_EDGE = 0.03
/** Aggressive with avg morale > 80, or structured with chemistry > 80. */
export const STYLE_SPECIALISATION_EDGE = 0.05
/** Setting an anti-strat target costs your own tactics this much (tunnel vision). */
export const ANTI_STRAT_SELF_PENALTY = 0.02
/** Chemistry 0 → -5%, 50 → 0, 100 → +5%. */
export const CHEMISTRY_EDGE_RANGE = 0.05
/** Each of the five roles missing from the starting five. */
export const ROLE_MISSING_EDGE = 0.04
/** Facilities: +1% per average level above 1 (level 5 = +4%). */
export const FACILITY_EDGE_PER_LEVEL = 0.01

/**
 * Measured with the calibration harness (600 samples, paired seeds): share of
 * rounds won per 1.0 of team edge (+10% ≈ +2.8% of rounds) and map-win points
 * per 1.0 (+10% ≈ +8.5 points). VOD review (+6.25%): +1.4–1.7% of rounds.
 */
export const ROUND_SHARE_PER_EDGE = 0.28
export const MAP_POINTS_PER_EDGE = 85

export interface StaffBundle { coach?: Coach; analyst?: Analyst; psychologist?: Psychologist }

export interface TeamEdgeBreakdown {
    /** Coach + analyst + psychologist + playstyle counter, capped together (as in legacy). */
    staffAndCounter: number
    prep: number
    mentalPrep: number
    specialisation: number
    antiStrat: number
    prepPenalty: number
    chemistry: number
    roles: number
    gear: number
    facilities: number
    total: number
}

const ROLE_SET = ["AWPER", "RIFLER", "IGL", "SUPPORT", "ENTRY_FRAGGER"]

export function missingRoles(players: readonly { role?: string }[]): number {
    const have = new Set(players.map(p => p.role))
    return ROLE_SET.filter(r => !have.has(r)).length
}

export function teamEdgeBreakdown(
    team: Team,
    players: readonly Player[],
    staff: StaffBundle,
    opts: { counterMod?: number; mentalPrep?: boolean; implicitGear?: boolean } = {},
): TeamEdgeBreakdown {
    const staffAndCounter = Math.min(NON_PLAYER_BONUS_CAP, staffStrengthBonus(staff) + ((opts.counterMod ?? 1) - 1))
    const prep = Math.max(0, Math.min(100, team.tacticalPrep ?? 0)) * PREP_STRENGTH_PER_POINT
    const mentalPrep = opts.mentalPrep ? MENTAL_PREP_EDGE : 0
    const n = Math.max(1, players.length)
    const avgMorale = players.reduce((s, p) => s + (p.morale ?? 50), 0) / n
    const chemistryValue = team.chemistry ?? 50
    const specialisation = (team.playstyle === "aggressive" && avgMorale > 80) || (team.playstyle === "structured" && chemistryValue > 80)
        ? STYLE_SPECIALISATION_EDGE : 0
    const antiStrat = team.targetPlayerId ? -ANTI_STRAT_SELF_PENALTY : 0
    const prepPenalty = -(team.prepPenalty ?? 0)
    const chemistry = ((Math.max(0, Math.min(100, chemistryValue)) - 50) / 50) * CHEMISTRY_EDGE_RANGE
    const roles = -missingRoles(players) * ROLE_MISSING_EDGE
    const ownsGear = EquipmentManager.activeEquipment(team).length > 0
    const gear = ownsGear || !opts.implicitGear ? EquipmentManager.strengthBonus(team) : EquipmentManager.implicitStrengthBonus(team)
    const facilities = facilityEdge(team)
    const total = staffAndCounter + prep + mentalPrep + specialisation + antiStrat + prepPenalty + chemistry + roles + gear + facilities
    return { staffAndCounter, prep, mentalPrep, specialisation, antiStrat, prepPenalty, chemistry, roles, gear, facilities, total }
}

function facilityEdge(team: Team): number {
    const arr = (team as unknown as { facilities?: { level?: number }[] }).facilities
    const levels = Array.isArray(arr) && arr.length > 0
        ? arr.map(f => f.level || 1)
        : [(team as unknown as { facilitiesLevel?: number }).facilitiesLevel || 1]
    const avg = levels.reduce((s, l) => s + l, 0) / levels.length
    return Math.max(0, Math.min(4, avg - 1)) * FACILITY_EDGE_PER_LEVEL
}

/** Capped edge of `a` over `b` (team-strength units, ±NON_PLAYER_BONUS_CAP). */
export function cappedEdge(a: number, b: number): number {
    return Math.max(-NON_PLAYER_BONUS_CAP, Math.min(NON_PLAYER_BONUS_CAP, a - b))
}
