"use client"

import { useGameStore } from "@/store/game-store"

/** Flip an event back to unread (there is no store action for this — UI-only flag). */
export function markEventUnread(eventId: string): void {
    useGameStore.setState(state => {
        const event = state.eventsLog.find(e => e.id === eventId)
        if (!event || !event.acknowledged) return
        event.acknowledged = false
        const i = state.acknowledgedEventIds.indexOf(eventId)
        if (i >= 0) state.acknowledgedEventIds.splice(i, 1)
    })
}
