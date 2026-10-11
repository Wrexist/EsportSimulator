"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useGameStore } from "@/store/game-store"
import { matchCentreHref } from "./match-centre"

/**
 * Match hub entry (`/match`): the career lives in the client store, so the
 * redirect waits for it to rehydrate, then replaces this route with the live
 * match, the next match's prep, the latest result or the calendar.
 */
export default function MatchCentreRedirect() {
    const router = useRouter()
    const hydrated = useGameStore(s => s._hasHydrated)

    useEffect(() => {
        if (!hydrated) return
        const s = useGameStore.getState()
        router.replace(matchCentreHref({
            playerTeamId: s.playerTeamId,
            activeMatchId: s.activeMatchId,
            scheduledMatches: s.scheduledMatches,
            completedMatches: s.completedMatches,
            currentWeek: s.currentWeek,
            currentDay: s.currentDay,
            timeMode: s.timeMode,
            teams: s.teams,
            players: s.players,
        }))
    }, [hydrated, router])

    return <p role="status" className="py-16 text-center text-sm text-ink-3">Opening match centre…</p>
}
