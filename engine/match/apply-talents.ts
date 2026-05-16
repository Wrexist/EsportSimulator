/**
 * Pre-match staff-talent application — runs once before a match starts
 * and applies every "before round 1" talent effect to the two rosters
 * + coach tactic bonuses.
 *
 * Centralised because THREE separate entry points used to do this
 * inline, each slightly differently:
 *   1. engine/match-engine.ts       — instant-match adapter (all 3 talents)
 *   2. store/slices/match-simulation-slice.ts — store-driven instant sim (missed timeout_morale)
 *   3. hooks/useLiveMatch.ts        — interactive live-match runner   (missed timeout_morale)
 *
 * The slice + hook drifted out of sync with the engine when
 * timeout_morale was added in G3, so the Coach "Timeout Whisperer"
 * talent silently did nothing in 2 of 3 simulation paths. This helper
 * keeps every path in lockstep.
 *
 * Talents handled:
 *   - morale_floor / tilt_immunity (psychologist) — minimum morale floor
 *   - timeout_morale (coach Timeout Whisperer)   — additive morale boost
 *   - anti_strat (analyst)                        — opponent tactic reduction
 */

import {
    collectTeamTalentBonuses,
    applyTalentMoraleFloor,
} from "../talent-trees"

interface PlayerLike {
    morale: number
}

interface StaffLike {
    role: string
    unlockedTalentIds?: string[]
}

export interface PreMatchTalentResult {
    homeAntiStrat: number
    awayAntiStrat: number
    homeBonuses: Record<string, number>
    awayBonuses: Record<string, number>
}

/**
 * Apply pre-match staff talents to both rosters. Mutates player morale
 * in place (morale floor + timeout boost). Returns the anti_strat
 * fractions so the caller can reduce the opponent coach's tactic bonus
 * — that part needs the caller's coach-shape knowledge so it stays
 * out of this helper.
 */
export function applyPreMatchTalents<P extends PlayerLike, S extends StaffLike>(
    homePlayers: P[],
    awayPlayers: P[],
    homeStaff: S[] | undefined,
    awayStaff: S[] | undefined,
): PreMatchTalentResult {
    const homeBonuses = collectTeamTalentBonuses(homeStaff ?? [])
    const awayBonuses = collectTeamTalentBonuses(awayStaff ?? [])

    // 1. Morale floor (psychologist morale_floor + tilt_immunity).
    applyTalentMoraleFloor(homePlayers, homeBonuses)
    applyTalentMoraleFloor(awayPlayers, awayBonuses)

    // 2. Timeout Whisperer additive morale boost (coach).
    const homeTimeoutMorale = homeBonuses["timeout_morale"] || 0
    const awayTimeoutMorale = awayBonuses["timeout_morale"] || 0
    if (homeTimeoutMorale > 0) {
        homePlayers.forEach(p => { p.morale = Math.min(100, p.morale + homeTimeoutMorale) })
    }
    if (awayTimeoutMorale > 0) {
        awayPlayers.forEach(p => { p.morale = Math.min(100, p.morale + awayTimeoutMorale) })
    }

    // 3. anti_strat — returned for the caller to apply to opponent
    // tactic bonus (each caller's coach shape is different).
    const homeAntiStrat = (homeBonuses["anti_strat"] || 0) / 100
    const awayAntiStrat = (awayBonuses["anti_strat"] || 0) / 100

    return {
        homeAntiStrat,
        awayAntiStrat,
        homeBonuses,
        awayBonuses,
    }
}
