import { checkLegacyGoals, legacyLevelId, legacyProgress, LEGACY_GOALS, type LegacyView } from "@/engine/legacy-goals"

const team = (id: string, trophies: Array<{ week: number; tournamentId: string }> = [], extra: Record<string, unknown> = {}) =>
    ({ id, name: id, rosterIds: [], trophies: trophies.map(t => ({ ...t, tournamentName: t.tournamentId, tier: "A_TIER" })), ...extra })

function view(over: Partial<LegacyView> = {}): LegacyView {
    return {
        managerDetails: { name: "M", level: 1, xp: 0, reputation: 50, careerWins: 0, careerLosses: 0, championships: 0, stints: [] },
        teams: [], players: [], playerTeamId: "a", currentWeek: 100, recordBook: undefined, gameOverReason: undefined, proCareer: undefined,
        ...over,
    } as unknown as LegacyView
}
const row = (v: LegacyView, id: string) => legacyProgress(v).find(r => r.goal.id === id)!

describe("legacy goals", () => {
    test("trophies count only inside each spell, across clubs", () => {
        const v = view({
            teams: [team("a", [{ week: 5, tournamentId: "cup" }, { week: 60, tournamentId: "cup2" }]), team("b", [{ week: 2, tournamentId: "old" }, { week: 90, tournamentId: "cup3" }])] as never,
            managerDetails: { stints: [{ teamId: "a", teamName: "a", fromWeek: 1, toWeek: 52, matches: 0, wins: 0, losses: 0, trophies: 1 }, { teamId: "b", teamName: "b", fromWeek: 53, matches: 0, wins: 0, losses: 0, trophies: 1 }] } as never,
            playerTeamId: "b",
        })
        expect(row(v, "silverware").value).toBe(2)
        expect(row(v, "everywhere").value).toBe(2)
        expect(row(v, "everywhere").level).toBe(1)
    })

    test("the summit counts down: top 10, top 3, number one", () => {
        expect(row(view({ teams: [team("a", [], { worldRanking: 12 })] as never }), "summit").level).toBe(0)
        expect(row(view({ teams: [team("a", [], { worldRanking: 3 })] as never }), "summit").level).toBe(2)
        expect(row(view({ teams: [team("a", [], { worldRanking: 1 })] as never }), "summit").level).toBe(3)
        // Between clubs there is no club to rank.
        expect(row(view({ teams: [team("a", [], { worldRanking: 1 })] as never, gameOverReason: "SACKED" } as never), "summit").level).toBe(0)
    })

    test("each level fires once, with its reward; a pro career has no manager legacy", () => {
        const v = view({ teams: [team("a", [{ week: 5, tournamentId: "cup" }], { worldRanking: 2 })] as never, managerDetails: { tenureStartWeek: 1 } as never })
        const hits = checkLegacyGoals(v, new Set())
        expect(hits.map(h => h.id).sort()).toEqual([legacyLevelId("silverware", 0), legacyLevelId("summit", 0), legacyLevelId("summit", 1)].sort())
        expect(hits.find(h => h.goalId === "silverware")!.reputation).toBe(LEGACY_GOALS.find(g => g.id === "silverware")!.reputation[0])
        expect(checkLegacyGoals(v, new Set(hits.map(h => h.id)))).toEqual([])
        expect(checkLegacyGoals({ ...v, proCareer: { playerId: "p" } } as never, new Set())).toEqual([])
    })

    test("loyalty counts full seasons of the open spell; promotions come from season honours", () => {
        const v = view({
            teams: [team("a")] as never, currentWeek: 53 * 3,
            managerDetails: { stints: [{ teamId: "a", teamName: "a", fromWeek: 1, matches: 0, wins: 0, losses: 0, trophies: 0 }] } as never,
            recordBook: { honours: [{ userClub: { tierMove: "promoted" } }, { userClub: { tierMove: "none" } }] } as never,
        })
        expect(row(v, "loyalty").value).toBe(3)
        expect(row(v, "loyalty").level).toBe(1)
        expect(row(v, "climb").level).toBe(1)
    })

    test("COMP-17: the first silverware level reads in the singular", () => {
        const silverware = LEGACY_GOALS.find(g => g.id === "silverware")!
        expect(silverware.describe(1)).toBe("Win a trophy as a manager")
        expect(silverware.describe(10)).toBe("Win 10 trophies as a manager")
    })
})
