/**
 * Phase 4.4: the regional league gives every club a regular fixture list.
 */
import {
    compactLeagueMatches,
    computeStandings,
    divisionOfTeam,
    drawDueLeagueSplit,
    leagueRegionOf,
    processLeagueWeek,
} from "@/engine/season/regional-league"
import { LEAGUE_TUNING } from "@/lib/balance-tuning"
import type { GameSave, LeagueDivision } from "@/engine/save-types"
import { makeWorld, playLeagueWeek as playWeek } from "./league-fixtures"

const leagueOf = (save: GameSave, teamId: string) => save.scheduledMatches.filter(m => m.tournamentId?.startsWith("league_") && (m.homeTeamId === teamId || m.awayTeamId === teamId))

describe("regional league draw", () => {
    test("every club is in exactly one division of its region, about ten per division", () => {
        const save = makeWorld({ EU: 40, CIS: 21, NA: 12, BR: 8, ASIA: 9 })
        const split = drawDueLeagueSplit(save)!
        expect(split.id).toBe("league_s1_p1")
        const placed = split.divisions.flatMap(d => d.teamIds)
        expect(new Set(placed).size).toBe(save.teams.length)
        expect(placed.length).toBe(save.teams.length)
        for (const d of split.divisions) {
            expect(d.teamIds.length).toBeGreaterThanOrEqual(8)
            expect(d.teamIds.length).toBeLessThanOrEqual(12)
            for (const id of d.teamIds) expect(leagueRegionOf(save.teams.find(t => t.id === id)!.region)).toBe(d.region)
        }
        // NA + BR share the Americas conference.
        expect(split.divisions.filter(d => d.region === "AMERICAS").flatMap(d => d.teamIds).length).toBe(20)
        // Divisions are seeded by world ranking: division 1 holds the region's best.
        const eu = split.divisions.filter(d => d.region === "EUROPE").sort((a, b) => a.level - b.level)
        const rank = (id: string) => save.teams.find(t => t.id === id)!.worldRanking!
        expect(Math.max(...eu[0].teamIds.map(rank))).toBeLessThan(Math.min(...eu[1].teamIds.map(rank)))
        // Team fields drive the central payment.
        for (const t of save.teams) expect(t.leagueDivisionId).toBe(divisionOfTeam(save, t.id)!.id)
    })

    test("double round robin: 2 x (n - 1) fixtures a club, at most one league match a week, on a weekday", () => {
        const save = makeWorld({ EU: 40 })
        const split = drawDueLeagueSplit(save)!
        for (const d of split.divisions.filter(x => x.format === "DOUBLE")) {
            for (const id of d.teamIds) {
                const mine = leagueOf(save, id)
                expect(mine.length).toBe(2 * (d.teamIds.length - 1))
                const weeks = mine.map(m => m.week)
                expect(new Set(weeks).size).toBe(weeks.length)
                for (const m of mine) {
                    expect(m.week).toBeGreaterThanOrEqual(split.firstWeek)
                    expect(m.week).toBeLessThanOrEqual(split.lastWeek)
                    expect(m.day).toBeLessThan(4)
                    expect(m.format).toBe(LEAGUE_TUNING.MATCH_FORMAT)
                }
                // Home and away are balanced.
                const home = mine.filter(m => m.homeTeamId === id).length
                expect(Math.abs(home - (mine.length - home))).toBeLessThanOrEqual(2)
            }
        }
    })

    test("league nights avoid days a club already has an event match", () => {
        const save = makeWorld({ EU: 20 })
        // Every club already plays an event match on Tuesday of week 2.
        for (const [i, t] of save.teams.entries()) if (i % 2 === 0) {
            save.scheduledMatches.push({ id: `ev_${i}`, homeTeamId: t.id, awayTeamId: save.teams[i + 1].id, tournamentId: "event", stage: "R1", week: 2, day: 1, format: "BO3", seed: 1 })
        }
        drawDueLeagueSplit(save)
        const week2 = save.scheduledMatches.filter(m => m.week === 2 && m.tournamentId?.startsWith("league_"))
        expect(week2.length).toBeGreaterThan(0)
        for (const m of week2) expect(m.day).not.toBe(1)
    })

    test("divisions of busy international clubs play a single round robin", () => {
        const save = makeWorld({ EU: 40 })
        const split = drawDueLeagueSplit(save)!
        const top = split.divisions.find(d => d.level === 1)!
        expect(top.format).toBe("SINGLE")
        for (const id of top.teamIds) expect(leagueOf(save, id).length).toBe(top.teamIds.length - 1)
        expect(split.divisions.find(d => d.level === 4)!.format).toBe("DOUBLE")
    })

    test("the draw is idempotent and deterministic", () => {
        const a = makeWorld({ EU: 30 }), b = makeWorld({ EU: 30 })
        drawDueLeagueSplit(a)
        expect(drawDueLeagueSplit(a)).toBeNull()
        drawDueLeagueSplit(b)
        expect(a.scheduledMatches).toEqual(b.scheduledMatches)
    })

    test("a typical club plays 30-45 league matches over a season (two splits)", () => {
        const save = makeWorld({ EU: 40, CIS: 20 })
        drawDueLeagueSplit(save)
        const doubleInSplit1 = new Set(save.teams.filter(t => divisionOfTeam(save, t.id)?.format === "DOUBLE").map(t => t.id))
        const counts = new Map<string, number>()
        const count = () => { for (const m of save.scheduledMatches) for (const id of [m.homeTeamId, m.awayTeamId]) counts.set(id, (counts.get(id) ?? 0) + 1) }
        count()
        for (let w = 2; w <= 26; w++) { save.currentWeek = w; playWeek(save, w); processLeagueWeek(save, save.playerTeamId) }
        save.currentWeek = 26
        drawDueLeagueSplit(save)
        count()
        const double = save.teams.filter(t => doubleInSplit1.has(t.id) && divisionOfTeam(save, t.id)?.format === "DOUBLE").map(t => counts.get(t.id) ?? 0)
        expect(double.length).toBeGreaterThan(20)
        expect(Math.min(...double)).toBeGreaterThanOrEqual(30)
        expect(Math.max(...double)).toBeLessThanOrEqual(45)
    })
})

