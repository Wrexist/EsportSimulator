"use client"

/**
 * Top-bar advance control (Phase 4 stream 4.1).
 *
 * One primary action: CONTINUE runs days (daily mode) or weeks (weekly mode)
 * until something needs the manager, then says why. "Play match" replaces it
 * when a playable fixture is due. Next day / Skip week stay as secondary
 * actions. While a run is going, the control shows the date it has reached
 * and a Stop button (takes effect between days).
 */

import { useEffect, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useShallow } from "zustand/react/shallow"
import { ArrowRight, ChevronDown, Loader2, Play, Swords, X } from "lucide-react"
import { useGameStore } from "@/store/game-store"
import { selectPlayableMatchId } from "@/lib/playable-match"
import { soundManager } from "@/lib/sound-manager"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function AdvanceControl() {
    const router = useRouter()
    const pathname = usePathname()
    const {
        timeMode, currentWeek, currentDay, isLoading, gameOverReason, saveId, playerTeamId,
        continueRun, advanceStop,
        advanceDay, advanceToWeekEnd, advanceWeek, continueToNextDecision, cancelContinue, dismissAdvanceStop,
    } = useGameStore(useShallow(s => ({
        timeMode: s.timeMode,
        currentWeek: s.currentWeek,
        currentDay: s.currentDay,
        isLoading: s.isLoading,
        gameOverReason: s.gameOverReason,
        saveId: s.saveId,
        playerTeamId: s.playerTeamId,
        continueRun: s.continueRun,
        advanceStop: s.advanceStop,
        advanceDay: s.advanceDay,
        advanceToWeekEnd: s.advanceToWeekEnd,
        advanceWeek: s.advanceWeek,
        continueToNextDecision: s.continueToNextDecision,
        cancelContinue: s.cancelContinue,
        dismissAdvanceStop: s.dismissAdvanceStop,
    })))
    // Only offer "Play match" for a fixture the store will actually simulate
    // (shared predicate with the advance-week guard); an unplayable fixture is
    // forfeited when the week advances, so CONTINUE is shown instead (L27).
    const pendingMatchId = useGameStore(selectPlayableMatchId)
    const hasCareer = !!saveId && !!playerTeamId
    const running = !!continueRun
    const locked = isLoading || !!gameOverReason || !hasCareer || running
    const daily = timeMode === "HYBRID_DAILY"

    const step = (fn: () => Promise<void>) => () => {
        dismissAdvanceStop()
        soundManager.play("weekAdvance")
        void fn()
    }

    let control: ReactNode
    if (running) {
        control = (
            <div className="flex items-center gap-2" role="status" aria-live="polite">
                <span className="flex h-10 items-center gap-2 rounded-lg border border-line bg-raised px-3 text-xs font-semibold text-ink-2">
                    <Loader2 size={14} className="animate-spin text-gold" />
                    <span className="whitespace-nowrap tabular-nums">
                        Advancing · {daily ? `Day ${currentDay + 1}` : `Week ${currentWeek}`}
                    </span>
                </span>
                <Button
                    variant="outline"
                    onClick={cancelContinue}
                    disabled={continueRun?.cancelRequested}
                    className="h-10 px-3 text-xs font-semibold"
                    title="Stop after the current day"
                >
                    {continueRun?.cancelRequested ? "Stopping…" : "Stop"}
                </Button>
            </div>
        )
    } else if (pendingMatchId) {
        // One gold action per view: on this match's own prep and veto screens
        // "Start match" is the primary, so this shortcut steps down to outline.
        const onThisMatch = !!pathname?.startsWith(`/match/${pendingMatchId}/`)
        control = (
            <Button
                variant={onThisMatch ? "outline" : "play"}
                onClick={() => { dismissAdvanceStop(); router.push(`/match/${pendingMatchId}/tactics`) }}
                disabled={locked}
                className="h-10 px-5 shrink-0"
            >
                <span className="tracking-wide">Play match</span>
                <Swords size={16} />
            </Button>
        )
    } else {
        const secondary = [
            ...(daily ? [{ label: "Next day", title: "Advance one day", run: step(advanceDay) }] : []),
            {
                label: "Skip week",
                title: daily ? "Advance to the end of the week (stops on match day)" : "Advance exactly one week",
                run: step(daily ? advanceToWeekEnd : advanceWeek),
            },
        ]
        control = (
            <div className="flex items-center gap-1.5">
                {/* Wide screens: secondary actions inline. */}
                <div className="hidden items-center gap-1.5 2xl:flex">
                    {secondary.map(a => (
                        <Button key={a.label} variant="outline" onClick={a.run} disabled={locked} className="h-10 px-2.5 text-xs font-semibold" title={a.title}>
                            {a.label}
                        </Button>
                    ))}
                </div>
                {/* Narrower screens: one menu keeps the header from overflowing. */}
                <SecondaryMenu actions={secondary} disabled={locked} />
                <Button
                    variant="continue"
                    onClick={step(continueToNextDecision)}
                    disabled={locked}
                    className="h-10 px-4 2xl:px-5"
                    title="Advance until something needs your decision"
                >
                    <span className="flex items-center gap-2">
                        <span className="tracking-wide">CONTINUE</span>
                        <Play size={15} fill="currentColor" />
                    </span>
                </Button>
            </div>
        )
    }

    return (
        <div className="relative shrink-0">
            {control}
            {advanceStop && !running && <StopNotice />}
        </div>
    )
}

