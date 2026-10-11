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

/** Most senior players a club may hold; signing or promoting needs a free slot. */
export const SENIOR_ROSTER_MAX = 7
/** A release may not take the squad below a starting five. */
export const SENIOR_ROSTER_MIN = 5
/** Team chemistry a release costs (the standard roster-change penalty). */
export const RELEASE_CHEMISTRY_COST = CHEMISTRY_PENALTY_PER_SWAP

export interface ReleaseSettlement {
    /** Weeks left on his deal. */
    weeksLeft: number
    /** His weekly wage. */
    wage: number
    /** Paid at once: the rest of his contract (weeks left × wage). */
    amount: number
}

/** Releasing a player pays out the rest of his contract now. */
export function releaseSettlement(contract: Pick<ContractSaveData, "salaryPerWeek" | "endWeek"> | undefined, week: number): ReleaseSettlement {
    if (!contract) return { weeksLeft: 0, wage: 0, amount: 0 }
    const weeksLeft = Math.max(0, Math.floor(contract.endWeek - week))
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
    return `Your squad is full: ${rosterSize} senior players, and the limit is ${SENIOR_ROSTER_MAX}. `
        + `Release or sell ${n === 1 ? "one player" : `${n} players`} to make room (open a player and choose Release, or put him on the transfer list).`
}
