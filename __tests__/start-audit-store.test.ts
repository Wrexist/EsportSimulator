/**
 * Start-screen audit fixes that live in the store (2026-11-03):
 *  START-03 deleting the loaded career closes it, so no later save writes it back
 *  START-09 a pro career starts without the manager's first-session guide
 *  START-10 club tags reach the career save (and older saves get them back);
 *           a created club cannot take a world club's name or tag
 *  START-16 a failed recovery has its own error code
 */
import { useGameStore } from "@/store/game-store"
import { saveManager } from "@/engine"
import { PlayerRole } from "@/types"
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

async function snapshotTeams() {
    const { snapshotLoader } = jest.requireMock("@/data") as typeof import("@/data")
    if (!snapshotLoader.getSnapshot()) await snapshotLoader.loadSnapshot()
    return snapshotLoader.getSnapshot()!.teams as unknown as { id: string; name: string; shortName: string; reputation: number }[]
}

afterEach(() => jest.restoreAllMocks())

test("START-10: every snapshot club keeps its tag in a new career", async () => {
    const teams = await snapshotTeams()
    await useGameStore.getState().initializeNewGame("Tags", teams[10].id)
    const byId = new Map(useGameStore.getState().teams.map(t => [t.id, t]))
    for (const st of teams.filter(t => t.shortName)) expect(byId.get(st.id)?.shortName).toBe(st.shortName)
}, 120_000)

test("START-10: loading an older career fills in missing tags, and keeps tags the save has", async () => {
    const teams = await snapshotTeams()
    await useGameStore.getState().initializeNewGame("Old tags", teams[12].id)
    const saveId = useGameStore.getState().saveId!
    const { save } = await saveManager.loadGame(saveId)
    const old = structuredClone(save!) as GameSave
    const tagged = teams.filter(t => t.shortName)
    old.teams.forEach(t => { delete t.shortName })
    const kept = old.teams.find(t => t.id === tagged[1].id)!
    kept.shortName = "MINE"
    expect((await saveManager.saveGame(old)).success).toBe(true)
    await useGameStore.getState().loadGame(saveId)
    const byId = new Map(useGameStore.getState().teams.map(t => [t.id, t]))
    expect(byId.get(tagged[0].id)?.shortName).toBe(tagged[0].shortName)
    expect(byId.get(tagged[1].id)?.shortName).toBe("MINE")
}, 120_000)

test("START-10: a created club cannot take a world club's name or tag", async () => {
    const teams = await snapshotTeams()
    const base = { region: "EU" as const, difficulty: "normal" as const, logoIndex: 0, primaryColor: "#112233", secondaryColor: "#445566" }
    await useGameStore.getState().initializeCustomTeam("Manager", { ...base, name: teams[0].name.toUpperCase(), shortName: "ZZQ" })
    expect(useGameStore.getState().error).toMatch(/name is already taken/)
    const tagged = teams.find(t => t.shortName && /^[A-Z0-9]{2,5}$/.test(t.shortName))!
    await useGameStore.getState().initializeCustomTeam("Manager", { ...base, name: "Brand New Club", shortName: tagged.shortName })
    expect(useGameStore.getState().error).toMatch(/tag is already in use/)
    await useGameStore.getState().initializeCustomTeam("Manager", { ...base, name: "Brand New Club", shortName: "ZZQ" })
    expect(useGameStore.getState().error ?? null).toBeNull()
    const s = useGameStore.getState()
    const club = s.teams.find(t => t.id === s.playerTeamId)!
    // START-11: it ranks last, one below the world's clubs.
    expect(club.worldRanking).toBe(teams.length + 1)
    // START-12: the crest is seeded the way the setup preview draws it.
    expect(club.customTeamData?.emblemSeed).toBe("created:Brand New Club")
}, 120_000)

test("START-03: deleting the loaded career closes it and nothing writes it back", async () => {
    const teams = await snapshotTeams()
    await useGameStore.getState().initializeNewGame("Other", teams[20].id)
    const otherId = useGameStore.getState().saveId!
    await useGameStore.getState().initializeNewGame("Doomed", teams[21].id)
    const doomedId = useGameStore.getState().saveId!

    // Deleting another career leaves the loaded one alone.
    await useGameStore.getState().deleteSaveInSlot(otherId)
    expect(useGameStore.getState().saveId).toBe(doomedId)
    expect(useGameStore.getState().playerTeamId).toBe(teams[21].id)

    await useGameStore.getState().deleteSaveInSlot(doomedId)
    const s = useGameStore.getState()
    expect(s.saveId).toBeNull()
    expect(s.playerTeamId).toBeNull()
    expect(s.isInitialized).toBe(false)
    expect(s.isLoading).toBe(false)
    // The next save (Ctrl+S, auto-save) has no career to write.
    const write = jest.spyOn(saveManager, "saveGame")
    await useGameStore.getState().saveGame()
    expect(write).not.toHaveBeenCalled()
    expect((await saveManager.loadGame(doomedId)).save).toBeFalsy()
    expect((await useGameStore.getState().listSaves()).some(slot => slot.saveId === doomedId)).toBe(false)
}, 120_000)

test("START-03: a failed delete keeps the loaded career open", async () => {
    const teams = await snapshotTeams()
    await useGameStore.getState().initializeNewGame("Stays", teams[22].id)
    const saveId = useGameStore.getState().saveId!
    jest.spyOn(saveManager, "deleteSave").mockResolvedValue({ success: false })
    await expect(useGameStore.getState().deleteSaveInSlot(saveId)).rejects.toThrow("could not be deleted")
    expect(useGameStore.getState().saveId).toBe(saveId)
    expect(useGameStore.getState().isLoading).toBe(false)
}, 120_000)

test("START-16: a recovery that finds no backup reports RECOVERY_FAILED", async () => {
    jest.spyOn(saveManager, "attemptRecovery").mockResolvedValue({ save: null, error: "No recoverable backup or cloud copy was found" } as never)
    expect(await useGameStore.getState().attemptSaveRecovery("save_broken")).toBe(false)
    expect(useGameStore.getState().lastLoadError).toEqual({ saveId: "save_broken", errorCode: "RECOVERY_FAILED", message: "No recoverable backup or cloud copy was found" })
})

test("START-09: a pro career starts without the manager's guide, and it cannot be replayed there", async () => {
    const teams = await snapshotTeams()
    const club = [...teams].sort((a, b) => a.reputation - b.reputation || a.id.localeCompare(b.id))[5]
    useGameStore.getState().setShowTutorialOnNewGame(true)
    await useGameStore.getState().initializeNewGame("Pro guide", club.id)
    expect(useGameStore.getState().firstSession?.status).toBe("active")
    expect(useGameStore.getState().startProCareer({ nickname: "zyro", role: PlayerRole.RIFLER })).toBe(true)
    expect(useGameStore.getState().firstSession?.status).toBe("dismissed")
    useGameStore.getState().triggerTutorial()
    expect(useGameStore.getState().firstSession?.status).toBe("dismissed")
}, 120_000)

test("START-04: replaying the guide on a club career brings it back", async () => {
    const teams = await snapshotTeams()
    await useGameStore.getState().initializeNewGame("Replay", teams[30].id)
    useGameStore.setState({ firstSession: { version: 2, status: "dismissed", reviewed: [] } })
    useGameStore.getState().triggerTutorial()
    expect(useGameStore.getState().firstSession?.status).toBe("active")
}, 120_000)
