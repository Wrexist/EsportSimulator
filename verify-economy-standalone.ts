export { }

// Mock Types
interface TeamSaveData {
    id: string
    name: string
    tier: string
    rosterIds: string[]
    staffIds: string[]
    reputation: number
    fanbase: number
    facilitiesLevel: number
    budget: number
    sponsors?: { id: string, name: string, weeklyPayout: number }[]
    facilities?: { id: string, type: string, level: number }[]
    financialState?: string
    elo?: number
}

// Standalone Economy Engine Logic
class EconomyEngineStandalone {
    static processWeeklyFinances(team: TeamSaveData, contracts: any[], staff: any[]) {
        const FACILITY_BASE_COST = 500
        const FACILITY_COST_EXPONENT = 1.25
        const BASE_FAN_INCOME_PER_FAN = 0.0015

        // 1. Expenses
        let playerWages = 0
        team.rosterIds.forEach(id => {
            const contract = contracts.find(c => c.playerId === id)
            if (contract) playerWages += contract.salaryPerWeek
        })

        let staffWages = 0
        // Mock staff wages

        let facilitiesUpkeep = 0
        if (team.facilities) {
            team.facilities.forEach(fac => {
                facilitiesUpkeep += Math.pow(fac.level, FACILITY_COST_EXPONENT) * FACILITY_BASE_COST
            })
        }

        const totalExpenses = playerWages + staffWages + facilitiesUpkeep

        // 2. Income
        let sponsorIncome = 0
        const repFactor = 0.7 + (team.reputation / 100) * 0.6
        if (team.sponsors) {
            team.sponsors.forEach(s => sponsorIncome += s.weeklyPayout * repFactor)
        }
        sponsorIncome = Math.floor(sponsorIncome)

        const fanIncome = Math.floor(team.fanbase * BASE_FAN_INCOME_PER_FAN)

        const totalIncome = sponsorIncome + fanIncome
        const net = totalIncome - totalExpenses
        const newBalance = team.budget + net

        const weeklyBurn = net < 0 ? Math.abs(net) : 0
        const runwayWeeks = weeklyBurn > 0 ? newBalance / weeklyBurn : 999

        let state = "STABLE"
        if (newBalance <= 0) state = "INSOLVENT"
        else if (runwayWeeks < 3) state = "CRISIS"
        else if (runwayWeeks < 6) state = "RISK"
        else if (runwayWeeks < 12) state = "TIGHT"

        return {
            income: { total: totalIncome, sponsors: sponsorIncome, fans: fanIncome },
            expenses: { total: totalExpenses, wages: playerWages, facilities: facilitiesUpkeep },
            net,
            newBalance,
            runwayWeeks,
            state
        }
    }
}

// Test Data
const mockTeam: TeamSaveData = {
    id: "team_1", name: "Test", tier: "S", rosterIds: ["p1"], staffIds: [],
    reputation: 80, fanbase: 100000, facilitiesLevel: 3, budget: 50000,
    sponsors: [{ id: "s1", name: "Spon", weeklyPayout: 2000 }],
    facilities: [{ id: "f1", type: "TRAINING", level: 3 }],
    financialState: "STABLE", elo: 1000
}
const mockContracts = [{ playerId: "p1", salaryPerWeek: 1000 }]

console.log("--- Standalone Verification ---")
const result = EconomyEngineStandalone.processWeeklyFinances(mockTeam, mockContracts, [])
console.log(`Income: ${result.income.total} (Exp: ${Math.floor(2000 * (0.7 + 0.8 * 0.6))} + ${Math.floor(100000 * 0.0015)})`)
console.log(`Expenses: ${result.expenses.total} (Exp: 1000 + ${Math.pow(3, 1.25) * 500})`)
console.log(`Runway: ${result.runwayWeeks.toFixed(1)}`)
console.log(`State: ${result.state}`)

if (result.state === "STABLE") console.log("✅ Main Scenario Passed")
else console.error("❌ Main Scenario Failed")

