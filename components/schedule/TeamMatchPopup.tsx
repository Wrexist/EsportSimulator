"use client"

import React, { useMemo } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { X, Swords, Trophy, TrendingUp, Users, Play, Eye, MapPin, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { TeamSaveData, PlayerSaveData, MatchSaveData } from "@/engine/save-types"
import { TeamLogoImage, PlayerPortrait } from "@/components/ui/asset-images"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { resolvePlayerRole } from "@/engine/role-determination"

interface TeamMatchPopupProps {
    isOpen: boolean
    onClose: () => void
    match: MatchSaveData
    opponent: TeamSaveData | undefined
    opponentRoster: PlayerSaveData[]
    playerTeam: TeamSaveData | undefined
    tournamentName?: string
    stage?: string
    currentWeek: number
}

export function TeamMatchPopup({
    isOpen,
    onClose,
    match,
    opponent,
    opponentRoster,
    playerTeam,
    tournamentName,
    stage,
    currentWeek
}: TeamMatchPopupProps) {
    const router = useRouter()

    // Memoize opponent rating and top players to avoid recalculating evaluatePlayer on every render
    const opponentRating = useMemo(() => opponentRoster.length > 0
        ? Math.round(opponentRoster.reduce((sum, p) => sum + evaluatePlayer(p as any).overallRating, 0) / opponentRoster.length)
        : 0, [opponentRoster])

    const topPlayers = useMemo(() => [...opponentRoster]
        .map(p => ({ ...p, ovr: evaluatePlayer(p as any).overallRating }))
        .sort((a, b) => b.ovr - a.ovr)
        .slice(0, 5), [opponentRoster])

    if (!isOpen || !opponent) return null

    const handleGoToMatch = () => {
        onClose()
        if (match.result) {
            router.push(`/match/${match.id}/result`)
        } else {
            router.push(`/match/${match.id}/tactics`)
        }
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 top-16 bg-black/60 backdrop-blur-sm z-modal"
                    />

                    {/* Popup */}
                    <motion.div
                        drag
                        dragMomentum={false}
                        initial={{ opacity: 0, scale: 0.95, x: "-50%", y: "-50%" }}
                        animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
                        exit={{ opacity: 0, scale: 0.95, x: "-50%", y: "-40%" }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="fixed left-1/2 top-1/2 z-modal w-full max-w-xl cursor-move"
                        style={{ x: "-50%", y: "-50%" }} // Ensure transform is applied for centering
                    >
                        <div className="bg-[#0a0c10]/95 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl shadow-black/50">
                            {/* Header with Match Info */}
                            <div className="p-6 bg-gradient-to-br from-primary/10 via-transparent to-cyan-500/5 border-b border-white/5">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <Swords size={16} className="text-primary" />
                                        <span className="text-xs font-bold text-primary uppercase tracking-widest">Match Preview</span>
                                    </div>
                                    <button
                                        onClick={onClose}
                                        className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>

                                {/* Tournament Info */}
                                {tournamentName && (
                                    <div className="flex items-center gap-2 mb-4">
                                        <Trophy size={14} className="text-amber-400" />
                                        <span className="text-sm text-white/80">{tournamentName}</span>
                                        {stage && (
                                            <Badge variant="outline" className="text-[8px] border-amber-500/20 text-amber-400 bg-amber-500/10">
                                                {stage}
                                            </Badge>
                                        )}
                                    </div>
                                )}

                                {/* VS Display */}
                                <div className="flex items-center justify-center gap-6">
                                    {/* Player Team */}
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
                                            <TeamLogoImage src={playerTeam?.logoPath} alt={playerTeam?.name || "Your Team"} size={48} />
                                        </div>
                                        <span className="text-xs font-bold text-white truncate max-w-[80px]">{playerTeam?.name}</span>
                                        <Badge className="text-[8px] bg-primary/20 text-primary border-primary/30">YOU</Badge>
                                    </div>

                                    {/* VS */}
                                    <div className="flex flex-col items-center">
                                        <span className="text-2xl font-bold text-white/20">VS</span>
                                    </div>

                                    {/* Opponent Team */}
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
                                            <TeamLogoImage src={opponent.logoPath} alt={opponent.name} size={48} />
                                        </div>
                                        <span className="text-xs font-bold text-white truncate max-w-[80px]">{opponent.name}</span>
                                        <Badge variant="outline" className="text-[8px] border-white/10 text-white/60">
                                            #{opponent.worldRanking || "?"}
                                        </Badge>
                                    </div>
                                </div>
                            </div>

                            {/* Opponent Stats */}
                            <div className="p-4 border-b border-white/5">
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="text-center p-3 bg-white/5 rounded-xl">
                                        <p className="text-2xl font-bold text-white">{opponentRating}</p>
                                        <p className="text-[9px] text-white/40 uppercase font-bold">Team OVR</p>
                                    </div>
                                    <div className="text-center p-3 bg-white/5 rounded-xl">
                                        <p className="text-2xl font-bold text-white">#{opponent.worldRanking || "?"}</p>
                                        <p className="text-[9px] text-white/40 uppercase font-bold">World Rank</p>
                                    </div>
                                    <div className="text-center p-3 bg-white/5 rounded-xl">
                                        <p className="text-2xl font-bold text-white">{opponent.elo || 1000}</p>
                                        <p className="text-[9px] text-white/40 uppercase font-bold">ELO</p>
                                    </div>
                                </div>
                            </div>

                            {/* Opponent Roster Preview */}
                            <div className="p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Opponent Roster</h3>
                                    <span className="text-[10px] text-white/30">{opponentRoster.length} players</span>
                                </div>
                                <div className="space-y-1.5">
                                    {topPlayers.map(player => (
                                        <div key={player.id} className="flex items-center gap-3 p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
                                            <div className="w-8 h-8 rounded-lg bg-white/5 overflow-hidden flex items-center justify-center shrink-0">
                                                <PlayerPortrait src={player.portraitPath} alt={player.nickname} size={32} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-xs font-bold text-white truncate">{player.nickname}</span>
                                                    <CountryFlag country={player.nationality} size={10} className="opacity-60" />
                                                </div>
                                                <span className="text-[10px] text-white/40">{resolvePlayerRole(player as any)}</span>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <span className={cn(
                                                    "text-sm font-bold",
                                                    player.ovr >= 85 ? "text-amber-400" : player.ovr >= 75 ? "text-emerald-400" : "text-white/60"
                                                )}>
                                                    {player.ovr}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="p-4 bg-white/5 border-t border-white/5">
                                <div className="flex gap-3">
                                    <Button
                                        variant="outline"
                                        onClick={onClose}
                                        className="flex-1 h-11 border-white/10 text-white/60 hover:bg-white/5"
                                    >
                                        Close
                                    </Button>
                                    <Button
                                        onClick={handleGoToMatch}
                                        className="flex-1 h-11 bg-amber-500 hover:bg-amber-400 text-black font-bold shadow-[0_0_20px_rgba(245,158,11,0.3)] hover:shadow-[0_0_30px_rgba(245,158,11,0.5)] transition-all hover:scale-[1.02] active:scale-[0.98]"
                                    >
                                        <Play size={16} className="mr-2 fill-black" />
                                        {match.result ? "View Result" : "PLAY MATCH"}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}
