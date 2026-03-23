export { }

// Mock Types
interface TeamSaveData {
    id: string; name: string; rosterIds: string[]; budget: number;
    financialState: string; elo: number; reputation: number; fanbase: number;
    sponsors?: any[]; facilities?: any[]; staffIds?: string[];
}
interface PlayerSaveData {
    id: string; name: string; skill: number; forSale?: boolean;
    transferListingPrice?: number; weeksOnTransferList?: number; isRetired?: boolean;
}

// Standalone AI Manager Logic (Simplified Copy)
class AIManagerStandalone {
    static processWeeklyAI(save: any, playerTeamId: string) {
        const aiTeams = save.teams.filter((t: any) => t.id !== playerTeamId)
        aiTeams.forEach((team: any) => {
            this.manageRoster(team, save)
            this.manageFinances(team, save)
        })
    }

    private static manageRoster(team: TeamSaveData, save: any) {
        const rosterSize = team.rosterIds.length
        if (rosterSize < 5) this.signFreeAgent(team, save)
    }

    private static manageFinances(team: TeamSaveData, save: any) {
        if (team.financialState === "CRISIS" || team.financialState === "INSOLVENT") {
            this.listPlayerForTransfer(team, save)
        }
    }

    private static signFreeAgent(team: TeamSaveData, save: any) {
        const allRosteredIds = new Set(save.teams.flatMap((t: any) => t.rosterIds))
        const freeAgents = save.players.filter((p: any) => !allRosteredIds.has(p.id) && !p.isRetired)
        if (freeAgents.length === 0) return

        freeAgents.sort((a: any, b: any) => b.skill - a.skill)
        if (team.budget > 1000) {
            const target = freeAgents[0]
            team.rosterIds.push(target.id)
            save.contracts.push({ playerId: target.id, teamId: team.id })
            target.forSale = false
        }
    }

    private static listPlayerForTransfer(team: TeamSaveData, save: any) {
        const players = team.rosterIds.map(id => save.players.find((p: any) => p.id === id))
        const notForSale = players.filter(p => !p.forSale)
        if (notForSale.length > 0) {
            const target = notForSale[0]
            target.forSale = true
            target.transferListingPrice = 50000
        }
    }

    static updateElo(save: any, match: any) {
        const home = save.teams.find((t: any) => t.id === match.homeTeamId)
        const away = save.teams.find((t: any) => t.id === match.awayTeamId)
        if (!home || !away) return

        const K = 32
        const expectedHome = 1 / (1 + Math.pow(10, (away.elo - home.elo) / 400))
        const actualHome = match.winnerId === home.id ? 1 : 0
        const change = Math.round(K * (actualHome - expectedHome))
        home.elo += change
        away.elo -= change
    }
}

// TEST DATA
const mockTeam = { id: "t1", name: "AI", rosterIds: ["p1", "p2", "p3"], budget: 50000, financialState: "STABLE", elo: 1000, reputation: 10, fanbase: 100 }
const mockPlayer = { id: "p1", name: "P1", skill: 80, forSale: false }
const mockFA = { id: "fa1", name: "FA", skill: 70, isRetired: false }
const mockSave = {
    teams: [mockTeam, { id: "t2", name: "Player", rosterIds: [], elo: 1000 }],
    players: [mockPlayer, { id: "p2", skill: 80 }, { id: "p3", skill: 80 }, mockFA],
    contracts: [] as any[]
}

console.log("--- Standalone AI Verification ---")

// 1. Roster Filling
console.log(`Initial Roster: ${mockTeam.rosterIds.length}`)
AIManagerStandalone.processWeeklyAI(mockSave, "t2")
console.log(`Post-AI Roster: ${mockTeam.rosterIds.length} (Expected 4)`)
if (mockTeam.rosterIds.includes("fa1")) console.log("✅ AI Signed FA")
else console.error("❌ AI Logic Failed")

// 2. Panic Sell
mockTeam.financialState = "CRISIS"
AIManagerStandalone.processWeeklyAI(mockSave, "t2")
if (mockPlayer.forSale) console.log("✅ AI Listed Player in Crisis")
else console.error("❌ AI Failed to Panic Sell")

// 3. Elo
const match = { homeTeamId: "t1", awayTeamId: "t2", winnerId: "t1" }
AIManagerStandalone.updateElo(mockSave, match)
console.log(`Elo t1: ${mockTeam.elo} (Expected > 1000)`)
if (mockTeam.elo > 1000) console.log("✅ Elo Updates Working")
