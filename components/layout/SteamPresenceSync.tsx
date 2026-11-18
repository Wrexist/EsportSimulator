"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import { buildMatchPresence, buildMenuPresence, buildRichPresence, steamService } from "@/engine/steam-service"

/** Screens without a career on them: friends see "In the main menu". */
const MENU_PATHS = ["/main-menu", "/new-game", "/load-game"]
const LIVE_MATCH = /^\/match\/([^/]+)\/live\/?$/

/**
 * Keeps Steam Rich Presence in step with what is on screen (CROSSCUT-12,
 * 2026-11-17): the club and week as soon as a career is loaded (it used to
 * wait for the first week tick), "In the main menu" after quitting to the menu
 * (it used to keep showing the previous club), and the match while the live
 * match screen is open. Only changes are sent. No-op outside the desktop app.
 */
export function SteamPresenceSync() {
    const pathname = usePathname() ?? ""
    const liveId = LIVE_MATCH.exec(pathname)?.[1]
    const career = useGameStore(useShallow(s => {
        const team = s.isInitialized && s.playerTeamId ? s.teams.find(t => t.id === s.playerTeamId) : undefined
        const match = liveId && team ? s.scheduledMatches.find(m => m.id === liveId) : undefined
        const opponentId = match ? (match.homeTeamId === team!.id ? match.awayTeamId : match.homeTeamId) : undefined
        return {
            teamName: team?.name,
            week: s.currentWeek,
            ranking: team?.worldRanking,
            opponentName: opponentId ? s.teams.find(t => t.id === opponentId)?.name : undefined,
        }
    }))
    const sent = useRef("")

    useEffect(() => {
        const onMenu = MENU_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`))
        const presence = onMenu || !career.teamName
            ? buildMenuPresence()
            : career.opponentName
                ? buildMatchPresence({ teamName: career.teamName, opponentName: career.opponentName })
                : buildRichPresence({ teamName: career.teamName, week: career.week, ranking: career.ranking })
        const key = JSON.stringify(presence)
        if (key === sent.current) return
        sent.current = key
        void steamService.setPresence(presence)
    }, [pathname, career.teamName, career.week, career.ranking, career.opponentName])

    return null
}
