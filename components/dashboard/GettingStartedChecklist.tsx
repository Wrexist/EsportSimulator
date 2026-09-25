"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useShallow } from 'zustand/react/shallow'
import { useGameStore } from '@/store/game-store'
import { firstSessionNext, restoreFirstSession } from '@/lib/first-session'

export function GettingStartedChecklist({ compact = false }: { compact?: boolean }) {
    const pathname = usePathname()
    const state = useGameStore(useShallow(s => ({
        guide: s.firstSession, initialized: s.isInitialized, loading: s.isLoading, teamId: s.playerTeamId,
        teams: s.teams, players: s.players, matches: s.scheduledMatches, completed: s.completedMatches,
        active: s.activeMatchId, ended: s.gameOverReason, review: s.reviewGuideStep, dismiss: s.completeTutorial,
    })))
    const guide = restoreFirstSession(state.guide)
    const team = state.teams.find(t => t.id === state.teamId)
    if (!state.initialized || state.loading || state.ended || !team || guide.status !== 'active' || state.active) return null
    const next = firstSessionNext(guide, team, state.players, state.matches, state.completed, state.active)
    const canReview = next.reviewPath && pathname === next.reviewPath
    return (
        <section aria-label="First session guide" className="rounded-xl border border-slate-600/50 bg-slate-900/95 p-4 shadow-lg">
            <div className="flex items-center justify-between gap-4">
                <p className="text-xs text-slate-400">First session <span className="ml-2 tabular-nums">{guide.reviewed.length}/4</span></p>
                <button onClick={state.dismiss} className="text-xs text-slate-400 hover:text-white focus-visible:outline" aria-label="Skip first session guide">Skip guide</button>
            </div>
            <h2 className="mt-2 text-base font-semibold text-slate-100">{next.title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-300">{next.detail}</p>
            <div className="mt-3 flex flex-wrap gap-2">
                {canReview ? <button onClick={() => state.review(next.step)} className="rounded-lg bg-emerald-400 px-3 py-2 text-sm font-medium text-slate-950 focus-visible:outline">{next.step === 'match' ? 'Finish guide' : 'Reviewed - continue'}</button>
                    : <Link href={next.href} className="rounded-lg bg-emerald-400 px-3 py-2 text-sm font-medium text-slate-950 focus-visible:outline">{next.step === 'plan' ? 'Choose weekly focus' : 'Open ' + (next.step === 'budget' ? 'finances' : next.step === 'squad' ? 'squad' : 'match details')}</Link>}
            </div>
            {!compact && <p className="mt-3 text-xs text-slate-400">The guide follows your career save. Replay it from Settings whenever you want.</p>}
        </section>
    )
}
