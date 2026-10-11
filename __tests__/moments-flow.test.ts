/**
 * Phase 5.4a moment flow: a grand final recorded through saveMatchResult
 * queues the title for its result screen; the intro's facts and context line
 * are true; the victory/defeat cue plays once per match.
 */
import { produce, enableMapSet } from "immer"
import { createLaunchFixture } from "@/scripts/launch/fixtures"
import { createMatchSimulationSlice } from "@/store/slices/match-simulation-slice"
import type { StoreState } from "@/store/types"
import type { BracketMatchSaveData, CompletedMatchSaveData, TeamSaveData, TournamentSaveData } from "@/engine/save-types"
import type { TitleMoment } from "@/engine/moments"
import { headToHeadOf, introContextLine } from "@/lib/match-intro"
import { soundManager } from "@/lib/sound-manager"

jest.mock("@/lib/sound-manager", () => ({ soundManager: { play: jest.fn() } }))

enableMapSet()

describe("grand final on the result screen", () => {
    function harness() {
        const save = createLaunchFixture("first-week")
        const match = save.scheduledMatches[0]
        match.maps = ["Nuke"]
        match.tournamentId = "cup"
        match.stage = "Grand Final"
        const me = match.homeTeamId, opp = match.awayTeamId
        const others = save.teams.filter(t => t.id !== me && t.id !== opp).slice(0, 2).map(t => t.id)
        const bm = (id: string, stage: string, home: string, away: string, done: boolean, src?: string[]): BracketMatchSaveData => ({
            id, tournamentId: "cup", stage, homeTeamId: home, awayTeamId: away, isCompleted: done,
            ...(done ? { winnerId: home, loserId: away } : {}), week: match.week, format: "BO1", seed: 1, sourceMatchIds: src,
        })
        const tournament = {
            id: "cup", name: "Nordic Cup", shortName: "NC", tier: "A_TIER", region: "EU", format: "bracket", currentStage: "Playoffs",
            teamIds: [me, opp, ...others], standings: [], prizePool: 50_000, startWeek: 1, duration: 2, endWeek: match.week,
            playoffBracket: [bm("sf1", "Semi-final 1", me, others[0], true), bm("sf2", "Semi-final 2", opp, others[1], true), bm(match.id, "Grand Final", me, opp, false, ["sf1", "sf2"])],
        } as unknown as TournamentSaveData
        save.tournaments = [tournament]
        save.completedMatches = (["sf1", "sf2"] as const).map((id, i) => ({
            id, homeTeamId: i ? opp : me, awayTeamId: others[i], tournamentId: "cup", stage: i ? "Semi-final 2" : "Semi-final 1", week: match.week, day: 1, format: "BO1", seed: 1,
            result: { homeScore: 1, awayScore: 0, winnerId: i ? opp : me, maps: [] },
        })) as unknown as CompletedMatchSaveData[]
        let state = { ...save, saveId: save.saveId, newsFeed: [], momentQueue: [], seenMomentKeys: [] } as unknown as StoreState
        const set = (fn: Partial<StoreState> | ((s: StoreState) => void)) => { state = typeof fn === "function" ? produce(state, fn) : { ...state, ...fn } }
        const slice = createMatchSimulationSlice(set, () => state)
        const result = (homeWins: boolean) => ({
            homeScore: homeWins ? 1 : 0, awayScore: homeWins ? 0 : 1,
            maps: [{ map: "Nuke", homeScore: homeWins ? 13 : 8, awayScore: homeWins ? 8 : 13, rounds: [] }],
            playerStats: Object.fromEntries(state.players.map(p => [p.id, { kills: 10, deaths: 5, assists: 2, rating: 1.1 }])),
            mvpPlayerId: state.teams[0].rosterIds[0],
        })
        return { read: () => state as unknown as StoreState & { momentQueue: TitleMoment[] }, slice, match, result }
    }

    test("winning it queues the title moment, tied to the match, with the champion's share", () => {
        const h = harness()
        h.slice.saveMatchResult(h.match.id, h.result(true))
        expect(h.read().completedMatches.some(m => m.id === h.match.id)).toBe(true)
        expect(h.read().momentQueue).toHaveLength(1)
        expect(h.read().momentQueue[0]).toMatchObject({ key: "title:cup", kind: "title", matchId: h.match.id, prizeBooked: false, finalScore: "1-0", prize: 20_000 })
    })

    test("losing it queues nothing", () => {
        const h = harness()
        h.slice.saveMatchResult(h.match.id, h.result(false))
        expect(h.read().completedMatches.some(m => m.id === h.match.id)).toBe(true)
        expect(h.read().momentQueue).toHaveLength(0)
    })
})