describe("league tables, prizes and promotion", () => {
    test("results are read into the table; a finished division pays prizes, crowns a champion and flags movement", () => {
        const save = makeWorld({ EU: 30 })
        const split = drawDueLeagueSplit(save)!
        const d2 = split.divisions.find(d => d.level === 2)!
        // The lower-ranked (later-drawn) club always wins: the table inverts the seeding.
        const order = new Map(save.teams.map(t => [t.id, t.worldRanking!]))
        for (let w = split.firstWeek; w <= split.lastWeek; w++) {
            save.currentWeek = w
            playWeek(save, w, (h, a) => order.get(a)! > order.get(h)!)
            processLeagueWeek(save, save.playerTeamId)
        }
        save.currentWeek = split.lastWeek + 1
        const out = processLeagueWeek(save, save.playerTeamId)
        expect(split.completed || out.splitFinished).toBe(true)
        expect(d2.completed).toBe(true)
        const worst = [...d2.teamIds].sort((a, b) => order.get(b)! - order.get(a)!)[0]
        expect(d2.championId).toBe(worst)
        expect(d2.standings[0].wins).toBe((d2.format === "DOUBLE" ? 2 : 1) * (d2.teamIds.length - 1))
        expect(d2.promoted).toEqual(d2.standings.slice(0, 2).map(s => s.teamId))
        expect(d2.relegated).toEqual(d2.standings.slice(-2).map(s => s.teamId))
        // Prize rows (PRIZE, league_prize_*) for the top places, paid once.
        const rows = save.financeLedger.filter(e => e.id.startsWith(`league_prize_${d2.id}_`))
        expect(rows.length).toBe(Math.min(8, d2.teamIds.length))
        expect(rows.every(e => e.category === "PRIZE" && e.type === "INCOME")).toBe(true)
        expect(rows.find(e => e.teamId === worst)!.amount).toBe(Math.round(LEAGUE_TUNING.SPLIT_PRIZE_POOL_BY_LEVEL[1] * 0.4))
        processLeagueWeek(save, save.playerTeamId)
        expect(save.financeLedger.filter(e => e.id.startsWith(`league_prize_${d2.id}_`)).length).toBe(rows.length)
        // Top division champions lift a trophy.
        const d1 = split.divisions.find(d => d.level === 1)!
        expect(save.teams.find(t => t.id === d1.championId)!.trophies?.some(t => t.tournamentId === d1.id)).toBe(true)
        expect(save.league!.history.at(-1)!.id).toBe(split.id)
    })

    test("the next split applies promotion and relegation between neighbouring divisions", () => {
        const save = makeWorld({ EU: 30 })
        const split = drawDueLeagueSplit(save)!
        for (let w = split.firstWeek; w <= split.lastWeek + 1; w++) { save.currentWeek = w; playWeek(save, w); processLeagueWeek(save, save.playerTeamId) }
        const [d1, d2] = [1, 2].map(l => split.divisions.find(d => d.region === "EUROPE" && d.level === l)!) as LeagueDivision[]
        save.currentWeek = LEAGUE_TUNING.SPLITS[1].drawWeek
        const next = drawDueLeagueSplit(save)!
        const n1 = next.divisions.find(d => d.level === 1)!, n2 = next.divisions.find(d => d.level === 2)!
        for (const id of d2.promoted!) expect(n1.teamIds).toContain(id)
        for (const id of d1.relegated!) expect(n2.teamIds).toContain(id)
        expect(n1.teamIds.length).toBe(d1.teamIds.length)
    })

    test("table tiebreak: points, then head-to-head", () => {
        const fixtures = [
            { id: "a", home: "A", away: "B", round: 1, week: 2, result: { winnerId: "A", homeMaps: 1, awayMaps: 0, homeRounds: 13, awayRounds: 11 } },
            { id: "b", home: "B", away: "C", round: 2, week: 3, result: { winnerId: "B", homeMaps: 1, awayMaps: 0, homeRounds: 13, awayRounds: 2 } },
            { id: "c", home: "C", away: "A", round: 3, week: 4, result: { winnerId: "C", homeMaps: 1, awayMaps: 0, homeRounds: 13, awayRounds: 3 } },
            { id: "d", home: "A", away: "D", round: 4, week: 5, result: { winnerId: "A", homeMaps: 1, awayMaps: 0, homeRounds: 13, awayRounds: 0 } },
        ]
        const table = computeStandings({ teamIds: ["A", "B", "C", "D"], fixtures })
        expect(table.map(s => s.teamId)).toEqual(["A", "B", "C", "D"])
        expect(table[0].points).toBe(6)
    })
})

describe("league match records", () => {
    test("AI-vs-AI league records leave the completed-match log after a few weeks; the managed club's stay", () => {
        const save = makeWorld({ EU: 20 })
        drawDueLeagueSplit(save)
        for (let w = 2; w <= 10; w++) { save.currentWeek = w; playWeek(save, w); processLeagueWeek(save, save.playerTeamId) }
        const managed = save.completedMatches.filter(m => m.homeTeamId === save.playerTeamId || m.awayTeamId === save.playerTeamId).length
        compactLeagueMatches(save)
        const left = save.completedMatches
        expect(left.filter(m => m.homeTeamId === save.playerTeamId || m.awayTeamId === save.playerTeamId).length).toBe(managed)
        expect(left.every(m => m.homeTeamId === save.playerTeamId || m.awayTeamId === save.playerTeamId || m.week >= 10 - LEAGUE_TUNING.AI_MATCH_RECORD_WEEKS)).toBe(true)
        // The table still has every result.
        const d = divisionOfTeam(save, save.teams[3].id)!
        expect(d.standings.reduce((s, r) => s + r.played, 0)).toBe(2 * d.fixtures.filter(f => f.result).length)
    })
})
