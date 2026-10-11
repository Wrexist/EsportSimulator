"use client"

import { useMemo } from "react"
import { createPortal } from "react-dom"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import { buildSeasonReviewView, type ReviewPageId, type ReviewSource } from "@/lib/season-review-view"
import { SeasonReviewSequence } from "./SeasonReviewSequence"

/** The career fields the season review reads (the store holds the save's fields). */
export function useReviewSource(): ReviewSource {
    return useGameStore(useShallow(s => ({
        recordBook: s.recordBook,
        players: s.players,
        teams: s.teams,
        currentWeek: s.currentWeek,
        playerTeamId: s.playerTeamId ?? "",
        league: s.league,
        managerDetails: s.managerDetails,
        boardState: s.boardState,
        // Stream 5.3 adds storylines to the career; read without assuming it exists.
        storylines: (s as unknown as { storylines?: unknown }).storylines,
    }))) as ReviewSource
}

/**
 * A past season's review opened from history (the trophy room, the awards
 * message in the inbox): the same pages from the stored honours, no queue,
 * no music change.
 */
export function SeasonReviewReplay({ season, startAt, onClose }: { season: number; startAt?: ReviewPageId; onClose: () => void }) {
    const src = useReviewSource()
    const view = useMemo(() => buildSeasonReviewView(src, season), [src, season])
    if (!view || typeof document === "undefined") return null
    return createPortal(
        <SeasonReviewSequence view={view} teams={src.teams} mode="replay" startAt={startAt} onClose={onClose} />,
        document.body,
    )
}
