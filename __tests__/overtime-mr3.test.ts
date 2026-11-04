/**
 * MATCHENGINE-06: after three tied overtime sets the map keeps going in MR3
 * sets (CS2), it is not decided by the next round.
 */
import { prepareLegacySeries } from "@/engine/match/legacy-prepare"
import { applyLegacyTransition, createLegacySeriesState, overtimeMapWinThreshold } from "@/engine/match/legacy-series"
import { buildSide, even } from "@/engine/match/calibration/fixtures"

function fourthSet(homeRounds: number, awayRounds: number, currentRound: number) {
    const home = buildSide({ id: "HOME", skills: even(70) }), away = buildSide({ id: "AWAY", skills: even(70) })
    const ctx = prepareLegacySeries({
        match: { id: "ot", seed: 3, format: "BO1", maps: ["Mirage"], engineVersion: "script-v1" },
        homeTeam: home.team, awayTeam: away.team, homePlayers: home.players, awayPlayers: away.players, staff: [], managedTeamId: "nobody",
    })
    const { sim } = createLegacySeriesState(ctx)
    Object.assign(sim, { isOvertime: true, currentOTSet: 4, homeRounds, awayRounds, currentRound })
    return { ctx, sim }
}

test("overtime thresholds keep growing by three", () => {
    expect([1, 2, 3, 4, 5].map(overtimeMapWinThreshold)).toEqual([16, 19, 22, 25, 28])
})

test("22-21 in the fourth overtime set does not end the map", () => {
    const { ctx, sim } = fourthSet(22, 21, 45)
    expect(applyLegacyTransition(ctx, sim)).toBe("NONE")
})

test("the fourth set is won at 25 (4-2 in the set)", () => {
    const { ctx, sim } = fourthSet(25, 23, 49)
    expect(applyLegacyTransition(ctx, sim)).toBe("SERIES_END")
    expect(sim.homeSeriesScore).toBe(1)
})

test("a fourth tied set starts a fifth with sides swapped", () => {
    const { ctx, sim } = fourthSet(24, 24, 49)
    expect(applyLegacyTransition(ctx, sim)).toBe("OVERTIME_SWITCH")
    expect(sim.currentOTSet).toBe(5)
})
