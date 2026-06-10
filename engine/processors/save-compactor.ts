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

    // circuitPoints is bounded by team count, but each entry's `results` log
    // appends one row per tournament placement forever — trim to the recent
    // window (the running `points` total is preserved either way).
    if (save.circuitPoints) {
        for (const entry of save.circuitPoints) {
            if (entry.results && entry.results.length > ARRAY_CAPS.circuitPointResults) {
                entry.results = entry.results.slice(-ARRAY_CAPS.circuitPointResults)
            }
        }
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

    // scheduledActivities accumulates ~7 auto-generated REST days per week
    // forever (training-processor.processRestDays) on top of any planned
    // activities. Every consumer only looks at the current week or a
    // duration-spanning window (currentWeek < a.week + a.duration), so an
    // activity whose window ended before last week is dead weight. Drop those
    // to keep the save lean across multi-season careers (a 1-week grace keeps
    // the just-finished week visible to any recent-history UI).
    if (save.scheduledActivities && save.scheduledActivities.length > 0) {
        const keepFromWeek = save.currentWeek - 1
        save.scheduledActivities = save.scheduledActivities.filter(
            a => (a.week + (a.duration || 0)) >= keepFromWeek
        )
    }

    // Drop acknowledgements that reference events the compactor just pruned
    // so the set doesn't accumulate stale IDs across long campaigns.
    const knownEventIds = new Set(save.eventsLog.map(e => e.id))
    save.acknowledgedEventIds = save.acknowledgedEventIds.filter(id => knownEventIds.has(id))

    // Strip per-round detail from completed matches older than the retention
    // window. Player-team matches retain their rounds[] so the match-result
    // page can render the round-by-round replay for recent games. AI-vs-AI
    // matches already have rounds=[] from the week processor (Phase O.2).
    // After ROUNDS_RETENTION_WEEKS, the per-round data is dead weight —
    // players don't re-watch old matches, and the rounds arrays are the
    // single largest contributor to save-file bloat at ~50-120 KB per map.
    const ROUNDS_RETENTION_WEEKS = 4
    const roundsAgeThreshold = save.currentWeek - ROUNDS_RETENTION_WEEKS
    if (roundsAgeThreshold > 0) {
        for (const match of save.completedMatches) {
            if (match.week < roundsAgeThreshold && match.result?.maps) {
                for (const map of match.result.maps) {
                    if (Array.isArray(map.rounds) && map.rounds.length > 0) {
                        map.rounds = []
                    }
                }
            }
        }
    }
}
