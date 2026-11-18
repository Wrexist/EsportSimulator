/**
 * Audit 2026-11-17, round 2 (r2feat): features and leftovers.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import vm from "node:vm"

describe("i18n leftover: the Electron boot-failure page is in the game's language", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { loadHandlers } = require("../scripts/launch/electron-handler-harness.cjs")
    let directory: string
    beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), "esim-r2feat-")) })
    afterEach(() => { fs.rmSync(directory, { recursive: true, force: true }) })

    function errorPage(harness: { contexts: Record<string, vm.Context> }): string {
        const showErrorPage = vm.runInContext("showErrorPage", harness.contexts["main.js"])
        let url = ""
        showErrorPage({ loadURL: (u: string) => { url = u }, show() {} }, "Renderer boot timeout", "Error: boom")
        return decodeURIComponent(url.slice("data:text/html;charset=utf-8,".length))
    }

    test("before the renderer reports, the language saved in the game's settings is used", () => {
        fs.mkdirSync(path.join(directory, "game-storage"))
        fs.writeFileSync(path.join(directory, "game-storage", "esports_device_game-settings.json"),
            JSON.stringify({ state: { language: "de" }, version: 1 }))
        const html = errorPage(loadHandlers({ directory }))
        expect(html).toContain('<html lang="de">')
        expect(html).toContain("<h1>Start fehlgeschlagen</h1>")
        expect(html).toContain(">Beenden</button>")
        expect(html).toContain("Eigenschaften &gt; Installierte Dateien")
        expect(html).not.toMatch(/Failed to launch|Quit</)
    })

    test("the renderer's reported language wins; no settings file falls back to English", async () => {
        const harness = loadHandlers({ directory })
        expect(errorPage(harness)).toContain("<h1>Failed to launch</h1>")
        expect(await harness.invoke("app-set-ui-language", "fr")).toBe(true)
        const html = errorPage(harness)
        expect(html).toContain('<html lang="fr">')
        expect(html).toContain("Le moteur du jeu n&#39;a pas pu démarrer.")
    })

    test("a damaged settings file is ignored", () => {
        fs.mkdirSync(path.join(directory, "game-storage"))
        fs.writeFileSync(path.join(directory, "game-storage", "esports_device_game-settings.json"), "{not json")
        expect(errorPage(loadHandlers({ directory }))).toContain('<html lang="en">')
    })
})

describe("i18n leftover: the workload warning's stored percent is shown in the language's style", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const i18n = require("@/lib/i18n") as typeof import("@/lib/i18n")
    beforeAll(() => {
        for (const lang of ["fr", "de"]) i18n.registerLocale(lang, JSON.parse(fs.readFileSync(path.join(__dirname, "..", "public", "locales", `${lang}.json`), "utf8")))
    })
    afterEach(() => i18n.setLocale("en"))

    test("stored params stay English; the rendered text is localized at read time", () => {
        const follows = { key: "ev.workload.follows", params: { risk: "0.4%" } }
        const message = { key: "ev.workload.m", params: { name: "k1ncu", fatigue: 70, risk: "<0.1%", rested: 40 } }
        expect(i18n.tRef(follows)).toBe("Injury chance 0.4% this week")
        i18n.setLocale("fr")
        expect(i18n.tRef(follows)).toMatch(/0,4\s%/u)
        expect(i18n.tRef(follows)).not.toContain("0.4%")
        expect(i18n.tRef(message)).toMatch(/<0,1\s%/u)
        i18n.setLocale("de")
        expect(i18n.tRef({ key: "ev.workload.follows", params: { risk: "12%" } })).toMatch(/12\s%/u)
        expect(i18n.tRefEn(follows)).toBe("Injury chance 0.4% this week")
        expect(follows.params.risk).toBe("0.4%")
    })

    test("anything that is not a plain percent is left alone", () => {
        expect(i18n.localizeStoredPercent("high")).toBe("high")
        expect(i18n.localizeStoredPercent("0.4")).toBe("0.4")
    })
})

describe("MODES-17: Finances names the difficulty behind the income multiplier", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { incomeDifficulty } = require("@/lib/career-difficulty") as typeof import("@/lib/career-difficulty")
    test("existing club on Hard, created club on Impossible, Normal and joined clubs show nothing", () => {
        expect(incomeDifficulty({ difficultySettings: { incomeMultiplier: 0.85 } }, "hard")).toEqual({ label: "Hard", factor: 0.85 })
        expect(incomeDifficulty({ difficultySettings: { incomeMultiplier: 0.6 }, customTeamData: { difficulty: "impossible" } }, "normal")).toEqual({ label: "Impossible", factor: 0.6 })
        expect(incomeDifficulty({ difficultySettings: { incomeMultiplier: 1 } }, "normal")).toBeNull()
        expect(incomeDifficulty({}, "hard")).toBeNull()
        expect(incomeDifficulty({ difficultySettings: { incomeMultiplier: 1.2 } }, "legendary")).toBeNull()
    })
    test("the finances page shows it under the income rows", () => {
        const src = fs.readFileSync(path.join(__dirname, "..", "app", "finances", "page.tsx"), "utf8")
        expect(src).toContain('t("fin.in.difficulty"')
        expect(src).toContain("incomeDifficulty(team, careerDifficulty)")
    })
})

describe("MODES-19: a pro trial offer names the starter to beat", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { proRival, ovrOf } = require("@/engine/pro-career") as typeof import("@/engine/pro-career")
    const STATS = ["skill", "rifle", "awp", "pistol", "grenades", "creativity", "clutch", "tactic", "leader", "teamwork", "reaction", "eyesight", "entry", "trading"]
    const flat = (id: string, role: string, v: number, over: Record<string, unknown> = {}) => ({
        id, nickname: id, name: id, age: 22, nationality: "Sweden", role, morale: 75, form: 70, fatigue: 0, energy: 100, maxEnergy: 100,
        level: 1, xp: 0, potential: 85, productivity: 60, endurance: 70, ...Object.fromEntries(STATS.map(k => [k, v])), ...over,
    }) as unknown as import("@/engine/save-types").PlayerSaveData
    const five = [["i", "IGL"], ["w", "AWPER"], ["e", "ENTRY_FRAGGER"], ["r", "RIFLER"], ["s", "SUPPORT"]].map(([id, role]) => flat(id, role, 70))

    test("the AWPer in the coach's five, with his OVR, not the bench AWPer", () => {
        const benchAwp = flat("w2", "AWPER", 60)
        const rival = proRival([...five, benchAwp], "AWPER" as never, 20)!
        expect(rival.player.id).toBe("w")
        expect(rival.ovr).toBe(ovrOf(five[1], 20))
    })
    test("an injured starter does not count; no starter in the role gives null", () => {
        const injured = five.map(p => p.id === "w" ? { ...p, injury: { weeksRemaining: 3 } } as typeof p : p)
        expect(proRival(injured, "AWPER" as never, 20)).toBeNull()
        expect(proRival(five.filter(p => p.role !== "IGL"), "IGL" as never, 20)).toBeNull()
    })
})

describe("NEWPLAYER-12: the first official win is celebrated when it is recorded", () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { produce, enableMapSet } = require("immer") as typeof import("immer")
    const { createLaunchFixture } = require("@/scripts/launch/fixtures") as typeof import("@/scripts/launch/fixtures")
    const { createMatchSimulationSlice } = require("@/store/slices/match-simulation-slice") as typeof import("@/store/slices/match-simulation-slice")
    const { getActivePlayersByRosterOrder } = require("@/lib/live-match-builders") as typeof import("@/lib/live-match-builders")
    const { prepareLegacySeries } = require("@/engine/match/legacy-prepare") as typeof import("@/engine/match/legacy-prepare")
    const { runLegacySeries, finalizeLegacySeries } = require("@/engine/match/legacy-series") as typeof import("@/engine/match/legacy-series")
    const { createDefaultTactics } = require("@/engine/default-tactics") as typeof import("@/engine/default-tactics")
    const { checkMilestones } = require("@/engine/milestone-checker") as typeof import("@/engine/milestone-checker")
    const { resetCelebrationToasts } = require("@/lib/celebration-toasts") as typeof import("@/lib/celebration-toasts")
    /* eslint-enable @typescript-eslint/no-require-imports */
    enableMapSet()
    type Save = import("@/engine/save-types").GameSave
    type Store = import("@/store/types").StoreState

    function harness(tournamentId: string | null) {
        const save = createLaunchFixture("first-week", 3921) as Save
        const m = save.scheduledMatches[0]
        m.tournamentId = tournamentId as never
        m.maps = ["Sandstone"] as never
        const own = save.teams.find(t => t.id === save.playerTeamId)!
        own.rosterIds.forEach(id => Object.assign(save.players.find(p => p.id === id)!, { skill: 95, rifle: 95, awp: 95, pistol: 95, tactic: 95, reaction: 95, eyesight: 95 }))
        let state = { ...save, customTactics: createDefaultTactics(), newsFeed: [], acknowledgedEventIds: [], addToast: jest.fn() } as unknown as Store
        const set = (fn: Partial<Store> | ((s: Store) => void)) => { state = typeof fn === "function" ? produce(state, fn) : { ...state, ...fn } }
        const slice = createMatchSimulationSlice(set as never, () => state)
        state = { ...state, ...slice }
        const home = save.teams.find(t => t.id === m.homeTeamId)!, away = save.teams.find(t => t.id === m.awayTeamId)!
        const ctx = prepareLegacySeries({
            match: m, homeTeam: home, awayTeam: away,
            homePlayers: getActivePlayersByRosterOrder(home, save.players), awayPlayers: getActivePlayersByRosterOrder(away, save.players),
            staff: save.staff as never, customTactics: createDefaultTactics(), managedTeamId: save.playerTeamId,
        })
        const result = finalizeLegacySeries(ctx, runLegacySeries(ctx).state)
        return { read: () => state, slice, match: m, result }
    }
    beforeEach(() => resetCelebrationToasts())

    test("an official win records ms_win_1 with the match id and toasts at once; the week tick does not repeat it", () => {
        const h = harness("league_eu_test")
        expect(h.result.winnerId).toBe(h.read().playerTeamId)
        h.slice.saveMatchResult(h.match.id, h.result)
        const s = h.read()
        const ev = s.eventsLog.find(e => e.id === "ms_win_1")
        expect(ev).toBeDefined()
        expect((ev!.data as { matchId?: string }).matchId).toBe(h.match.id)
        expect(s.acknowledgedEventIds).toContain("ms_win_1")
        expect((s as unknown as { addToast: jest.Mock }).addToast).toHaveBeenCalledWith({ message: "Your first win!", type: "achievement" })
        const fired = new Set([...s.acknowledgedEventIds, ...s.eventsLog.map(e => e.id)])
        expect(checkMilestones(s as unknown as Save, fired).map(x => x.id)).not.toContain("ms_win_1")
    })

    test("a friendly win is not the first win", () => {
        const h = harness(null)
        h.slice.saveMatchResult(h.match.id, h.result)
        expect(h.read().completedMatches).toHaveLength(1)
        expect(h.read().eventsLog.some(e => e.id === "ms_win_1")).toBe(false)
    })
})
