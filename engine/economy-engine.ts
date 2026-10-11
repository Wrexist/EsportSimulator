import { EquipmentManager } from "./equipment-manager"
import {
    TeamSaveData,
    PlayerSaveData,
    StaffSaveData,
    ContractSaveData
} from "./save-types"
import {
    ECONOMY_CONSTANTS,
    FACILITY_CONSTANTS,
} from "../lib/constants"
import { facilityWeeklyCost } from "./organization-effects"
import { calculateWeeklyUpkeep } from "./academy-constants"
import { clubOperationsCost, leagueCentralPayment, sponsorIncomeFloor } from "../lib/balance-tuning"

const FACILITY_BASE_COST = ECONOMY_CONSTANTS.FACILITY_BASE_COST
const FACILITY_COST_EXPONENT = FACILITY_CONSTANTS.COST_EXPONENT
const BASE_FAN_INCOME_PER_FAN = ECONOMY_CONSTANTS.BASE_FAN_INCOME_PER_FAN

export type FinancialState = "STABLE" | "TIGHT" | "RISK" | "CRISIS" | "INSOLVENT"

export interface WeeklyFinancialReport {
    income: {
        sponsors: number
        fanbase: number
        leagueShare: number
        total: number
    }
    expenses: {
        playerWages: number
        staffWages: number
        facilities: number
        equipment: number
        academy: number
        /** Club operations: travel, admin, content (CLUB_ECONOMY_TUNING). */
        operations: number
        total: number
    }
    net: number
    newBalance: number
    runwayWeeks: number
    state: FinancialState
}

export class EconomyEngine {

    /**
     * Calculate all financial movements for a team for a single week
     */
    static processWeeklyFinances(
        team: TeamSaveData,
        players: PlayerSaveData[],
        contracts: ContractSaveData[],
        staff: StaffSaveData[],
        settlementWeek?: number,
        academyProspectCount = 0,
        /**
         * AI clubs (not the managed club): with no gear on file they play with
         * implicit gear (match strength) and pay its upkeep here (Phase 4.4).
         */
        options: { implicitGear?: boolean } = {},
    ): WeeklyFinancialReport {

        // 1. Calculate Expenses
        const playerWages = this.calculatePlayerWages(team, contracts, settlementWeek)
        const staffWages = this.calculateStaffWages(team.staffIds, staff, settlementWeek)
        const facilitiesUpkeep = this.calculateFacilitiesUpkeep(team)

        const ownsGear = EquipmentManager.activeEquipment(team).length > 0
        const equipmentUpkeep = ownsGear || !options.implicitGear
            ? EquipmentManager.calculateWeeklyCost(team)
            : EquipmentManager.implicitWeeklyCost(team)
        const academyUpkeep = team.academyFacility?.level ? calculateWeeklyUpkeep(team.academyFacility.level, academyProspectCount) : 0
        const operations = this.calculateOperationsCost(team)
        const totalExpenses = playerWages + staffWages + facilitiesUpkeep + equipmentUpkeep + academyUpkeep + operations

        // 2. Calculate Income
        // Note: Prize money is handled separately by MatchEngine/Tournament logic
        const sponsorIncome = this.calculateSponsorIncome(team)
        const fanIncome = this.calculateFanIncome(team)
        // Regional league central distribution by division level (Phase 4.4).
        const leagueShare = leagueCentralPayment(team.leagueDivisionLevel)

        const totalIncome = sponsorIncome + fanIncome + leagueShare

        // 3. Net & Balance
        const net = totalIncome - totalExpenses
        // A non-finite result means upstream data (team.budget, wages,
        // sponsor income) is corrupt. Without this guard the NaN is written
        // back to the team and — because every NaN comparison is false —
        // determineState misreports the team as STABLE. Clamp to 0 so the
        // team registers as INSOLVENT and the corruption stops spreading.
        const rawBalance = team.budget + net
        const newBalance = Number.isFinite(rawBalance) ? rawBalance : 0

        // 4. Runway & State
        // Use average of last 4 weeks burn if available, otherwise current net
        // For simplicity in this step, we use current net.
        // If net is positive, runway is infinite (999).
        const weeklyBurn = net < 0 ? Math.abs(net) : 0
        const rawRunway = newBalance <= 0 ? 0 : weeklyBurn > 0 ? newBalance / weeklyBurn : 999
        const runwayWeeks = Number.isFinite(rawRunway) ? rawRunway : 0

        const state = this.determineState(newBalance, runwayWeeks)

        return {
            income: {
                sponsors: sponsorIncome,
                fanbase: fanIncome,
                leagueShare,
                total: totalIncome
            },
            expenses: {
                playerWages,
                staffWages,
                facilities: facilitiesUpkeep,
                equipment: equipmentUpkeep,
                academy: academyUpkeep,
                operations,
                total: totalExpenses
            },
            net,
            newBalance,
            runwayWeeks,
            state
        }
    }

