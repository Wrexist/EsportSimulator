import type { CustomTactics } from '@/types'

export interface TimeoutState { remaining: number; rounds: number }
export function restoreTimeoutState(remaining = 2, rounds = 0): TimeoutState {
    if (![remaining, rounds].every(n => Number.isInteger(n) && n >= 0 && n <= 2)) throw Error('Invalid saved timeout state')
    return { remaining, rounds }
}

/** Spend only at the strategy break; the caller synchronously commits before another click. */
export function spendTimeout(state: TimeoutState, betweenRounds: boolean, status: string): TimeoutState | null {
    if (!betweenRounds || status !== 'IN_PROGRESS' || state.remaining <= 0 || state.rounds > 0) return null
    return { remaining: state.remaining - 1, rounds: 2 }
}

/** Round-win probability edge while regrouping after a tactical timeout. */
export const REGROUP_EDGE = 0.04
/**
 * What a regroup is worth in round wins, as the decision card states it.
 * REGROUP_EDGE is the engine input (duel points via REGROUP_POINTS_PER_PROB);
 * on the sight engine it moves the round-win chance by less than its face
 * value. Measured 2026-10-24 with paired rounds (same state, same dice, with
 * and without the regroup; scripts/odds/win-odds-calibration.ts effects):
 * 36.3% → 39.2% over 6,601 rounds, +2.9 points; re-measured 2026-10-27 with
 * team play: 36.2% → 39.5% over 6,538 rounds, +3.2 points.
 */
export const REGROUP_ROUND_WIN_PTS = 3
/** Losses in a row before a regroup helps ("no benefit without a losing streak"). */
export const REGROUP_MIN_LOSS_STREAK = 2

/**
 * A regroup (tactical timeout, two rounds) is worth REGROUP_EDGE only while
 * the team is on a losing streak; economy/loss bonus and the opponent are
 * untouched. It used to soften the automatic tilt penalty, which no longer
 * exists (flat streak/tilt bonuses snowballed maps).
 */
export function regroupEdge(lossStreak: number, active: boolean): number {
    return active && lossStreak >= REGROUP_MIN_LOSS_STREAK ? REGROUP_EDGE : 0
}

export function managedLoadout(tactics: CustomTactics | undefined, teamId: string, managedTeamId: string | undefined): CustomTactics | undefined {
    return teamId === managedTeamId ? tactics : undefined
}
