"use client"

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Check } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useGameStore } from '@/store/game-store'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
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
        <section aria-labelledby="first-session-title" className="rounded-lg border border-line-strong bg-panel">
            <header className="flex min-h-11 items-center justify-between gap-4 border-b border-line px-4 py-2">
                <p id="first-session-title" className="text-sm font-semibold text-ink-1">
                    First session <span className="ml-2 text-xs font-normal tabular-nums text-ink-3">{done} / {FIRST_SESSION_STEPS.length} done</span>
                </p>
                <button type="button" onClick={state.dismiss} className="rounded-sm text-xs font-medium text-ink-3 hover:text-ink-1" aria-label="Skip first session guide. You can replay it from Settings.">Skip guide</button>
            </header>

            <div className="p-4">
                {!compact && (
                    <ol className="mb-3 space-y-1.5" aria-label="First session steps">
                        {FIRST_SESSION_STEPS.map(step => {
                            const isDone = guide.reviewed.includes(step)
                            const isCurrent = step === next.step
                            return (
                                <li key={step} aria-current={isCurrent ? 'step' : undefined} className={cn('flex items-center gap-2.5 text-sm', isDone ? 'text-ink-3' : isCurrent ? 'font-semibold text-ink-1' : 'text-ink-2')}>
                                    <span aria-hidden="true" className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', isDone ? 'border-positive bg-positive text-ink' : isCurrent ? 'border-ink-1' : 'border-line-strong')}>
                                        {isDone && <Check size={10} strokeWidth={3} />}
                                    </span>
                                    <span className={isDone ? 'line-through' : undefined}>{FIRST_SESSION_LABELS[step]}</span>
                                    <span className="sr-only">{isDone ? '(done)' : isCurrent ? '(next)' : ''}</span>
                                </li>
                            )
                        })}
                    </ol>
                )}

                <div className={compact ? undefined : 'border-t border-line pt-3'}>
                    <h2 className="text-sm font-semibold text-ink-1">{next.title}</h2>
                    <p className="mt-1 text-sm leading-relaxed text-ink-2">{next.detail}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        {canReview
                            ? <Button size="sm" variant="outline" onClick={() => state.review(next.step)}>{next.reviewLabel}</Button>
                            : next.action.href !== pathname && <Button asChild size="sm" variant="outline"><Link href={next.action.href}>{next.action.label}</Link></Button>}
                        {!compact && next.alternatives.map(link => (
                            <Button key={link.href} asChild size="sm" variant="ghost"><Link href={link.href}>{link.label}</Link></Button>
                        ))}
                    </div>
                    <details className="mt-3 text-xs text-ink-3">
                        <summary className="cursor-pointer rounded-sm hover:text-ink-1">Why this matters</summary>
                        <p className="mt-1 leading-relaxed">{next.help}</p>
                    </details>
                </div>
            </div>
        </section>
    )
}
