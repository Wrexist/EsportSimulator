/**
 * What the managed club pays to change its staff (SQUAD-16). The store
 * actions (store/slices/staff-management-slice.ts) and the staff screen read
 * these, so the cost shown is the cost charged. AI clubs never call them.
 *
 *   - Releasing a staff member pays severance: two weeks' wage, or the rest
 *     of the contract when fewer weeks are left.
 *   - The staff market can be refreshed for free once per week; further
 *     refreshes that week cost about one week of the average wage on the
 *     market.
 */

import type { StaffSaveData } from "./save-types"

/** Weeks of wage a staff release pays at most. */
export const STAFF_SEVERANCE_WEEKS = 2

export interface StaffSeverance {
    /** Weeks of wage paid (the rest of the contract when shorter than two). */
    weeks: number
    /** The weekly wage. */
    wage: number
    /** Paid at once: weeks × wage. */
    amount: number
}

/** Severance for releasing a staff member in `week`. An open-ended contract pays the full two weeks. */
export function staffSeverance(staff: Pick<StaffSaveData, "salaryPerWeek" | "contractEndWeek">, week: number): StaffSeverance {
    const wage = Math.max(0, Math.round(staff.salaryPerWeek || 0))
    const weeksLeft = staff.contractEndWeek == null || !Number.isFinite(staff.contractEndWeek)
        ? STAFF_SEVERANCE_WEEKS
        : Math.max(0, Math.floor(staff.contractEndWeek - week))
    const weeks = Math.min(STAFF_SEVERANCE_WEEKS, weeksLeft)
    return { weeks, wage, amount: weeks * wage }
}

/** One week of the average wage asked on the market, rounded to $10 (0 for an empty market). */
export function staffRefreshFee(market: Pick<StaffSaveData, "salaryPerWeek">[]): number {
    const wages = market.map(s => s.salaryPerWeek).filter((w): w is number => Number.isFinite(w) && w > 0)
    if (wages.length === 0) return 0
    const average = wages.reduce((sum, w) => sum + w, 0) / wages.length
    return Math.round(average / 10) * 10
}

/**
 * Cost of the next manual refresh in `week`. `freeRefreshWeek` is the week
 * the free refresh was last used (undefined in a new career or an older save).
 */
export function staffRefreshCost(
    market: Pick<StaffSaveData, "salaryPerWeek">[],
    week: number,
    freeRefreshWeek: number | undefined,
): { free: boolean; cost: number } {
    if (freeRefreshWeek !== week) return { free: true, cost: 0 }
    const cost = staffRefreshFee(market)
    // An empty market has nothing to re-roll, so filling it stays free.
    return cost > 0 ? { free: false, cost } : { free: true, cost: 0 }
}

/** A saved free-refresh week, or undefined when it is missing or malformed. */
export function normalizeStaffRefreshWeek(value: unknown): number | undefined {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined
}
