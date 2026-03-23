
import { EconomyEngine } from "./engine/economy-engine"
import { TeamSaveData, PlayerSaveData, ContractSaveData, StaffSaveData } from "./engine/save-types"

console.log("Starting Economy Verification...")

// Mock Data
const mockTeam: TeamSaveData = {
    id: "team_1",
    name: "Test Team",
    tier: "S_TIER",
    rosterIds: ["p1", "p2", "p3", "p4", "p5"],
    staffIds: [],
    reputation: 80, // High rep
    fanbase: 100000,
    chemistry: 80,
    facilitiesLevel: 3,
    budget: 50000,
    elo: 1500,
    leagueTier: "S_TIER",
    sponsors: [
        { id: "s1", name: "TechCorp", tier: "PREMIUM", weeklyPayout: 2000, remainingWeeks: 10, requirements: "none" }
    ],
    facilities: [
        { id: "f1", type: "TRAINING", level: 3, description: "Good", monthlyCost: 1000 }
    ],
    trainingSlotsUsed: 0,
    maxTrainingSlots: 10
}

const mockContracts: ContractSaveData[] = [
    { playerId: "p1", teamId: "team_1", salaryPerWeek: 1000, startWeek: 1, endWeek: 50, buyout: 5000 },
    { playerId: "p2", teamId: "team_1", salaryPerWeek: 1000, startWeek: 1, endWeek: 50, buyout: 5000 },
    { playerId: "p3", teamId: "team_1", salaryPerWeek: 1000, startWeek: 1, endWeek: 50, buyout: 5000 },
    { playerId: "p4", teamId: "team_1", salaryPerWeek: 1000, startWeek: 1, endWeek: 50, buyout: 5000 },
    { playerId: "p5", teamId: "team_1", salaryPerWeek: 1000, startWeek: 1, endWeek: 50, buyout: 5000 },
]

const mockPlayers: PlayerSaveData[] = [] // Not needed for pure economy calc currently
const mockStaff: StaffSaveData[] = []

// SCENARIO 1: Stable Team
console.log("\n--- Scenario 1: Stable Team ---")
const report1 = EconomyEngine.processWeeklyFinances(mockTeam, mockPlayers, mockContracts, mockStaff)

console.log(`Income: ${report1.income.total} (Sponsors: ${report1.income.sponsors}, Fans: ${report1.income.fanbase})`)
console.log(`Expenses: ${report1.expenses.total} (Wages: ${report1.expenses.playerWages}, Facilities: ${report1.expenses.facilities})`)
console.log(`Net: ${report1.net}`)
console.log(`New Balance: ${report1.newBalance}`)
console.log(`Runway: ${report1.runwayWeeks.toFixed(1)} weeks`)
console.log(`State: ${report1.state}`)

if (report1.state === "STABLE") console.log("✅ State is STABLE as expected")
else console.error("❌ State mismatch")

// SCENARIO 2: Crisis Team
console.log("\n--- Scenario 2: Crisis Team ---")
const crisisTeam = { ...mockTeam, budget: 2000, reputation: 10, fanbase: 100 } // Low budget, low income
const report2 = EconomyEngine.processWeeklyFinances(crisisTeam, mockPlayers, mockContracts, mockStaff)

console.log(`Net: ${report2.net}`)
console.log(`New Balance: ${report2.newBalance}`)
console.log(`Runway: ${report2.runwayWeeks.toFixed(1)} weeks`)
console.log(`State: ${report2.state}`)

if (report2.state === "CRISIS" || report2.state === "INSOLVENT") console.log("✅ State is CRISIS/INSOLVENT as expected")
else console.error(`❌ State mismatch: Got ${report2.state}`)

// SCENARIO 3: Facilities Cost Scaling
console.log("\n--- Scenario 3: Facility Scaling ---")
const facTeam = { ...mockTeam, facilities: [{ id: "f1", type: "TRAINING", level: 5, description: "Top", monthlyCost: 0 }] as any }
const report3 = EconomyEngine.processWeeklyFinances(facTeam, mockPlayers, mockContracts, mockStaff)
console.log(`Level 5 Facility Cost: ${report3.expenses.facilities}`)

// Expected: Level 5 ^ 1.25 * 500 = 7.47 * 500 = ~3738
if (report3.expenses.facilities > 3500) console.log("✅ Facility cost scaled correctly")
else console.error("❌ Facility cost too low")

console.log("\nVerification Complete.")
