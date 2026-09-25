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

/** Regroup softens our tilt calculation; economy/loss bonus and the opponent remain intact. */
export function regroupLossStreak(lossStreak: number, active: boolean): number {
    return Math.max(0, lossStreak - (active ? 2 : 0))
}

export function managedLoadout(tactics: CustomTactics | undefined, teamId: string, managedTeamId: string | undefined): CustomTactics | undefined {
    return teamId === managedTeamId ? tactics : undefined
}
