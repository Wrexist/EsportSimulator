"use client"

import { useEffect } from "react"
import { create } from "zustand"
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

/** Full-screen moments currently on screen (a count: a replay can open over nothing else). */
const useMomentScreens = create<{ open: number }>(() => ({ open: 0 }))

/** Mark a full-screen moment as on screen while the calling component is mounted. */
export function useMomentOnScreen(): void {
    useEffect(() => {
        useMomentScreens.setState(s => ({ open: s.open + 1 }))
        return () => useMomentScreens.setState(s => ({ open: Math.max(0, s.open - 1) }))
    }, [])
}

/** True while a full-screen moment is on screen: toasts wait so they never cover its actions. */
export function useMomentOnScreenNow(): boolean {
    return useMomentScreens(s => s.open > 0)
}
