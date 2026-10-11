/**
 * Weekly inbox digest (Phase 4.9).
 *
 * Low-value notices (level-ups, milestones, booking confirmations, match-day
 * reminders, tournament registrations, a player back from injury…) are folded
 * into one "Club round-up" message per week instead of each taking an inbox
 * row. Messages the manager needs (offers, contracts, injuries, the board,
 * scouting reports, sponsor deals, results that matter) stay on their own.
 *
 * The digest rolls: while it is unread, later weeks add to it; once read, the
 * next fold starts a new one. Folded events stay in the log (read, tagged
 * with the digest id) so id-based "fire once" checks keep working; the inbox
 * hides them and lists them inside the digest.
 *
 * Pure: works on the store draft or a save.
 */

import type { GameEventSaveData } from "@/engine/save-types"

export const DIGEST_TYPE = "DIGEST"
/** Items kept in one digest (oldest dropped first). */
export const DIGEST_MAX_ITEMS = 40

export interface DigestItem {
    id: string
    type: string
    week: number
    data: Record<string, unknown>
}

const data = (e: GameEventSaveData): Record<string, unknown> => (e.data ?? {}) as Record<string, unknown>

/** True for notices that belong in the weekly digest rather than their own inbox row. */
export function isDigestible(e: GameEventSaveData): boolean {
    const type = String(e.type)
    if (type === DIGEST_TYPE || data(e).digestId) return false
    // Decisions, open or answered, stay visible (answered ones are history).
    if (Array.isArray(e.choices) && e.choices.length > 0) return false
    const id = e.id
    switch (type) {
        case "PLAYER_LEVEL_UP":
        case "STAFF_LEVEL_UP":
        case "MANAGER_LEVEL_UP":
        case "MILESTONE":
        case "TRAINING_START":
        case "TRAINING_CANCEL":
        case "TRAINING_COMPLETE":
        case "TOURNAMENT_UPDATE":
            return true
        // Booking confirmations; "can't afford this week's focus" is a warning.
        case "TEAM_UPDATE": return !id.startsWith("activity_unaffordable_")
        // Follower milestones (fan requests carry choices).
        case "FAN": return true
        case "CAREER_UPDATE": return id.startsWith("mgr_lvl_")
        // Match-day reminders and "the tournament has started".
        case "TOURNAMENT": return id.startsWith("upcoming_match_") || id.startsWith("tourney_start_")
        // Knocked out of an event (the weekly report has the results), rivalry chatter.
        case "MEDIA": return id.startsWith("elim_") || id.startsWith("rivalry_")
        // Back from injury: the injury itself stays a message.
        case "INJURY": return id.startsWith("recovery_")
        default: return false
    }
}

interface DigestState {
    currentWeek: number
    eventsLog: GameEventSaveData[]
    acknowledgedEventIds: string[]
}

/**
 * Fold this week's digestible notices into the round-up. Sweeps events from
 * the week just played and the new week (in-week match level-ups, pre-tick
 * XP, the tick itself); older ones are left as they were. Returns the number
 * folded.
 */
export function foldWeeklyDigest(state: DigestState): number {
    const fresh = state.eventsLog.filter(e => e.week >= state.currentWeek - 1 && isDigestible(e))
    if (fresh.length === 0) return 0

    let digest = state.eventsLog
        .filter(e => String(e.type) === DIGEST_TYPE)
        .sort((a, b) => b.week - a.week)[0]
    if (!digest || digest.acknowledged) {
        let id = `digest_w${state.currentWeek}`
        for (let n = 2; state.eventsLog.some(e => e.id === id); n++) id = `digest_w${state.currentWeek}_${n}`
        digest = { id, type: DIGEST_TYPE, week: state.currentWeek, acknowledged: true, data: { title: "Club round-up", items: [] } }
        state.eventsLog.unshift(digest)
    }

    const items = (Array.isArray(data(digest).items) ? data(digest).items : []) as DigestItem[]
    const added: DigestItem[] = []
    for (const e of fresh.sort((a, b) => a.week - b.week)) {
        const { digestId: _drop, ...rest } = data(e)
        void _drop
        added.push({ id: e.id, type: String(e.type), week: e.week, data: rest })
        if (!e.acknowledged) digest.acknowledged = false
        e.data = { ...data(e), digestId: digest.id }
        e.acknowledged = true
        if (!state.acknowledgedEventIds.includes(e.id)) state.acknowledgedEventIds.push(e.id)
    }
    digest.data = { ...data(digest), items: [...items, ...added].slice(-DIGEST_MAX_ITEMS) }
    digest.week = state.currentWeek
    return added.length
}

/** The digest's items, newest week first. */
export function digestItems(e: GameEventSaveData): DigestItem[] {
    const items = data(e).items
    return Array.isArray(items) ? [...(items as DigestItem[])].sort((a, b) => b.week - a.week) : []
}
