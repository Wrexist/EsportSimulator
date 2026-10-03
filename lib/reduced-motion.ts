"use client"

/**
 * Single source of truth for "should this animate?".
 *
 * Reduced motion is active when EITHER the in-game setting is on OR the OS
 * reports `prefers-reduced-motion: reduce`. framer-motion's own
 * `useReducedMotion()` only reads the OS media query, so components that
 * branch on it ignore the in-game toggle — use `useAppReducedMotion()`.
 *
 * Non-React code (rAF loops, canvas, count-ups) should call
 * `isReducedMotionActive()`; GameShell mirrors the combined state onto
 * `<html class="reduce-motion">`, which is also what the global CSS uses.
 */
import { useReducedMotion } from "framer-motion"
import { useSettingsStore } from "./settings-store"

export function resolveReducedMotion(setting: boolean | null | undefined, system: boolean | null | undefined): boolean {
    return Boolean(setting) || Boolean(system)
}

/** Imperative check for effects, rAF loops and canvas renderers. */
export function isReducedMotionActive(): boolean {
    if (typeof window === "undefined") return false
    try {
        if (useSettingsStore.getState().reducedMotion) return true
    } catch { /* store unavailable — fall through to DOM/OS signals */ }
    if (typeof document !== "undefined" && document.documentElement?.classList?.contains("reduce-motion")) return true
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
}

/** React hook honoring both the in-game setting and the OS preference. */
export function useAppReducedMotion(): boolean {
    const setting = useSettingsStore(state => state.reducedMotion)
    const system = useReducedMotion()
    return resolveReducedMotion(setting, system)
}
