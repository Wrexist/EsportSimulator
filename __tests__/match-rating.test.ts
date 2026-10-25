/**
 * Shown OVR = what the match engine plays (engine/match-rating.ts), and the
 * reputation bonus that used to sit on top of it is real skill, given once.
 * Measured agreement: docs/revamp/calibration/OVR_2026-10.md.
 */
import path from "path"
import { SnapshotLoader } from "@/data/snapshot-loader"
import { applyReputationLift, evaluatePlayer } from "@/engine/player-evaluation"
import { matchRating, overallFromMatchRating, reputationLift, MATCH_RATING_SIDE_CAP } from "@/engine/match-rating"
import { migrateToV11, runMigrationLadder } from "@/engine/save-migrations"
import { CURRENT_SAVE_VERSION, type GameSave, type PlayerSaveData } from "@/engine/save-types"

const base = (over: Partial<PlayerSaveData> = {}): PlayerSaveData => ({
    id: "p", name: "P", nickname: "P", age: 24, role: "RIFLER", skill: 60, rifle: 70, awp: 40, pistol: 60,
    grenades: 50, creativity: 50, clutch: 60, tactic: 50, leader: 50, teamwork: 50, reaction: 50, eyesight: 70,
    stressResistance: 50, potential: 70, ...over,
} as unknown as PlayerSaveData)

const ovr = (p: PlayerSaveData) => evaluatePlayer(p).overallRating

describe("OVR is the engine's strength", () => {
    test("OVR is the rounded match rating", () => {
        const p = base({ skill: 71, rifle: 85, trading: 60 } as never)
        expect(ovr(p)).toBe(overallFromMatchRating(matchRating(p as never)))
    })

    test("skill moves OVR point for point; reputation and experience do not move it", () => {
        expect(ovr(base({ skill: 70 })) - ovr(base({ skill: 60 }))).toBe(10)
        expect(ovr(base({ prestigeScore: 100, matchesPlayed: 600 } as never))).toBe(ovr(base()))
    })

    test("attributes the engine ignores do not move OVR; the ones it uses do, within the cap", () => {
        expect(ovr(base({ leader: 99, tactic: 99, teamwork: 99, creativity: 99, grenades: 99 }))).toBe(ovr(base()))
        expect(ovr(base({ trading: 90 } as never))).toBeGreaterThan(ovr(base()))
        expect(ovr(base({ rifle: 95 }))).toBeGreaterThan(ovr(base()))
        const maxed = base({ reaction: 99, clutch: 99, stressResistance: 99, eyesight: 99, pistol: 99, entry: 99, trading: 99 } as never)
        expect(matchRating(maxed as never) - matchRating(base() as never)).toBeLessThanOrEqual(MATCH_RATING_SIDE_CAP + 2)
    })

    test("an AWPer is rated on the AWP, everyone else on the rifle", () => {
        expect(ovr(base({ role: "AWPER", awp: 95 }))).toBeGreaterThan(ovr(base({ role: "AWPER", awp: 60 })))
        expect(ovr(base({ awp: 95 }))).toBe(ovr(base({ awp: 60 })))
    })
})

describe("reputation becomes real skill once", () => {
    test("lift is the old OVR prestige bonus", () => {
        expect(reputationLift(0)).toBe(0)
        expect(reputationLift(100)).toBe(25)
        expect(reputationLift(65)).toBe(13)
    })

    test("skill and potential rise together, capped at 99", () => {
        const p = base({ prestigeScore: 100, skill: 50, potential: 80 } as never)
        applyReputationLift(p)
        expect(p.skill).toBe(75)
        expect(p.potential).toBe(99)
    })

    test("save v11 lifts club players once and leaves legends alone", () => {
        const star = base({ id: "star", prestigeScore: 100, skill: 50 } as never)
        const legend = base({ id: "legend", prestigeScore: 100, skill: 90, isLegendary: true } as never)
        const v10 = { saveVersion: 10, currentWeek: 1, players: [star, legend] }
        const migrated = runMigrationLadder(structuredClone(v10)) as GameSave
        expect(migrated.saveVersion).toBe(CURRENT_SAVE_VERSION)
        const by = new Map(migrated.players.map(p => [p.id, p]))
        expect(by.get("star")!.skill).toBe(75)
        expect(by.get("legend")!.skill).toBe(90)
        // Already at v11: the ladder does not lift again.
        expect((runMigrationLadder(structuredClone(migrated)) as GameSave).players.find(p => p.id === "star")!.skill).toBe(75)
        expect(typeof migrateToV11).toBe("function")
    })
})

describe("new career: club OVR orders clubs the way the engine does", () => {
    let save: GameSave
    beforeAll(async () => {
        const loader = new SnapshotLoader(path.join(process.cwd(), "public/data/snapshot"))
        const loaded = await loader.loadSnapshot()
        if (!loaded.success) throw new Error(loaded.error)
        save = loader.createCareerFromSnapshot("Ratings", loader.getSnapshot()!.teams[0].id, 1)!
    })

    const clubOvr = (teamId: string) => {
        const t = save.teams.find(x => x.id === teamId)!
        const ps = t.rosterIds.map(id => save.players.find(p => p.id === id)!).filter(Boolean).slice(0, 5)
        return ps.reduce((s, p) => s + ovr(p), 0) / ps.length
    }

    test("elite clubs are stronger than semi-pro clubs, on average by 15+ OVR", () => {
        const mean = (tier: string) => {
            const ids = save.teams.filter(t => t.tier === tier && t.rosterIds.length >= 5).map(t => t.id)
            return ids.reduce((s, id) => s + clubOvr(id), 0) / ids.length
        }
        expect(mean("ELITE") - mean("SEMI_PRO")).toBeGreaterThan(15)
    })

    test("player OVR tracks the engine's duel rating", () => {
        const rostered = new Set(save.teams.flatMap(t => t.rosterIds))
        const ps = save.players.filter(p => rostered.has(p.id))
        const xs = ps.map(ovr), ys = ps.map(p => matchRating(p as never))
        const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length
        let sxy = 0, sxx = 0, syy = 0
        xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; syy += (ys[i] - my) ** 2 })
        expect(sxy / Math.sqrt(sxx * syy)).toBeGreaterThan(0.98)
    })
})