    /** Weekly player + staff wages payable in `week`. */
    static weeklyWageBill(team: TeamSaveData, contracts: ContractSaveData[], staff: StaffSaveData[], week?: number): number {
        return this.calculatePlayerWages(team, contracts || [], week) + this.calculateStaffWages(team.staffIds || [], staff || [], week)
    }

    /** Sponsor cap base: wages plus club operations (the costs a deal is sized against). */
    static sponsorCostBase(team: TeamSaveData, contracts: ContractSaveData[], staff: StaffSaveData[], week?: number): number {
        return this.weeklyWageBill(team, contracts, staff, week) + this.calculateOperationsCost(team)
    }

    /** Weekly club operations cost (travel, admin, content), scaled by reputation. */
    static calculateOperationsCost(team: Pick<TeamSaveData, "reputation">): number {
        return clubOperationsCost(team.reputation)
    }

    /** Weekly sponsor income an unsponsored club still receives (minor partners, platform revenue). */
    static sponsorFloor(reputation: number): number {
        return sponsorIncomeFloor(reputation)
    }

    /** Sponsor income multiplier from reputation (0.7 at 0 to 1.3 at 100). */
    static sponsorReputationFactor(reputation: number): number {
        return ECONOMY_CONSTANTS.SPONSOR_REP_FACTOR_BASE + ((reputation || 0) / 100) * ECONOMY_CONSTANTS.SPONSOR_REP_FACTOR_RANGE
    }

    // === INCOME LOGIC ===

    static calculateSponsorIncome(team: TeamSaveData): number {
        const repFactor = this.sponsorReputationFactor(team.reputation)

        let total = 0
        if (team.sponsors && team.sponsors.length > 0) {
            team.sponsors.forEach(sponsor => {
                if (sponsor.remainingWeeks === undefined || sponsor.remainingWeeks > 0) total += sponsor.weeklyPayout * repFactor
            })
        }

        // Minor partners and platform revenue every club earns from its
        // reputation, plus every signed deal on top (Phase 4.4). Additive, so a
        // signed sponsor always adds its payout: as a max() floor, a club
        // ranked outside the top 30 (one STANDARD slot) earned nothing from
        // its only deal once the floor was above the deal. Signing a sponsor
        // still can only ever raise income, never lower it.
        total += this.sponsorFloor(team.reputation)

        // Apply difficulty multiplier for custom teams
        const incomeMultiplier = team.difficultySettings?.incomeMultiplier ?? 1.0
        return Math.floor(total * incomeMultiplier)
    }

