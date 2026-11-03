/**
 * START-01/02 (MARKET-04): the club picker shows the OVR and cash the career
 * actually starts with. The picker previews one world and hands that world to
 * initializeNewGame, so both read the same players, contracts and difficulty.
 */
import { useGameStore } from "@/store/game-store"
import { previewClubStart, difficultyStartingCash, createdClubStartRank, clubIdentityClash } from "@/lib/career-start-preview"
import { teamOvr } from "@/lib/team-ovr"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { randomizeWorld } from "@/engine/random-world"
import type { GameSave } from "@/engine/save-types"

jest.mock("@/data", () => {
    const actual = jest.requireActual("@/data")
    const { SnapshotLoader } = jest.requireActual("@/data/snapshot-loader")
    const nodePath = jest.requireActual("node:path")
    return { ...actual, snapshotLoader: new SnapshotLoader(nodePath.join(process.cwd(), "public/data/snapshot")) }
})
jest.mock("@/engine/worker/week-processor-bridge", () => {
    const { WeekProcessorBridge } = require("@/engine/worker/week-processor-client")
    return { weekProcessorBridge: new WeekProcessorBridge(() => { throw new Error("No browser worker in Node fixture") }) }
})
jest.mock("@/engine/manager-career-profile", () => ({ recordCareerProgress: jest.fn().mockResolvedValue(undefined), recordNewCampaign: jest.fn() }))

async function previewWorld(): Promise<GameSave> {
    const { snapshotLoader } = jest.requireMock("@/data") as typeof import("@/data")
    if (!snapshotLoader.getSnapshot()) await snapshotLoader.loadSnapshot()
    const first = snapshotLoader.getSnapshot()!.teams[0].id
    return snapshotLoader.createCareerFromSnapshot("", first, 1)!
}

/** What Home shows: the starting five's average OVR and the club's cash. */
function homeNumbers() {
    const s = useGameStore.getState()
    expect(s.error ?? null).toBeNull()
    const team = s.teams.find(t => t.id === s.playerTeamId)!
    const byId = new Map(s.players.map(p => [p.id, p]))
    const five = team.rosterIds.slice(0, 5).map(id => byId.get(id)!).filter(Boolean)
    return {
        homeOvr: Math.round(five.reduce((sum, p) => sum + evaluatePlayer(p).overallRating, 0) / five.length),
        teamOvr: teamOvr(team, s.players),
        startingBudget: (team as { startingBudget?: number }).startingBudget,
        budget: team.budget,
    }
}

test("difficulty cash matches the store's rounding", () => {
    expect(difficultyStartingCash(100_000, "normal")).toBe(100_000)
    expect(difficultyStartingCash(100_000, "hard")).toBe(60_000)
    expect(difficultyStartingCash(1_310_000, "easy")).toBe(1_965_000)
})

test("picker OVR and budget equal the started career's, at every difficulty, for elite, small and short-handed clubs", async () => {
    const world = await previewWorld()
    const ranked = [...world.teams].sort((a, b) => b.reputation - a.reputation)
    const shortHanded = world.teams.find(t => t.rosterIds.length > 0 && t.rosterIds.length < 5)
    const clubs = [ranked[0], ranked[Math.floor(ranked.length / 2)], ranked[ranked.length - 1], shortHanded].filter((t): t is NonNullable<typeof t> => !!t)
    // The old picker rated the raw snapshot player: about 30 OVR under the career for top clubs.
    expect(previewClubStart(world, ranked[0].id)!.ovr).toBeGreaterThan(70)
    for (const club of clubs) {
        for (const difficulty of ["normal", "hard", "easy"] as const) {
            const preview = previewClubStart(world, club.id, difficulty)!
            await useGameStore.getState().initializeNewGame("Preview check", club.id, undefined, { world: structuredClone(world), difficulty })
            const home = homeNumbers()
            expect({ club: club.id, difficulty, ovr: preview.ovr, budget: preview.budget })
                .toEqual({ club: club.id, difficulty, ovr: home.teamOvr, budget: home.startingBudget })
            expect(preview.ovr).toBe(home.homeOvr)
            expect(preview.budget).toBe(home.budget)
        }
    }
}, 600_000)

test("a randomised world previews the shuffled rosters the career gets", async () => {
    const world = structuredClone(await previewWorld())
    randomizeWorld(world)
    const club = [...world.teams].sort((a, b) => b.reputation - a.reputation)[3]
    const preview = previewClubStart(world, club.id, "hard")!
    await useGameStore.getState().initializeNewGame("Random check", club.id, undefined, { world: structuredClone(world), randomWorld: true, difficulty: "hard" })
    const s = useGameStore.getState()
    expect(s.randomWorld).toBe(true)
    // Not randomised a second time: the roster is the one the picker previewed.
    expect(s.teams.find(t => t.id === club.id)!.rosterIds).toEqual(club.rosterIds)
    const home = homeNumbers()
    expect(preview.ovr).toBe(home.teamOvr)
    expect(preview.budget).toBe(home.startingBudget)
}, 300_000)

test("a created club starts below every club, and duplicate names or tags are caught", () => {
    expect(createdClubStartRank(198)).toBe(199)
    const clubs = [{ name: "Natus Vincera", shortName: "NAT" }, { name: "Prucyon", shortName: undefined }]
    expect(clubIdentityClash(" natus vincera ", "nat", clubs)).toEqual({ name: true, tag: true })
    expect(clubIdentityClash("Prucyon Two", "PRU", clubs)).toEqual({ name: false, tag: false })
    expect(clubIdentityClash("", "", clubs)).toEqual({ name: false, tag: false })
})
