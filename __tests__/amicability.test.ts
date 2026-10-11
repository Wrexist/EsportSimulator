/**
 * Phase 5 fix: the snapshot gave every player amicability 70, so pair
 * synergy never varied with it and the dressing-room rift's "two cold
 * starters" could not happen. New careers and save v10 derive it from the
 * archetype and an id hash (engine/personality.ts).
 */
import path from "node:path"
import { SnapshotLoader } from "@/data/snapshot-loader"
import type { GameSave, PersonalityArchetype, PlayerSaveData, TeamSaveData } from "@/engine/save-types"
import { CURRENT_SAVE_VERSION } from "@/engine/save-types"
import { PERSONALITY_TUNING as T, STORY_TUNING as S } from "@/lib/balance-tuning"
import { SNAPSHOT_AMICABILITY, deriveAmicability, getArchetype, spreadPlaceholderAmicability } from "@/engine/personality"
import { migrateToV10, runMigrationLadder } from "@/engine/save-migrations"
import { SynergyCalculator } from "@/engine/synergy-calculator"
import { rift } from "@/engine/storylines/arcs/rift"
import { buildContext } from "@/engine/storylines/common"
import { createLaunchFixture } from "@/scripts/launch/fixtures"

async function snapshotCareer(): Promise<GameSave> {
    const loader = new SnapshotLoader(path.join(process.cwd(), "public/data/snapshot"))
    const res = await loader.loadSnapshot()
    expect(res.success).toBe(true)
    const teams = loader.getSnapshot()!.teams as unknown as TeamSaveData[]
    return loader.createCareerFromSnapshot("Amicability", teams[0].id, 1)!
}

const p = (id: string, archetype: PersonalityArchetype, amicability = SNAPSHOT_AMICABILITY, extra: Partial<PlayerSaveData> = {}) =>
    ({ id, nickname: id, amicability, personality: { archetype }, traits: [], ...extra }) as PlayerSaveData

describe("new careers", () => {
    let save: GameSave
    beforeAll(async () => { save = await snapshotCareer() }, 60_000)

    test("amicability is spread, not a constant: cold, warm and a rare toxic tail", () => {
        const players = save.players.filter(x => !x.isLegendary)
        const share = (f: (a: number) => boolean) => players.filter(x => f(x.amicability)).length / players.length
        expect(share(a => a === SNAPSHOT_AMICABILITY)).toBeLessThan(0.05)
        expect(share(a => a < S.RIFT_AMICABILITY)).toBeGreaterThan(0.05)
        expect(share(a => a < S.RIFT_AMICABILITY)).toBeLessThan(0.15)
        expect(share(a => a < 20)).toBeLessThan(0.02)
        expect(share(a => a >= 80)).toBeGreaterThan(0.05)
        for (const x of players) expect(x.amicability).toBe(deriveAmicability(x))
    })

    test("follows the archetype: Loyal and Leaders warmer than Hotheads and Mercenaries", () => {
        const mean = (a: PersonalityArchetype) => {
            const v = save.players.filter(x => !x.isLegendary && getArchetype(x) === a).map(x => x.amicability)
            return v.reduce((s, x) => s + x, 0) / v.length
        }
        expect(mean("LOYAL")).toBeGreaterThan(mean("MERCENARY") + 15)
        expect(mean("LEADER")).toBeGreaterThan(mean("HOTHEAD") + 20)
    })

    test("pair synergy and the rift's two-cold-starters case can now occur (in some clubs, not most)", () => {
        const byId = new Map(save.players.map(x => [x.id, x]))
        const fives = save.teams.map(t => t.rosterIds.slice(0, 5).map(id => byId.get(id)!).filter(Boolean))
        const coldPair = fives.filter(f => f.filter(x => x.amicability < S.RIFT_AMICABILITY).length >= 2).length
        expect(coldPair).toBeGreaterThan(0)
        expect(coldPair / fives.length).toBeLessThan(0.15)
        // A clashing pair (both under 40) scores 10 below the same pair at 70.
        const clash = fives.flat().filter(x => x.amicability < 40).slice(0, 2)
        expect(clash).toHaveLength(2)
        const [a, b] = clash
        const warm = SynergyCalculator.calculatePairSynergy({ ...a, amicability: 70 }, { ...b, amicability: 70 })
        expect(SynergyCalculator.calculatePairSynergy(a, b)).toBeLessThan(warm)
    })

    test("legends keep their own amicability", () => {
        const legends = save.players.filter(x => x.isLegendary)
        expect(legends.length).toBeGreaterThan(0)
        expect(new Set(legends.map(x => x.amicability)).size).toBeGreaterThan(3)
    })
})

