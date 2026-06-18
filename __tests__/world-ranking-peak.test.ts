/**
 * Career-best world-ranking tracking (C8). The weekly re-sort is a pure Elo
 * re-rank (volatile), so peakWorldRanking — the lowest rank ever held — is what
 * lets the ladder read as a climb. Tests the AIManager copy that actually runs
 * in the tick (ai-world-processor calls AIManager.refreshWorldRankings).
 */

import { AIManager } from "@/engine/ai-manager"
import type { GameSave } from "@/engine/save-types"

const team = (id: string, elo: number, extra: Record<string, unknown> = {}) =>
    ({ id, name: id, elo, reputation: 50, ...extra }) as never

const save = (teams: never[]): GameSave => ({ teams }) as unknown as GameSave

describe("AIManager.refreshWorldRankings — career-best peak (C8)", () => {
    test("ranks by elo and seeds peakWorldRanking on first run", () => {
        const s = save([team("a", 1600), team("b", 1500), team("c", 1700)])
        AIManager.refreshWorldRankings(s)
        const c = s.teams.find(t => t.id === "c")!
        expect(c.worldRanking).toBe(1)
        expect(c.peakWorldRanking).toBe(1)
    })

    test("peak holds when the current rank gets worse", () => {
        const a = team("a", 1700, { peakWorldRanking: 1 })
        const s = save([a, team("b", 1800), team("c", 1900)]) // a now 3rd
        AIManager.refreshWorldRankings(s)
        expect(s.teams.find(t => t.id === "a")!.worldRanking).toBe(3)
        expect(s.teams.find(t => t.id === "a")!.peakWorldRanking).toBe(1) // career-best unchanged
    })

    test("peak improves when the current rank gets better", () => {
        const a = team("a", 2000, { peakWorldRanking: 5 })
        const s = save([a, team("b", 1500)])
        AIManager.refreshWorldRankings(s)
        expect(s.teams.find(t => t.id === "a")!.worldRanking).toBe(1)
        expect(s.teams.find(t => t.id === "a")!.peakWorldRanking).toBe(1)
    })
})
