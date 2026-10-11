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

import type { ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useShallow } from "zustand/react/shallow"
import { ArrowRight, Loader2, Play, Swords, X } from "lucide-react"
import { useGameStore } from "@/store/game-store"
import { selectPlayableMatchId } from "@/lib/playable-match"
import { soundManager } from "@/lib/sound-manager"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

export function AdvanceControl() {
    const router = useRouter()
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
                        Week {currentWeek}{daily ? ` · ${DAY_NAMES[currentDay] ?? `Day ${currentDay + 1}`}` : ""}
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
        control = (
            <Button
                variant="play"
                onClick={() => { dismissAdvanceStop(); router.push(`/match/${pendingMatchId}/tactics`) }}
                disabled={locked}
                className="h-10 px-5 shrink-0"
            >
                <span className="tracking-wide">Play match</span>
                <Swords size={16} />
            </Button>
        )
    } else {
        control = (
            <div className="flex items-center gap-1.5">
                {daily && (
                    <Button
                        variant="outline"
                        onClick={step(advanceDay)}
                        disabled={locked}
                        className="h-10 px-2.5 text-xs font-semibold"
                        title="Advance one day"
                    >
                        Next day
                    </Button>
                )}
                <Button
                    variant="outline"
                    onClick={step(daily ? advanceToWeekEnd : advanceWeek)}
                    disabled={locked}
                    className="h-10 px-2.5 text-xs font-semibold"
                    title={daily ? "Advance to the end of the week (stops on match day)" : "Advance exactly one week"}
                >
                    Skip week
                </Button>
                <Button
                    variant="continue"
                    onClick={step(continueToNextDecision)}
                    disabled={locked}
                    className="h-10 px-5"
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
