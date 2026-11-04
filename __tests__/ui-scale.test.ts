/**
 * CROSSCUT-12: the UI scale is real page zoom in the desktop app, with an
 * automatic default from the window size until the player picks a scale.
 */
import { applyUiScale, autoUiScale, baseViewportSize, clampUiScale, effectiveUiScale, stableBaseViewportSize } from '@/lib/ui-scale'

type Globals = { window?: unknown; document?: unknown }
const g = global as Globals

function withEnv(env: Globals, run: () => void) {
    const before = { window: g.window, document: g.document }
    g.window = env.window
    g.document = env.document
    try { run() } finally { g.window = before.window; g.document = before.document }
}

describe('autoUiScale', () => {
    it('keeps small and full-HD windows at 100%', () => {
        expect(autoUiScale(1024, 640)).toBe(100)
        expect(autoUiScale(1280, 720)).toBe(100)
        expect(autoUiScale(1600, 900)).toBe(100)
        expect(autoUiScale(1920, 1080)).toBe(100)
        expect(autoUiScale(1920, 1200)).toBe(100)
    })
    it('scales 1440p to 125% and 4K to 150%', () => {
        expect(autoUiScale(2560, 1440)).toBe(125)
        expect(autoUiScale(3840, 2160)).toBe(150)
        expect(autoUiScale(5120, 2880)).toBe(150)
    })
    it('ramps between the anchors in slider steps', () => {
        const values = [2000, 2200, 2400, 3000, 3400].map(w => autoUiScale(w, w * 9 / 16))
        for (const v of values) { expect(v % 5).toBe(0); expect(v).toBeGreaterThanOrEqual(100); expect(v).toBeLessThanOrEqual(150) }
        expect(values).toEqual([...values].sort((a, b) => a - b))
        expect(autoUiScale(3200, 1800)).toBe(135)
    })
    it('lets the shorter side limit ultrawide and short windows', () => {
        expect(autoUiScale(3440, 1440)).toBe(125)
        expect(autoUiScale(2560, 1080)).toBe(100)
        expect(autoUiScale(2560, 900)).toBe(100)
    })
    it('never leaves the scaled page less room than 1920x1080', () => {
        for (let w = 1920; w <= 4200; w += 40) {
            const h = Math.round(w * 9 / 16)
            const s = autoUiScale(w, h) / 100
            expect(w / s).toBeGreaterThanOrEqual(1920)
            expect(h / s).toBeGreaterThanOrEqual(1080)
        }
    })
    it('is safe with bad input', () => {
        expect(autoUiScale(NaN, NaN)).toBe(100)
        expect(autoUiScale(0, 0)).toBe(100)
        expect(autoUiScale(2560)).toBe(125)
    })
})

describe('effectiveUiScale', () => {
    it('follows the window while automatic and the choice once picked', () => {
        expect(effectiveUiScale({ uiScale: 100, uiScaleAuto: true }, { width: 2560, height: 1440 })).toBe(125)
        expect(effectiveUiScale({ uiScale: 110, uiScaleAuto: false }, { width: 3840, height: 2160 })).toBe(110)
        expect(effectiveUiScale({ uiScale: 999, uiScaleAuto: false }, null)).toBe(150)
        expect(effectiveUiScale({ uiScale: 100, uiScaleAuto: true }, null)).toBe(100)
        expect(clampUiScale('x')).toBe(100)
    })
})

describe('applying the scale', () => {
    it('uses page zoom in the desktop app and never also the root font size', () => {
        let zoom = 1
        const setZoomFactor = jest.fn((f: number) => { zoom = f })
        const style = { fontSize: '125%' }
        withEnv({ window: { electron: { display: { getZoomFactor: () => zoom, setZoomFactor } } }, document: { documentElement: { style } } }, () => {
            applyUiScale(125)
            expect(setZoomFactor).toHaveBeenCalledWith(1.25)
            expect(style.fontSize).toBe('')
            applyUiScale(125)
            expect(setZoomFactor).toHaveBeenCalledTimes(1)
            applyUiScale(400)
            expect(setZoomFactor).toHaveBeenLastCalledWith(1.5)
        })
    })
    it('falls back to the root font size in a browser', () => {
        const style = { fontSize: '' }
        withEnv({ window: {}, document: { documentElement: { style } } }, () => {
            applyUiScale(125)
            expect(style.fontSize).toBe('125%')
        })
    })
    it('measures the window at 100% zoom so the automatic scale does not feed back', () => {
        withEnv({ window: { innerWidth: 2048, innerHeight: 1152, electron: { display: { getZoomFactor: () => 1.25, setZoomFactor() {} } } } }, () => {
            expect(baseViewportSize()).toEqual({ width: 2560, height: 1440 })
            expect(autoUiScale(2560, 1440)).toBe(125)
        })
        withEnv({ window: { innerWidth: 2560, innerHeight: 1440, electron: { display: { getZoomFactor: () => 1.5, setZoomFactor() {} } } } }, () => {
            expect(baseViewportSize()).toEqual({ width: 3840, height: 2160 })
        })
        withEnv({ window: { innerWidth: 1280, innerHeight: 720 } }, () => {
            expect(baseViewportSize()).toEqual({ width: 1280, height: 720 })
        })
    })
    it('ignores the px of rounding a zoom change causes, so a boundary size cannot flip-flop', () => {
        const win = { innerWidth: 2560, innerHeight: 1440 }
        withEnv({ window: win }, () => {
            expect(stableBaseViewportSize()).toEqual({ width: 2560, height: 1440 })
            win.innerWidth = 2558
            expect(stableBaseViewportSize()).toEqual({ width: 2560, height: 1440 })
            win.innerWidth = 1920; win.innerHeight = 1080
            expect(stableBaseViewportSize()).toEqual({ width: 1920, height: 1080 })
        })
    })
})
