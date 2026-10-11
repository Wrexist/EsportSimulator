/**
 * Phase 4.7: the League screen, Home's league card and every fixture label
 * read the Phase 4.4 league through components/league/league-view.ts.
 */
import fs from "fs"
import path from "path"
import { drawDueLeagueSplit, processLeagueWeek } from "@/engine/season/regional-league"
import type { GameSave, LeagueDivision } from "@/engine/save-types"
import {
    bottomLevelOf,
    clubFixtures,
    divisionRounds,
    divisionsByRegion,
    isLeagueFixture,
    leagueDivisionLabel,
    leagueMatchContext,
    leagueStageLabel,
    leagueTableRows,
    nextDrawLabel,
    previousSplitOutcome,
    showsMapDiff,
    splitOutcomeText,
    splitProgressLabel,
    splitWeeksLabel,
    tableSituation,
    teamForm,
    zoneFor,
    zoneRules,
} from "@/components/league/league-view"
import { getMatchHeadline, getMatchTone, getStakes, isLeagueStage, LEAGUE_STAKES } from "@/lib/match-stakes"
import { makeWorld, playLeagueWeek } from "./league-fixtures"

/** A drawn European league of 40 clubs (four divisions of ten); the managed club is in division 3. */
function world(): { save: GameSave; own: LeagueDivision } {
    const save = makeWorld({ EU: 40 })
    drawDueLeagueSplit(save)
    const own = save.league!.current!.divisions.find(d => d.teamIds.includes(save.playerTeamId))!
    return { save, own }
}

function playWeeks(save: GameSave, from: number, to: number, awayWins?: (h: string, a: string) => boolean) {
    for (let w = from; w <= to; w++) {
        save.currentWeek = w
        playLeagueWeek(save, w, awayWins)
        processLeagueWeek(save, save.playerTeamId)
    }
}

describe("zones", () => {
    test("top 2 up and bottom 2 down, except at the ends of the ladder", () => {
        // Division 3 of 4: both zones.
        expect([1, 2, 3, 8, 9, 10].map(p => zoneFor(p, 10, 3, 4))).toEqual(["promotion", "promotion", null, null, "relegation", "relegation"])
        // Division 1: no promotion; the winner takes the title.
        expect([1, 2, 9, 10].map(p => zoneFor(p, 10, 1, 4))).toEqual([null, null, "relegation", "relegation"])
        // Lowest division: no relegation.
        expect([1, 2, 9, 10].map(p => zoneFor(p, 10, 4, 4))).toEqual(["promotion", "promotion", null, null])
        // A one-division region has neither.
        expect([1, 10].map(p => zoneFor(p, 10, 1, 1))).toEqual([null, null])
        expect(zoneFor(0, 10, 3, 4)).toBeNull()
        expect(zoneFor(11, 10, 3, 4)).toBeNull()
    })

    test("zone rules name the neighbouring divisions", () => {
        expect(zoneRules(3, 4)).toEqual(["Top 2 promoted to Division 2", "Bottom 2 relegated to Division 4"])
        expect(zoneRules(1, 4)).toEqual(["Winner takes the title", "Bottom 2 relegated to Division 2"])
        expect(zoneRules(4, 4)).toEqual(["Top 2 promoted to Division 3"])
    })
})

