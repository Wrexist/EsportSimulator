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
