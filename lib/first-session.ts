import { WeeklyActivityType } from '@/types/activities'
import type { CompletedMatchSaveData, MatchSaveData, PlayerSaveData, TeamSaveData } from '@/engine/save-types'

/**
 * First-session objective chain (L22).
 *
 * Five steps, completed by what the player actually does:
 *  - squad / budget: an explicit "done" on the squad / finances page (opening a link never counts)
 *  - decision: choosing a weekly focus, setting a player's training focus, or signing a player
 *  - match: a new own-team result that was actually played (forfeits do not count)
 *  - week: the career week advances past the week the guide started in
 *
 * The state is part of the career save (`firstSession`). `baseline` records the career at the
 * moment the guide started (new career or replay) so replaying on an older career requires new
 * actions instead of instantly completing from history.
 */
export type FirstSessionStep = 'squad' | 'budget' | 'decision' | 'match' | 'week'
export const FIRST_SESSION_STEPS: readonly FirstSessionStep[] = ['squad', 'budget', 'decision', 'match', 'week']
export interface FirstSessionBaseline { week: number; lastResultId: string | null; rosterIds: string[] }
export interface FirstSessionState {
    version: 2
    status: 'active' | 'dismissed' | 'complete'
    reviewed: FirstSessionStep[]
    baseline?: FirstSessionBaseline
}
/** Career facts the guide reads. All come from the live store / save. */
export interface FirstSessionContext {
    team: TeamSaveData
    players: PlayerSaveData[]
    matches: MatchSaveData[]
    completed: CompletedMatchSaveData[]
    currentWeek: number
    activeMatchId?: string | null
}

const STATUSES = ['active', 'dismissed', 'complete'] as const
const DISMISSED: FirstSessionState = { version: 2, status: 'dismissed', reviewed: [] }

export const newFirstSession = (baseline?: FirstSessionBaseline): FirstSessionState =>
    baseline ? { version: 2, status: 'active', reviewed: [], baseline: copyBaseline(baseline) } : { version: 2, status: 'active', reviewed: [] }

function copyBaseline(b: FirstSessionBaseline): FirstSessionBaseline {
    return { week: b.week, lastResultId: b.lastResultId, rosterIds: [...b.rosterIds] }
}

function restoreBaseline(value: unknown): FirstSessionBaseline | undefined {
    const b = value as Partial<FirstSessionBaseline> | undefined
    if (!b || typeof b !== 'object' || typeof b.week !== 'number' || !Number.isFinite(b.week)) return undefined
    if (b.lastResultId !== null && typeof b.lastResultId !== 'string') return undefined
    if (!Array.isArray(b.rosterIds) || b.rosterIds.length > 64 || !b.rosterIds.every(id => typeof id === 'string')) return undefined
    return { week: b.week, lastResultId: b.lastResultId ?? null, rosterIds: [...b.rosterIds] }
}

/**
 * Normalise saved guide data. Missing/unknown data (old saves, other versions) defaults to
 * dismissed so a loaded career never inherits a guide; Settings can replay it.
 * Version 1 (four steps: squad, budget, plan, match) migrates in place: plan -> decision.
 */
export function restoreFirstSession(value: unknown): FirstSessionState {
    const v = value as { version?: unknown; status?: unknown; reviewed?: unknown; baseline?: unknown } | undefined
    if (!v || typeof v !== 'object' || !STATUSES.includes(v.status as typeof STATUSES[number])) return { ...DISMISSED, reviewed: [] }
    const status = v.status as FirstSessionState['status']
    const raw = Array.isArray(v.reviewed) ? v.reviewed : []
    if (v.version === 1) {
        const mapped = raw.map(s => s === 'plan' ? 'decision' : s)
        return { version: 2, status, reviewed: FIRST_SESSION_STEPS.filter(s => s !== 'week' && mapped.includes(s)) }
    }
    if (v.version !== 2) return { ...DISMISSED, reviewed: [] }
    const baseline = restoreBaseline(v.baseline)
    const reviewed = FIRST_SESSION_STEPS.filter(s => raw.includes(s))
    return baseline ? { version: 2, status, reviewed, baseline } : { version: 2, status, reviewed }
}

