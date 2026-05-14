"use client"

import { useMemo } from "react"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import type { TeamSaveData } from "@/engine/save-types"

/**
 * Returns the player's currently active team, memoized.
 *
 * Replaces the repeated pattern that appears across ~30 components:
 *
 *     const { teams, playerTeamId } = useGameStore(useShallow(s => ({
 *         teams: s.teams,
 *         playerTeamId: s.playerTeamId,
 *     })))
 *     const playerTeam = useMemo(
 *         () => teams.find(t => t.id === playerTeamId),
 *         [teams, playerTeamId]
 *     )
 *
 * Centralising it means:
 *   1. The shallow-equality selector only pulls the two fields it
 *      actually needs (`teams`, `playerTeamId`), so callers that
 *      previously over-subscribed (e.g. pulled `players` too) re-render
 *      less.
 *   2. The `.find()` is memoised by reference identity of `teams` /
 *      `playerTeamId`, so two consumers on the same page reuse the
 *      same scan instead of doing one each.
 *   3. Future store-shape changes (e.g. precomputed `teamsById` map)
 *      can be applied in one place.
 *
 * Returns `undefined` if no team is selected or the id doesn't match.
 */
export function useCurrentTeam(): TeamSaveData | undefined {
    const { teams, playerTeamId } = useGameStore(
        useShallow(s => ({
            teams: s.teams,
            playerTeamId: s.playerTeamId,
        }))
    )
    return useMemo(
        () => teams.find(t => t.id === playerTeamId),
        [teams, playerTeamId]
    )
}

/**
 * Same as `useCurrentTeam` but returns just the id. Useful for callers
 * that only need the id (e.g. filtering matches by team) — they avoid
 * subscribing to the `teams` array and so don't re-render when the
 * league updates.
 */
export function useCurrentTeamId(): string | undefined {
    return useGameStore(s => s.playerTeamId)
}
