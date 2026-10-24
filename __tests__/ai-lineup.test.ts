/**
 * G5: AI clubs field their best role-balanced five.
 */
import { bestAILineup, setAILineup } from "@/engine/ai/lineup"
import { evaluatePlayer } from "@/engine/player-evaluation"
import type { PlayerSaveData, TeamSaveData } from "@/engine/save-types"

const base = {
    age: 24, nationality: "SE", rifle: 70, awp: 50, pistol: 70, grenades: 70, creativity: 60, clutch: 60,
    tactic: 60, leader: 50, teamwork: 70, reaction: 70, eyesight: 70, morale: 70, form: 70, fatigue: 0,
    skill: 70, potential: 80, productivity: 60, endurance: 70,
}
const player = (id: string, role: string, over: Partial<PlayerSaveData> = {}) =>
    ({ ...base, id, nickname: id, role, ...over } as unknown as PlayerSaveData)

test("a benched AWPer and IGL move into the five over slightly better riflers", () => {
    const roster = [
        player("r1", "RIFLER", { skill: 74 }), player("r2", "RIFLER", { skill: 74 }), player("e", "ENTRY_FRAGGER", { skill: 72 }),
        player("s", "SUPPORT", { skill: 72 }), player("r3", "RIFLER", { skill: 73 }),
        player("awp", "AWPER", { skill: 71, awp: 85 }), player("igl", "IGL", { skill: 70, leader: 85, tactic: 85 }),
    ]
    const team = { id: "t", rosterIds: roster.map(p => p.id) } as unknown as TeamSaveData
    expect(setAILineup(team, new Map(roster.map(p => [p.id, p])), 10)).toBe(true)
    const five = team.rosterIds.slice(0, 5)
    expect(five).toEqual(expect.arrayContaining(["awp", "igl", "e", "s"]))
    expect(team.rosterIds).toHaveLength(7)
    // Already best: nothing changes.
    expect(setAILineup(team, new Map(roster.map(p => [p.id, p])), 10)).toBe(false)
})

test("a much stronger player still beats role coverage", () => {
    const roster = [
        player("a", "RIFLER", { skill: 90, rifle: 90, reaction: 90 }), player("b", "RIFLER", { skill: 70 }), player("c", "RIFLER", { skill: 70 }),
        player("d", "RIFLER", { skill: 70 }), player("e", "RIFLER", { skill: 70 }), player("weak", "AWPER", { skill: 40, rifle: 40, reaction: 40, awp: 72 }),
    ]
    const ovr = (p: PlayerSaveData) => evaluatePlayer(p, undefined, undefined, 10).overallRating
    const { five } = bestAILineup(roster, 10)
    const weakIn = five.some(p => p.id === "weak")
    // The AWPer only plays when he costs fewer overall points than one missing role.
    const replaced = Math.min(...roster.filter(p => p.id !== "weak").map(ovr))
    expect(weakIn).toBe(replaced - ovr(roster[5]) < 6)
})

test("injured players sit out", () => {
    const roster = [
        player("a", "RIFLER"), player("b", "RIFLER"), player("c", "RIFLER"), player("d", "RIFLER"),
        player("e", "RIFLER", { injury: { type: "x", weeksOut: 2 } } as Partial<PlayerSaveData>), player("f", "RIFLER", { skill: 50 }),
    ]
    const { five } = bestAILineup(roster, 10)
    expect(five.map(p => p.id)).not.toContain("e")
})