/** Record a step. Ignored unless the guide is active. Completes the guide when all steps are done. */
export function reviewFirstSession(state: FirstSessionState, step: FirstSessionStep): FirstSessionState {
    if (state.status !== 'active' || !FIRST_SESSION_STEPS.includes(step)) return state
    if (state.reviewed.includes(step)) return state
    const reviewed = FIRST_SESSION_STEPS.filter(s => s === step || state.reviewed.includes(s))
    return { ...state, reviewed, status: reviewed.length === FIRST_SESSION_STEPS.length ? 'complete' : 'active' }
}

const ownsMatch = (teamId: string) => (m: MatchSaveData) => m.homeTeamId === teamId || m.awayTeamId === teamId
/** A forfeit result has no maps; it was not played and must not count as "played your first match". */
function wasPlayed(m: CompletedMatchSaveData): boolean {
    const maps = (m.result as { maps?: unknown[] } | undefined)?.maps
    return !(Array.isArray(maps) && maps.length === 0)
}
export function lastOwnPlayedResult(teamId: string, completed: CompletedMatchSaveData[]): CompletedMatchSaveData | undefined {
    for (let i = completed.length - 1; i >= 0; i--) if (ownsMatch(teamId)(completed[i]) && wasPlayed(completed[i])) return completed[i]
    return undefined
}

export function captureFirstSessionBaseline(ctx: Pick<FirstSessionContext, 'team' | 'completed' | 'currentWeek'>): FirstSessionBaseline {
    return { week: ctx.currentWeek, lastResultId: lastOwnPlayedResult(ctx.team.id, ctx.completed)?.id ?? null, rosterIds: [...ctx.team.rosterIds] }
}

/** Steps proven by career state since the baseline (not by clicks). */
export function derivedFirstSessionSteps(state: FirstSessionState, ctx: FirstSessionContext): FirstSessionStep[] {
    const b = state.baseline
    if (!b) return []
    const done: FirstSessionStep[] = []
    if (ctx.team.rosterIds.some(id => !b.rosterIds.includes(id))) done.push('decision')
    const last = lastOwnPlayedResult(ctx.team.id, ctx.completed)
    if (last && last.id !== b.lastResultId) done.push('match')
    if (ctx.currentWeek > b.week) done.push('week')
    return done
}

/**
 * Bring an active guide up to date with the career: capture a missing baseline (new careers,
 * migrated v1 guides) and record steps proven by state. Returns the same object when nothing changed.
 */
export function syncFirstSessionProgress(state: FirstSessionState, ctx: FirstSessionContext): FirstSessionState {
    if (state.status !== 'active') return state
    if (!state.baseline) return { ...state, baseline: captureFirstSessionBaseline(ctx) }
    let next = state
    for (const step of derivedFirstSessionSteps(state, ctx)) next = reviewFirstSession(next, step)
    return next
}

export function availableStarters(team: TeamSaveData, players: PlayerSaveData[]): number {
    return new Set(team.rosterIds.slice(0, 5).filter(id => players.some(p => p.id === id && !p.isRetired))).size
}

export interface FirstSessionLink { href: string; label: string }
export interface FirstSessionGuidance {
    step: FirstSessionStep
    title: string
    detail: string
    /** Primary navigation. */
    action: FirstSessionLink
    /** Other valid ways to do the same step. */
    alternatives: FirstSessionLink[]
    /** Route on which the explicit "done" control appears (squad/budget only). */
    reviewPath: string
    reviewLabel: string
    /** Short contextual help, shown only on request. */
    help: string
}

export const FIRST_SESSION_LABELS: Record<FirstSessionStep, string> = {
    squad: 'Assess your squad',
    budget: 'Check what you can afford',
    decision: 'Make one training or recruitment decision',
    match: 'Play your first match',
    week: 'Advance to next week',
}

export function firstSessionNextStep(state: FirstSessionState): FirstSessionStep | null {
    return FIRST_SESSION_STEPS.find(s => !state.reviewed.includes(s)) ?? null
}

