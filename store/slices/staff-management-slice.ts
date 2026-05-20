"use client"

/**
 * Staff management slice.
 *
 * Four actions for the player team's coaching/analyst/psych staff:
 *
 *   - refreshStaffMarket — regenerate the 20-slot weekly market using
 *     a SeededRNG derived from save.lastRngSeed (deterministic on
 *     re-rolls within the same week).
 *
 *   - hireStaff — sign a market staff member with negotiated terms.
 *     Caps roster at 5 total and 1 per role. Logs the sign-on fee as
 *     a WAGES_STAFF expense, posts a news item.
 *
 *   - renewStaffContract — extend an existing staff member's contract
 *     with validated bounds.
 *
 *   - fireStaff — remove a staff member from their team's staffIds
 *     and the global staff array. Posts a news item.
 *
 * All write paths use parseBoundedInt against MAX_STAFF_SALARY_PER_WEEK /
 * MAX_CONTRACT_LENGTH_WEEKS / MAX_SIGNING_BONUS so the UI can't smuggle
 * malformed numbers through.
 */

import type { SliceCreator } from "@/store/types"
import { StaffGenerator } from "@/engine/staff-generator"
import { SeededRNG, generateSeed } from "@/engine/rng"
import {
    nextDeterministicId,
    nextRandomInt,
    parseBoundedInt,
    MAX_STAFF_SALARY_PER_WEEK,
    MAX_CONTRACT_LENGTH_WEEKS,
    MAX_SIGNING_BONUS,
} from "@/store/utils/helpers"

const MAX_STAFF_PER_TEAM = 5
const MAX_PER_ROLE = 1
const DEFAULT_CONTRACT_WEEKS = 52
const MARKET_SLOT_COUNT = 20
const NEWS_FEED_CAP = 50

export interface StaffManagementActions {
    refreshStaffMarket: () => void
    hireStaff: (
        staffId: string,
        terms?: { salary?: number; duration?: number; signingBonus?: number },
    ) => { success: boolean; message: string }
    renewStaffContract: (
        staffId: string,
        salary: number,
        duration: number,
    ) => { success: boolean; message: string }
    fireStaff: (staffId: string) => void
}

