"use client"

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Check } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useGameStore } from '@/store/game-store'
import { FIRST_SESSION_LABELS, FIRST_SESSION_STEPS, firstSessionGuidance, restoreFirstSession } from '@/lib/first-session'

/**
 * First-session objective chain (L22). A small, nonmodal "next step" card driven by career state.
 * Home shows the full five-step checklist; other management pages show only the next step.
 * It disappears once the guide is complete or skipped (replay from Settings).
 */
export function GettingStartedChecklist({ compact = false }: { compact?: boolean }) {
    const pathname = usePathname()
    const state = useGameStore(useShallow(s => ({
        guide: s.firstSession, initialized: s.isInitialized, loading: s.isLoading, teamId: s.playerTeamId,
        teams: s.teams, players: s.players, matches: s.scheduledMatches, completed: s.completedMatches,
        week: s.currentWeek, active: s.activeMatchId, ended: s.gameOverReason,
        review: s.reviewGuideStep, sync: s.syncFirstSession, dismiss: s.completeTutorial,
    })))
    const guide = restoreFirstSession(state.guide)
    const team = state.teams.find(t => t.id === state.teamId)
    const rosterKey = team?.rosterIds.join(',') ?? ''
    const lastResultId = state.completed[state.completed.length - 1]?.id

    // Record steps proven by the career itself: a signing, a played result, the week advancing.
    const { sync, initialized, loading, active } = state
    useEffect(() => {
        if (initialized && !loading && !active && guide.status === 'active') sync()
    }, [sync, initialized, loading, active, guide.status, rosterKey, lastResultId, state.week])

    if (!state.initialized || state.loading || state.ended || !team || guide.status !== 'active' || state.active) return null
    const next = firstSessionGuidance(guide, { team, players: state.players, matches: state.matches, completed: state.completed, currentWeek: state.week, activeMatchId: state.active })
    if (!next) return null
    const canReview = next.reviewPath !== '' && pathname === next.reviewPath
    const done = guide.reviewed.length

    return (
        <section aria-labelledby="first-session-title" className="rounded-xl border border-slate-600/50 bg-slate-900/95 p-4 shadow-lg">
            <div className="flex items-center justify-between gap-4">
                <p id="first-session-title" className="text-xs text-slate-400">
                    First session <span className="ml-2 tabular-nums">{done}/{FIRST_SESSION_STEPS.length} done</span>
                </p>
                <button type="button" onClick={state.dismiss} className="rounded text-xs text-slate-400 hover:text-white focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-emerald-400" aria-label="Skip first session guide. You can replay it from Settings.">Skip guide</button>
            </div>

            {!compact && (
                <ol className="mt-3 space-y-1" aria-label="First session steps">
                    {FIRST_SESSION_STEPS.map(step => {
                        const isDone = guide.reviewed.includes(step)
                        const isCurrent = step === next.step
                        return (
                            <li key={step} aria-current={isCurrent ? 'step' : undefined} className={`flex items-center gap-2 text-sm ${isDone ? 'text-slate-500' : isCurrent ? 'font-medium text-slate-100' : 'text-slate-400'}`}>
                                <span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${isDone ? 'border-emerald-400 bg-emerald-400 text-slate-950' : isCurrent ? 'border-emerald-400' : 'border-slate-600'}`}>
                                    {isDone && <Check size={10} strokeWidth={3} />}
                                </span>
                                <span className={isDone ? 'line-through' : undefined}>{FIRST_SESSION_LABELS[step]}</span>
                                <span className="sr-only">{isDone ? '(done)' : isCurrent ? '(next)' : ''}</span>
                            </li>
                        )
                    })}
                </ol>
            )}

            <div className={compact ? 'mt-2' : 'mt-3 border-t border-white/5 pt-3'}>
                <h2 className="text-base font-semibold text-slate-100">{next.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-300">{next.detail}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    {canReview
                        ? <button type="button" onClick={() => state.review(next.step)} className="rounded-lg bg-emerald-400 px-3 py-2 text-sm font-medium text-slate-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-200">{next.reviewLabel}</button>
                        : next.action.href !== pathname && <Link href={next.action.href} className="rounded-lg bg-emerald-400 px-3 py-2 text-sm font-medium text-slate-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-200">{next.action.label}</Link>}
                    {!compact && next.alternatives.map(link => (
                        <Link key={link.href} href={link.href} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/5 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-emerald-400">{link.label}</Link>
                    ))}
                </div>
                <details className="mt-3 text-xs text-slate-400">
                    <summary className="cursor-pointer rounded hover:text-slate-200 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-emerald-400">Why this matters</summary>
                    <p className="mt-1 leading-relaxed">{next.help}</p>
                </details>
            </div>
        </section>
    )
}
