import { memo } from "react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ArrowLeft, Play, Pause, SkipForward as SkipForwardIcon, FastForward as FastForwardIcon, ChevronsRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { LIVE_SPEED_PRESETS } from "@/lib/live-match-builders"
import { PACING, PACING_MODES, PACING_MODE_LABEL, type PacingMode } from "@/lib/live-match-pacing"
import { LiveGameState } from "@/types"

interface LiveMatchControlBarProps {
    gameState: LiveGameState
    isAutoTactics: boolean
    setIsAutoTactics: (v: boolean) => void
    /** Playback is advancing (mid-round: playing; between rounds: auto call counting down). */
    isPlaying: boolean
    onTogglePlayback: () => void
    isWaitingForStrategy: boolean
    /** No round is being played back (decision, round-end beat, half-time break). */
    betweenRounds: boolean
    speed: number
    setSpeed: (speed: number) => void
    pacingMode: PacingMode
    setPacingMode: (mode: PacingMode) => void
    /** Key moments: the quiet stretch is being fast-forwarded right now. */
    fastForward: boolean
    onSimulateRound: () => void
    onSimulateMatch: () => void
    /** Pause and go to the match hub (unset once the match is over). */
    onLeave?: () => void
    onBeforeLeave?: () => void
}

const segment = (active: boolean) => cn(
    "h-7 rounded-[3px] px-2 text-xs font-semibold transition-colors duration-150",
    active ? "bg-hover text-ink-1 shadow-[inset_0_-2px_0_var(--gold)]" : "text-ink-3 hover:text-ink-1",
)

/**
 * Command dock: one row under the scorebug with every playback control —
 * match hub, auto tactics, pause, speed, pacing mode, skip round / match.
 */