describe("table rows", () => {
    test("rows follow the engine's standings with zones, form and the managed club marked", () => {
        const { save, own } = world()
        const split = save.league!.current!
        expect(bottomLevelOf(split, "EUROPE")).toBe(4)
        playWeeks(save, split.firstWeek, split.firstWeek + 5)
        const rows = leagueTableRows(own, 4, save.playerTeamId)
        expect(rows.map(r => r.teamId)).toEqual(own.standings.map(s => s.teamId))
        expect(rows.map(r => r.position)).toEqual(rows.map((_, i) => i + 1))
        expect(rows.filter(r => r.isPlayer).map(r => r.teamId)).toEqual([save.playerTeamId])
        expect(rows.filter(r => r.zone === "promotion").map(r => r.position)).toEqual([1, 2])
        expect(rows.filter(r => r.zone === "relegation").map(r => r.position)).toEqual([9, 10])
        for (const r of rows) {
            expect(r.points).toBe(3 * r.wins)
            expect(r.form.length).toBe(Math.min(5, r.played))
            expect(r.form.filter(f => f === "W").length).toBeLessThanOrEqual(r.wins)
        }
        // BO1: map difference is just W-L, so the table hides it; round difference is real.
        expect(showsMapDiff(own)).toBe(false)
        expect(rows.some(r => r.roundDiff !== 0)).toBe(true)
    })

    test("form is the last five results, oldest first", () => {
        const fixtures = [1, 2, 3, 4, 5, 6].map(round => ({
            id: `f${round}`, home: "A", away: "B", round, week: round + 1,
            result: { winnerId: round % 2 ? "A" : "B", homeMaps: round % 2, awayMaps: 1 - (round % 2), homeRounds: 13, awayRounds: 10 },
        }))
        expect(teamForm({ fixtures }, "A")).toEqual(["L", "W", "L", "W", "L"])
        expect(teamForm({ fixtures }, "B", 2)).toEqual(["L", "W"])
        expect(teamForm({ fixtures: [] }, "A")).toEqual([])
    })

    test("table situation speaks in points against the zones", () => {
        const row = (teamId: string, position: number, points: number, zone: "promotion" | "relegation" | null = null) =>
            ({ position, teamId, played: 3, wins: points / 3, losses: 3 - points / 3, points, mapDiff: 0, roundDiff: 0, form: [], zone, isPlayer: false })
        const rows = [row("A", 1, 9, "promotion"), row("B", 2, 6, "promotion"), row("C", 3, 3), row("D", 4, 3, "relegation"), row("E", 5, 0, "relegation")]
        expect(tableSituation(rows, "A", 3)).toEqual({ text: "In the promotion places", tone: "positive" })
        expect(tableSituation(rows, "C", 3)).toEqual({ text: "3 pts off the promotion places", tone: "neutral" })
        expect(tableSituation(rows, "E", 3)).toEqual({ text: "In the relegation places · 3 pts from safety", tone: "negative" })
        expect(tableSituation(rows, "D", 3)!.text).toBe("In the relegation places · level on points with safety")
        expect(tableSituation(rows.map(r => ({ ...r, zone: r.zone === "promotion" ? null : r.zone })), "B", 1)!.text).toBe("3 pts behind the leader")
        expect(tableSituation(rows, "Z", 3)).toBeNull()
        expect(tableSituation(rows.map(r => ({ ...r, played: 0 })), "C", 3)!.text).toBe("No rounds played yet")
    })
})

describe("split progress and the managed club's fixtures", () => {
    test("round x of y, then the final table", () => {
        const { save, own } = world()
        const split = save.league!.current!
        const total = Math.max(...own.fixtures.map(f => f.round))
        expect(divisionRounds(own)).toEqual({ played: 0, total, current: 1, completed: false })
        expect(splitProgressLabel(split, own)).toBe(`Split 1 · Round 1 of ${total}`)
        expect(splitWeeksLabel(split)).toBe("Weeks 2–24")
        playWeeks(save, split.firstWeek, split.firstWeek + 6)
        const done = new Set(own.fixtures.filter(f => f.week <= split.firstWeek + 6).map(f => f.round)).size
        expect(done).toBeGreaterThan(1)
        expect(divisionRounds(own).played).toBe(done)
        expect(splitProgressLabel(split, own)).toBe(`Split 1 · Round ${done + 1} of ${total}`)
        playWeeks(save, split.firstWeek + 3, split.lastWeek + 1)
        expect(own.completed).toBe(true)
        expect(splitProgressLabel(split, own)).toBe("Split 1 · Final table")
        expect(nextDrawLabel(split)).toBe("Split 2 is drawn in week 26")
        expect(nextDrawLabel({ split: 2, season: 1 })).toBe("Season 2 split 1 is drawn in week 1")
    })

    test("upcoming soonest first; played newest first with the club-side score", () => {
        const { save, own } = world()
        const split = save.league!.current!
        playWeeks(save, split.firstWeek, split.firstWeek + 3, () => true) // away sides win 13-9
        const { upcoming, played } = clubFixtures(own, save.playerTeamId)
        expect(upcoming.length + played.length).toBe(own.fixtures.filter(f => f.home === save.playerTeamId || f.away === save.playerTeamId).length)
        expect(upcoming.map(c => c.fixture.week)).toEqual([...upcoming.map(c => c.fixture.week)].sort((a, b) => a - b))
        expect(played.map(c => c.fixture.round)).toEqual([...played.map(c => c.fixture.round)].sort((a, b) => b - a))
        for (const c of played) {
            expect(c.won).toBe(!c.home)
            expect(c.score).toBe(c.won ? "13–9" : "9–13")
        }
    })

    test("divisions grouped by region, top division first", () => {
        const save = makeWorld({ EU: 20, CIS: 10, NA: 10 }, "t_CIS_3")
        drawDueLeagueSplit(save)
        const groups = divisionsByRegion(save.league!.current)
        expect(groups.map(g => g.region)).toEqual(["EUROPE", "CIS", "AMERICAS"])
        expect(groups[0].divisions.map(d => d.level)).toEqual([1, 2])
        expect(divisionsByRegion(undefined)).toEqual([])
    })
})