export const createStaffManagementSlice: SliceCreator<StaffManagementActions> = (set, get) => ({
    refreshStaffMarket: () => {
        set((state) => {
            const rng = new SeededRNG(state.lastRngSeed || generateSeed())
            state.marketStaff = StaffGenerator.generateWeeklyMarket(
                state.currentWeek,
                MARKET_SLOT_COUNT,
                rng,
            )
            state.lastRngSeed = rng.getState()
        })
    },

    hireStaff: (staffId, terms) => {
        let result = { success: false, message: "" }
        set((state) => {
            const staffIndex = state.marketStaff.findIndex(s => s.id === staffId)
            if (staffIndex === -1) {
                result = { success: false, message: "Staff member not found" }
                return
            }

            const staffMember = state.marketStaff[staffIndex]
            const team = state.teams.find(t => t.id === state.playerTeamId)
            if (!team) return

            // Negotiated terms or sensible defaults (full salary, 1 year,
            // 2 weeks' salary as sign-on bonus).
            const rawSalary = terms?.salary ?? staffMember.salaryPerWeek
            const rawDuration = terms?.duration ?? DEFAULT_CONTRACT_WEEKS
            const rawSigningFee = terms?.signingBonus ?? (staffMember.salaryPerWeek * 2)

            const salaryValidation = parseBoundedInt(rawSalary, "Staff salary", 1, MAX_STAFF_SALARY_PER_WEEK)
            if (!salaryValidation.ok) {
                result = { success: false, message: salaryValidation.message }
                return
            }
            const durationValidation = parseBoundedInt(rawDuration, "Contract duration", 1, MAX_CONTRACT_LENGTH_WEEKS)
            if (!durationValidation.ok) {
                result = { success: false, message: durationValidation.message }
                return
            }
            const signingFeeValidation = parseBoundedInt(rawSigningFee, "Signing bonus", 0, MAX_SIGNING_BONUS)
            if (!signingFeeValidation.ok) {
                result = { success: false, message: signingFeeValidation.message }
                return
            }

            const salary = salaryValidation.value
            const duration = durationValidation.value
            const signingFee = signingFeeValidation.value

            if (team.budget < signingFee) {
                result = { success: false, message: `Insufficient funds. Need $${signingFee}` }
                return
            }

            // Roster cap + role uniqueness.
            const currentStaff = state.staff.filter(s => s.teamId === team.id)
            if (currentStaff.length >= MAX_STAFF_PER_TEAM) {
                result = { success: false, message: `Staff roster full (Max ${MAX_STAFF_PER_TEAM})` }
                return
            }
            const roleCount = currentStaff.filter(s => s.role === staffMember.role).length
            if (roleCount >= MAX_PER_ROLE) {
                result = { success: false, message: `You already have a ${staffMember.role}!` }
                return
            }

            team.budget -= signingFee
            state.financeLedger.push({
                id: nextDeterministicId(state, "fin_hire", staffMember.id),
                week: state.currentWeek,
                teamId: team.id,
                type: "EXPENSE",
                category: "WAGES_STAFF",
                amount: signingFee,
                description: `Hired ${staffMember.name} (${staffMember.role}) - Sign-on Fee`,
                balance: team.budget,
            })

            // Move from market into the team's staff list.
            state.marketStaff.splice(staffIndex, 1)
            state.staff.push({
                ...staffMember,
                teamId: team.id,
                salaryPerWeek: salary,
                // yearsRemaining is the legacy field kept for older UI;
                // contractEndWeek is the canonical expiry.
                yearsRemaining: Math.max(1, Math.ceil(duration / 52)),
                contractEndWeek: state.currentWeek + duration,
                signingBonus: signingFee,
            })
            team.staffIds.push(staffMember.id)

            state.newsFeed.unshift({
                id: nextDeterministicId(state, "news_hire", staffMember.id),
                title: `${staffMember.name} hired by ${team.name}`,
                content: `${team.name} have officially signed ${staffMember.name} to their staff roster as ${staffMember.role}. The contract is expected to run for ${duration} weeks.`,
                category: "STAFF",
                teamId: team.id,
                week: state.currentWeek,
                engagement: {
                    likes: nextRandomInt(state, 200, 1199),
                    views: nextRandomInt(state, 1000, 10999),
                },
            })
            if (state.newsFeed.length > NEWS_FEED_CAP) state.newsFeed.pop()

            result = { success: true, message: `Hired ${staffMember.name}!` }
        })
        return result
    },

    renewStaffContract: (staffId, salary, duration) => {
        let result = { success: false, message: "" }
        set((state) => {
            const staff = state.staff.find(s => s.id === staffId && s.teamId === state.playerTeamId)
            if (!staff) {
                result = { success: false, message: "Staff not found" }
                return
            }

            const salaryValidation = parseBoundedInt(salary, "Staff salary", 1, MAX_STAFF_SALARY_PER_WEEK)
            if (!salaryValidation.ok) {
                result = { success: false, message: salaryValidation.message }
                return
            }
            const durationValidation = parseBoundedInt(duration, "Contract duration", 1, MAX_CONTRACT_LENGTH_WEEKS)
            if (!durationValidation.ok) {
                result = { success: false, message: durationValidation.message }
                return
            }

            const normalizedSalary = salaryValidation.value
            const normalizedDuration = durationValidation.value

            staff.salaryPerWeek = normalizedSalary
            staff.contractEndWeek = state.currentWeek + normalizedDuration
            staff.yearsRemaining = Math.max(1, Math.ceil(normalizedDuration / 52))

            result = { success: true, message: "Contract Renewed!" }
        })
        return result
    },

    fireStaff: (staffId) => {
        // Detect missing staff up-front so the caller (typically a
        // ConfirmDialog) can surface a real error message instead of
        // silently no-op'ing a confirmed action.
        const current = get()
        const exists = current.staff.some(s => s.id === staffId)
        if (!exists) {
            throw new Error(`Cannot fire staff member: not found (id=${staffId})`)
        }

        set((state) => {
            const staffIndex = state.staff.findIndex(s => s.id === staffId)
            if (staffIndex === -1) return

            const staffMember = state.staff[staffIndex]
            const team = state.teams.find(t => t.id === staffMember.teamId)
            if (team) {
                team.staffIds = team.staffIds.filter(id => id !== staffId)
            }
            state.staff.splice(staffIndex, 1)

            state.newsFeed.unshift({
                id: nextDeterministicId(state, "news_fire", staffId),
                title: `${staffMember.name} leaves ${team?.name || "Organization"}`,
                content: `The organization has announced that ${staffMember.name} is no longer serving as their ${staffMember.role}. The search for a replacement begins immediately.`,
                category: "STAFF",
                teamId: team?.id,
                week: state.currentWeek,
                engagement: {
                    likes: nextRandomInt(state, 20, 219),
                    views: nextRandomInt(state, 200, 2199),
                },
            })
            if (state.newsFeed.length > NEWS_FEED_CAP) state.newsFeed.pop()
        })
    },
})
