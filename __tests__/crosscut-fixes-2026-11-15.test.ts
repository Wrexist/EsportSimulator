/**
 * Crosscut audit fixes (2026-11-15):
 *  CROSSCUT-03 Space on a focused control, CROSSCUT-14 UI scale capped by
 *  window size, CROSSCUT-06/07/08 Electron crash prompt, restored window
 *  bounds and quitting with the last window.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import vm from "node:vm"
import { effectiveUiScale, maxUiScaleFor, UI_SCALE_MAX } from "@/lib/ui-scale"
import { isSpaceOwnedByFocus } from "@/lib/keyboard-shortcuts"

const { fitBoundsToWorkArea } = require("../electron/window-bounds") as {
    fitBoundsToWorkArea: (bounds: { width?: number; height?: number; x?: number; y?: number }, area: { x: number; y: number; width: number; height: number } | null, limits: { minWidth: number; minHeight: number; defaultWidth: number; defaultHeight: number }) => { width: number; height: number; x?: number; y?: number }
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadHandlers } = require("../scripts/launch/electron-handler-harness.cjs")

describe("CROSSCUT-14: the UI scale never leaves less than the minimum layout", () => {
    test("the cap follows the window", () => {
        expect(maxUiScaleFor({ width: 1024, height: 640 })).toBe(100)
        expect(maxUiScaleFor({ width: 1280, height: 720 })).toBe(110)
        expect(maxUiScaleFor({ width: 1366, height: 768 })).toBe(120)
        expect(maxUiScaleFor({ width: 1920, height: 1080 })).toBe(150)
        expect(maxUiScaleFor({ width: 3840, height: 2160 })).toBe(150)
    })
    test("a window smaller than the minimum keeps 100%, unknown windows are not capped", () => {
        expect(maxUiScaleFor({ width: 800, height: 600 })).toBe(100)
        expect(maxUiScaleFor(null)).toBe(UI_SCALE_MAX)
        expect(maxUiScaleFor({ width: NaN, height: 0 })).toBe(UI_SCALE_MAX)
    })
    test("the scaled page is never smaller than 1024x640 CSS px when it can be avoided", () => {
        for (let w = 1024; w <= 3840; w += 64) {
            for (const h of [640, 720, 768, 900, 1080, 1440]) {
                const s = maxUiScaleFor({ width: w, height: h }) / 100
                if (s > 1) {
                    expect(w / s).toBeGreaterThanOrEqual(1024)
                    expect(h / s).toBeGreaterThanOrEqual(640)
                }
            }
        }
    })
    test("a picked scale is applied capped but kept as the choice", () => {
        expect(effectiveUiScale({ uiScale: 150, uiScaleAuto: false }, { width: 1280, height: 720 })).toBe(110)
        expect(effectiveUiScale({ uiScale: 150, uiScaleAuto: false }, { width: 1920, height: 1080 })).toBe(150)
        expect(effectiveUiScale({ uiScale: 90, uiScaleAuto: false }, { width: 1024, height: 640 })).toBe(90)
        expect(effectiveUiScale({ uiScale: 100, uiScaleAuto: true }, { width: 2560, height: 1440 })).toBe(125)
    })
})

describe("CROSSCUT-03: Space presses the focused control instead of advancing time", () => {
    const fakeTarget = (match: boolean) => ({ closest: jest.fn(() => (match ? {} : null)) })
    test("a focused button, link, tab or switch owns Space", () => {
        const target = fakeTarget(true)
        expect(isSpaceOwnedByFocus(target as unknown as EventTarget)).toBe(true)
        const selector = (target.closest.mock.calls[0] as unknown as string[])[0]
        for (const owner of ["button", "a[href]", "summary", '[role="tab"]', '[role="switch"]', '[role="checkbox"]', '[role="menuitem"]', '[role="slider"]']) {
            expect(selector).toContain(owner)
        }
        // A focusable scroll region opts in; the main region (tabindex -1) does not.
        expect(selector).toContain('[tabindex]:not([tabindex="-1"])')
    })
    test("nothing focused (or plain content) leaves Space to Continue", () => {
        expect(isSpaceOwnedByFocus(fakeTarget(false) as unknown as EventTarget)).toBe(false)
        expect(isSpaceOwnedByFocus(null)).toBe(false)
        expect(isSpaceOwnedByFocus({} as EventTarget)).toBe(false)
    })
    test("the global handler checks it before advancing", () => {
        const src = fs.readFileSync(path.join(__dirname, "../components/layout/GameShell.tsx"), "utf8")
        const space = src.slice(src.indexOf('if (e.key === " "'))
        expect(space.indexOf("isSpaceOwnedByFocus(e.target)")).toBeGreaterThan(-1)
        expect(space.indexOf("isSpaceOwnedByFocus(e.target)")).toBeLessThan(space.indexOf("continueToNextDecision"))
    })
})

describe("CROSSCUT-07: restored window bounds fit the screen", () => {
    const limits = { minWidth: 1024, minHeight: 640, defaultWidth: 1280, defaultHeight: 720 }
    const laptop = { x: 0, y: 0, width: 1920, height: 1040 }
    test("a 1440p window restored on a 1080p laptop is shrunk and moved inside", () => {
        expect(fitBoundsToWorkArea({ x: 0, y: 0, width: 2560, height: 1440 }, laptop, limits)).toEqual({ x: 0, y: 0, width: 1920, height: 1040 })
        expect(fitBoundsToWorkArea({ x: 600, y: 300, width: 1600, height: 900 }, laptop, limits)).toEqual({ x: 320, y: 140, width: 1600, height: 900 })
    })
    test("a window that fits keeps its place; a second monitor's origin is respected", () => {
        expect(fitBoundsToWorkArea({ x: 100, y: 50, width: 1280, height: 720 }, laptop, limits)).toEqual({ x: 100, y: 50, width: 1280, height: 720 })
        expect(fitBoundsToWorkArea({ x: 1800, y: -20, width: 1280, height: 720 }, { x: 1920, y: 0, width: 1920, height: 1040 }, limits)).toEqual({ x: 1920, y: 0, width: 1280, height: 720 })
    })
    test("no position: only the size is fitted", () => {
        expect(fitBoundsToWorkArea({ width: 2560, height: 1440 }, laptop, limits)).toEqual({ width: 1920, height: 1040 })
        expect(fitBoundsToWorkArea({ width: 1280, height: 720 }, null, limits)).toEqual({ width: 1280, height: 720 })
    })
})

describe("Electron main process (harness)", () => {
    let directory: string
    beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), "esim-crosscut-")) })
    afterEach(() => { fs.rmSync(directory, { recursive: true, force: true }) })

    test("CROSSCUT-07: launch bounds use the display the window opens on", () => {
        const harness = loadHandlers({ directory })
        const ctx = harness.contexts["main.js"]
        const laptop = { workArea: { x: 0, y: 0, width: 1920, height: 1040 } }
        vm.runInContext("screen.getAllDisplays = () => [testDisplay]; screen.getDisplayNearestPoint = () => testDisplay; screen.getPrimaryDisplay = () => testDisplay;", Object.assign(ctx, { testDisplay: laptop }))
        const resolve = vm.runInContext("resolveInitialBounds", ctx)
        expect(resolve({ x: 0, y: 0, width: 2560, height: 1440 })).toEqual({ x: 0, y: 0, width: 1920, height: 1040 })
        expect(resolve({ width: 2560, height: 1440 })).toEqual({ width: 1920, height: 1040 })
        // Centre on no display (monitor unplugged): centred default size, fitted.
        expect(resolve({ x: 5000, y: 5000, width: 1280, height: 720 })).toEqual({ width: 1280, height: 720 })
    })

    test("CROSSCUT-08: the game quits when its last window closes, on every platform", () => {
        const harness = loadHandlers({ directory })
        const quit = jest.fn()
        harness.app.quit = quit
        harness.app.emit("window-all-closed")
        expect(quit).toHaveBeenCalledTimes(1)
        const main = fs.readFileSync(path.join(__dirname, "../electron/main.js"), "utf8")
        const handler = main.slice(main.indexOf("app.on('window-all-closed'"), main.indexOf("app.on('activate'"))
        expect(handler).not.toMatch(/darwin/)
        // A second window reuses the running Next.js server.
        expect(main).toMatch(/if \(!nextServerPromise\)/)
    })

    test("CROSSCUT-06: a crash after boot asks the player instead of closing silently", () => {
        const harness = loadHandlers({ directory })
        const decide = vm.runInContext("shouldCloseAfterRendererGone", harness.contexts["main.js"])
        expect(decide({ closePending: false, forceQuit: false, reason: "crashed" })).toBe(false)
        expect(decide({ closePending: false, forceQuit: false, reason: "oom" })).toBe(false)
        expect(decide({ closePending: true, forceQuit: false, reason: "crashed" })).toBe(true)
        expect(decide({ closePending: false, forceQuit: true, reason: "killed" })).toBe(true)
        expect(decide({ closePending: false, forceQuit: false, reason: "clean-exit" })).toBe(true)
        const main = fs.readFileSync(path.join(__dirname, "../electron/main.js"), "utf8")
        const handler = main.slice(main.indexOf("on('render-process-gone'"), main.indexOf("mainWindow.on('closed'"))
        expect(handler).toMatch(/shouldCloseAfterRendererGone\(/)
        expect(handler).toMatch(/dialog\.showMessageBox\(mainWindow/)
        expect(handler).toMatch(/buttons: \['Reload', 'Quit'\]/)
        expect(handler).toMatch(/mainWindow\.loadURL\(getCurrentUrl\(\)\)/)
    })
})
