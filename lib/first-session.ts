import { WeeklyActivityType } from '@/types/activities'
import type { CompletedMatchSaveData, MatchSaveData, PlayerSaveData, TeamSaveData } from '@/engine/save-types'

export type FirstSessionStep = 'squad' | 'budget' | 'plan' | 'match'
export interface FirstSessionState { version: 1; status: 'active' | 'dismissed' | 'complete'; reviewed: FirstSessionStep[] }
const steps: FirstSessionStep[] = ['squad', 'budget', 'plan', 'match']
export const newFirstSession = (): FirstSessionState => ({ version: 1, status: 'active', reviewed: [] })
export function restoreFirstSession(value: unknown): FirstSessionState {
    const v = value as Partial<FirstSessionState> | undefined
    if (v?.version !== 1 || !['active', 'dismissed', 'complete'].includes(v.status || '')) return { version: 1, status: 'dismissed', reviewed: [] }
    return { version: 1, status: v.status!, reviewed: steps.filter(s => Array.isArray(v.reviewed) && v.reviewed.includes(s)) }
}
export function reviewFirstSession(state: FirstSessionState, step: FirstSessionStep): FirstSessionState {
    if (state.status !== 'active' || !steps.includes(step)) return state
    const reviewed = steps.filter(s => s === step || state.reviewed.includes(s))
    return { ...state, reviewed, status: reviewed.length === steps.length ? 'complete' : 'active' }
}
export function firstSessionNext(state: FirstSessionState, team: TeamSaveData, players: PlayerSaveData[], matches: MatchSaveData[], completed: CompletedMatchSaveData[], activeMatchId?: string | null) {
    const step = steps.find(s => !state.reviewed.includes(s)) || 'match'
    const activeCount = new Set(team.rosterIds.slice(0, 5).filter(id => players.some(p => p.id === id && !p.isRetired))).size
    const result = completed.find(m => m.homeTeamId === team.id || m.awayTeamId === team.id)
    const upcoming = matches.filter(m => m.homeTeamId === team.id || m.awayTeamId === team.id).sort((a, b) => a.week - b.week || (a.day ?? 6) - (b.day ?? 6))[0]
    if (step === 'squad') return { step, title: 'Assess your starting five', detail: `${activeCount}/5 selected players are available. Review roles, energy and form. Missing players need recruitment before a match.`, href: '/squad', reviewPath: '/squad' }
    if (step === 'budget') return { step, title: 'Check what you can afford', detail: `Cash: $${Math.round(team.budget).toLocaleString('en-US')}. Compare weekly wages and forecast before buying. Prizes are uncertain; a free agent still needs a salary.`, href: '/finances', reviewPath: '/finances' }
    if (step === 'plan') return { step, title: 'Choose your weekly plan', detail: 'Select a focus on Home. Compare its cost, training and energy effects; keeping regular training is a valid choice. The step completes when you choose.', href: '/#weekly-focus', reviewPath: '' }
    if (result) return { step, title: 'Learn from your first result', detail: 'Open your report. Identify one performance to improve and use its training, squad or scouting links.', href: `/match/${result.id}/result`, reviewPath: `/match/${result.id}/result` }
    if (activeMatchId) return { step, title: 'Resume your match', detail: 'Continue the recorded match before starting another. Your choices and pending rounds are preserved.', href: `/match/${activeMatchId}/live`, reviewPath: '' }
    if (activeCount < 5) return { step, title: 'Fill your starting lineup', detail: 'You need five available starters. Compare affordable free agents, then review the squad order.', href: '/transfers', reviewPath: '' }
    return { step, title: 'Prepare your first match', detail: upcoming ? `Your next fixture is in week ${upcoming.week}, day ${(upcoming.day ?? 6) + 1}. Check the schedule and advance time only when ready. Paid preparation is optional.` : 'No fixture is scheduled. Use the schedule to arrange a friendly when your squad is ready.', href: '/schedule', reviewPath: '' }
}

export function restoreWeeklyPlan(value: unknown): WeeklyActivityType | null {
    return Object.values(WeeklyActivityType).includes(value as WeeklyActivityType) ? value as WeeklyActivityType : null
}