/** Guidance for the first incomplete step, or null when everything is done. */
export function firstSessionGuidance(state: FirstSessionState, ctx: FirstSessionContext): FirstSessionGuidance | null {
    const step = firstSessionNextStep(state)
    if (!step) return null
    const { team, players, matches, activeMatchId } = ctx
    const starters = availableStarters(team, players)
    const missing = Math.max(0, 5 - starters)
    const cash = `$${Math.round(team.budget).toLocaleString('en-US')}`
    const base = { step, title: FIRST_SESSION_LABELS[step], alternatives: [] as FirstSessionLink[], reviewPath: '', reviewLabel: '' }
    if (step === 'squad') return {
        ...base,
        detail: missing > 0
            ? `${starters}/5 starters available. You need ${missing} more before a match can be played. Look at who you have first, then sign players in Transfers.`
            : `${starters}/5 starters available. Look at each player's role and rating to see where the team is strong or thin.`,
        action: { href: '/squad', label: 'Open squad' },
        reviewPath: '/squad', reviewLabel: 'Done assessing squad',
        help: 'OVR is overall ability. Each lineup needs five players; covering the main roles (AWPer, in-game leader, entry) once each usually beats stacking one role.',
    }
    if (step === 'budget') return {
        ...base,
        detail: `Cash: ${cash}. Wages and running costs come out of cash every week. Check the weekly outgoings before you add salary.`,
        action: { href: '/finances', label: 'Open finances' },
        reviewPath: '/finances', reviewLabel: 'Done checking finances',
        help: 'Prize money is uncertain; sponsor and merchandise income is recurring. A free agent has no transfer fee but still needs a paid contract. Running out of cash limits what you can do.',
    }
    if (step === 'decision') {
        const recruit = { href: '/transfers', label: 'Sign a player' }
        const focus = { href: '/#weekly-focus', label: 'Choose weekly focus' }
        const training = { href: '/training', label: 'Set training focus' }
        return {
            ...base,
            detail: missing > 0
                ? `You are ${missing} player${missing === 1 ? '' : 's'} short. Signing one counts as your decision. You can also pick a weekly focus or a player's training focus.`
                : 'Pick a weekly focus on Home, set a player\'s training focus, or sign a player. This step completes when you make the choice.',
            action: missing > 0 ? recruit : focus,
            alternatives: missing > 0 ? [focus, training] : [training, recruit],
            help: 'Regular training is free and is a valid choice. Paid weekly plans are charged when the week is processed, and only offered when you have the cash.',
        }
    }
    if (step === 'match') {
        const help = 'You can watch the match live or simulate it. Tactics are optional. Your choices and pending rounds are saved if you leave mid-match.'
        if (activeMatchId) return { ...base, detail: 'You have a match in progress. Continue it before starting another.', action: { href: `/match/${activeMatchId}/live`, label: 'Resume match' }, help }
        if (missing > 0) return { ...base, detail: `You need five available starters to play. Sign ${missing} more in Transfers, then check the squad order.`, action: { href: '/transfers', label: 'Find players' }, help }
        const upcoming = matches.filter(ownsMatch(team.id)).sort((a, b) => a.week - b.week || (a.day ?? 6) - (b.day ?? 6))[0]
        return {
            ...base,
            detail: upcoming
                ? `Next fixture: week ${upcoming.week}, day ${(upcoming.day ?? 6) + 1}. Advance time from the top bar. When the match is due, the top bar shows Play match.`
                : 'No fixture is scheduled. Use the schedule to arrange a friendly once your squad is ready.',
            action: { href: '/schedule', label: 'Open schedule' },
            help,
        }
    }
    const last = lastOwnPlayedResult(team.id, ctx.completed)
    return {
        ...base,
        detail: 'Advance to next week from the top bar (Skip week in daily mode, Continue in weekly mode). Your weekly focus and wages are settled then.',
        action: { href: '/', label: 'Back to Home' },
        alternatives: last && state.baseline && last.id !== state.baseline.lastResultId ? [{ href: `/match/${last.id}/result`, label: 'Review your result' }] : [],
        help: 'Processing the week applies training, wages and income, then saves the career. Check Home and Finances afterwards to see what changed.',
    }
}

export function restoreWeeklyPlan(value: unknown): WeeklyActivityType | null {
    return Object.values(WeeklyActivityType).includes(value as WeeklyActivityType) ? value as WeeklyActivityType : null
}
