import { deriveExpectationTier, getTierTargets } from '@/engine/board-expectations'
import type { BoardExpectationTier } from '@/engine/save-types'

/**
 * Plain-language summary of what a club asks of a new manager, shown before committing to it (L22).
 * Board numbers mirror ensureBoardState() in engine/board-expectations.ts, which sets the real
 * targets when the career starts; __tests__/l22-first-session.test.ts keeps the two in step.
 */
export interface ClubChallenge {
    tier: BoardExpectationTier
    boardLabel: string
    boardBlurb: string
    rankTarget: number
    trophyTarget: number
    level: 'Gentle' | 'Moderate' | 'Demanding' | 'Very demanding'
    notes: string[]
}

export function boardStartTargets(worldRanking: number | undefined, reputation: number | undefined) {
    const ranking = worldRanking ?? 30
    const tier = deriveExpectationTier(ranking, reputation ?? 50)
    const targets = getTierTargets(tier)
    return { tier, targets, rankTarget: Math.max(targets.rankTarget, ranking > 30 ? Math.ceil(ranking * 0.9) : 0) }
}

export function describeClubChallenge(input: { worldRanking?: number; reputation?: number; starters: number; budget: number; custom?: boolean }): ClubChallenge {
    const { tier, targets, rankTarget } = boardStartTargets(input.worldRanking, input.reputation)
    const missing = Math.max(0, 5 - input.starters)
    const notes: string[] = []
    if (input.custom) notes.push('Your club starts with no players. Sign five in the roster builder or in Transfers; their wages come out of your starting cash every week.')
    else if (missing > 0) notes.push(`Only ${input.starters} of 5 players. You must sign ${missing} before your first match; the starting cash includes an allowance for that, but wages still come out of it every week.`)
    if (input.budget < 300_000) notes.push('Small budget: a single expensive signing can leave little cash for wages. Free agents and regular training keep costs down.')
    if (tier === 'WIN' || tier === 'CONTEND') notes.push('High expectations: a top club is expected to win now, so there is little room for a slow start.')
    notes.push('The board reviews each season against these targets. Missing them lowers its confidence. You are put on notice before you can be dismissed, so one bad season does not end a career.')
    notes.push(input.custom
        ? 'Difficulty sets starting cash, reputation and recurring sponsor/merchandise income. It does not change match simulation.'
        : 'Match simulation is the same for every club. The challenge comes from squad strength, cash and the board targets.')
    const level: ClubChallenge['level'] = tier === 'WIN' ? 'Very demanding' : tier === 'CONTEND' ? 'Demanding' : missing > 0 || input.budget < 300_000 ? 'Moderate' : tier === 'COMPETE' ? 'Moderate' : 'Gentle'
    return { tier, boardLabel: targets.label, boardBlurb: targets.blurb, rankTarget, trophyTarget: targets.trophyTarget, level, notes }
}

/** Cash a custom club actually starts with: the difficulty budget plus the 30% empty-roster
 *  recruitment allowance added by initializeCustomTeam in store/game-store.ts. */
export function customClubStartingCash(difficultyBudget: number): number {
    return difficultyBudget + Math.round(difficultyBudget * 0.3)
}
