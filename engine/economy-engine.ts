import {
    TeamSaveData,
    PlayerSaveData,
    StaffSaveData,
    SponsorSaveData,
    ContractSaveData
} from "./save-types"

/**
 * Economic Constants
 */
const FACILITY_BASE_COST = 500
const FACILITY_COST_EXPONENT = 1.25 // Makes high level facilities expensive
const BASE_FAN_INCOME_PER_FAN = 0.0015 // ~$75/week for 50k followers at level 1
const TIER_MULTIPLIERS: Record<string, number> = {
    "S_TIER": 10.0,
    "A_TIER": 5.0,
    "B_TIER": 2.5,
    "C_TIER": 1.0,
    "D_TIER": 0.5
}
const LEAGUE_REVENUE_SHARE = 15000 // Base income for all teams to ensure stability

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
        staff: StaffSaveData[]
    ): WeeklyFinancialReport {

        // 1. Calculate Expenses
        const playerWages = this.calculatePlayerWages(team.rosterIds, contracts)
        const staffWages = this.calculateStaffWages(team.staffIds, staff)
        const facilitiesUpkeep = this.calculateFacilitiesUpkeep(team)

        const totalExpenses = playerWages + staffWages + facilitiesUpkeep

        // 2. Calculate Income
        // Note: Prize money is handled separately by MatchEngine/Tournament logic
        const sponsorIncome = this.calculateSponsorIncome(team)
        const fanIncome = this.calculateFanIncome(team)
        const leagueShare = LEAGUE_REVENUE_SHARE

        const totalIncome = sponsorIncome + fanIncome + leagueShare

        // 3. Net & Balance
        const net = totalIncome - totalExpenses
        const newBalance = team.budget + net

        // 4. Runway & State
        // Use average of last 4 weeks burn if available, otherwise current net
        // For simplicity in this step, we use current net.
        // If net is positive, runway is infinite (999).
        const weeklyBurn = net < 0 ? Math.abs(net) : 0
        const runwayWeeks = weeklyBurn > 0 ? newBalance / weeklyBurn : 999

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
                total: totalExpenses
            },
            net,
            newBalance,
            runwayWeeks,
            state
        }
    }

    // === INCOME LOGIC ===

    private static calculateSponsorIncome(team: TeamSaveData): number {
        const repFactor = 0.7 + (team.reputation / 100) * 0.6

        let total = 0
        if (team.sponsors && team.sponsors.length > 0) {
            team.sponsors.forEach(sponsor => {
                total += sponsor.weeklyPayout * repFactor
            })
        } else {
            // Fallback for AI teams or empty sponsors -> Estimate based on reputation
            // This fixes "bad for bad teams" by giving them at least something implicit
            total = (team.reputation * 150) + 2000
        }

        // Apply difficulty multiplier for custom teams
        const incomeMultiplier = team.difficultySettings?.incomeMultiplier ?? 1.0
        return Math.floor(total * incomeMultiplier)
    }

    private static calculateFanIncome(team: TeamSaveData): number {
        // Phase 24: Use followers and merchLevel
        const followers = team.followers ?? ((team.fanbase ?? 0) * 7)
        const merchLevel = team.merchStoreLevel || 1
        const hypeMultiplier = (team.merchHype || 10) / 10

        // Phase 18: Fan Zone Facility Bonus (20% revenue boost per level)
        const fanZoneFacility = team.facilities?.find(f => f.type === "FANZONE")
        const fanZoneMultiplier = 1 + (fanZoneFacility?.level || 0) * 0.2

        // Base income per follower * Level multiplier * Hype multiplier
        // A level 1 store with 10k followers and 10 hype gets 10,000 * 0.0015 * 1 * 1 = $15/week?
        // Wait, BASE_FAN_INCOME_PER_FAN is 0.0015. 1 million followers = $1500.
        // Let's bump it slightly for the new system.
        const effectiveRate = BASE_FAN_INCOME_PER_FAN
        const levelMultiplier = 1 + (merchLevel - 1) * 0.4 // +40% per level

        // Apply difficulty multipliers for custom teams
        const fansMultiplier = team.difficultySettings?.fansMultiplier ?? 1.0
        const incomeMultiplier = team.difficultySettings?.incomeMultiplier ?? 1.0

        return Math.floor(followers * effectiveRate * levelMultiplier * hypeMultiplier * fanZoneMultiplier * incomeMultiplier)
    }

    // === EXPENSE LOGIC ===

    private static calculatePlayerWages(rosterIds: string[], contracts: ContractSaveData[]): number {
        let total = 0
        rosterIds.forEach(id => {
            const contract = contracts.find(c => c.playerId === id)
            if (contract) {
                total += contract.salaryPerWeek
            }
        })
        return total
    }

    private static calculateStaffWages(staffIds: string[], staff: StaffSaveData[]): number {
        let total = 0
        staffIds.forEach(id => {
            const member = staff.find(s => s.id === id)
            if (member) {
                total += member.salaryPerWeek
            }
        })
        return total
    }

    private static calculateFacilitiesUpkeep(team: TeamSaveData): number {
        if (!team.facilities) return 0

        let total = 0
        team.facilities.forEach(fac => {
            // Formula: Level ^ 1.25 * Base
            const cost = Math.pow(fac.level, FACILITY_COST_EXPONENT) * FACILITY_BASE_COST
            total += cost
        })

        // Legacy support if facilities array not populated but level exists
        if (team.facilities.length === 0 && team.facilitiesLevel > 0) {
            total += Math.pow(team.facilitiesLevel, FACILITY_COST_EXPONENT) * FACILITY_BASE_COST * 2 // Abstracted
        }

        return Math.floor(total)
    }

    // === STATE LOGIC ===

    private static determineState(balance: number, runway: number): FinancialState {
        if (balance <= 0) return "INSOLVENT"
        if (runway < 3) return "CRISIS"
        if (runway < 6) return "RISK"
        if (runway < 12) return "TIGHT"
        return "STABLE"
    }
}