describe("save v10", () => {
    const v9 = () => ({
        saveVersion: 9, saveId: "v9", saveName: "Old", currentWeek: 40, currentDay: 6, timeMode: "WEEKLY", playerTeamId: "t1",
        teams: [{ id: "t1", name: "T1", rosterIds: ["a", "b", "c", "d"], facilities: [], sponsors: [], fanbase: 0, branding: {} }],
        players: [
            p("a", "HOTHEAD"), p("b", "LOYAL"), p("c", "QUIET", 55),
            p("d", "LEADER", SNAPSHOT_AMICABILITY, { isLegendary: true }),
        ],
        legendaryPlayers: [], contracts: [], financeLedger: [], tournaments: [], scheduledMatches: [], completedMatches: [],
    })

    test("re-derives the placeholder, keeps real values and legends, deterministic and idempotent", () => {
        const migrated = runMigrationLadder(v9()) as GameSave
        expect(CURRENT_SAVE_VERSION).toBe(10)
        expect(migrated.saveVersion).toBe(10)
        const by = new Map(migrated.players.map(x => [x.id, x]))
        expect(by.get("a")!.amicability).toBe(deriveAmicability(by.get("a")!))
        expect(by.get("b")!.amicability).toBe(deriveAmicability(by.get("b")!))
        expect(by.get("a")!.amicability).not.toBe(by.get("b")!.amicability)
        expect(by.get("c")!.amicability).toBe(55)
        expect(by.get("d")!.amicability).toBe(SNAPSHOT_AMICABILITY)
        const once = migrateToV10(v9())
        expect(JSON.stringify(migrateToV10(structuredClone(once)))).toBe(JSON.stringify(once))
        expect(JSON.stringify(migrateToV10(v9()))).toBe(JSON.stringify(once))
    })

    test("the same spread as a new career: a hash of the id and the archetype's base", () => {
        const players = ["x1", "x2", "x3"].map(id => p(id, "MERCENARY"))
        expect(spreadPlaceholderAmicability(players)).toBeGreaterThan(0)
        for (const x of players) {
            expect(Math.abs(x.amicability - T.AMICABILITY_BASE.MERCENARY)).toBeLessThanOrEqual(T.AMICABILITY_SPREAD)
        }
    })
})

describe("dressing-room rift: two cold starters", () => {
    test("two starters under the rift threshold clash after two defeats in three", () => {
        const save = createLaunchFixture("first-week")
        const team = save.teams.find(t => t.id === save.playerTeamId)!
        const five = team.rosterIds.slice(0, 5).map(id => save.players.find(x => x.id === id)!)
        for (const x of five) { x.personality = { archetype: "PROFESSIONAL" }; x.amicability = 60 }
        five[1].amicability = 20
        five[3].amicability = 30
        const opp = save.teams.find(t => t.id !== team.id)!.id
        save.completedMatches = [0, 1, 2].map(i => ({
            id: `m${i}`, homeTeamId: team.id, awayTeamId: opp, tournamentId: "cup", week: save.currentWeek, day: i, format: "BO1", seed: 1,
            result: { homeScore: i === 0 ? 1 : 0, awayScore: i === 0 ? 0 : 1, winnerId: i === 0 ? team.id : opp, maps: [] },
        })) as unknown as GameSave["completedMatches"]
        const found = rift.detect(buildContext(save)).find(c => c.facts.reason === "CLASH")
        expect(found?.playerIds).toEqual([five[1].id, five[3].id])
    })
})
