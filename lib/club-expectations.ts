import { deriveExpectationTier, getTierTargets } from '@/engine/board-expectations'
import type { BoardExpectationTier } from '@/engine/save-types'
import { t } from '@/lib/i18n'

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
    if (input.custom) notes.push(t('ng.note.custom'))
    else if (missing > 0) notes.push(t('ng.note.missing', { have: input.starters, missing }))
    if (input.budget < 300_000) notes.push(t('ng.note.smallBudget'))
    if (tier === 'WIN' || tier === 'CONTEND') notes.push(t('ng.note.high'))
    notes.push(t('ng.note.board'))
    notes.push(input.custom
        ? t('ng.note.customDiff')
        : t('ng.note.sameSim'))
    const level: ClubChallenge['level'] = tier === 'WIN' ? 'Very demanding' : tier === 'CONTEND' ? 'Demanding' : missing > 0 || input.budget < 300_000 ? 'Moderate' : tier === 'COMPETE' ? 'Moderate' : 'Gentle'
    return { tier, boardLabel: targets.label, boardBlurb: targets.blurb, rankTarget, trophyTarget: targets.trophyTarget, level, notes }
}

/** Cash a custom club actually starts with: the difficulty budget plus the 30% empty-roster
 *  recruitment allowance added by initializeCustomTeam in store/game-store.ts. */
export function customClubStartingCash(difficultyBudget: number): number {
    return difficultyBudget + Math.round(difficultyBudget * 0.3)
}
