import { t, tn } from './i18n'
import { WeeklyActivityType } from '@/types/activities'
import type { CompletedMatchSaveData, MatchSaveData, PlayerSaveData, TeamSaveData } from '@/engine/save-types'

import { formatCurrency } from "@/lib/utils-extended"
import { formatGameCalendarDate, gameCalendarDate } from "@/lib/game-calendar"
/**
 * First-session objective chain (L22).
 *
 * Five steps, completed by what the player actually does:
 *  - squad / budget: an explicit "done" on the squad / finances page (opening a link never counts),
 *    or, once a match has been played and a week has passed, done by playing (MODES-21)
 *  - decision: choosing a weekly focus, setting a player's training focus, signing a player, or any
 *    other management choice the career shows (staff hire, drill, gear, facility, academy, retraining,
 *    an answered decision in the inbox) (SQUAD-63, HOME-17)
 *  - match: a new own-team result that was actually played (forfeits do not count)
 *  - week: the career week advances past the week the guide started in
 *
 * The state is part of the career save (`firstSession`). `baseline` records the career at the
 * moment the guide started (new career or replay) so replaying on an older career requires new
 * actions instead of instantly completing from history. A guide still open more than
 * FIRST_SESSION_WEEKS weeks after it started retires itself (HOME-17).
 */
export type FirstSessionStep = 'squad' | 'budget' | 'decision' | 'match' | 'week'
export const FIRST_SESSION_STEPS: readonly FirstSessionStep[] = ['squad', 'budget', 'decision', 'match', 'week']
export interface FirstSessionBaseline {
    week: number
    lastResultId: string | null
    rosterIds: string[]
    /** Management marks at the start (managementMarks); a new mark later is a decision. Absent on older saves until the next sync. */
    managed?: string[]
}
/** Weeks after its start that an unfinished guide stays open (HOME-17). */
export const FIRST_SESSION_WEEKS = 4
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
    /** The own fixture "Play match" offers right now (selectPlayableMatchId), if any. */
    dueMatchId?: string | null
    /** The club's academy enrolments (state.academyPlayers). */
    academy?: ReadonlyArray<{ id: string; playerId: string; enrolledWeek: number }>
    /** The career inbox (state.eventsLog): an answered decision counts as the decision step. */
    events?: ReadonlyArray<{ id: string; week: number; selectedChoiceId?: string }>
    /** Career epoch, so the next fixture is named by its date like Home does (START-55). */
    gameStartDate?: string | null
    /** The money facts the budget step states (NEWPLAYER-25). */
    budgetFacts?: { maxFee: number; weeklyNet: number; cashTarget: number | null }
}

const STATUSES = ['active', 'dismissed', 'complete'] as const
const DISMISSED: FirstSessionState = { version: 2, status: 'dismissed', reviewed: [] }

export const newFirstSession = (baseline?: FirstSessionBaseline): FirstSessionState =>
    baseline ? { version: 2, status: 'active', reviewed: [], baseline: copyBaseline(baseline) } : { version: 2, status: 'active', reviewed: [] }

function copyBaseline(b: FirstSessionBaseline): FirstSessionBaseline {
    const copy: FirstSessionBaseline = { week: b.week, lastResultId: b.lastResultId, rosterIds: [...b.rosterIds] }
    if (b.managed) copy.managed = [...b.managed]
    return copy
}

