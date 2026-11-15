/**
 * "Back" buttons that never leave the game (START-42, START-40).
 *
 * `router.back()` on a page opened first (a reload, a deep link, the window's
 * first route) goes to whatever came before the app: about:blank in Electron,
 * a blank window with no way back. The Navigation API lists only this app's
 * own (same-origin) entries, so `navigation.canGoBack` is false there; older
 * engines fall back to the history length.
 */

type BackRouter = { back: () => void; push: (href: string) => void }

/** True when the previous history entry is a screen of this app. */
export function canGoBackInApp(win: Window | undefined = typeof window === "undefined" ? undefined : window): boolean {
    if (!win) return false
    const nav = (win as Window & { navigation?: { canGoBack?: unknown } }).navigation
    if (nav && typeof nav.canGoBack === "boolean") return nav.canGoBack
    return win.history.length > 1
}

/** Go back one screen, or to `fallback` when there is no screen of the app to go back to. */
export function goBackOr(router: BackRouter, fallback: string, win?: Window): void {
    if (canGoBackInApp(win ?? (typeof window === "undefined" ? undefined : window))) router.back()
    else router.push(fallback)
}
