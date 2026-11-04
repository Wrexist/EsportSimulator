/**
 * The news picks last week's notable results (your match, upsets, big clubs)
 * and rumour suitors vary by fit instead of always the same three clubs.
 */
import { generateNarrativeNews } from "@/engine/processors/narrative-news"
import { SeededRNG } from "@/engine/rng"
import type { GameSave } from "@/engine/save-types"

const team = (id: string, elo: number, budget = 500_000) => ({ id, name: id.toUpperCase(), elo, budget, rosterIds: [] as string[] })
function world(): GameSave {
    const teams = [team("us", 1500), team("a", 1900), team("b", 1880), team("c", 1300), team("d", 1700), ...Array.from({ length: 12 }, (_, i) => team(`x${i}`, 1200 + i * 60))]
    const done = (id: string, home: string, away: string, winner: string) => ({ id, homeTeamId: home, awayTeamId: away, week: 9, tournamentId: "cup_1", stage: "Group", format: "BO1", seed: 1, result: { winnerId: winner, homeScore: 1, awayScore: 0, maps: [] } })
    return {
        currentWeek: 10, playerTeamId: "us", teams, players: [], contracts: [], tournaments: [], scheduledMatches: [], newsFeed: [],
        completedMatches: [done("m_plain", "x0", "x1", "x1"), done("m_plain2", "x2", "x3", "x3"), done("m_upset", "a", "c", "c"), done("m_ours", "us", "x4", "us")],
    } as unknown as GameSave
}

test("headlines: your match first, then the biggest upset", () => {
    const save = world()
    generateNarrativeNews(save, new SeededRNG(5))
    const heads = save.newsFeed.filter(n => n.id.startsWith("headline_")).map(n => n.id.split("_").slice(1, 3).join("_"))
    expect(heads.sort()).toEqual(["m_ours", "m_upset"].sort())
})

test("rumour suitors vary and lean to clubs near the player's level", () => {
    const named = new Map<string, number>()
    for (let seed = 0; seed < 400; seed++) {
        const save = world()
        save.completedMatches = []
        save.players = [{ id: "p", nickname: "P", age: 24, role: "RIFLER", skill: 70 } as never]
        save.contracts = [{ playerId: "p", teamId: "d", salaryPerWeek: 1000, startWeek: 1, endWeek: 15, buyout: 0 }]
        save.teams.find(t => t.id === "d")!.rosterIds = ["p"]
        generateNarrativeNews(save, new SeededRNG(seed))
        const rumour = save.newsFeed.find(n => n.category === "TRANSFER" || /rumou?r|link/i.test(n.title))
        if (!rumour) continue
        for (const t of save.teams) if (t.id !== "d" && rumour.content.includes(t.name)) named.set(t.id, (named.get(t.id) ?? 0) + 1)
    }
    expect(named.size).toBeGreaterThan(3)
    // Near d (1700): a/b (1880-1900) and x9-x11 (1740-1860) beat the far-off weakest clubs.
    expect((named.get("b") ?? 0)).toBeGreaterThan(named.get("x0") ?? 0)
})

describe("post-match headlines (HOME-03 / HOME-10)", () => {
    function leagueWorld(): GameSave {
        const save = world()
        save.completedMatches = [{
            id: "league_s1_m1", homeTeamId: "x4", awayTeamId: "us", week: 9, tournamentId: "league_s1_CIS_5", stage: "CIS Division 5 · Round 6",
            format: "BO1", seed: 1, result: { winnerId: "us", homeScore: 0, awayScore: 1, maps: [{ homeScore: 8, awayScore: 13 }] },
        }] as never
        return save
    }

    test("an away win prints the winner's score first and names the league division", () => {
        const save = leagueWorld()
        generateNarrativeNews(save, new SeededRNG(5))
        const head = save.newsFeed.find(n => n.id.startsWith("headline_league_s1_m1"))!
        expect(head.content).toContain("US defeats X4 1-0 in CIS Division 5.")
        expect(head.content).not.toContain("tournament play")
        expect(head.content).not.toContain("0-1")
    })

    test("the headline is dated to the match's week, not the tick's", () => {
        const save = leagueWorld()
        generateNarrativeNews(save, new SeededRNG(5))
        const head = save.newsFeed.find(n => n.id.startsWith("headline_league_s1_m1"))!
        expect(head.week).toBe(9)
        expect(head.matchId).toBe("league_s1_m1")
    })

    test("a match that already has its own news item gets no second headline", () => {
        const save = world()
        save.newsFeed = [{ id: "news_match_1", matchId: "m_ours", title: "US defeat X4 1-0", content: "", category: "MATCH", week: 9 }]
        generateNarrativeNews(save, new SeededRNG(5))
        const heads = save.newsFeed.filter(n => n.id.startsWith("headline_")).map(n => n.matchId)
        expect(heads).not.toContain("m_ours")
        // Still two headlines from the rest of last week's results.
        expect(heads).toHaveLength(2)
    })
})