function restoreBaseline(value: unknown): FirstSessionBaseline | undefined {
    const b = value as Partial<FirstSessionBaseline> | undefined
    if (!b || typeof b !== 'object' || typeof b.week !== 'number' || !Number.isFinite(b.week)) return undefined
    if (b.lastResultId !== null && typeof b.lastResultId !== 'string') return undefined
    if (!Array.isArray(b.rosterIds) || b.rosterIds.length > 64 || !b.rosterIds.every(id => typeof id === 'string')) return undefined
    const restored: FirstSessionBaseline = { week: b.week, lastResultId: b.lastResultId ?? null, rosterIds: [...b.rosterIds] }
    if (Array.isArray(b.managed) && b.managed.length <= 1024 && b.managed.every(m => typeof m === 'string')) restored.managed = [...b.managed]
    return restored
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

/**
 * What the manager has set up in the club, as marks: a mark that was not there when the guide
 * started is a management decision taken since (SQUAD-63). Only things the manager does add
 * marks: hiring staff, buying gear, building or upgrading, enrolling a prospect, retraining a
 * player, running a drill this week, answering an inbox decision (an expired one is not an answer).
 */
export function managementMarks(ctx: Pick<FirstSessionContext, 'team' | 'currentWeek' | 'academy' | 'events'>, sinceWeek: number): string[] {
    const { team } = ctx
    const marks: string[] = []
    for (const id of team.staffIds ?? []) marks.push(`staff:${id}`)
    for (const item of team.equipment ?? []) marks.push(`gear:${item.id}`)
    // One mark per level reached, so only a build or an upgrade adds one (a downgrade adds none).
    const levels = (kind: string, level: number | undefined) => { for (let l = 1; l <= Math.min(level ?? 0, 10); l++) marks.push(`${kind}:${l}`) }
    levels('fac:base', team.facilitiesLevel)
    for (const f of team.facilities ?? []) levels(`fac:${f.type}`, f.level)
    levels('academy', team.academyFacility?.level)
    // The yearly youth intake joins on its own (id academy_<player>_<week>): only an enrolment is a choice.
    for (const a of ctx.academy ?? []) if (a.id !== `academy_${a.playerId}_${a.enrolledWeek}`) marks.push(`prospect:${a.id}`)
    const retraining = team.activeRoleTraining ?? []
    for (const r of retraining) marks.push(`retrain:${r.playerId}:${r.startWeek}`)
    // Drills use the weekly training slots that retraining does not hold; slots reset each week.
    const drills = Math.max(0, (team.trainingSlotsUsed ?? 0) - retraining.length)
    for (let i = 1; i <= drills; i++) marks.push(`drill:${ctx.currentWeek}:${i}`)
    for (const e of ctx.events ?? []) {
        if (e.week >= sinceWeek && e.selectedChoiceId && e.selectedChoiceId !== 'expired') marks.push(`event:${e.id}`)
    }
    return marks
}

export function captureFirstSessionBaseline(ctx: Pick<FirstSessionContext, 'team' | 'completed' | 'currentWeek' | 'academy' | 'events'>): FirstSessionBaseline {
    return {
        week: ctx.currentWeek, lastResultId: lastOwnPlayedResult(ctx.team.id, ctx.completed)?.id ?? null, rosterIds: [...ctx.team.rosterIds],
        managed: managementMarks(ctx, ctx.currentWeek),
    }
}

/** Steps proven by career state since the baseline (not by clicks). */
export function derivedFirstSessionSteps(state: FirstSessionState, ctx: FirstSessionContext): FirstSessionStep[] {
    const b = state.baseline
    if (!b) return []
    const done: FirstSessionStep[] = []
    if (ctx.team.rosterIds.some(id => !b.rosterIds.includes(id))) done.push('decision')
    else if (b.managed) {
        const before = new Set(b.managed)
        if (managementMarks(ctx, b.week).some(m => !before.has(m))) done.push('decision')
    }
    const last = lastOwnPlayedResult(ctx.team.id, ctx.completed)
    if (last && last.id !== b.lastResultId) done.push('match')
    if (ctx.currentWeek > b.week) done.push('week')
    // A player who has played a match and seen a week pass has looked at the squad and
    // the money: the guide stops asking for the on-page confirmation (MODES-21).
    if (done.includes('match') && done.includes('week')) done.unshift('squad', 'budget')
    return done
}

/**
 * Bring an active guide up to date with the career: capture a missing baseline (new careers,
 * migrated v1 guides) and record steps proven by state. Returns the same object when nothing changed.
 */
export function syncFirstSessionProgress(state: FirstSessionState, ctx: FirstSessionContext): FirstSessionState {
    if (state.status !== 'active') return state
    if (!state.baseline) return { ...state, baseline: captureFirstSessionBaseline(ctx) }
    // A guide still unfinished weeks later only covers the screen: it retires itself (HOME-17).
    if (ctx.currentWeek > state.baseline.week + FIRST_SESSION_WEEKS) return { ...state, status: 'complete', reviewed: [...FIRST_SESSION_STEPS] }
    // Saves from before management marks: start watching from now, without counting the past.
    if (!state.baseline.managed) state = { ...state, baseline: { ...copyBaseline(state.baseline), managed: managementMarks(ctx, state.baseline.week) } }
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

/** The step's name in the checklist (translation key first-session.label.<step>). */
export function firstSessionLabel(step: FirstSessionStep): string {
    return t(`firstSession.label.${step}`)
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
    const cash = `${formatCurrency(Math.round(team.budget), "$", false)}`
    const base = { step, title: firstSessionLabel(step), alternatives: [] as FirstSessionLink[], reviewPath: '', reviewLabel: '' }
    // An empty club has nobody to assess: the first move is signing players (START-56).
    if (step === 'squad' && starters === 0) return {
        ...base,
        detail: t('firstSession.squad.empty'),
        action: { href: '/transfers', label: t('firstSession.findPlayers') },
        alternatives: [{ href: '/squad', label: t('firstSession.openSquad') }],
        reviewPath: '/squad', reviewLabel: t('firstSession.squad.review'),
        help: t('firstSession.squad.help'),
    }
    if (step === 'squad') return {
        ...base,
        detail: missing > 0
            ? t('firstSession.squad.missing', { starters, missing })
            : t('firstSession.squad.full', { starters }),
        action: { href: '/squad', label: t('firstSession.openSquad') },
        reviewPath: '/squad', reviewLabel: t('firstSession.squad.review'),
        help: t('firstSession.squad.help'),
    }
    if (step === 'budget') {
        // The numbers the step asks about, stated together (NEWPLAYER-25).
        const facts = ctx.budgetFacts
        const money = (n: number) => formatCurrency(Math.round(n), "$", true)
        const detail = !facts ? t('firstSession.budget.detail', { cash }) : [
            facts.weeklyNet > 0
                ? t('firstSession.budget.facts', { cash, fee: money(facts.maxFee), room: money(facts.weeklyNet) })
                : t('firstSession.budget.factsLoss', { cash, fee: money(facts.maxFee), loss: money(-facts.weeklyNet) }),
            ...(facts.cashTarget !== null && facts.cashTarget > 0 ? [t('firstSession.budget.target', { target: money(facts.cashTarget) })] : []),
        ].join(' ')
        return {
            ...base,
            detail,
            action: { href: '/finances', label: t('firstSession.openFinances') },
            reviewPath: '/finances', reviewLabel: t('firstSession.budget.review'),
            help: t('firstSession.budget.help'),
        }
    }
    if (step === 'decision') {
        const recruit = { href: '/transfers', label: t('firstSession.signPlayer') }
        const focus = { href: '/week#weekly-focus', label: t('firstSession.chooseFocus') }
        const training = { href: '/week#training-focus', label: t('firstSession.setTraining') }
        return {
            ...base,
            detail: missing > 0 ? tn('firstSession.decision.short', missing) : t('firstSession.decision.full'),
            action: missing > 0 ? recruit : focus,
            alternatives: missing > 0 ? [focus, training] : [training, recruit],
            help: t('firstSession.decision.help'),
        }
    }
    if (step === 'match') {
        const help = t('firstSession.match.help')
        if (activeMatchId) return { ...base, detail: t('firstSession.match.inProgress'), action: { href: `/match/${activeMatchId}/live`, label: t('firstSession.resumeMatch') }, help }
        if (missing > 0) return { ...base, detail: t('firstSession.match.missing', { missing }), action: { href: '/transfers', label: t('firstSession.findPlayers') }, help }
        // Match day: take the player to the match, not to the calendar (MODES-25).
        if (ctx.dueMatchId) return {
            ...base,
            detail: t('firstSession.match.today'),
            action: { href: `/match/${ctx.dueMatchId}/tactics`, label: t('firstSession.prepareMatch') },
            alternatives: [{ href: '/schedule', label: t('firstSession.openSchedule') }],
            help,
        }
        const upcoming = matches.filter(ownsMatch(team.id)).sort((a, b) => a.week - b.week || (a.day ?? 6) - (b.day ?? 6))[0]
        // Named by its date, as on Home and in the brief (START-55).
        const date = upcoming && (ctx.gameStartDate
            ? formatGameCalendarDate(gameCalendarDate(ctx.gameStartDate, upcoming.week, upcoming.day ?? 6), { weekday: "short", month: "short", day: "numeric" })
            : t('common.day', { n: (upcoming.day ?? 6) + 1 }))
        return {
            ...base,
            detail: upcoming
                ? t('firstSession.match.next', { week: upcoming.week, date })
                : t('firstSession.match.none'),
            action: { href: '/schedule', label: t('firstSession.openSchedule') },
            help,
        }
    }
    const last = lastOwnPlayedResult(team.id, ctx.completed)
    return {
        ...base,
        detail: t('firstSession.week.detail'),
        action: { href: '/', label: t('firstSession.backHome') },
        alternatives: last && state.baseline && last.id !== state.baseline.lastResultId ? [{ href: `/match/${last.id}/result`, label: t('firstSession.reviewResult') }] : [],
        help: t('firstSession.week.help'),
    }
}

export function restoreWeeklyPlan(value: unknown): WeeklyActivityType | null {
    return Object.values(WeeklyActivityType).includes(value as WeeklyActivityType) ? value as WeeklyActivityType : null
}
