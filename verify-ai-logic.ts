
import { AIManager } from "./engine/ai-manager"
import { TeamSaveData, PlayerSaveData, ContractSaveData } from "./engine/save-types"

console.log("Starting AI Manager Verification...")

// Mock Data
const mockTeam: TeamSaveData = {
    id: "team_ai", name: "AI Team", tier: "S_TIER", rosterIds: ["p1", "p2", "p3"], // Gap: Need 5
    staffIds: [], reputation: 80, fanbase: 1000, facilitiesLevel: 1, budget: 50000, elo: 1000, leagueTier: "S_TIER",
    chemistry: 50, sponsors: [], facilities: [],
    trainingSlotsUsed: 0, maxTrainingSlots: 3, financialState: "STABLE", logoPath: ""
}

const mockPlayer: PlayerSaveData = {
    id: "p1", name: "P1", nickname: "P1", age: 20, nationality: "SE", portraitPath: "", role: "RIFLER", tier: "S",
    skill: 80, isRetired: false,
} as any

const mockFA: PlayerSaveData = {
    id: "fa_1", name: "Free Agent", nickname: "FA", age: 20, nationality: "SE", portraitPath: "", role: "RIFLER", tier: "A",
    skill: 75, isRetired: false
} as any

const mockSave: any = {
    teams: [mockTeam],
    players: [mockPlayer, { ...mockPlayer, id: "p2" }, { ...mockPlayer, id: "p3" }, mockFA],
    contracts: [],
    currentWeek: 1
}

// TEST 1: Roster Filling
console.log("\n--- Test 1: Roster Filling ---")
console.log(`Initial Roster Size: ${mockTeam.rosterIds.length}`)
AIManager.processWeeklyAI(mockSave, "player_team_id")
console.log(`Post-AI Roster Size: ${mockTeam.rosterIds.length}`)

if (mockTeam.rosterIds.includes("fa_1")) console.log("✅ AI Signed Free Agent")
else console.error("❌ AI Failed to sign FA")

// TEST 2: Financial Panic
console.log("\n--- Test 2: Panic Sell ---")
mockTeam.financialState = "CRISIS"
mockTeam.rosterIds.push("p4", "p5") // Fill roster so they don't buy more
// Make p1 not for sale initially
const p1 = mockSave.players.find((p: any) => p.id === "p1")
p1.forSale = false

AIManager.processWeeklyAI(mockSave, "player_team_id")

if (p1.forSale) console.log("✅ AI Listed Player for Sale in Crisis")
else console.error("❌ AI did not list player")

// TEST 3: Elo Update
console.log("\n--- Test 3: Elo Update ---")
const home = { id: "t1", elo: 1000 }
const away = { id: "t2", elo: 1000 }
const mockMatch = { homeTeamId: "t1", awayTeamId: "t2", winnerId: "t1" }
const eloSave: any = { teams: [home, away] }

AIManager.updateElo(eloSave, mockMatch)
console.log(`Home Elo: ${home.elo} (Expected > 1000)`)
console.log(`Away Elo: ${away.elo} (Expected < 1000)`)

if (home.elo > 1000 && away.elo < 1000) console.log("✅ Elo Updated Correctly")
else console.error("❌ Elo Update Failed")

