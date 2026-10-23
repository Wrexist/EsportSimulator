/**
 * Feed time labels in the scorebug's terms, so a kill reads against the clock
 * on screen: round time left (1:55 down, stops at the plant), then the bomb
 * timer after the plant (`bomb`: the feed colours it and titles it "Bomb
 * timer"). Computed oldest → newest: a round starts at its "round N begins"
 * line (or after ROUND_END) and a PLANT row starts its bomb timer. Labels
 * depend only on earlier rows, so they never change once shown.
 */

import type { LogEntry } from "@/types"
import { scorebugTime } from "./live-clock"

export interface FeedClockLabel { text: string; bomb: boolean }

const mmss = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`

/** Labels for a newest-first feed. */
export function feedClockLabels(logs: readonly LogEntry[]): Map<LogEntry, FeedClockLabel> {
    const out = new Map<LogEntry, FeedClockLabel>()
    let plantAt: number | undefined
    for (let i = logs.length - 1; i >= 0; i--) {
        const l = logs[i]
        if (l.type === "ROUND_END" || (l.type === "SYSTEM" && /round \d+ begins/i.test(l.message))) plantAt = undefined
        if (l.time == null) continue
        if (l.type === "PLANT") plantAt = l.time
        const tb = scorebugTime(l.time, plantAt)
        out.set(l, { text: mmss(tb.seconds), bomb: tb.planted && l.type !== "PLANT" })
    }
    return out
}
