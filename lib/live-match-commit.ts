/**
 * Records a finished live match exactly once (MATCHDAY-03).
 *
 * The live screen commits the result as soon as the series is over (the end
 * beat is showing), not only when "Continue to results" is pressed: closing
 * the game on the end screen must not roll the match back. The button then
 * only navigates; calling this again is a no-op, so nothing is recorded or
 * saved twice.
 */

export type LiveCommitOutcome = "committed" | "already" | "failed"

export interface LiveCommitArgs {
    matchId: string
    ownerSaveId: string | null | undefined
    /** True once the result is in completedMatches. */
    isRecorded: () => boolean
    /** The canonical result; only built when the match is not recorded yet. */
    buildResult: () => unknown
    saveMatchResult: (matchId: string, result: unknown) => void
    /** Drops the live-match shell (activeMatchId / activeMatchState). */
    clearActive: () => void
    /** Writes the career save, then drops the durable live checkpoint. */
    persist: (saveId: string | null | undefined, matchId: string) => Promise<void> | void
}

export function commitLiveMatch(args: LiveCommitArgs): LiveCommitOutcome {
    if (args.isRecorded()) return "already"
    args.saveMatchResult(args.matchId, args.buildResult())
    if (!args.isRecorded()) return "failed"
    args.clearActive()
    // Save the career now: until then a reload would load the save from
    // before this match and play it again.
    void args.persist(args.ownerSaveId, args.matchId)
    return "committed"
}
