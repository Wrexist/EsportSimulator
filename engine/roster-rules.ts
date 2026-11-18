import { tn } from "@/lib/i18n"
/**
 * Senior roster rules for the managed club: the size cap that blocks
 * signings and promotions, the quorum a release may not break, and what a
 * release costs. The store actions, the squad screen and the deal panel read
 * these, so the stated rule is the applied one.
 *
 * Some snapshot clubs start above the cap (Eternal Flame has 9 players).
 * Such a club can still release down to it; AI clubs trim themselves
 * (engine/ai/roster-management.ts) and are not affected.
 */

import type { ContractSaveData } from "./save-types"
import { CHEMISTRY_PENALTY_PER_SWAP } from "./chemistry-engine"
import { settlementsLeft } from "./finance-forecast"

/** Most senior players a club may hold; signing or promoting needs a free slot. */
export const SENIOR_ROSTER_MAX = 7
/** A release may not take the squad below a starting five. */
export const SENIOR_ROSTER_MIN = 5
/** Team chemistry a release costs (the standard roster-change penalty). */
export const RELEASE_CHEMISTRY_COST = CHEMISTRY_PENALTY_PER_SWAP

export interface ReleaseSettlement {
    /** Wage settlements his deal still pays (settlementsLeft, as Payroll counts them). */
    weeksLeft: number
    /** His weekly wage. */
    wage: number
    /** Paid at once: the rest of his contract (weeks left × wage). */
    amount: number
}

/**
 * Releasing a player pays out the rest of his contract now. MARKET-06
 * (2026-11-17): the weeks his contract still pays, as Payroll's "Left to
 * pay" counts them (this week's settlement has already run).
 */
export function releaseSettlement(contract: Pick<ContractSaveData, "salaryPerWeek" | "endWeek"> | undefined, week: number): ReleaseSettlement {
    if (!contract) return { weeksLeft: 0, wage: 0, amount: 0 }
    const weeksLeft = settlementsLeft(contract.endWeek, week)
    const wage = Math.max(0, Math.round(contract.salaryPerWeek || 0))
    return { weeksLeft, wage, amount: weeksLeft * wage }
}

/** Departures needed before the club can sign one player. */
export function departuresToSign(rosterSize: number): number {
    return Math.max(0, rosterSize - SENIOR_ROSTER_MAX + 1)
}

/** The managed club's "squad full" line: why it can't sign, and what to do about it. */
export function squadFullMessage(rosterSize: number): string {
    const n = departuresToSign(rosterSize)
    return tn("squad.full", n, { size: rosterSize, max: SENIOR_ROSTER_MAX })
}

/** A club won't sell to (or buy from) a club it plays within this many weeks. */
export const STRATEGIC_REFUSAL_LOOKAHEAD_WEEKS = 3

type Fixture = { week: number; homeTeamId: string; awayTeamId: string }

/**
 * Strategic refusal: the week of the first match between the two clubs in
 * the next STRATEGIC_REFUSAL_LOOKAHEAD_WEEKS weeks, or null when a deal is
 * allowed. transferPlayer applies it; MARKET-05 (2026-11-17): the deal panel
 * says it before any offer is made.
 */
export function strategicRefusalWeek(matches: readonly Fixture[], currentWeek: number, fromTeamId: string, toTeamId: string): number | null {
    let first: number | null = null
    for (const m of matches) {
        if (m.week < currentWeek || m.week > currentWeek + STRATEGIC_REFUSAL_LOOKAHEAD_WEEKS) continue
        if (!((m.homeTeamId === fromTeamId && m.awayTeamId === toTeamId) || (m.homeTeamId === toTeamId && m.awayTeamId === fromTeamId))) continue
        if (first === null || m.week < first) first = m.week
    }
    return first
}

/** The first week from which the refusal no longer holds (later fixtures between the two clubs counted). */
export function strategicRefusalEndsWeek(matches: readonly Fixture[], currentWeek: number, fromTeamId: string, toTeamId: string): number {
    let week = currentWeek
    for (let guard = 0; guard < 520 && strategicRefusalWeek(matches, week, fromTeamId, toTeamId) !== null; guard++) week++
    return week
}
