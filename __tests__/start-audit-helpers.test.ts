/**
 * Start-screen audit fixes (2026-11-03), pure helpers:
 *  START-05 / CROSSCUT-09 route rules, START-06/07 the new-career draft,
 *  START-10/13 created-club checks, START-18 window mode, CROSSCUT-06 the
 *  window size clamp in electron/window-bounds.js.
 */
import { escapeGoesBack, requiresCareer } from "@/lib/career-routes"
import { normalizeWindowMode, windowModeForFullscreen } from "@/lib/window-mode"
import { normalizeCareerDraft } from "@/lib/new-career-draft"
import { createCustomTeam } from "@/engine/team-creator"
import { backfillTeamTags } from "@/lib/career-start-preview"
import { CLUB_NAME_MAX } from "@/types/team-creator"

const { clampWindowSize } = require("../electron/window-bounds") as {
    clampWindowSize: (w: unknown, h: unknown, area: { width: number; height: number } | undefined, limits: { minWidth: number; minHeight: number; defaultWidth: number; defaultHeight: number }) => { width: number; height: number }
}

describe("CROSSCUT-09: career screens need a career", () => {
    test.each(["/", "/squad", "/desktop", "/match/x/live", "/team/abc", "/finances", "/week"])("%s needs one", path => {
        expect(requiresCareer(path)).toBe(true)
    })
    test.each(["/main-menu", "/new-game", "/new-game/create-team", "/load-game", "/settings", "/settings/sandbox", "/credits", "/map-editor/lab", "/dev"])("%s works without one", path => {
        expect(requiresCareer(path)).toBe(false)
    })
    test("a lookalike prefix is still a career screen", () => expect(requiresCareer("/settingsx")).toBe(true))
})

describe("START-05: Escape goes back except where back leaves or reopens setup", () => {
    test.each(["/", "/main-menu", "/new-game", "/new-game/pro"])("%s stays", path => expect(escapeGoesBack(path)).toBe(false))
    test.each(["/squad", "/settings", "/load-game", "/match/x/result"])("%s goes back", path => expect(escapeGoesBack(path)).toBe(true))
})

describe("START-18: window mode", () => {
    test("borderless was fullscreen and reads as it", () => {
        expect(normalizeWindowMode("borderless")).toBe("fullscreen")
        expect(normalizeWindowMode("fullscreen")).toBe("fullscreen")
        expect(normalizeWindowMode("windowed")).toBe("windowed")
        expect(normalizeWindowMode("bogus", "fullscreen")).toBe("fullscreen")
    })
    test("F11 and the OS set the matching mode", () => {
        expect(windowModeForFullscreen(true)).toBe("fullscreen")
        expect(windowModeForFullscreen(false)).toBe("windowed")
    })
    test("the settings store keeps only the two modes", () => {
        const { useSettingsStore } = require("@/lib/settings-store") as typeof import("@/lib/settings-store")
        useSettingsStore.getState().setWindowMode("borderless" as never)
        expect(useSettingsStore.getState().windowMode).toBe("fullscreen")
        useSettingsStore.getState().setWindowMode("windowed")
        expect(useSettingsStore.getState().windowMode).toBe("windowed")
    })
})

describe("CROSSCUT-06: resolution never exceeds the display's work area", () => {
    const limits = { minWidth: 1024, minHeight: 640, defaultWidth: 1280, defaultHeight: 720 }
    test("1920x1080 on a 1366x768 work area fits the work area", () => {
        expect(clampWindowSize(1920, 1080, { width: 1366, height: 728 }, limits)).toEqual({ width: 1366, height: 728 })
    })
    test("a size that fits is kept", () => {
        expect(clampWindowSize(1600, 900, { width: 1920, height: 1040 }, limits)).toEqual({ width: 1600, height: 900 })
    })
    test("the minimum still applies, unless the screen is smaller than it", () => {
        expect(clampWindowSize(800, 500, { width: 1920, height: 1040 }, limits)).toEqual({ width: 1024, height: 640 })
        expect(clampWindowSize(1280, 720, { width: 1000, height: 600 }, limits)).toEqual({ width: 1000, height: 600 })
    })
    test("bad input falls back to the default size", () => {
        expect(clampWindowSize("x", undefined, undefined, limits)).toEqual({ width: 1280, height: 720 })
    })
    test("main.js clamps window-set-size to the matching display", () => {
        const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "../electron/main.js"), "utf8") as string
        const handler = src.slice(src.indexOf("handleApp('window-set-size'"), src.indexOf("handleApp('window-get-size'"))
        expect(handler).toMatch(/screen\.getDisplayMatching\(mainWindow\.getBounds\(\)\)/)
        expect(handler).toMatch(/clampWindowSize\(/)
        expect(src).toMatch(/webContents\.send\('window-fullscreen-changed'/)
    })
})

describe("START-06/07: the new-career draft", () => {
    test("keeps difficulty, randomised world and the step", () => {
        expect(normalizeCareerDraft({ version: 1, managerName: "Neo", difficulty: "hard", randomWorld: true, step: "team-select" }))
            .toMatchObject({ difficulty: "hard", randomWorld: true, step: "team-select" })
    })
    test("drops values it does not know", () => {
        const d = normalizeCareerDraft({ version: 1, managerName: "Neo", difficulty: "nightmare", randomWorld: "yes", step: "pro" })!
        expect(d.difficulty).toBeUndefined()
        expect(d.randomWorld).toBeUndefined()
        expect(d.step).toBeUndefined()
    })
    test("a created club's name is cut at the club name limit", () => {
        const d = normalizeCareerDraft({ version: 1, managerName: "Neo", custom: { name: "x".repeat(60), shortName: "ABC", difficulty: "normal", region: "EU", logoIndex: 0, primaryColor: "#000000", secondaryColor: "#ffffff" } })!
        expect(d.custom!.name.length).toBe(CLUB_NAME_MAX)
    })
})

describe("START-10/13: creating a club", () => {
    const base = { shortName: "NEW", region: "EU" as const, difficulty: "normal" as const, logoIndex: 0, primaryColor: "#000000", secondaryColor: "#ffffff" }
    const world = [{ name: "Natus Vincera", shortName: "NAT" }]
    test("a world club's name or tag is refused", () => {
        expect(createCustomTeam({ ...base, name: "natus vincera " }, world).success).toBe(false)
        expect(createCustomTeam({ ...base, name: "Natus Two", shortName: "NAT" }, world).success).toBe(false)
        expect(createCustomTeam({ ...base, name: "Natus Two" }, world).success).toBe(true)
    })
    test("a name over the limit is refused", () => {
        expect(createCustomTeam({ ...base, name: "x".repeat(CLUB_NAME_MAX + 1) }).success).toBe(false)
        expect(createCustomTeam({ ...base, name: "x".repeat(CLUB_NAME_MAX) }).success).toBe(true)
    })
    test("tag backfill fills only missing tags", () => {
        const teams: { id: string; shortName?: string }[] = [{ id: "a" }, { id: "b", shortName: "KEEP" }, { id: "c" }]
        expect(backfillTeamTags(teams, [{ id: "a", shortName: "AAA" }, { id: "b", shortName: "BBB" }])).toBe(1)
        expect(teams).toEqual([{ id: "a", shortName: "AAA" }, { id: "b", shortName: "KEEP" }, { id: "c" }])
    })
})
