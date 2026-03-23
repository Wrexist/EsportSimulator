import { LiveGameState, Team, MapId } from "@/types"
import { cn } from "@/lib/utils"
import Image from "next/image"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"

interface LiveMatchScoreboardProps {
    gameState: LiveGameState
    homeTeam: Team
    awayTeam: Team
    matchFormat: string // "BO1" | "BO3" | "BO5"
    currentMapId: MapId
    mapName: string
    homeSeriesScore: number
    awaySeriesScore: number
    homeScore: number
    awayScore: number
}

import { motion } from "framer-motion"
import { ANIMATIONS } from "@/components/debug/AnimationShowcase"

export function LiveMatchScoreboard({
    gameState,
    homeTeam,
    awayTeam,
    matchFormat,
    currentMapId,
    mapName,
    homeSeriesScore,
    awaySeriesScore,
    homeScore,
    awayScore
}: LiveMatchScoreboardProps) {

    const homeBorderClass = "border-l-4 border-l-blue-500/50" // CT Color
    const awayBorderClass = "border-r-4 border-r-amber-500/50" // T Color (Assuming standard starting side, but dynamic in parent)

    return (
        <div className="flex items-start justify-between mb-6 relative z-10" role="region" aria-label="Match scoreboard" aria-live="polite">
            {/* HOME TEAM */}
            <div className="flex items-center gap-6 w-1/3">
                <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center font-normal text-2xl overflow-hidden relative group">
                    <TeamLogoDisplay team={homeTeam as any} size={40} />
                    <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div>
                    <div className="text-xl font-normal uppercase">{homeTeam.name}</div>
                    <div className="flex gap-1 mt-1">
                        {[...Array(matchFormat === "BO3" ? 2 : matchFormat === "BO5" ? 3 : 1)].map((_, i) => (
                            <div key={i} className={cn("w-2 h-2 rounded-full", i < homeSeriesScore ? "bg-white box-shadow-glow" : "bg-white/10")} />
                        ))}
                    </div>
                </div>
            </div>

            {/* SCORE */}
            <div className="flex flex-col items-center">
                <div className="flex items-center gap-8 bg-black/40 backdrop-blur-xl px-12 py-3 rounded-3xl border border-white/5 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />

                    {/* Animated Home Score */}
                    <div className="w-20 text-center relative h-[60px] flex items-center justify-center">
                        <motion.div
                            key={homeScore}
                            {...ANIMATIONS.juicyBounce}
                            className="text-6xl font-normal text-white tracking-tighter absolute"
                            style={{ textShadow: "0 0 30px rgba(59, 130, 246, 0.3)" }}
                        >
                            {homeScore}
                        </motion.div>
                    </div>

                    <div className="flex flex-col items-center gap-1">
                        <div className="text-[10px] font-bold tracking-[0.2em] text-white/50 bg-white/5 px-3 py-1 rounded-full uppercase">
                            {mapName}
                        </div>
                        <div className={cn("text-xs font-bold px-2 py-0.5 rounded text-white/80", gameState.status === "FINISHED" ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5")}>
                            {gameState.status === "FINISHED" ? "FINAL" : `RND ${gameState.round} / 24`}
                        </div>
                        {gameState.time >= 0 && (
                            <div className={cn("text-xl font-mono tabular-nums tracking-wider", gameState.isPaused ? "text-white/30" : (gameState.time <= 10 ? "text-red-500 animate-pulse" : "text-white/80"))}>
                                {Math.floor(gameState.time / 60)}:{(gameState.time % 60).toString().padStart(2, '0')}
                            </div>
                        )}
                    </div>

                    {/* Animated Away Score */}
                    <div className="w-20 text-center relative h-[60px] flex items-center justify-center">
                        <motion.div
                            key={awayScore}
                            {...ANIMATIONS.juicyBounce}
                            className="text-6xl font-normal text-white tracking-tighter absolute"
                            style={{ textShadow: "0 0 30px rgba(245, 158, 11, 0.3)" }}
                        >
                            {awayScore}
                        </motion.div>
                    </div>
                </div>
            </div>

            {/* AWAY TEAM */}
            <div className="flex items-center gap-6 w-1/3 justify-end text-right">
                <div>
                    <div className="text-xl font-normal uppercase">{awayTeam.name}</div>
                    <div className="flex gap-1 mt-1 justify-end">
                        {[...Array(matchFormat === "BO3" ? 2 : matchFormat === "BO5" ? 3 : 1)].map((_, i) => (
                            <div key={i} className={cn("w-2 h-2 rounded-full", i < awaySeriesScore ? "bg-white box-shadow-glow" : "bg-white/10")} />
                        ))}
                    </div>
                </div>
                <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center font-normal text-2xl overflow-hidden">
                    <TeamLogoDisplay team={awayTeam as any} size={40} />
                </div>
            </div>
        </div>
    )
}
