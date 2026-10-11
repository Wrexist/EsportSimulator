/**
 * Where the Match hub (`/match`) sends the manager right now.
 *
 *  1. A match in progress (live screen) → back into it.
 *  2. The fixture "Play match" offers (lib/playable-match) → its prep (tactics).
 *  3. Another fixture of the managed club this week (not due yet, e.g. a
 *     later day in daily mode) → its prep, so the lineup and plan can be set.
 *  4. The latest result → the result screen.
 *  5. Nothing played or scheduled → the season calendar.
 * No career loaded → Home (which returns to the main menu).
 */

import { pendingPlayableMatch, type PlayableMatchState } from "@/lib/playable-match"

interface FixtureLike {
    id: string
    week: number
    day?: number
    homeTeamId: string
    awayTeamId: string
}

export interface MatchCentreState extends PlayableMatchState<FixtureLike> {
    activeMatchId?: string | null
    completedMatches: Array<FixtureLike & { result?: unknown }>
}

export function matchCentreHref(state: MatchCentreState): string {
    const me = state.playerTeamId
    // No career loaded: Home owns the "back to the main menu" redirect.
    if (!me) return "/"
    const mine = (m: FixtureLike) => m.homeTeamId === me || m.awayTeamId === me
    const completedIds = new Set(state.completedMatches.map(m => m.id))

    if (state.activeMatchId && state.scheduledMatches.some(m => m.id === state.activeMatchId && mine(m)) && !completedIds.has(state.activeMatchId)) {
        return `/match/${state.activeMatchId}/live`
    }

    const playable = pendingPlayableMatch(state, completedIds)
    if (playable) return `/match/${playable.id}/tactics`

    const thisWeek = state.scheduledMatches
        .filter(m => mine(m) && m.week === state.currentWeek && !completedIds.has(m.id))
        .sort((a, b) => (a.day ?? 6) - (b.day ?? 6))[0]
    if (thisWeek) return `/match/${thisWeek.id}/tactics`

    // Newest of ours by calendar slot; a later entry wins a tie (play order).
    let latest: FixtureLike | null = null
    for (const m of state.completedMatches) {
        if (!mine(m)) continue
        if (!latest || m.week > latest.week || (m.week === latest.week && (m.day ?? 6) >= (latest.day ?? 6))) latest = m
    }
    return latest ? `/match/${latest.id}/result` : "/schedule"
}