describe("match intro facts", () => {
    const team = (id: string, worldRanking: number, rivalries?: TeamSaveData["rivalries"]) => ({ id, name: `Team ${id}`, worldRanking, rivalries }) as TeamSaveData
    const played = (id: string, home: string, away: string, homeScore: number, awayScore: number, week: number) =>
        ({ id, homeTeamId: home, awayTeamId: away, week, day: 1, result: { homeScore, awayScore, winnerId: homeScore > awayScore ? home : away, maps: [] } }) as unknown as CompletedMatchSaveData

    test("head to head counts the recorded meetings from each side, last meeting first", () => {
        const h2h = headToHeadOf([played("a", "me", "op", 2, 1, 3), played("b", "op", "me", 2, 0, 9), played("c", "me", "x", 1, 0, 9)], "me", "op")
        expect(h2h).toMatchObject({ meetings: 2, homeWins: 1, awayWins: 1, last: { winnerId: "op", winnerScore: 2, loserScore: 0, week: 9 } })
        expect(headToHeadOf([], "me", "op")).toEqual({ meetings: 0, homeWins: 0, awayWins: 0, last: undefined })
    })

    test("one context line, the first that is true: final, derby, rematch, top-10 clash", () => {
        const me = team("me", 4), op = team("op", 9)
        const lost = headToHeadOf([played("b", "op", "me", 2, 0, 9)], "me", "op")
        const base = { home: me, away: op, playerTeamId: "me", competitionName: "Nordic Cup", h2h: lost }
        expect(introContextLine({ ...base, stage: "Grand Final" })).toBe("Grand Final: the winner lifts the Nordic Cup trophy")
        const derby = { ...base, home: team("me", 4, [{ opponentTeamId: "op", matchesPlayed: 8, wins: 4, losses: 4, lastPlayed: 9, intensity: "FIERCE" }]) }
        expect(introContextLine({ ...derby, stage: "Semi-final 1" })).toBe("Fierce rivalry: a derby between Team me and Team op")
        expect(introContextLine({ ...base, stage: "Group A" })).toBe("Rematch: Team op won the last meeting 2–0 in week 9")
        expect(introContextLine({ ...base, h2h: headToHeadOf([], "me", "op") })).toBe("Top-10 clash: world #4 meets world #9")
        expect(introContextLine({ ...base, away: team("op", 40), h2h: headToHeadOf([], "me", "op") })).toBeNull()
    })
})

describe("victory / defeat cue", () => {
    beforeEach(() => { jest.resetModules(); jest.mocked(soundManager.play).mockClear() })

    test("plays once per match across the live and result screens", async () => {
        const { playMatchOutcomeCue, markOutcomeCue, outcomeCuePlayed } = await import("@/lib/match-outcome-sound")
        const { soundManager: sm } = await import("@/lib/sound-manager")
        ;(globalThis as { window?: unknown }).window = globalThis
        try {
            expect(playMatchOutcomeCue("m1", true)).toBe(true)
            expect(playMatchOutcomeCue("m1", true)).toBe(false)
            expect(sm.play).toHaveBeenCalledTimes(1)
            expect(sm.play).toHaveBeenCalledWith("victory", { key: "outcome:m1" })
            markOutcomeCue("m2")
            expect(outcomeCuePlayed("m2")).toBe(true)
            expect(playMatchOutcomeCue("m2", false)).toBe(false)
            expect(playMatchOutcomeCue("m3", false)).toBe(true)
            expect(sm.play).toHaveBeenLastCalledWith("defeat", { key: "outcome:m3" })
        } finally {
            delete (globalThis as { window?: unknown }).window
        }
    })
})
