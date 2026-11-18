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
