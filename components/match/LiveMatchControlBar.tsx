import { memo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
        <div className="match-playback glass-panel-dark rounded-xl p-2 flex flex-wrap items-center justify-between gap-2 border-white/5">
            <AnimatePresence mode="wait">
                {inProgress && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="bg-red-500/10 border border-red-500/20 text-red-500 px-2 py-1 rounded-md flex items-center gap-1.5"
                    >
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_0_1px_rgba(248,113,113,0.5)]" />
                        <span className="text-[10px] font-normal tracking-wider leading-none">LIVE</span>
                    </motion.div>
                )}
                {!inProgress && (
                    <Badge className="bg-white/10 text-white/50 border-white/5" variant="outline">
                        {gameState.status.replace("_", " ")}
                    </Badge>
                )}
            </AnimatePresence>

            <div className="flex flex-wrap items-center gap-2">
                {/* AUTO TACTICS TOGGLE (Clean Switch) */}
                <div className="flex items-center gap-3">
                    <span className={cn("text-[10px] font-bold tracking-wider transition-colors", isAutoTactics ? "text-amber-400" : "text-white/20")}>
                        AUTO TACTICS
                    </span>
                    <button
                        onClick={() => setIsAutoTactics(!isAutoTactics)}
                        role="switch"
                        aria-checked={isAutoTactics}
                        aria-label="Auto tactics — let the engine pick the strategy"
                        className={cn(
                            "w-10 h-5 rounded-full relative transition-all border",
                            isAutoTactics
                                ? "bg-amber-500/20 border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.2)]"
                                : "bg-white/5 border-white/10 hover:border-white/20"
                        )}
                    >
                        <motion.div
                            animate={{
                                x: isAutoTactics ? 20 : 2,
                                scale: isAutoTactics ? 1.1 : 1
                            }}
                            className={cn(
                                "absolute top-0.5 w-3.5 h-3.5 rounded-full shadow-xs",
                                isAutoTactics ? "bg-amber-400" : "bg-white/30"
                            )}
                        />
                    </button>
                </div>

                <div className="w-px h-8 bg-white/5" />

                <div className="flex items-center gap-2">
                    {/* Play/Pause — solid glyph on a filled disc so it reads at a glance. */}
                    <Button
                        size="icon"
                        variant="ghost"
                        aria-label={isPlaying ? "Pause match" : "Resume match"}
                        title={isPlaying ? "Pause (Space)" : "Resume (Space)"}
                        disabled={!inProgress}
                        className={cn(
                            "rounded-full w-9 h-9 transition-colors",
                            pausedMidRound
                                ? "bg-emerald-400 text-slate-950 hover:bg-emerald-300 hover:text-slate-950"
                                : "bg-white/15 text-white hover:bg-white/25 hover:text-white"
                        )}
                        onClick={onTogglePlayback}
                    >
                        {isPlaying ? (
                            <Pause size={16} fill="currentColor" strokeWidth={0} aria-hidden="true" />
                        ) : (
                            <Play size={16} fill="currentColor" strokeWidth={0} className="translate-x-px" aria-hidden="true" />
                        )}
                    </Button>

                    {/* SIMULATE ROUND BUTTON */}
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 rounded-lg px-3 text-[10px] font-bold text-white/40 hover:text-white hover:bg-white/5 gap-2 transition-all"
                        onClick={onSimulateRound}
                        disabled={!isPlaying && !isWaitingForStrategy}
                    >
                        <SkipForwardIcon size={12} />
                        SKIP RND
                    </Button>

                    {/* SIMULATE MATCH BUTTON */}
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 rounded-lg px-3 text-[10px] font-bold text-amber-500/50 hover:text-amber-400 hover:bg-amber-500/10 gap-2 transition-all"
                        onClick={onSimulateMatch}
                    >
                        <FastForwardIcon size={12} />
                        SKIP MATCH
                    </Button>
                </div>

                {/* SPEED PRESETS */}
                <div role="group" aria-label="Playback speed" className="flex items-center gap-0.5 bg-white/5 rounded-full p-0.5 border border-white/10">
                    {LIVE_SPEED_PRESETS.map(preset => (
                        <button
                            key={preset}
                            type="button"
                            aria-pressed={speed === preset}
                            aria-label={`Playback speed ${preset}x`}
                            title={`${preset}x speed`}
                            onClick={() => setSpeed(preset)}
                            className={cn(
                                "h-7 min-w-8 px-2 rounded-full text-[11px] font-bold tabular-nums transition-colors",
                                speed === preset ? "bg-white text-slate-950" : "text-white/60 hover:text-white hover:bg-white/10"
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
