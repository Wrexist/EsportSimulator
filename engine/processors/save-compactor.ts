/**
 * Persistent-state compactor.
 *
 * Keeps growing per-tick arrays (events log, completed matches, finance
 * ledger, transfer history, news feed, tournament qualifications) within
 * the {@link ARRAY_CAPS} ceilings so long sessions don't bloat memory or
 * save files.
 *
 * Extracted from atomic-week-processor.ts so the compaction logic can be
 * unit-tested and reasoned about in isolation. Callers should invoke
 * {@link compactPersistentState} at the end of a successful week tick.
 */

import type { GameSave } from "../save-types"
import { ARRAY_CAPS } from "@/lib/constants"
import { dedupeQualifications } from "../circuit-engine"

/**
 * Trim each persistent array down to its cap.
 *
 * Important nuance: callers mix `push` (oldest at index 0) and `unshift`
 * (newest at index 0), so a positional slice silently drops valid recent
 * entries. For event log and news feed we sort by week descending first;
 * for events we also break ties by unacknowledged-before-acknowledged so
 * unread events never get dropped while older read events remain. Other
 * arrays are stable enough that a tail-slice is safe.
 */
export function compactPersistentState(save: GameSave): void {
    if (save.eventsLog.length > ARRAY_CAPS.eventsLog) {
        save.eventsLog = [...save.eventsLog]
            .sort((a, b) => {
                if (b.week !== a.week) return b.week - a.week
                if (a.acknowledged !== b.acknowledged) return a.acknowledged ? 1 : -1
                return 0
            })
            .slice(0, ARRAY_CAPS.eventsLog)
    }

    if (save.completedMatches.length > ARRAY_CAPS.completedMatches) {
        save.completedMatches = save.completedMatches.slice(-ARRAY_CAPS.completedMatches)
    }

    if (save.financeLedger.length > ARRAY_CAPS.financeLedger) {
        save.financeLedger = save.financeLedger.slice(-ARRAY_CAPS.financeLedger)
    }

    if (save.transferHistory.length > ARRAY_CAPS.transferHistory) {
        save.transferHistory = save.transferHistory.slice(-ARRAY_CAPS.transferHistory)
    }

    if (save.newsFeed.length > ARRAY_CAPS.newsFeed) {
        save.newsFeed = [...save.newsFeed]
            .sort((a, b) => b.week - a.week)
            .slice(0, ARRAY_CAPS.newsFeed)
    }

    if (save.tournamentQualifications.length > 0) {
        save.tournamentQualifications = dedupeQualifications(
            save.tournamentQualifications,
            save.currentWeek
        )
        if (save.tournamentQualifications.length > ARRAY_CAPS.tournamentQualifications) {
            save.tournamentQualifications = save.tournamentQualifications.slice(-ARRAY_CAPS.tournamentQualifications)
        }
    }

    // Drop acknowledgements that reference events the compactor just pruned
    // so the set doesn't accumulate stale IDs across long campaigns.
    const knownEventIds = new Set(save.eventsLog.map(e => e.id))
    save.acknowledgedEventIds = save.acknowledgedEventIds.filter(id => knownEventIds.has(id))
}
