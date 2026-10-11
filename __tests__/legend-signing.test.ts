/**
 * The Major-win legend pick states what signing does to the squad cap: a
 * legend may take the squad over SENIOR_ROSTER_MAX, and the quote says so.
 */
import { quoteLegendSigning } from "@/lib/legend-signing"
import { SENIOR_ROSTER_MAX } from "@/engine/roster-rules"
import type { PlayerSaveData, TeamSaveData } from "@/engine/save-types"

const player = (id: string, skill = 70) => ({ id, nickname: id, skill, age: 25, role: "RIFLER", isRetired: false } as unknown as PlayerSaveData)

function state(rosterSize: number) {
    const roster = Array.from({ length: rosterSize }, (_, i) => `p${i}`)
    const team = { id: "us", name: "Us", budget: 50_000_000, rosterIds: roster, staffIds: [], facilities: [], sponsors: [], fanbase: 1000, reputation: 50 } as unknown as TeamSaveData
    return {
        teams: [team],
        players: [...roster.map(id => player(id)), player("legend", 99)],
        contracts: roster.map(id => ({ playerId: id, teamId: "us", salaryPerWeek: 1000, startWeek: 1, endWeek: 100, buyout: 0 })),
        staff: [], currentWeek: 10, playerTeamId: "us", academyPlayers: [],
    }
}

describe("quoteLegendSigning", () => {
    test("below the cap: no squad note", () => {
        const q = quoteLegendSigning(state(5), "legend")!
        expect(q.rosterAfter).toBe(6)
        expect(q.overCap).toBe(false)
    })

    test("at the cap: the quote reports the squad going over it", () => {
        const q = quoteLegendSigning(state(SENIOR_ROSTER_MAX), "legend")!
        expect(q.rosterAfter).toBe(SENIOR_ROSTER_MAX + 1)
        expect(q.overCap).toBe(true)
    })
})
