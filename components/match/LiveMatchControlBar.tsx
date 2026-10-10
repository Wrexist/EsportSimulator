import { memo } from "react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Play, Pause, SkipForward as SkipForwardIcon, FastForward as FastForwardIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { LIVE_SPEED_PRESETS } from "@/lib/live-match-builders"
import { LiveGameState } from "@/types"

interface LiveMatchControlBarProps {
    gameState: LiveGameState
    isAutoTactics: boolean
    setIsAutoTactics: (v: boolean) => void
    isPlaying: boolean
    onTogglePlayback: () => void
    isWaitingForStrategy: boolean
    speed: number
    setSpeed: (speed: number) => void
    onSimulateRound: () => void
    onSimulateMatch: () => void
}

function LiveMatchControlBarComponent({
    gameState,
    isAutoTactics,
    setIsAutoTactics,
    isPlaying,
    onTogglePlayback,
    isWaitingForStrategy,
    speed,
    setSpeed,
    onSimulateRound,
    onSimulateMatch
}: LiveMatchControlBarProps) {
    const inProgress = gameState.status === "IN_PROGRESS"
    // Paused mid-round is the state the player must notice; between rounds
    // the strategy panel is the call to action instead.
    const pausedMidRound = inProgress && !isPlaying && !isWaitingForStrategy
    return (
        <div className="flex h-full min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-lg border border-line bg-panel px-2 py-1.5">
            <div className="flex items-center gap-3">
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

            <div className="flex items-center gap-1.5">
                {/* Play/Pause */}
                <Button
                    size="icon"
                    variant="ghost"
                    aria-label={isPlaying ? "Pause match" : "Resume match"}
                    title={isPlaying ? "Pause (Space)" : "Resume (Space)"}
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

                <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 min-h-8 gap-1.5 rounded px-2.5 text-xs font-semibold tracking-[0.04em] text-ink-2 hover:text-ink-1"
                    onClick={onSimulateRound}
                    disabled={!isPlaying && !isWaitingForStrategy}
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

                <span className="mx-1 h-5 w-px bg-line-strong" aria-hidden="true" />

                {/* Speed presets */}
                <div role="group" aria-label="Playback speed" className="flex items-center rounded border border-line bg-shell p-0.5">
                    {LIVE_SPEED_PRESETS.map(preset => (
                        <button
                            key={preset}
                            type="button"
                            aria-pressed={speed === preset}
                            aria-label={`Playback speed ${preset}x`}
                            title={`${preset}x speed`}
                            onClick={() => setSpeed(preset)}
                            className={cn(
                                "h-7 min-w-8 rounded-[3px] px-1.5 text-xs font-semibold tabular-nums transition-colors duration-150",
                                speed === preset ? "bg-hover text-ink-1 shadow-[inset_0_-2px_0_var(--gold)]" : "text-ink-3 hover:text-ink-1",
                            )}
                        >
                            {preset}x
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )
}

// memo'd so it skips re-renders when its props (all primitives or stable
// callbacks from useLiveMatch) haven't changed between parent paints.
export const LiveMatchControlBar = memo(LiveMatchControlBarComponent)
