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
import { forfeitStops, type StopSource } from "@/lib/advance-stops"
import { soundManager } from "@/lib/sound-manager"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { draftCupOutcome } from "@/engine/draft-cup"
import { demoWeekCapReached } from "@/lib/edition"
import { t } from "@/lib/i18n"
import { liveMatchInProgress } from "@/app/match/match-centre"

/**
 * The match a stop notice was last restored for in this page session, so a
 * dismissed notice does not come back on every remount (HOME-16).
 */
let restoredMatchStop: string | null = null

export function AdvanceControl() {
    const router = useRouter()
    const pathname = usePathname()
    const {
        timeMode, currentWeek, currentDay, isLoading, gameOverReason, runOver, saveId, playerTeamId,
        continueRun, advanceStop,
        advanceDay, advanceToWeekEnd, advanceWeek, continueToNextDecision, cancelContinue, dismissAdvanceStop, restoreMatchStop,
    } = useGameStore(useShallow(s => ({
        timeMode: s.timeMode,
        currentWeek: s.currentWeek,
        currentDay: s.currentDay,
        isLoading: s.isLoading,
        gameOverReason: s.gameOverReason,
        runOver: (!!s.draftCup && !!draftCupOutcome(s as never)) || demoWeekCapReached(s),
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
        restoreMatchStop: s.restoreMatchStop,
    })))
    // Only offer "Play match" for a fixture the store will actually simulate
    // (shared predicate with the advance-week guard); an unplayable fixture is
    // forfeited when the week advances, so CONTINUE is shown instead (L27).
    const pendingMatchId = useGameStore(selectPlayableMatchId)
    // A live match that was left mid-way resumes on the live screen, not its prep.
    const pendingIsLive = useGameStore(s => !!pendingMatchId && liveMatchInProgress(s, pendingMatchId))
    const hasCareer = !!saveId && !!playerTeamId
    const running = !!continueRun
    const locked = isLoading || !!gameOverReason || runOver || !hasCareer || running
    const daily = timeMode === "HYBRID_DAILY"

    // The stop notice is transient: after a reload the one-click "Sim match"
    // was gone while the match was still due. Show it again, once per match.
    useEffect(() => {
        if (!saveId || !pendingMatchId || isLoading || running) return
        const key = `${saveId}:${pendingMatchId}`
        if (restoredMatchStop === key) return
        restoredMatchStop = key
        restoreMatchStop()
    }, [saveId, pendingMatchId, isLoading, running, restoreMatchStop])

    const step = (fn: () => Promise<void>, wholeWeek = false) => () => {
        // SQUAD-04: a fixture this step would forfeit (the club can't field
        // five) stops the first press and says so; the next press goes on.
        const s = useGameStore.getState()
        const forfeit = forfeitStops(s as unknown as StopSource, undefined, { wholeWeek }).find(f => !s.advanceSeenKeys.includes(f.key))
        if (forfeit) {
            useGameStore.setState({
                advanceStop: { ...forfeit, week: s.currentWeek, day: s.currentDay },
                advanceSeenKeys: [...s.advanceSeenKeys, forfeit.key].slice(-200),
            })
            return
        }
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
                        {t("advance.running", { when: daily ? t("common.day", { n: currentDay + 1 }) : t("common.week", { n: currentWeek }) })}
                    </span>
                </span>
                <Button
                    variant="outline"
                    onClick={cancelContinue}
                    disabled={continueRun?.cancelRequested}
                    className="h-10 px-3 text-xs font-semibold"
                    title={t("advance.stopTitle")}
                >
                    {continueRun?.cancelRequested ? t("advance.stopping") : t("advance.stop")}
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
                onClick={() => { dismissAdvanceStop(); router.push(`/match/${pendingMatchId}/${pendingIsLive ? "live" : "tactics"}`) }}
                disabled={locked}
                className="h-10 px-5 shrink-0"
            >
                <span className="tracking-wide">{t("advance.playMatch")}</span>
                <Swords size={16} />
            </Button>
        )
    } else {
        const secondary = [
            ...(daily ? [{ id: "day", label: t("advance.nextDay"), title: t("advance.nextDayTitle"), run: step(advanceDay) }] : []),
            {
                id: "week",
                label: t("advance.skipWeek"),
                title: daily ? t("advance.skipWeekDailyTitle") : t("advance.skipWeekTitle"),
                run: step(daily ? advanceToWeekEnd : advanceWeek, true),
            },
        ]
        control = (
            <div className="flex items-center gap-1.5">
                {/* Wide screens: secondary actions inline. */}
                <div className="hidden items-center gap-1.5 @min-[110rem]/topbar:flex">
                    {secondary.map(a => (
                        <Button key={a.id} variant="outline" onClick={a.run} disabled={locked} className="h-10 px-2.5 text-xs font-semibold" title={a.title}>
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
                    className="h-10 px-4 @min-[110rem]/topbar:px-5"
                    title={t("advance.continueTitle")}
                >
                    <span className="flex items-center gap-2">
                        <span className="tracking-wide uppercase">{t("advance.continue")}</span>
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

/** Next day / Skip week behind one button on a narrower top bar (TopBar size container). */
function SecondaryMenu({ actions, disabled }: { actions: { id: string; label: string; title: string; run: () => void }[]; disabled: boolean }) {
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
        <div ref={ref} className="relative @min-[110rem]/topbar:hidden">
            <Button
                variant="outline"
                onClick={() => setOpen(o => !o)}
                disabled={disabled}
                className="h-10 w-10 px-0"
                aria-label={t("advance.moreOptions")}
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
                            key={a.id}
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
    const headline = stop.kind === "match" ? t("home.matchDay") : stop.kind === "cancelled" ? t("advance.paused") : t("advance.stopped")
    return (
        <div
            role="status"
            aria-live="polite"
            className="absolute right-0 top-[calc(100%+10px)] z-50 w-[340px] rounded-lg border border-line-strong bg-panel p-3 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.8)]"
        >
            <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                    <p className={cn("text-[11px] font-semibold uppercase tracking-[0.08em]", stop.kind === "match" ? "text-gold" : "text-ink-3")}>{headline}</p>
                    <p className="mt-1 text-sm font-semibold leading-snug text-ink-1">{stop.kind === "cancelled" ? t("advance.youPaused") : stop.reason}</p>
                </div>
                <button type="button" onClick={dismiss} aria-label={t("advance.dismiss")} className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-ink-3 hover:bg-raised hover:text-ink-1">
                    <X size={14} />
                </button>
            </div>
            {stop.kind === "match" && stop.href && <MatchStopActions href={stop.href} onDone={dismiss} />}
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

/**
 * A match stop offers both paths: prepare it (veto, counters, live match) or
 * let it play out now with the engine's veto and the counters the VOD review
 * found (store prepAndSimMatch), then open the result.
 */
function MatchStopActions({ href, onDone }: { href: string; onDone: () => void }) {
    const router = useRouter()
    const prepAndSim = useGameStore(s => s.prepAndSimMatch)
    const [busy, setBusy] = useState(false)
    const matchId = href.match(/^\/match\/([^/]+)\//)?.[1]
    const sim = async () => {
        if (!matchId || busy) return
        setBusy(true)
        try {
            if (await prepAndSim(matchId)) {
                onDone()
                router.push(`/match/${matchId}/result`)
            }
        } finally {
            setBusy(false)
        }
    }
    return (
        <div className="mt-2 flex items-center gap-3">
            <Link href={href} onClick={onDone} className="inline-flex items-center gap-1 text-xs font-semibold text-gold underline-offset-2 hover:underline">
                {t("advance.prepare")} <ArrowRight size={12} />
            </Link>
            {matchId && (
                <button type="button" onClick={sim} disabled={busy} className="text-xs font-semibold text-ink-2 underline-offset-2 hover:text-ink-1 hover:underline disabled:opacity-50" title={t("advance.simTitle")}>
                    {busy ? t("advance.simulating") : t("advance.simMatch")}
                </button>
            )}
        </div>
    )
}
