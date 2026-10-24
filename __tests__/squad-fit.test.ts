/**
 * G3: dressing-room fit before signing lists only effects the weekly
 * dressing-room step and the captain/mentor rules apply, and respects the
 * scouting fog (rating estimate, leader only when revealed).
 */

import type { ContractSaveData, PlayerSaveData, TeamSaveData } from "@/engine/save-types"
import { squadFit } from "@/engine/squad-fit"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { PERSONALITY_TUNING as T } from "@/lib/balance-tuning"

function makePlayer(id: string, overrides: Partial<PlayerSaveData> = {}): PlayerSaveData {
    return {
        id, nickname: id, firstName: id, lastName: "P", age: 22, nationality: "US",
        role: "Rifler",
        rifle: 50, awp: 40, pistol: 50, grenades: 40, creativity: 40, clutch: 40,
        tactic: 50, leader: 40, teamwork: 50, reaction: 50, eyesight: 50,
        morale: 75, form: 70, fatigue: 0, energy: 100, maxEnergy: 100,
        level: 1, xp: 0, xpToNextLevel: 1000, availableSkillPoints: 0, talentPoints: 0,
        unlockedTalentIds: [], majorWins: 0, matchesPlayed: 0,
        totalKills: 0, totalDeaths: 0, totalMVPs: 0,
        salary: 1000, contractWeeks: 52,
        skill: 50, potential: 90, productivity: 60, endurance: 70,
        // Same archetype for every fixture (no training modifier), so each
        // test compares only the variable it sets (Phase 5.2).
        personality: { archetype: "QUIET" },
        ...overrides,
    } as unknown as PlayerSaveData
}

function makeTeam(overrides: Partial<TeamSaveData> = {}): TeamSaveData {
    return {
        id: "t1", name: "Team", shortName: "T", budget: 100_000,
        rosterIds: [], staffIds: [], trophies: [], facilities: [], sponsors: [],
        fanbase: 1000, playstyle: "default", reputation: 50, region: "EU",
        facilitiesLevel: 0,
        ...overrides,
    } as unknown as TeamSaveData
}


const stats = (v: number) => ({ rifle: v, awp: v, pistol: v, grenades: v, creativity: v, clutch: v, tactic: v, teamwork: v, reaction: v, eyesight: v, skill: v })
const contract = (playerId: string, salaryPerWeek: number): ContractSaveData => ({ id: `c_${playerId}`, playerId, teamId: "t1", salaryPerWeek, endWeek: 999 } as unknown as ContractSaveData)

function setup(targetOverrides: Partial<PlayerSaveData>, mateOverrides: Partial<PlayerSaveData> = {}) {
    const mates = [
        makePlayer("ace", { ...stats(85), personality: { archetype: "MERCENARY" }, ...mateOverrides } as Partial<PlayerSaveData>),
        ...["a", "b", "c", "d"].map(id => makePlayer(id, stats(70))),
    ]
    const target = makePlayer("new", { ...stats(60), ...targetOverrides })
    const team = makeTeam({ rosterIds: mates.map(p => p.id) })
    const byId = new Map([...mates, target].map(p => [p.id, p]))
    const contracts = [contract("ace", 2000), ...["a", "b", "c", "d"].map(id => contract(id, 3000))]
    const rating = evaluatePlayer(target, undefined, undefined, 5).overallRating
    return { target, team, lookup: (id: string) => byId.get(id), contracts, rating }
}

describe("squadFit", () => {
    test("warns when a wage-minded starter would earn under the fairness share of a lower-rated newcomer", () => {
        const s = setup({})
        const lines = squadFit({ ...s, team: s.team as TeamSaveData, currentWeek: 5, wage: 5000, visible: { rating: s.rating, exact: true } })
        expect(lines.some(l => l.tone === "warn" && l.text.startsWith("ace (Mercenary"))).toBe(true)
        const fair = squadFit({ ...s, team: s.team as TeamSaveData, currentWeek: 5, wage: Math.floor(2000 / T.WAGE_FAIRNESS_SHARE) - 100, visible: { rating: s.rating, exact: true } })
        expect(fair.some(l => l.text.startsWith("ace (Mercenary"))).toBe(false)
    })

    test("a strong signing names the starter he would push to the bench", () => {
        const s = setup(stats(90))
        const lines = squadFit({ ...s, team: s.team as TeamSaveData, currentWeek: 5, wage: 1000, visible: { rating: s.rating, exact: true } })
        expect(lines.some(l => /^Rated above (a|b|c|d) /.test(l.text))).toBe(true)
    })

    test("unscouted: uses the estimate and hides the captain line without a revealed leader stat", () => {
        const s = setup({ ...stats(90), leader: 99, personality: { archetype: "LEADER" } } as Partial<PlayerSaveData>)
        const hidden = squadFit({ ...s, team: s.team as TeamSaveData, currentWeek: 5, wage: 1000, visible: { rating: s.rating, exact: false } })
        expect(hidden.some(l => l.text.startsWith("Rated about above"))).toBe(true)
        expect(hidden.some(l => l.text.includes("captain"))).toBe(false)
        const shown = squadFit({ ...s, team: s.team as TeamSaveData, currentWeek: 5, wage: 1000, visible: { rating: s.rating, exact: true, leader: 99 } })
        expect(shown.some(l => l.tone === "good" && l.text.includes("better captain"))).toBe(true)
    })

    test("young signing with a veteran Professional on the roster gets the mentor line", () => {
        const s = setup({ age: 19 }, { age: 30, personality: { archetype: "PROFESSIONAL" } } as Partial<PlayerSaveData>)
        const lines = squadFit({ ...s, team: s.team as TeamSaveData, currentWeek: 5, wage: 1000, visible: { rating: s.rating, exact: true } })
        expect(lines.some(l => l.tone === "good" && l.text.startsWith("ace (Professional) can mentor him"))).toBe(true)
    })
})