describe("previous split outcome", () => {
    test("the archived table says where the club finished and whether it moved", () => {
        const { save, own } = world()
        const split = save.league!.current!
        expect(previousSplitOutcome(save.league, save.playerTeamId)).toBeNull()
        // The managed club wins every game: champions of division 3, promoted.
        playWeeks(save, split.firstWeek, split.lastWeek + 1, (h, a) => a === save.playerTeamId)
        const outcome = previousSplitOutcome(save.league, save.playerTeamId)!
        expect(outcome).toMatchObject({ splitId: split.id, season: 1, split: 1, divisionName: own.name, level: own.level, position: 1, size: 10, champion: true, fate: "promoted", movedTo: "Division 2" })
        const games = (own.format === "DOUBLE" ? 2 : 1) * (own.teamIds.length - 1)
        expect(outcome.wins).toBe(games)
        expect(splitOutcomeText(outcome)).toBe(`Champions of 10 in ${own.name} (${games}W–0L, ${3 * games} pts). Promoted to Division 2.`)
        // A club that went down.
        const last = own.standings.at(-1)!.teamId
        const down = previousSplitOutcome(save.league, last)!
        expect(down.fate).toBe("relegated")
        expect(splitOutcomeText(down)).toMatch(/^10th of 10 in .+ Relegated to Division 4\.$/)
    })
})

describe("fixture labels", () => {
    test("league fixtures are named by their stage; others fall through", () => {
        const { save } = world()
        const m = save.scheduledMatches.find(x => x.tournamentId?.startsWith("league_"))!
        expect(isLeagueFixture(m)).toBe(true)
        expect(leagueStageLabel(m)).toMatch(/^Europe Division \d · Round \d+$/)
        expect(leagueDivisionLabel(m)).toMatch(/^Europe Division \d$/)
        expect(leagueStageLabel({ id: "m1", tournamentId: "iem_katowice_s1", stage: "Quarter-final" })).toBeNull()
        expect(leagueStageLabel({ id: "scrim_1", tournamentId: "SCRIM", stage: null })).toBeNull()
        expect(leagueStageLabel({ id: "league_s1_p1_cis_d1_r1_0", tournamentId: "league_s1_p1_cis_d1", stage: null })).toBe("Regional league")
        expect(leagueStageLabel(null)).toBeNull()
    })

    test("the match header shows both clubs' table places, first team first", () => {
        const { save, own } = world()
        const split = save.league!.current!
        playWeeks(save, split.firstWeek, split.firstWeek + 1)
        const m = save.scheduledMatches.find(x => x.tournamentId === own.id && (x.homeTeamId === save.playerTeamId || x.awayTeamId === save.playerTeamId))!
        const pos = (id: string) => own.standings.findIndex(s => s.teamId === id) + 1
        const opp = m.homeTeamId === save.playerTeamId ? m.awayTeamId : m.homeTeamId
        const text = leagueMatchContext(save.league, m, save.playerTeamId)!
        expect(text.startsWith(`${pos(save.playerTeamId)}`)).toBe(true)
        expect(text).toContain(` v ${pos(opp)}`)
        expect(leagueMatchContext(save.league, { ...m, tournamentId: "league_old" }, save.playerTeamId)).toBeNull()
    })

    test("match stakes: a league round is three points, not a bracket", () => {
        const stage = "Europe Division 3 · Round 5"
        expect(isLeagueStage(stage)).toBe(true)
        expect(isLeagueStage("Round of 16")).toBe(false)
        expect(isLeagueStage("Swiss Round 2")).toBe(false)
        expect(getStakes(stage, true)).toEqual(LEAGUE_STAKES)
        expect(getMatchTone(stage, true)).toBe("league")
        const headline = getMatchHeadline(stage, true, "Rivals")
        expect(headline).not.toMatch(/tournament/i)
        expect(headline).toBe("League match — 3 points at stake against Rivals.")
        // Tournament stages keep their wording.
        expect(getMatchTone("Grand Final", true)).toBe("championship")
        expect(getMatchHeadline("Quarter-final", true, "X")).toBe("Win-or-go-home against X.")
        expect(getMatchHeadline("Swiss Round 2", false, "X")).toBe("Swiss round — every result moves the standings.")
        expect(getMatchHeadline("Opening match", false, "X")).toBe("Tournament match against X.")
    })

    test("every fixture surface routes league fixtures through the stage label", () => {
        const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, "..", rel), "utf8")
        for (const file of [
            "app/page.tsx",
            "components/week/WeekFixtures.tsx",
            "app/schedule/page.tsx",
            "app/match/[id]/tactics/page.tsx",
            "app/match/[id]/result/page.tsx",
            "app/match/[id]/veto/page.tsx",
        ]) {
            expect([file, read(file).includes("leagueStageLabel(")]).toEqual([file, true])
        }
    })
})
