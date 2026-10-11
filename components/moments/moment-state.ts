"use client"

import { useGameStore } from "@/store/game-store"
import { titleMomentFromCelebration } from "@/engine/moments"

/** Screens a moment never covers: menus, setup, the editor, the live match. */
export function momentBlockedRoute(path: string | null | undefined): boolean {
    if (!path) return true
    return path.startsWith("/new-game") || path.startsWith("/main-menu") || path.startsWith("/load-game")
        || path.startsWith("/map-editor") || path.startsWith("/dev") || /^\/match\/[^/]+\/live\/?$/.test(path)
}

/** True while a moment is waiting or on screen (the weekly report and the legend pick wait for it). */
export function useMomentPending(): boolean {
    return useGameStore(st => st.momentQueue.length > 0 || titleMomentFromCelebration(st.pendingCelebration) !== null)
}
