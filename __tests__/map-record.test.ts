/**
 * G2 map data: the running tally of maps, sides, buys, plans and calls.
 */
import { recordMapResults, ownMapDetail, teamMapTally, rate } from "@/engine/map-record"
import { getSeasonNumber } from "@/engine/career-stats"
import { createLaunchFixture } from "@/scripts/launch/fixtures"
import type { RoundResult } from "@/types/match"
import { computeWeek } from "@/engine/worker/compute-week"
import { TrainingFocus } from "@/types"

jest.mock("@/engine/worker/week-processor-bridge", () => {
    const { WeekProcessorBridge } = require("@/engine/worker/week-processor-client")
    return { weekProcessorBridge: new WeekProcessorBridge(() => { throw new Error("No browser worker in Node fixture") }) }
})
jest.mock("@/engine/manager-career-profile", () => ({ recordCareerProgress: jest.fn().mockResolvedValue(undefined) }))

const round = (n: number, ctTeam: string, tTeam: string, winningTeamId: string, extra: Partial<RoundResult> = {}): RoundResult => ({
    roundNumber: n, ctTeam, tTeam, winningTeamId, winner: winningTeamId === ctTeam ? "ct" : "t", winType: "ELIMINATION", kills: [], ...extra,
})

function setup() {
    const save = createLaunchFixture("first-week")
    const me = save.playerTeamId
    const them = save.teams.find(t => t.id !== me)!.id
    return { save, me, them }
}

test("official maps count for both clubs, with sides, buys, plans and calls for you", () => {
    const { save, me, them } = setup()
    const rounds = [
        round(1, me, them, me, { buys: { home: "PISTOL", away: "PISTOL" }, plan: { tStrategy: "execute", site: "A", ctSetup: "2-1-2" } }),
        round(2, me, them, them, { buys: { home: "FULL", away: "ECO" }, plan: { tStrategy: "rush", site: "B", ctSetup: "stack-A" }, managerCall: { strategy: "FULL" } }),
        round(3, them, me, me, { buys: { home: "FORCE", away: "FULL" }, plan: { tStrategy: "split", site: "B", ctSetup: "aggressive" } }),
    ]
    const match = { homeTeamId: me, awayTeamId: them, week: save.currentWeek }
    recordMapResults(save, match, { maps: [{ map: "de_mirage", ctStartTeamId: me, tStartTeamId: them, rounds, finalScore: { team1: 2, team2: 1 }, mvpPlayerId: "" }] as never, management: { teamId: me, playstyle: "aggressive", timeoutsUsed: 0, strategyCalls: 1, mode: "instant" } }, true)

    expect(save.mapRecords!.current.season).toBe(getSeasonNumber(save.currentWeek))
    expect(teamMapTally(save, me).de_mirage).toEqual([1, 1, 2, 1, 1, 1])
    expect(teamMapTally(save, them).de_mirage).toEqual([1, 0, 1, 0, 2, 1])
    const d = ownMapDetail(save, "current", "official").de_mirage
    expect(d.pistol).toEqual({ n: 1, won: 1 })
    expect(d.buys).toEqual({ FULL: { n: 1, won: 0 }, FORCE: { n: 1, won: 1 } })
    expect(d.ctSetups).toEqual({ "2-1-2": { n: 1, won: 1 }, "stack-A": { n: 1, won: 0 } })
    expect(d.tPlans).toEqual({ split: { n: 1, won: 1 } })
    expect(d.calls).toEqual({ FULL: { n: 1, won: 0 } })
    expect(d.playstyles).toEqual({ aggressive: { n: 1, won: 1 } })
    expect(rate(1, 3)).toBe(33)
})

test("friendlies count only for your own detail, and seasons roll over", () => {
    const { save, me, them } = setup()
    const rounds = [round(1, me, them, me)]
    const map = [{ map: "de_nuke", ctStartTeamId: me, tStartTeamId: them, rounds, finalScore: { team1: 1, team2: 0 }, mvpPlayerId: "" }] as never
    recordMapResults(save, { homeTeamId: me, awayTeamId: them, week: save.currentWeek }, { maps: map }, false)
    expect(teamMapTally(save, them)).toEqual({})
    expect(ownMapDetail(save, "current", "friendly").de_nuke.side).toEqual([1, 1, 1, 1, 0, 0])
    expect(ownMapDetail(save, "current", "official")).toEqual({})

    const nextSeasonWeek = save.currentWeek + 52
    expect(getSeasonNumber(nextSeasonWeek)).toBe(getSeasonNumber(save.currentWeek) + 1)
    recordMapResults(save, { homeTeamId: me, awayTeamId: them, week: nextSeasonWeek }, { maps: map }, true)
    expect(save.mapRecords!.previous!.season).toBe(getSeasonNumber(save.currentWeek))
    expect(teamMapTally(save, me, "current").de_nuke[0]).toBe(1)
    expect(ownMapDetail(save, "previous", "friendly").de_nuke.side[0]).toBe(1)
})

test("a new club starts a fresh own record", () => {
    const { save, me, them } = setup()
    const map = [{ map: "de_inferno", ctStartTeamId: me, tStartTeamId: them, rounds: [round(1, me, them, me)], finalScore: { team1: 1, team2: 0 }, mvpPlayerId: "" }] as never
    recordMapResults(save, { homeTeamId: me, awayTeamId: them, week: save.currentWeek }, { maps: map }, true)
    save.playerTeamId = them
    expect(ownMapDetail(save, "current", "official")).toEqual({})
    recordMapResults(save, { homeTeamId: me, awayTeamId: them, week: save.currentWeek }, { maps: map }, true)
    expect(ownMapDetail(save, "current", "official").de_inferno.side).toEqual([1, 0, 0, 0, 1, 0])
})

test("a played week fills your record from the real match", async () => {
    const save = createLaunchFixture("first-week")
    const config = { playerTeamId: save.playerTeamId, trainingFocus: new Map([[save.playerTeamId, { focus: TrainingFocus.AIM, intensity: 5 }]]) }
    const { save: after } = await computeWeek(save, config, 5)
    const played = after.completedMatches.filter(m => m.homeTeamId === save.playerTeamId || m.awayTeamId === save.playerTeamId)
    expect(played.length).toBeGreaterThan(0)
    const detail = Object.values({ ...ownMapDetail(after, "current", "official"), ...ownMapDetail(after, "current", "friendly") })
    const rounds = played.flatMap(m => m.result.maps).reduce((n, m) => n + m.rounds.length, 0)
    expect(detail.reduce((n, d) => n + d.side[2] + d.side[4], 0)).toBe(rounds)
    expect(detail.reduce((n, d) => n + Object.values(d.tPlans).reduce((k, c) => k + c.n, 0), 0)).toBeGreaterThan(0)
})
