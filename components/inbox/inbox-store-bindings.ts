"use client"

/**
 * Memoised game-store selectors for the inbox (context + badge counts).
 * Type-only store import, so this stays testable without the store runtime.
 */

import type { GameStoreState } from "@/store/game-store"
import { countInbox, type InboxContext, type InboxCounts } from "./inbox-model"

type ContextSlice = Pick<GameStoreState, "currentWeek" | "playerTeamId" | "teams" | "players">

const nameMaps = new WeakMap<object, Map<string, string>>()
function nameMap(players: GameStoreState["players"]): Map<string, string> {
    let map = nameMaps.get(players)
    if (!map) {
        map = new Map(players.map(p => [p.id, p.nickname || p.name]))
        nameMaps.set(players, map)
    }
    return map
}

let lastCtxKey: unknown[] = []
let lastCtx: InboxContext | null = null

/** Stable InboxContext for the current week / club / roster. */
export function selectInboxContext(state: ContextSlice): InboxContext {
    const key = [state.currentWeek, state.playerTeamId, state.teams, state.players]
    if (lastCtx && key.every((v, i) => v === lastCtxKey[i])) return lastCtx
    const team = state.playerTeamId ? state.teams.find(t => t.id === state.playerTeamId) : undefined
    const names = nameMap(state.players)
    lastCtxKey = key
    lastCtx = {
        currentWeek: state.currentWeek,
        playerTeamId: state.playerTeamId,
        rosterIds: new Set(team?.rosterIds ?? []),
        playerName: (id: string) => names.get(id),
    }
    return lastCtx
}

const NO_COUNTS: InboxCounts = Object.freeze({ decisions: 0, unreadMessages: 0, unreadNews: 0 })
let lastCountsKey: unknown[] = []
let lastCounts: InboxCounts = NO_COUNTS

/** Badge counts; recomputed only when the events log or context changes. */
export function selectInboxCounts(state: ContextSlice & Pick<GameStoreState, "eventsLog" | "saveId">): InboxCounts {
    if (!state.saveId || !state.playerTeamId) return NO_COUNTS
    const ctx = selectInboxContext(state)
    const key = [state.eventsLog, ctx]
    if (key.every((v, i) => v === lastCountsKey[i])) return lastCounts
    lastCountsKey = key
    lastCounts = countInbox(state.eventsLog ?? [], ctx)
    return lastCounts
}
