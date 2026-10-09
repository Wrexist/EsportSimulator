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
