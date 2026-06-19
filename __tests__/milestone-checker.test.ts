import { checkMilestones } from "@/engine/milestone-checker"
import type { GameSave } from "@/engine/save-types"

function win(week: number) {
    return { week, homeTeamId: "t1", awayTeamId: "x", result: { homeScore: 16, awayScore: 5 } }
}
function loss(week: number) {
    return { week, homeTeamId: "t1", awayTeamId: "x", result: { homeScore: 5, awayScore: 16 } }
}

function makeSave(opts: {
    matches?: unknown[]
    kills?: number
    followers?: number
    trophies?: number
} = {}): GameSave {
    return {
        playerTeamId: "t1",
        teams: [{
            id: "t1",
            rosterIds: ["p1", "p2"],
            followers: opts.followers ?? 0,
            trophies: Array.from({ length: opts.trophies ?? 0 }, (_, i) => ({ id: `tr${i}`, tier: "A_TIER", week: 1 })),
        }],
        players: [{ id: "p1", totalKills: opts.kills ?? 0 }, { id: "p2", totalKills: 0 }],
        completedMatches: opts.matches ?? [],
    } as unknown as GameSave
}

const ids = (hits: { id: string }[]) => hits.map(h => h.id)

describe("milestone checker", () => {
    it("fires the first-win milestone but not higher tiers", () => {
        const hits = checkMilestones(makeSave({ matches: [win(1)] }), new Set())
        expect(ids(hits)).toContain("ms_win_1")
        expect(ids(hits)).not.toContain("ms_win_10")
    })

    it("dedups against already-fired ids", () => {
        const hits = checkMilestones(makeSave({ matches: [win(1)] }), new Set(["ms_win_1"]))
        expect(ids(hits)).not.toContain("ms_win_1")
    })

    it("fires a win-streak milestone only for a genuine consecutive run", () => {
        const streak = checkMilestones(makeSave({ matches: [win(1), win(2), win(3)] }), new Set())
        expect(ids(streak)).toContain("ms_streak_3")

        const broken = checkMilestones(makeSave({ matches: [win(1), win(2), loss(3), win(4)] }), new Set())
        expect(ids(broken)).not.toContain("ms_streak_3")
    })

    it("fires firsts and threshold milestones for trophies, kills, and followers", () => {
        const hits = checkMilestones(makeSave({ trophies: 1, kills: 1000, followers: 100_000 }), new Set())
        expect(ids(hits)).toContain("ms_trophy_1")
        expect(ids(hits)).toContain("ms_kills_1000")
        expect(ids(hits)).toContain("ms_fans_100000")
    })

    it("returns nothing for a team with no progress", () => {
        expect(checkMilestones(makeSave(), new Set())).toHaveLength(0)
    })
})
