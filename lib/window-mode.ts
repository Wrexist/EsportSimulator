/**
 * Window mode (START-18). The desktop app has two real modes: a window, or
 * fullscreen (Electron's fullscreen is already borderless; there is no
 * exclusive mode). "Borderless" was a third label for the same behaviour, so
 * stored "borderless" now reads as fullscreen.
 */

export type WindowModeChoice = "windowed" | "fullscreen"

/** A stored or legacy value as one of the two modes. */
export function normalizeWindowMode(value: unknown, fallback: WindowModeChoice = "windowed"): WindowModeChoice {
    if (value === "fullscreen" || value === "borderless") return "fullscreen"
    if (value === "windowed") return "windowed"
    return fallback
}

/** The setting that matches what the window is actually doing (after F11 or the OS left fullscreen). */
export function windowModeForFullscreen(isFullscreen: boolean): WindowModeChoice {
    return isFullscreen ? "fullscreen" : "windowed"
}
