/**
 * Crosscut audit fixes (2026-11-17). Electron items are checked through the
 * main-process harness (the real main.js in a vm) and the pure helpers, since
 * Electron itself cannot run in this environment.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import vm from "node:vm"
import { EventEmitter } from "node:events"

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadHandlers } = require("../scripts/launch/electron-handler-harness.cjs")
const { windowMinimumSize, fitBoundsToWorkArea } = require("../electron/window-bounds") as {
    windowMinimumSize: (bounds: { width?: number; height?: number }, limits: { minWidth: number; minHeight: number }) => { minWidth: number; minHeight: number }
    fitBoundsToWorkArea: (bounds: { width?: number; height?: number }, area: { x: number; y: number; width: number; height: number } | null, limits: { minWidth: number; minHeight: number; defaultWidth: number; defaultHeight: number }) => { width: number; height: number }
}

const root = path.join(__dirname, "..")
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8")

describe("Electron main process", () => {
    let directory: string
    beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), "esim-crosscut17-")) })
    afterEach(() => { fs.rmSync(directory, { recursive: true, force: true }) })

    function windowWithClose() {
        const win = Object.assign(new EventEmitter(), {
            webContents: { id: 7, mainFrame: { url: "http://localhost:3210/main-menu" }, getURL: () => "http://localhost:3210/main-menu", isDestroyed: () => false, send: jest.fn() },
            close: jest.fn(),
        })
        const harness = loadHandlers({ directory, nativeWindow: win, contents: win.webContents })
        harness.attachCloseHandler()
        return { win, ctx: harness.contexts["main.js"] }
    }

    test("CROSSCUT-03: before the first page has loaded, the window closes at once", () => {
        const { win, ctx } = windowWithClose()
        vm.runInContext("rendererBooted = false", ctx)
        const event = { preventDefault: jest.fn() }
        win.emit("close", event)
        expect(event.preventDefault).not.toHaveBeenCalled()
        expect(win.webContents.send).not.toHaveBeenCalled()
        expect(vm.runInContext("closePending", ctx)).toBe(false)
    })

    test("CROSSCUT-03: after boot the page is asked first (save handshake)", () => {
        const { win, ctx } = windowWithClose()
        const event = { preventDefault: jest.fn() }
        win.emit("close", event)
        expect(event.preventDefault).toHaveBeenCalledTimes(1)
        expect(win.webContents.send).toHaveBeenCalledWith("app-close-intent")
        expect(vm.runInContext("closePending", ctx)).toBe(true)
        vm.runInContext("closeHandshake.cancel()", ctx)
    })

    test("CROSSCUT-03: boot success arms the handshake, a closed window disarms it", () => {
        const main = read("electron/main.js")
        const boot = main.slice(main.indexOf("const markBootCompleted"), main.indexOf("const failBoot"))
        expect(boot).toMatch(/bootCompleted = true;\s*rendererBooted = true;/)
        const closed = main.slice(main.indexOf("mainWindow.on('closed'"), main.indexOf("} catch (error) {\n        console.error('[Electron] Failed to create window:'"))
        expect(closed).toContain("rendererBooted = false;")
    })

    test("CROSSCUT-04: the launch error page puts real line breaks between message and stack, in the game palette", () => {
        const harness = loadHandlers({ directory })
        const showErrorPage = vm.runInContext("showErrorPage", harness.contexts["main.js"])
        let url = ""
        showErrorPage({ loadURL: (u: string) => { url = u }, show() {} }, "Next.js server failed to start within 60s", "Error: boom\n    at x")
        const html = decodeURIComponent(url.slice("data:text/html;charset=utf-8,".length))
        expect(html).toContain("within 60s\n\nError: boom")
        expect(html).not.toContain("\\n")
        expect(html).toContain("background:#07090C")
        expect(html).toContain("color:#F2F4F7")
        expect(html).toContain("color:#FF5468")
        expect(html).not.toMatch(/#1a1a2e|#ff4444/)
    })
})

describe("CROSSCUT-05: the window minimum never exceeds a small work area", () => {
    const limits = { minWidth: 1024, minHeight: 640, defaultWidth: 1280, defaultHeight: 720 }
    test("1366x768 at 125% (work area about 1093x582): the window and its minimum fit", () => {
        const area = { x: 0, y: 0, width: 1093, height: 582 }
        const bounds = fitBoundsToWorkArea({ width: 1280, height: 720 }, area, limits)
        expect(bounds).toEqual({ width: 1093, height: 582 })
        expect(windowMinimumSize(bounds, limits)).toEqual({ minWidth: 1024, minHeight: 582 })
    })
    test("a normal screen keeps the UI minimum", () => {
        expect(windowMinimumSize({ width: 1280, height: 720 }, limits)).toEqual({ minWidth: 1024, minHeight: 640 })
        expect(windowMinimumSize({}, limits)).toEqual({ minWidth: 1024, minHeight: 640 })
    })
    test("main.js passes the fitted minimum, not the fixed one", () => {
        const main = read("electron/main.js")
        const ctor = main.slice(main.indexOf("mainWindow = new BrowserWindow({"), main.indexOf("webPreferences:", main.indexOf("mainWindow = new BrowserWindow({")))
        expect(ctor).toContain("...windowMinimumSize(initialBounds, WINDOW_LIMITS)")
        expect(ctor).not.toMatch(/minWidth: MIN_WIDTH/)
    })
})

describe("CROSSCUT-06: one not-found card for every match screen", () => {
    test("prep, veto and live render the shared card", () => {
        for (const file of ["app/match/[id]/tactics/page.tsx", "app/match/[id]/veto/page.tsx", "app/match/[id]/live/page.tsx"]) {
            const src = read(file)
            expect(src).toContain('import { MatchNotFound } from "@/components/match/MatchNotFound"')
            expect(src).toMatch(/return <MatchNotFound \/>/)
        }
        // The veto page's odd exit to Home is gone.
        expect(read("app/match/[id]/veto/page.tsx")).not.toContain('router.push("/")')
    })
    test("the card has an h1 and one way back to the schedule", () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const React = require("react") as typeof import("react")
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { renderToStaticMarkup } = require("react-dom/server") as typeof import("react-dom/server")
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { MatchNotFound } = require("@/components/match/MatchNotFound") as typeof import("@/components/match/MatchNotFound")
        const html = renderToStaticMarkup(React.createElement(MatchNotFound))
        expect(html).toMatch(/<h1[^>]*>Match not found<\/h1>/)
        expect(html).toContain('href="/schedule"')
        expect(html.match(/<a /g)).toHaveLength(1)
    })
})

describe("CROSSCUT-07: a locked staff meeting's reason stays readable", () => {
    test("the row is not dimmed as a whole; the reason is ink-2", () => {
        const src = read("components/schedule/BookStaffMeetingModal.tsx")
        expect(src).not.toContain('"opacity-60"')
        expect(src).toContain('<p className="text-xs leading-snug text-ink-2">{status.reason}</p>')
    })
})

describe("CROSSCUT-08: one name for a club's level and one spelling for tournament tiers", () => {
    test("the Welcome moment names the club level by world ranking, like New career and the club page", () => {
        const src = read("components/moments/WelcomeMomentView.tsx")
        expect(src).toContain("t(`ng.tier.${calculateTeamTier(team.worldRanking)}`)")
        expect(src).not.toContain("TIER_DISPLAY")
    })
    test("tournament tier labels are spelled one way per language", () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { COMMON } = require("@/locales/en/common") as { COMMON: Record<string, string> }
        for (const tier of ["S", "A", "B", "C"]) expect(COMMON[`common.tier.${tier}_TIER`]).toBe(`${tier}-Tier`)
        for (const lang of ["de", "es", "fr", "pl", "pt-BR", "ru"]) {
            const json = JSON.parse(read(`public/locales/${lang}.json`)) as Record<string, string>
            for (const tier of ["S", "A", "B", "C"]) expect(json[`sr.tier.${tier}_TIER`]).toBe(json[`common.tier.${tier}_TIER`])
        }
    })
})

describe("CROSSCUT-09/10/14/15: shell consistency", () => {
    test("09: Home and Calendar share the 1600 px content width of the other screens", () => {
        expect(read("app/page.tsx")).toContain('<div className="mx-auto max-w-[1600px] space-y-5 pb-12">')
        expect(read("app/schedule/page.tsx")).toContain('<div className="mx-auto max-w-[1600px] space-y-4 pb-10">')
    })
    test("10: the top-bar date uses the same numeric day as every other date", () => {
        const src = read("components/layout/TopBar.tsx")
        expect(src).not.toContain('day: "2-digit"')
        expect(src).toContain('formatGameCalendarDate(currentDate, { weekday: "short", day: "numeric", month: "short", year: "numeric" })')
    })
    test("14: programmatic focus targets (tabindex -1) get no ring; controls keep the gold one", () => {
        const css = read("app/globals.css")
        expect(css).toContain('[tabindex]:not([tabindex="-1"]):focus-visible {')
        expect(css).not.toMatch(/^\s*\[tabindex\]:focus-visible \{/m)
        const rule = css.slice(css.indexOf('[role="dialog"][tabindex="-1"]:focus-visible'))
        expect(rule.slice(0, rule.indexOf("}"))).toContain("outline: none;")
    })
    test("15: number keys do nothing while a dialog, menu or list is open", () => {
        const src = read("components/layout/GameShell.tsx")
        const guard = src.indexOf(`document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')`)
        expect(guard).toBeGreaterThan(-1)
        expect(guard).toBeLessThan(src.indexOf("NUMBER_KEY_ROUTES[e.key]"))
    })
})

describe("CROSSCUT-11: the loading splash adds no route stylesheet", () => {
    test("LoadingSplash uses global classes; the brand module keeps only the title hero", () => {
        const splash = read("components/brand/LoadingSplash.tsx")
        expect(splash).not.toContain("module.css")
        for (const cls of ["brand-splash", "brand-splash-track", "brand-splash-shimmer", "brand-splash-shimmer-static"]) {
            expect(splash).toContain(cls)
            expect(read("app/globals.css")).toContain(`.${cls}`)
        }
        expect(read("components/brand/brand.module.css")).not.toMatch(/\.splash|\.shimmer|\.track/)
    })
})

describe("CROSSCUT-12: Rich Presence follows the screen", () => {
    test("the sync is mounted once at the root and covers menu, career and live match", () => {
        expect(read("app/layout.tsx")).toContain("<SteamPresenceSync />")
        const sync = read("components/layout/SteamPresenceSync.tsx")
        for (const fn of ["buildMenuPresence()", "buildMatchPresence(", "buildRichPresence(", "steamService.setPresence(presence)"]) expect(sync).toContain(fn)
    })
})
