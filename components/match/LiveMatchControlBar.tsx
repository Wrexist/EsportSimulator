import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PlayCircle, PauseCircle, SkipForward as SkipForwardIcon, FastForward as FastForwardIcon, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { LiveGameState } from "@/types"

interface LiveMatchControlBarProps {
    gameState: LiveGameState
    isAutoTactics: boolean
    setIsAutoTactics: (v: boolean) => void
    isPlaying: boolean
    setIsPlaying: (v: boolean) => void
    isWaitingForStrategy: boolean
    speed: number
    setSpeed: (updater: (s: number) => number) => void
    onSimulateRound: () => void
    onSimulateMatch: () => void
}

export function LiveMatchControlBar({
    gameState,
    isAutoTactics,
    setIsAutoTactics,
    isPlaying,
    setIsPlaying,
    isWaitingForStrategy,
    speed,
    setSpeed,
    onSimulateRound,
    onSimulateMatch
}: LiveMatchControlBarProps) {
    return (
        <div className="glass-panel-dark rounded-full p-2 flex items-center justify-between px-6 border-white/5 h-14">
            <AnimatePresence mode="wait">
                {gameState.status === "IN_PROGRESS" && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="bg-red-500/10 border border-red-500/20 text-red-500 px-2 py-1 rounded-md flex items-center gap-1.5"
                    >
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse box-shadow-glow" />
                        <span className="text-[10px] font-normal tracking-wider leading-none">LIVE</span>
                    </motion.div>
                )}
                {gameState.status !== "IN_PROGRESS" && (
                    <Badge className="bg-white/10 text-white/50 border-white/5" variant="outline">
                        {gameState.status.replace("_", " ")}
                    </Badge>
                )}
            </AnimatePresence>

            <div className="flex items-center gap-6">
                {/* AUTO TACTICS TOGGLE (Clean Switch) */}
                <div className="flex items-center gap-3">
                    <span className={cn("text-[10px] font-bold tracking-wider transition-colors", isAutoTactics ? "text-amber-400" : "text-white/20")}>
                        AUTO TACTICS
                    </span>
                    <button
                        onClick={() => setIsAutoTactics(!isAutoTactics)}
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
                                "absolute top-0.5 w-3.5 h-3.5 rounded-full shadow-sm",
                                isAutoTactics ? "bg-amber-400" : "bg-white/30"
                            )}
                        />
                    </button>
                </div>

                <div className="w-px h-8 bg-white/5" />

                <div className="flex items-center gap-2">
                    {/* Play/Pause */}
                    <Button
                        size="icon"
                        variant="ghost"
                        className="rounded-full w-8 h-8 text-white/70 hover:text-white hover:bg-white/10"
                        onClick={() => setIsPlaying(!isPlaying)}
                    >
                        {isPlaying ? (
                            <PauseCircle size={18} fill="currentColor" className="text-white/20" />
                        ) : (
                            <PlayCircle size={18} fill="currentColor" className="text-white/20" />
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

                {/* SPEED CONTROL */}
                <div className="flex items-center gap-2 bg-white/5 rounded-full px-2 py-1 border border-white/5">
                    <span className="text-[10px] font-bold text-white/40 w-4 text-center">{speed.toFixed(0)}x</span>
                    <Button
                        size="icon"
                        variant="ghost"
                        className="w-4 h-4 rounded-full p-0 hover:bg-white/10"
                        onClick={() => setSpeed(s => Math.min(s + 0.5, 5))}
                    >
                        <Plus size={10} className="text-white/50" />
                    </Button>
                </div>
            </div>
        </div>
    )
}
