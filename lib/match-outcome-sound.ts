/**
 * The victory / defeat cue plays exactly once per match (Phase 5.4a). The
 * live screen plays it when the series ends; the result screen plays it only
 * for a match that was not watched (instant simulation). Keyed by match id,
 * in memory and in sessionStorage so a reload of the result screen stays quiet.
 */
import { soundManager } from "./sound-manager"

const played = new Set<string>()
const storageKey = (matchId: string) => `esm:outcome-cue:${matchId}`

/** Has the outcome cue of this match been played in this session? */
export function outcomeCuePlayed(matchId: string): boolean {
    if (played.has(matchId)) return true
    try { return typeof sessionStorage !== "undefined" && sessionStorage.getItem(storageKey(matchId)) === "1" } catch { return false }
}

/** Mark the cue as played without playing it (another moment owns the sound). */
export function markOutcomeCue(matchId: string): void {
    played.add(matchId)
    try { if (typeof sessionStorage !== "undefined") sessionStorage.setItem(storageKey(matchId), "1") } catch { /* storage denied: memory only */ }
}

/** Play the victory or defeat cue for a match, once. Returns true when it played. */
export function playMatchOutcomeCue(matchId: string, won: boolean): boolean {
    if (!matchId || typeof window === "undefined" || outcomeCuePlayed(matchId)) return false
    markOutcomeCue(matchId)
    soundManager.play(won ? "victory" : "defeat", { key: `outcome:${matchId}` })
    return true
}
