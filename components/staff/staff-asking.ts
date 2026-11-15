/**
 * What a staff member asks for and accepts (SQUAD-07).
 *
 * The negotiation used to compare an offer with a hidden figure (listed wage
 * × rarity × a seeded ±5%) while the market table and the modal showed the
 * listed wage, so the prefilled "asking" offer was often rejected. Both now
 * read the same numbers from here: `staffMinAcceptable` is the hidden figure
 * (unchanged rules), and `staffAskingWage` is the lowest offer it accepts for
 * a one-year deal, which the market table, the modal and the prefill show.
 */

import type { StaffSaveData } from "@/engine/save-types"
import { SeededRNG } from "@/engine/rng"

/** Offers at or above this share of the expected wage are accepted. */
export const STAFF_ACCEPT_SHARE = 0.97

export interface StaffAskContext {
    isRenewal: boolean
    /** Contract length offered, in weeks (two years or more: about 5% less). */
    duration: number
    saveId?: string | null
    currentWeek: number
    teamId?: string | null
}

const deterministicSeed = (...parts: Array<string | number | undefined | null>): number => {
    const payload = parts
        .filter((part): part is string | number => part !== undefined && part !== null)
        .map(String)
        .join("|")

    let hash = 2166136261
    for (let i = 0; i < payload.length; i++) {
        hash ^= payload.charCodeAt(i)
        hash = Math.imul(hash, 16777619)
    }

    return (hash >>> 0) || 1
}

/** The wage the staff member expects; offers ≥ 97% of it are accepted. */
export function staffMinAcceptable(member: Pick<StaffSaveData, "id" | "salaryPerWeek" | "rarity">, ctx: StaffAskContext): number {
    let targetSalary = member.salaryPerWeek
    if (ctx.isRenewal) targetSalary *= 1.15 // Expect a raise for renewal

    // Rarity tax
    if (member.rarity === "Legendary") targetSalary *= 1.1
    if (member.rarity === "Epic") targetSalary *= 1.05

    // Prefer longer contracts (job security)
    if (ctx.duration >= 104) targetSalary *= 0.95

    // Deterministic variance blocks re-roll abuse via reload/reopen.
    const variance = new SeededRNG(
        deterministicSeed(ctx.saveId || "local", ctx.currentWeek, member.id, ctx.teamId || "NO_TEAM", ctx.isRenewal ? "renewal" : "hire"),
    ).range(0.95, 1.05)
    return Math.round(targetSalary * variance)
}

/** Whether a weekly wage offer is accepted. */
export function staffAcceptsOffer(offer: number, minAcceptable: number): boolean {
    return offer >= minAcceptable * STAFF_ACCEPT_SHARE
}

/** The lowest weekly wage accepted for a one-year contract: the "Asking" figure. */
export function staffAskingWage(member: Pick<StaffSaveData, "id" | "salaryPerWeek" | "rarity">, ctx: Omit<StaffAskContext, "duration">): number {
    return Math.ceil(staffMinAcceptable(member, { ...ctx, duration: 52 }) * STAFF_ACCEPT_SHARE)
}
