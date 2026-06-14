import { mergeCareerProgress, createEmptyCareerProfile } from "@/engine/manager-career-profile"
import type { GameSave } from "@/engine/save-types"

// Minimal save factory — only the fields mergeCareerProgress reads.
function makeSave(overrides: {
    level?: number
    reputation?: number
    worldRanking?: number
    teamName?: string
    trophies?: { tier: string }[]
    totalSeasons?: number
} = {}): GameSave {
    return {
        playerTeamId: "t1",
        managerDetails: { level: overrides.level ?? 5, reputation: overrides.reputation ?? 40 },
        teams: [{
            id: "t1",
            name: overrides.teamName ?? "Team A",
            worldRanking: overrides.worldRanking ?? 10,
            trophies: overrides.trophies ?? [{ tier: "S_TIER" }, { tier: "A_TIER" }],
        }],
        careerStats: { totalSeasons: overrides.totalSeasons ?? 3 },
    } as unknown as GameSave
}

describe("manager career profile merge", () => {
    it("captures peaks/union from an empty profile", () => {
        const p = mergeCareerProgress(createEmptyCareerProfile(), makeSave())
        expect(p.peakLevel).toBe(5)
        expect(p.peakReputation).toBe(40)
        expect(p.bestWorldRanking).toBe(10)
        expect(p.bestCareerMajors).toBe(1)   // one S_TIER
        expect(p.bestCareerTrophies).toBe(2)
        expect(p.mostSeasonsManaged).toBe(3)
        expect(p.teamsManaged).toEqual(["Team A"])
    })

    it("is idempotent — re-merging the same save does not double-count", () => {
        const once = mergeCareerProgress(createEmptyCareerProfile(), makeSave())
        const twice = mergeCareerProgress(once, makeSave())
        expect(twice.bestCareerMajors).toBe(once.bestCareerMajors)
        expect(twice.bestCareerTrophies).toBe(once.bestCareerTrophies)
        expect(twice.mostSeasonsManaged).toBe(once.mostSeasonsManaged)
        expect(twice.teamsManaged).toEqual(["Team A"])
    })

    it("never regresses on a weaker campaign", () => {
        const strong = mergeCareerProgress(createEmptyCareerProfile(), makeSave({ level: 12, reputation: 80, worldRanking: 2, trophies: [{ tier: "S_TIER" }, { tier: "S_TIER" }], totalSeasons: 6 }))
        const weaker = mergeCareerProgress(strong, makeSave({ level: 2, reputation: 10, worldRanking: 90, trophies: [], totalSeasons: 1 }))
        expect(weaker.peakLevel).toBe(12)
        expect(weaker.peakReputation).toBe(80)
        expect(weaker.bestWorldRanking).toBe(2) // lower (better) rank wins
        expect(weaker.bestCareerMajors).toBe(2)
        expect(weaker.mostSeasonsManaged).toBe(6)
    })

    it("treats an unranked (0) world ranking as 'no data', not best", () => {
        const p1 = mergeCareerProgress(createEmptyCareerProfile(), makeSave({ worldRanking: 0 }))
        expect(p1.bestWorldRanking).toBe(0)
        const p2 = mergeCareerProgress(p1, makeSave({ worldRanking: 7 }))
        expect(p2.bestWorldRanking).toBe(7)
        const p3 = mergeCareerProgress(p2, makeSave({ worldRanking: 0 }))
        expect(p3.bestWorldRanking).toBe(7) // unranked doesn't wipe the record
    })

    it("unions teams managed across campaigns", () => {
        const p1 = mergeCareerProgress(createEmptyCareerProfile(), makeSave({ teamName: "Team A" }))
        const p2 = mergeCareerProgress(p1, makeSave({ teamName: "Team B" }))
        expect(p2.teamsManaged.sort()).toEqual(["Team A", "Team B"])
    })
})