function LiveMatchControlBarComponent({
    gameState,
    isAutoTactics,
    setIsAutoTactics,
    isPlaying,
    onTogglePlayback,
    isWaitingForStrategy,
    betweenRounds,
    speed,
    setSpeed,
    pacingMode,
    setPacingMode,
    fastForward,
    onSimulateRound,
    onSimulateMatch,
    onLeave,
    onBeforeLeave,
}: LiveMatchControlBarProps) {
    const inProgress = gameState.status === "IN_PROGRESS"
    // Paused mid-round is the state the player must notice; between rounds
    // the decision card (or the break card) is the call to action instead.
    const pausedMidRound = inProgress && !isPlaying && !betweenRounds
    const momentSpeed = speed * PACING.MOMENT_SPEED
    return (
        <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-line bg-panel px-2 py-1.5" role="toolbar" aria-label="Match controls">
            {/* Left: leave, status, auto tactics */}
            <div className="flex items-center gap-3">
                {onLeave && (
                    <ConfirmDialog
                        title="Leave the live match?"
                        description="The match pauses and is saved exactly where it is. Resume it from the match hub; other fixtures stay locked until it is finished."
                        confirmText="Go to match hub"
                        cancelText="Stay"
                        onConfirm={onLeave}
                    >
                        <Button
                            variant="outline"
                            className="h-8 min-h-8 shrink-0 gap-1.5 rounded px-2.5 text-xs font-semibold"
                            title="Pause and go back to the match hub"
                            aria-label="Leave to the match hub"
                            // Pause while deciding: the round would otherwise play on (or end) behind the dialog.
                            onClick={onBeforeLeave}
                        >
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Match hub
                        </Button>
                    </ConfirmDialog>
                )}
                {inProgress ? (
                    <span className="inline-flex items-center gap-1.5 rounded-sm bg-negative/15 px-1.5 py-1 text-[11px] font-bold leading-none tracking-[0.06em] text-negative">
                        <span className="h-1.5 w-1.5 rounded-full bg-negative" aria-hidden="true" />
                        LIVE
                    </span>
                ) : (
                    <span className="rounded-sm border border-line-strong px-1.5 py-1 text-[11px] font-semibold uppercase leading-none tracking-[0.06em] text-ink-2">
                        {gameState.status === "FINISHED" ? "Final" : gameState.status.replace("_", " ").toLowerCase()}
                    </span>
                )}

                {/* Auto tactics switch */}
                <label className="flex cursor-pointer items-center gap-2">
                    <span className={cn("text-xs font-semibold", isAutoTactics ? "text-ink-1" : "text-ink-3")}>Auto tactics</span>
                    <button
                        onClick={() => setIsAutoTactics(!isAutoTactics)}
                        role="switch"
                        aria-checked={isAutoTactics}
                        aria-label="Auto tactics — let the engine pick the strategy"
                        className={cn(
                            "relative h-5 w-9 rounded-full border transition-colors duration-150",
                            isAutoTactics ? "border-gold bg-gold/25" : "border-line-strong bg-raised hover:border-ink-3",
                        )}
                    >
                        <span className={cn(
                            "absolute top-0.5 h-3.5 w-3.5 rounded-full transition-[left,background-color] duration-150",
                            isAutoTactics ? "left-[18px] bg-gold" : "left-0.5 bg-ink-3",
                        )} />
                    </button>
                </label>
            </div>

            {/* Centre: transport — play/pause, speed, pacing mode */}
            <div className="mx-auto flex items-center gap-2">
                <Button
                    size="icon"
                    variant="ghost"
                    aria-label={isPlaying ? "Pause match" : "Resume match"}
                    title={isWaitingForStrategy ? (isPlaying ? "Hold the auto call (Space)" : "Resume (Space)") : isPlaying ? "Pause (Space)" : "Resume (Space)"}
                    disabled={!inProgress}
                    className={cn(
                        "h-8 w-8 min-h-8 rounded",
                        pausedMidRound ? "bg-gold text-gold-on hover:bg-gold-hover hover:text-gold-on" : "bg-raised text-ink-1 hover:bg-hover",
                    )}
                    onClick={onTogglePlayback}
                >
                    {isPlaying ? (
                        <Pause size={14} fill="currentColor" strokeWidth={0} aria-hidden="true" />
                    ) : (
                        <Play size={14} fill="currentColor" strokeWidth={0} className="translate-x-px" aria-hidden="true" />
                    )}
                </Button>

                {/* Speed presets */}
                <div role="group" aria-label="Playback speed" className="flex items-center rounded border border-line bg-shell p-0.5">
                    {LIVE_SPEED_PRESETS.map(preset => (
                        <button
                            key={preset}
                            type="button"
                            aria-pressed={speed === preset}
                            aria-label={`Playback speed ${preset}x`}
                            title={pacingMode === "moments" ? `${preset}x: key moments at ${preset * PACING.MOMENT_SPEED}× real time, quiet stretches faster` : `${preset}x real time`}
                            onClick={() => setSpeed(preset)}
                            className={cn(segment(speed === preset), "min-w-8 px-1.5 tabular-nums")}
                        >
                            {preset}x
                        </button>
                    ))}
                </div>

                {/* Pacing mode */}
                <div role="radiogroup" aria-label="Playback pacing" className="flex items-center rounded border border-line bg-shell p-0.5">
                    {PACING_MODES.map(mode => (
                        <button
                            key={mode}
                            type="button"
                            role="radio"
                            aria-checked={pacingMode === mode}
                            onClick={() => setPacingMode(mode)}
                            title={mode === "moments" ? "Play kills, the plant, defuses and executes at speed; fast-forward the quiet stretches" : "Play every second of the round at speed"}
                            className={segment(pacingMode === mode)}
                        >
                            {PACING_MODE_LABEL[mode]}
                        </button>
                    ))}
                </div>

                {/* What the clock is doing right now */}
                <span
                    className={cn(
                        "inline-flex w-[118px] items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.06em]",
                        pacingMode === "moments" && fastForward && isPlaying && !betweenRounds ? "text-ink-2" : "text-ink-3",
                    )}
                    aria-live="off"
                    data-pacing-state={pacingMode === "moments" ? (fastForward ? "fast-forward" : "moment") : "full"}
                >
                    {pacingMode === "moments" && isPlaying && !betweenRounds
                        ? fastForward ? <><ChevronsRight size={13} aria-hidden="true" /> Fast-forward</> : <><span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden="true" /> Key moment</>
                        : pacingMode === "moments" ? `Moments ${momentSpeed}×` : `Real time ${speed}×`}
                </span>
            </div>

            {/* Right: skip round / match */}
            <div className="flex items-center gap-1.5">
                <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 min-h-8 gap-1.5 rounded px-2.5 text-xs font-semibold tracking-[0.04em] text-ink-2 hover:text-ink-1"
                    onClick={onSimulateRound}
                    disabled={!inProgress}
                    title="Finish this round now"
                >
                    <SkipForwardIcon size={13} aria-hidden="true" />
                    SKIP RND
                </Button>

                {/* Finishes the series at once, so confirm first. */}
                <ConfirmDialog
                    title="Skip to the final result?"
                    description="Every remaining round is simulated now with automatic buys, exactly as if you let it play on Auto tactics. You will not be able to make further calls in this match."
                    confirmText="Skip match"
                    cancelText="Keep watching"
                    onConfirm={onSimulateMatch}
                >
                    <Button
                        size="sm"
                        variant="ghost"
                        disabled={!inProgress}
                        className="h-8 min-h-8 gap-1.5 rounded px-2.5 text-xs font-semibold tracking-[0.04em] text-ink-2 hover:text-ink-1"
                    >
                        <FastForwardIcon size={13} aria-hidden="true" />
                        SKIP MATCH
                    </Button>
                </ConfirmDialog>
            </div>
        </div>
    )
}

// memo'd so it skips re-renders when its props (all primitives or stable
// callbacks from useLiveMatch) haven't changed between parent paints.
export const LiveMatchControlBar = memo(LiveMatchControlBarComponent)
