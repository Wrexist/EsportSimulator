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