/** Next day / Skip week behind one button below the 2xl breakpoint. */
function SecondaryMenu({ actions, disabled }: { actions: { label: string; title: string; run: () => void }[]; disabled: boolean }) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)
    useEffect(() => {
        if (!open) return
        const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
        document.addEventListener("mousedown", onDown)
        document.addEventListener("keydown", onKey)
        return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey) }
    }, [open])
    return (
        <div ref={ref} className="relative 2xl:hidden">
            <Button
                variant="outline"
                onClick={() => setOpen(o => !o)}
                disabled={disabled}
                className="h-10 w-10 px-0"
                aria-label="More advance options"
                aria-haspopup="menu"
                aria-expanded={open}
                title={actions.map(a => a.label).join(" / ")}
            >
                <ChevronDown size={15} />
            </Button>
            {open && (
                <div role="menu" className="absolute right-0 top-[calc(100%+6px)] z-50 w-56 overflow-hidden rounded-lg border border-line-strong bg-panel py-1 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.8)]">
                    {actions.map(a => (
                        <button
                            key={a.label}
                            type="button"
                            role="menuitem"
                            onClick={() => { setOpen(false); a.run() }}
                            className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-raised"
                        >
                            <span className="text-sm font-semibold text-ink-1">{a.label}</span>
                            <span className="text-xs text-ink-3">{a.title}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

/** Why the last Continue stopped, anchored under the control. */
function StopNotice() {
    const stop = useGameStore(s => s.advanceStop)
    const dismiss = useGameStore(s => s.dismissAdvanceStop)
    if (!stop) return null
    const headline = stop.kind === "match" ? "Match day" : stop.kind === "cancelled" ? "Paused" : "Stopped"
    return (
        <div
            role="status"
            aria-live="polite"
            className="absolute right-0 top-[calc(100%+10px)] z-50 w-[340px] rounded-lg border border-line-strong bg-panel p-3 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.8)]"
        >
            <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                    <p className={cn("text-[11px] font-semibold uppercase tracking-[0.08em]", stop.kind === "match" ? "text-gold" : "text-ink-3")}>{headline}</p>
                    <p className="mt-1 text-sm font-semibold leading-snug text-ink-1">{stop.kind === "cancelled" ? "You paused advancing." : stop.reason}</p>
                </div>
                <button type="button" onClick={dismiss} aria-label="Dismiss" className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-ink-3 hover:bg-raised hover:text-ink-1">
                    <X size={14} />
                </button>
            </div>
            {stop.href && stop.actionLabel && stop.kind !== "match" && (
                <Link
                    href={stop.href}
                    onClick={dismiss}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-ink-2 underline-offset-2 hover:text-ink-1 hover:underline"
                >
                    {stop.actionLabel} <ArrowRight size={12} />
                </Link>
            )}
        </div>
    )
}
