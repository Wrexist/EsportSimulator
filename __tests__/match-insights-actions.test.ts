/**
 * MATCHENGINE-06 / -07: the result screen's next-step buttons give the reason
 * that actually triggered them, and "a starter struggled badly" is kept for a
 * clear weak link instead of firing after most matches.
 */
import { buildMatchInsights, STRUGGLED_GAP, STRUGGLED_RATING } from "@/lib/match-insights"
import type { MatchResult } from "@/types"

const own = ["o1", "o2", "o3", "o4", "o5"]
const opp = ["x1", "x2", "x3", "x4", "x5"]

/** One map of `rounds` [ownBuy, oppBuy, ownWon] rows, home = own team. */
function result(rounds: [string, string, boolean][], ratings: number[] = [1, 1, 1, 1, 1]): MatchResult {
    const stat = (id: string, rating: number) => ({ playerId: id, rating, kills: 10, deaths: 10 })
    return {
        homeScore: 1, awayScore: 0, winnerId: "own",
        playerStats: Object.fromEntries([...own.map((id, i) => [id, stat(id, ratings[i])]), ...opp.map(id => [id, stat(id, 1)])]),
        maps: [{ map: "de_mirage", winner: "own", rounds: rounds.map(([o, x, won], i) => ({ roundNumber: i + 2, winningTeamId: won ? "own" : "opp", buys: { home: o, away: x } })) }],
    } as unknown as MatchResult
}

const insights = (r: MatchResult) => buildMatchInsights({ result: r, teamId: "own", isHome: true, ownLineup: own, opponentLineup: opp, nextMatchId: "n1" })
const tactics = (r: MatchResult) => insights(r).actions.find(a => a.href === "/match/n1/tactics" && a.label === "Tactics and loadouts")

describe("the tactics button's reason (MATCHENGINE-06)", () => {
    test("triggered by poor full buys: it names the full buys, not '0 rounds lost while better equipped'", () => {
        // 6 full buys against full buys, 2 won; never lost while better equipped.
        const rows: [string, string, boolean][] = [true, false, false, true, false, false].map(won => ["FULL", "FULL", won])
        const action = tactics(result(rows))
        expect(action?.reason).toBe("Won 2 of 6 full buys")
    })

    test("triggered by rounds lost with the better buy: it keeps that count", () => {
        const rows: [string, string, boolean][] = [["FULL", "ECO", false], ["FULL", "ECO", false], ["FULL", "FORCE", false], ["FULL", "FULL", true]]
        expect(tactics(result(rows))?.reason).toBe("3 rounds lost while better equipped")
    })
})

describe("'a starter struggled badly' (MATCHENGINE-07)", () => {
    const rows: [string, string, boolean][] = [["FULL", "FULL", true]]
    const struggled = (ratings: number[]) => insights(result(rows, ratings)).actions.some(a => a.href === "/transfers")

    test("one ordinary low map (0.75 in a 1.0 lineup) no longer sends you to transfers", () => {
        expect(struggled([1.1, 1.05, 1.0, 0.95, 0.75])).toBe(false)
    })

    test("a clear weak link (far under the line and the lineup's average) still does", () => {
        expect(struggled([1.2, 1.15, 1.1, 1.05, 0.4])).toBe(true)
    })

    test("a low rating in a lineup that all played badly is not singled out", () => {
        expect(struggled([0.75, 0.7, 0.65, 0.6, 0.5])).toBe(false)
    })

    test("thresholds", () => {
        expect(STRUGGLED_RATING).toBe(0.6)
        expect(STRUGGLED_GAP).toBe(0.4)
    })
})
