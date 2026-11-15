/**
 * A won match's celebration (confetti, the "advancing" card) plays once: the
 * first time its result screen opens. Opening the result again later, from
 * the calendar or after a reload, shows the result quietly.
 *
 * Kept in memory and in localStorage (the most recent ids only), keyed by
 * career and match.
 */

const STORAGE_KEY = "esm:celebrated-matches"
const MAX_KEPT = 200
const seen = new Set<string>()

const keyFor = (careerId: string | null | undefined, matchId: string, kind: string) => `${careerId ?? ""}:${matchId}:${kind}`

function readStored(): string[] {
    try {
        if (typeof localStorage === "undefined") return []
        const raw = localStorage.getItem(STORAGE_KEY)
        const parsed: unknown = raw ? JSON.parse(raw) : []
        return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []
    } catch { return [] }
}

/** Has this match's celebration of this kind already played? */
export function celebrationPlayed(careerId: string | null | undefined, matchId: string, kind: "confetti" | "advancement"): boolean {
    const key = keyFor(careerId, matchId, kind)
    return seen.has(key) || readStored().includes(key)
}

/** Record that the celebration played, so later visits stay quiet. */
export function markCelebrationPlayed(careerId: string | null | undefined, matchId: string, kind: "confetti" | "advancement"): void {
    const key = keyFor(careerId, matchId, kind)
    seen.add(key)
    try {
        if (typeof localStorage === "undefined") return
        const kept = readStored().filter(k => k !== key)
        kept.push(key)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(kept.slice(-MAX_KEPT)))
    } catch { /* storage denied: memory only */ }
}
