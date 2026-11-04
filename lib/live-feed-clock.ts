/**
 * Feed time labels in the scorebug's terms, so a kill reads against the clock
 * on screen: round time left (1:55 down, stops at the plant), then the bomb
 * timer after the plant (`bomb`: the feed colours it and titles it "Bomb
 * timer"). Computed oldest → newest: a round starts at its "round N begins"
 * line (or after ROUND_END). The PLANT row shows the round clock at the plant
 * (its last moment); later rows of the round show the bomb timer, and a DEFUSE
 * / EXPLODE row (and the rows after it, e.g. the clutch line) the bomb timer
 * where it stopped, so an explosion reads 0:00 (MATCHDAY-04). Labels depend
 * only on earlier rows, so they never change once shown.
 */

import type { LogEntry } from "@/types"
import { BOMB_SECONDS, roundClockSeconds } from "./live-clock"

export interface FeedClockLabel { text: string; bomb: boolean }

const mmss = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`

/** Labels for a newest-first feed. */
export function feedClockLabels(logs: readonly LogEntry[]): Map<LogEntry, FeedClockLabel> {
    const out = new Map<LogEntry, FeedClockLabel>()
    let plantAt: number | undefined
    let bombEndAt: number | undefined
    for (let i = logs.length - 1; i >= 0; i--) {
        const l = logs[i]
        if (l.type === "ROUND_END" || (l.type === "SYSTEM" && /round \d+ begins/i.test(l.message))) { plantAt = undefined; bombEndAt = undefined }
        if (l.time == null) continue
        if (l.type === "PLANT") {
            out.set(l, { text: mmss(roundClockSeconds(l.time)), bomb: false })
            plantAt = l.time
            bombEndAt = undefined
            continue
        }
        if (plantAt !== undefined && l.time >= plantAt) {
            // A defuse or explosion stops the bomb timer.
            if ((l.type === "DEFUSE" || l.type === "EXPLODE") && bombEndAt === undefined) bombEndAt = l.time
            const at = bombEndAt !== undefined ? Math.min(l.time, bombEndAt) : l.time
            out.set(l, { text: mmss(Math.max(0, BOMB_SECONDS - Math.floor(at - plantAt))), bomb: true })
            continue
        }
        out.set(l, { text: mmss(roundClockSeconds(l.time)), bomb: false })
    }
    return out
}