    private static calculateFanIncome(team: TeamSaveData): number {
        // Phase 24: Use followers and merchLevel
        const followers = team.followers ?? ((team.fanbase ?? 0) * 7)
        const merchLevel = team.merchStoreLevel || 1
        const hypeMultiplier = Math.max(0, Math.min(100, team.merchHype || 10)) / 10

        // Phase 18: Fan Zone Facility Bonus (20% revenue boost per level)
        const fanZoneFacility = team.facilities?.find(f => f.type === "FANZONE")
        const fanZoneMultiplier = 1 + (fanZoneFacility?.level || 0) * ECONOMY_CONSTANTS.FANZONE_LEVEL_RATE

        // Base income per follower * Level multiplier * Hype multiplier
        // A level 1 store with 10k followers and 10 hype gets 10,000 * 0.0015 * 1 * 1 = $15/week?
        // Wait, BASE_FAN_INCOME_PER_FAN is 0.0015. 1 million followers = $1500.
        // Let's bump it slightly for the new system.
        const effectiveRate = BASE_FAN_INCOME_PER_FAN
        const levelMultiplier = 1 + (merchLevel - 1) * ECONOMY_CONSTANTS.MERCH_LEVEL_RATE

        // Active merch lines add a small, capped conversion bonus. Items unlock
        // via paid store level-ups (UI gates each behind a level), so this is
        // bounded (≤5 lines → +20%) and non-farmable — and it makes the
        // "diversify your catalog" UI claim actually true.
        const activeLines = Math.min(5, team.activeMerchItems?.length ?? 0)
        const merchLineBonus = 1 + activeLines * 0.04

        // Apply difficulty multipliers for custom teams
        const fansMultiplier = team.difficultySettings?.fansMultiplier ?? 1.0
        const incomeMultiplier = team.difficultySettings?.incomeMultiplier ?? 1.0

        return Math.floor(followers * effectiveRate * levelMultiplier * hypeMultiplier * fanZoneMultiplier * merchLineBonus * incomeMultiplier)
    }

    // === EXPENSE LOGIC ===

    private static calculatePlayerWages(team: TeamSaveData, contracts: ContractSaveData[], week?: number): number {
        const contractMap = new Map(contracts.filter(c =>
            (!c.teamId || c.teamId === team.id) &&
            (week === undefined || (c.startWeek === undefined || c.startWeek <= week) && (c.endWeek === undefined || c.endWeek > week))
        ).map(c => [c.playerId, c]))
        let total = 0
        new Set(team.rosterIds).forEach(id => {
            const contract = contractMap.get(id)
            if (contract) total += contract.salaryPerWeek
        })
        return total
    }

    private static calculateStaffWages(staffIds: string[], staff: StaffSaveData[], week?: number): number {
        const staffMap = new Map(staff.filter(s => week === undefined || s.contractEndWeek === undefined || s.contractEndWeek > week).map(s => [s.id, s]))
        let total = 0
        staffIds.forEach(id => {
            const member = staffMap.get(id)
            if (member) total += member.salaryPerWeek
        })
        return total
    }

    private static calculateFacilitiesUpkeep(team: TeamSaveData): number {
        if (!team.facilities) return 0

        let total = 0
        team.facilities.forEach(fac => {
            // Formula: Level ^ 1.25 * Base
            const cost = facilityWeeklyCost(fac.level)
            total += cost
        })

        // Legacy support if facilities array not populated but level exists
        if (team.facilities.length === 0 && team.facilitiesLevel > 0) {
            total += Math.pow(team.facilitiesLevel, FACILITY_COST_EXPONENT) * FACILITY_BASE_COST * 2 // Abstracted
        }

        return Math.floor(total)
    }

    // === STATE LOGIC ===

    static determineState(balance: number, runway: number): FinancialState {
        // Non-finite balance means corrupt data; every comparison against NaN
        // is false, which would otherwise fall through to "STABLE" and hide a
        // team in real trouble. Treat it as insolvent.
        if (!Number.isFinite(balance) || balance <= 0) return "INSOLVENT"
        if (!Number.isFinite(runway) || runway < 3) return "CRISIS"
        if (runway < 6) return "RISK"
        if (runway < 12) return "TIGHT"
        return "STABLE"
    }
}
