"use client"

/**
 * First-week "Getting Started" checklist (AUDIT_UX_2026-06 E4).
 *
 * After the one-shot welcome mail + tutorial are dismissed there was no standing
 * "do these things first" guide. This shows a short, dismissible checklist on the
 * dashboard for the opening weeks. Steps auto-check from state where derivable
 * (weekly focus set, first match played); link steps check once visited. Progress
 * + dismissal persist in localStorage so it doesn't nag after you're rolling.
 */

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle2, Circle, Rocket, X, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

const STORAGE_KEY = "cs2_getting_started_v1"
const SHOW_UNTIL_WEEK = 4

interface PersistedState {
    dismissed: boolean
    clicked: string[]
}

function loadState(): PersistedState {
    if (typeof window === "undefined") return { dismissed: false, clicked: [] }
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) return { dismissed: false, clicked: [] }
        const parsed = JSON.parse(raw) as Partial<PersistedState>
        return { dismissed: !!parsed.dismissed, clicked: Array.isArray(parsed.clicked) ? parsed.clicked : [] }
    } catch {
        return { dismissed: false, clicked: [] }
    }
}

function saveState(state: PersistedState) {
    if (typeof window === "undefined") return
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch { /* storage best-effort */ }
}

export function GettingStartedChecklist() {
    const { currentWeek, selectedWeeklyActivity, hasPlayedMatch } = useGameStore(useShallow(s => ({
        currentWeek: s.currentWeek,
        selectedWeeklyActivity: s.selectedWeeklyActivity,
        hasPlayedMatch: s.completedMatches.some(m => m.homeTeamId === s.playerTeamId || m.awayTeamId === s.playerTeamId),
    })))

    const [persisted, setPersisted] = useState<PersistedState>({ dismissed: false, clicked: [] })
    const [hydrated, setHydrated] = useState(false)

    useEffect(() => {
        setPersisted(loadState())
        setHydrated(true)
    }, [])

    const markClicked = useCallback((id: string) => {
        setPersisted(prev => {
            if (prev.clicked.includes(id)) return prev
            const next = { ...prev, clicked: [...prev.clicked, id] }
            saveState(next)
            return next
        })
    }, [])

    const dismiss = useCallback(() => {
        setPersisted(prev => {
            const next = { ...prev, dismissed: true }
            saveState(next)
            return next
        })
    }, [])

    const steps: { id: string; label: string; href: string; auto: boolean }[] = [
        { id: "focus", label: "Set this week's focus", href: "/", auto: !!selectedWeeklyActivity },
        { id: "squad", label: "Review your roster", href: "/squad", auto: false },
        { id: "transfers", label: "Scout the transfer market", href: "/transfers", auto: false },
        { id: "match", label: "Play your first match", href: "/schedule", auto: hasPlayedMatch },
    ]
    const isDone = (s: { id: string; auto: boolean }) => s.auto || persisted.clicked.includes(s.id)
    const doneCount = steps.filter(isDone).length

    // Don't render until we've read localStorage (avoids a flash) or once the
    // opening weeks are over / it's been dismissed.
    if (!hydrated || persisted.dismissed || currentWeek > SHOW_UNTIL_WEEK) return null

    return (
        <Card className="glass-panel border-cyan-400/15 bg-cyan-500/[0.03] backdrop-blur-xl rounded-lg overflow-hidden">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-xs font-bold uppercase tracking-[0.2em] text-white/60 flex items-center gap-3">
                        <div className="p-2 bg-cyan-500/10 rounded-xl">
                            <Rocket size={14} className="text-cyan-300" />
                        </div>
                        Getting Started
                    </CardTitle>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-white/40 tabular-nums">{doneCount}/{steps.length}</span>
                        <button onClick={dismiss} aria-label="Dismiss getting started" className="text-white/30 hover:text-white/70 transition-colors">
                            <X size={14} />
                        </button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-2 space-y-1.5">
                {steps.map(step => {
                    const done = isDone(step)
                    return (
                        <Link
                            key={step.id}
                            href={step.href}
                            onClick={() => markClicked(step.id)}
                            className={cn(
                                "flex items-center gap-3 rounded-lg border p-2.5 transition-colors group",
                                done ? "border-emerald-500/15 bg-emerald-500/[0.04]" : "border-white/5 bg-white/[0.02] hover:bg-white/[0.05]"
                            )}
                        >
                            {done
                                ? <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                                : <Circle size={16} className="text-white/25 shrink-0" />}
                            <span className={cn("flex-1 text-xs font-medium", done ? "text-white/40 line-through" : "text-white/85")}>
                                {step.label}
                            </span>
                            {!done && <ArrowRight size={13} className="text-white/20 group-hover:text-white/50 transition-colors" />}
                        </Link>
                    )
                })}
            </CardContent>
        </Card>
    )
}
