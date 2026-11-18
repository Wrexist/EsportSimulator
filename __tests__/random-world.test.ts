/**
 * G14: a randomised world keeps the clubs, gives every active player a new
 * handle, and shuffles rosters (with their contracts) within league tiers.
 */
import { randomHandle, randomizeWorld, RANDOM_WORLD_TUNING } from "@/engine/random-world"
import { SeededRNG } from "@/engine/rng"
import type { GameSave } from "@/engine/save-types"
import { snapshotLoader } from "@/data"

jest.mock("@/data", () => {
    const actual = jest.requireActual("@/data")
    const { SnapshotLoader } = jest.requireActual("@/data/snapshot-loader")
    const nodePath = jest.requireActual("node:path")
    return { ...actual, snapshotLoader: new SnapshotLoader(nodePath.join(process.cwd(), "public/data/snapshot")) }
})
jest.setTimeout(120_000)

let base: GameSave
beforeAll(async () => {
    await snapshotLoader.loadSnapshot()
    const first = snapshotLoader.getSnapshot()!.teams[0]
    base = snapshotLoader.createCareerFromSnapshot("rw", first.id, 1)!
})

test("handles are short and readable", () => {
    const rng = new SeededRNG(7)
    for (let i = 0; i < 200; i++) expect(randomHandle(rng)).toMatch(/^[A-Za-z0-9]{3,12}$/)
})

test("new identities, same clubs, rosters shuffled within a tier with their contracts", () => {
    const save = structuredClone(base)
    randomizeWorld(save)
    expect(save.randomWorld).toBe(true)
    expect(save.teams.map(t => t.id)).toEqual(base.teams.map(t => t.id))

    const before = new Map(base.players.map(p => [p.id, p]))
    const active = save.players.filter(p => !p.isRetired)
    const oldHandles = new Set(base.players.map(p => p.nickname.toLowerCase()))
    expect(active.every(p => !oldHandles.has(p.nickname.toLowerCase()))).toBe(true)
    expect(new Set(active.map(p => p.nickname.toLowerCase())).size).toBe(active.length)
    for (const p of active) {
        const old = before.get(p.id)!
        expect(Math.abs(p.skill - old.skill)).toBeLessThanOrEqual(RANDOM_WORLD_TUNING.STAT_JITTER + 1)
        expect(p.potential).toBeGreaterThanOrEqual(p.skill)
    }

    // Same players overall, each club's roster comes from a club of its own tier.
    const rosterOwner = new Map(base.teams.flatMap(t => t.rosterIds.map(id => [id, t] as const)))
    let moved = 0
    for (const t of save.teams) {
        const owners = new Set(t.rosterIds.map(id => rosterOwner.get(id)!.id))
        expect(owners.size).toBeLessThanOrEqual(1)
        for (const id of t.rosterIds) { const o = rosterOwner.get(id)!; expect([o.leagueTier || o.tier, o.region]).toEqual([t.leagueTier || t.tier, t.region]) }
        if (t.rosterIds.length && !owners.has(t.id)) moved++
        for (const id of t.rosterIds) {
            const c = save.contracts.find(x => x.playerId === id)
            if (c) expect(c.teamId).toBe(t.id)
        }
    }
    expect(moved).toBeGreaterThan(save.teams.length / 3)
    expect(save.teams.flatMap(t => t.rosterIds).sort()).toEqual(base.teams.flatMap(t => t.rosterIds).sort())
})

test("same save, same world", () => {
    const a = structuredClone(base), b = structuredClone(base)
    randomizeWorld(a); randomizeWorld(b)
    expect(a.players.map(p => p.nickname)).toEqual(b.players.map(p => p.nickname))
    expect(a.teams.map(t => t.rosterIds)).toEqual(b.teams.map(t => t.rosterIds))
})

// NEWPLAYER-09: the randomised world is now the default for existing-club and
// no-club starts, so it has to keep the naming policy: clubs keep their
// look-alike names, maps keep their real CS names, new handles are invented
// and carry no real club or brand name.
test("NEWPLAYER-09: clubs, staff and maps keep their names; new handles are clean", () => {
    const { stripForbidden } = jest.requireActual("@/lib/safe-branding/name-transform") as typeof import("@/lib/safe-branding/name-transform")
    const { MAP_NAMES } = jest.requireActual("@/data/map-pool") as typeof import("@/data/map-pool")
    const mapsBefore = { ...MAP_NAMES }
    const save = structuredClone(base)
    randomizeWorld(save)
    expect(save.teams.map(t => [t.name, t.shortName])).toEqual(base.teams.map(t => [t.name, t.shortName]))
    expect(save.mapRotation).toEqual(base.mapRotation)
    expect(MAP_NAMES).toEqual(mapsBefore)
    expect(Object.values(MAP_NAMES)).toEqual(expect.arrayContaining(["Mirage", "Inferno", "Nuke", "Ancient", "Anubis"]))
    expect(JSON.stringify(save.staff ?? null)).toBe(JSON.stringify(base.staff ?? null))
    for (const p of save.players.filter(p => !p.isRetired)) expect(p.name).toBe(p.nickname)
    // Many worlds: no invented handle spells a real team or brand (a run once dealt "fazero").
    const bad: string[] = []
    for (let i = 0; i < 40; i++) {
        const world = structuredClone(base)
        world.saveId = `naming_${i}`
        randomizeWorld(world)
        for (const p of world.players) if (!p.isRetired && stripForbidden(p.nickname.toLowerCase()) !== p.nickname.toLowerCase()) bad.push(p.nickname)
    }
    expect(bad).toEqual([])
})

test("NEWPLAYER-09: the New Career switch starts on, and a player's 'off' survives a reload", () => {
    const fs = jest.requireActual("node:fs") as typeof import("node:fs")
    const src = fs.readFileSync("app/new-game/page.tsx", "utf8")
    expect(src).toMatch(/const \[randomWorld, setRandomWorld\] = useState\(true\)/)
    expect(src).toContain("setRandomWorld(draft.randomWorld ?? true)")
    const { normalizeCareerDraft } = jest.requireActual("@/lib/new-career-draft") as typeof import("@/lib/new-career-draft")
    expect(normalizeCareerDraft({ version: 1, managerName: "Neo", randomWorld: false })!.randomWorld).toBe(false)
    expect(normalizeCareerDraft({ version: 1, managerName: "Neo" })!.randomWorld).toBeUndefined()
})
