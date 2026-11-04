/**
 * UI scale (CROSSCUT-12).
 *
 * The desktop app scales the whole page with Electron's page zoom
 * (webFrame.setZoomFactor, exposed by electron/preload.js as
 * window.electron.display). That is the same zoom as Ctrl + in a browser:
 * text, px sizes, canvases, portals, fixed elements, media queries and pointer
 * coordinates all stay consistent, because the page just gets a smaller CSS
 * viewport and a higher devicePixelRatio.
 *
 * A plain browser has no page-zoom API. There the scale falls back to the root
 * font size, which enlarges rem-based sizes only. CSS `zoom` on the root was
 * ruled out: viewport units (h-screen, 85vh; ~100 uses) grow with it, so a
 * full-height screen became 1800px tall in a 1440px window at 125%; and code
 * that writes measured px back into styles (floating-ui 1.8 popovers, the
 * radar's canvas sizing) would get those px multiplied by the zoom again.
 * Only one of the two mechanisms is ever active, so nothing is scaled twice.
 */

export const UI_SCALE_MIN = 80
export const UI_SCALE_MAX = 150
export const UI_SCALE_STEP = 5
export const UI_SCALE_DEFAULT = 100

export function clampUiScale(scale: unknown): number {
    if (typeof scale !== 'number' || !Number.isFinite(scale)) return UI_SCALE_DEFAULT
    return Math.max(UI_SCALE_MIN, Math.min(UI_SCALE_MAX, scale))
}

/** Linear ramp between anchor points: [size at 100%, size at 125%, size at 150%]. */
function rampScale(size: number, at100: number, at125: number, at150: number): number {
    if (!Number.isFinite(size) || size <= at100) return 100
    if (size <= at125) return 100 + 25 * (size - at100) / (at125 - at100)
    if (size <= at150) return 125 + 25 * (size - at125) / (at150 - at125)
    return 150
}

/**
 * Automatic scale for a window of this CSS size (measured at 100% zoom):
 * 1920x1080 and smaller -> 100%, 2560x1440 -> 125%, 3840x2160 -> 150%,
 * linear in between, rounded down to the slider step. Width and height are
 * both considered, so an ultrawide 3440x1440 gets 125% (its height is the
 * limit), and the scaled page never ends up with less room than 1920x1080.
 */
export function autoUiScale(width: number, height: number = Number.POSITIVE_INFINITY): number {
    const byWidth = rampScale(width, 1920, 2560, 3840)
    const byHeight = height === Number.POSITIVE_INFINITY ? UI_SCALE_MAX : rampScale(height, 1080, 1440, 2160)
    const raw = Math.min(byWidth, byHeight)
    return clampUiScale(Math.floor(raw / UI_SCALE_STEP + 1e-9) * UI_SCALE_STEP)
}

/** The scale in force: the player's own choice, or the automatic one. */
export function effectiveUiScale(settings: { uiScale: number; uiScaleAuto: boolean }, viewport: { width: number; height: number } | null): number {
    if (!settings.uiScaleAuto) return clampUiScale(settings.uiScale)
    return viewport ? autoUiScale(viewport.width, viewport.height) : UI_SCALE_DEFAULT
}

interface DisplayBridge {
    getZoomFactor?: () => number
    setZoomFactor?: (factor: number) => void
}

function displayBridge(): DisplayBridge | null {
    if (typeof window === 'undefined') return null
    const bridge = (window as typeof window & { electron?: { display?: DisplayBridge } }).electron?.display
    return bridge && typeof bridge.setZoomFactor === 'function' ? bridge : null
}

/** True when the page scale is real page zoom (the desktop app). */
export function hasPageZoom(): boolean {
    return displayBridge() !== null
}

/**
 * The window's CSS size as it would be at 100% zoom. Page zoom shrinks
 * innerWidth/innerHeight, so they are multiplied back by the current factor;
 * otherwise the automatic scale would feed back into itself.
 */
export function baseViewportSize(): { width: number; height: number } | null {
    if (typeof window === 'undefined' || !window.innerWidth) return null
    const bridge = displayBridge()
    let factor = 1
    try { factor = bridge?.getZoomFactor?.() ?? 1 } catch { factor = 1 }
    if (!Number.isFinite(factor) || factor <= 0) factor = 1
    return { width: Math.round(window.innerWidth * factor), height: Math.round(window.innerHeight * factor) }
}

let lastBase: { width: number; height: number } | null = null

/**
 * baseViewportSize, but ignoring changes of a few px. Under page zoom
 * innerWidth is rounded, so the size read back after a zoom change can be off
 * by a px or two; near a step boundary that would flip the automatic scale
 * back and forth on every resize event.
 */
export function stableBaseViewportSize(): { width: number; height: number } | null {
    const next = baseViewportSize()
    if (!next) return lastBase
    if (lastBase && Math.abs(next.width - lastBase.width) <= 4 && Math.abs(next.height - lastBase.height) <= 4) return lastBase
    lastBase = next
    return next
}

/** Apply a scale (percent) with exactly one mechanism. */
export function applyUiScale(scale: number): void {
    const bounded = clampUiScale(scale)
    const bridge = displayBridge()
    if (bridge) {
        try {
            const current = bridge.getZoomFactor?.()
            if (current === undefined || Math.abs(current - bounded / 100) > 0.001) bridge.setZoomFactor!(bounded / 100)
        } catch { /* a failed zoom keeps the current size */ }
        if (typeof document !== 'undefined') document.documentElement.style.fontSize = ''
        return
    }
    if (typeof document !== 'undefined') {
        document.documentElement.style.fontSize = `${bounded}%`
    }
}
