"use client"

import { memo, useMemo } from "react"
import { motion } from "framer-motion"
import Image from "next/image"
import { Trophy, Users, Star, Target, Crosshair, Award } from "lucide-react"
import { cn } from "@/lib/utils"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { CompletedMatchSaveData, PlayerSaveData, TeamSaveData } from "@/engine/save-types"
import {
    getTournamentTopPlayers,
    getTournamentTopTeams,
    getTournamentMVP
} from "@/engine/tournament-stats"
import { TournamentPlayerStats, TournamentTeamStats, TournamentMVP } from "@/types/match"

interface TournamentStatsProps {
    tournamentId: string
    completedMatches: CompletedMatchSaveData[]
    players: PlayerSaveData[]
    teams: TeamSaveData[]
    isCompleted?: boolean
}

function TournamentStatsComponent({
    tournamentId,
    completedMatches,
    players,
    teams,
    isCompleted
}: TournamentStatsProps) {
    // Calculate stats
    const topPlayers = useMemo(() =>
        getTournamentTopPlayers(completedMatches, tournamentId, players, teams, 10),
        [completedMatches, tournamentId, players, teams]
    )

    const topTeams = useMemo(() =>
        getTournamentTopTeams(completedMatches, tournamentId, teams, 10),
        [completedMatches, tournamentId, teams]
    )

    const mvp = useMemo(() =>
        getTournamentMVP(completedMatches, tournamentId, players, teams),
        [completedMatches, tournamentId, players, teams]
    )

    if (topPlayers.length === 0 && topTeams.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center">
                <Target size={48} className="text-white/20 mb-4" />
                <h3 className="text-lg font-normal text-white/60 mb-2">No Stats Available Yet</h3>
                <p className="text-sm text-white/40 max-w-md">
                    Statistics will appear once matches have been played in this tournament.
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-8">
            {/* MVP Banner */}
            {mvp && (isCompleted || topPlayers.length >= 3) && (
                <MVPBanner mvp={mvp} />
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Players */}
                <TopPlayersTable players={topPlayers} />

                {/* Top Teams */}
                <TopTeamsTable teams={topTeams} allTeams={teams} />
            </div>
        </div>
    )
}

export default memo(TournamentStatsComponent)

// MVP Banner Component
function MVPBanner({ mvp }: { mvp: TournamentMVP }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden glass-panel p-6 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-yellow-500/5 to-amber-500/10"
        >
            {/* Background glow */}
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-amber-500/20 blur-[80px] pointer-events-none" />

            <div className="relative z-10 flex items-center gap-6">
                {/* MVP Icon */}
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                    <Trophy className="w-6 h-6 text-amber-400" />
                </div>

                {/* Player Portrait */}
                <div className="flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden bg-white/5 border border-white/10 relative">
                    {mvp.portraitPath ? (
                        <Image
                            src={mvp.portraitPath}
                            alt={mvp.playerName}
                            fill
                            className="object-cover"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/20">
                            <Users size={32} />
                        </div>
                    )}
                    <div className="absolute bottom-1 right-1">
                        <CountryFlag country={mvp.nationality} className="scale-75" />
                    </div>
                </div>

                {/* Player Info */}
                <div className="flex-1 min-w-0">
                    <div className="text-xs text-amber-400 font-normal uppercase tracking-widest mb-1">
                        Tournament MVP
                    </div>
                    <div className="text-2xl font-normal text-white truncate">
                        {mvp.playerName}
                    </div>
                    <div className="text-sm text-white/50">{mvp.teamName}</div>
                </div>

                {/* Stats */}
                <div className="hidden sm:flex items-center gap-6">
                    <div className="text-center">
                        <div className="text-2xl font-normal text-amber-400">{mvp.avgRating.toFixed(2)}</div>
                        <div className="text-xs text-white/40 uppercase">Rating</div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl font-normal text-white">{mvp.totalKills}</div>
                        <div className="text-xs text-white/40 uppercase">Kills</div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl font-normal text-white">{mvp.mapsPlayed}</div>
                        <div className="text-xs text-white/40 uppercase">Maps</div>
                    </div>
                    {mvp.mvpMaps > 0 && (
                        <div className="text-center">
                            <div className="text-2xl font-normal text-purple-400">{mvp.mvpMaps}</div>
                            <div className="text-xs text-white/40 uppercase">MVP Maps</div>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    )
}

// Top Players Table Component
function TopPlayersTable({ players }: { players: TournamentPlayerStats[] }) {
    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-panel rounded-2xl border border-white/5 overflow-hidden"
        >
            {/* Header */}
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Crosshair size={18} className="text-primary" />
                    <h3 className="text-sm font-normal uppercase tracking-widest text-white">
                        Top Players
                    </h3>
                </div>
            </div>

            {/* Table */}
            <div className="divide-y divide-white/5">
                {players.map((player, index) => (
                    <motion.div
                        key={player.playerId}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className={cn(
                            "flex items-center gap-4 px-6 py-3 hover:bg-white/5 transition-colors",
                            index === 0 && "bg-amber-500/5"
                        )}
                    >
                        {/* Rank */}
                        <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold",
                            index === 0 ? "bg-amber-500/20 text-amber-400" :
                                index === 1 ? "bg-gray-400/20 text-gray-300" :
                                    index === 2 ? "bg-orange-600/20 text-orange-400" :
                                        "bg-white/5 text-white/40"
                        )}>
                            {index + 1}
                        </div>

                        {/* Flag & Name */}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                            <CountryFlag country={player.nationality} className="scale-90" />
                            <div className="min-w-0">
                                <div className="text-white font-normal truncate">{player.playerName}</div>
                                <div className="text-xs text-white/40 truncate">{player.teamName}</div>
                            </div>
                        </div>

                        {/* Rating */}
                        <div className="text-right">
                            <div className={cn(
                                "text-lg font-normal",
                                player.rating >= 1.2 ? "text-emerald-400" :
                                    player.rating >= 1.0 ? "text-white" :
                                        "text-red-400"
                            )}>
                                {player.rating.toFixed(2)}
                            </div>
                            <div className="text-[10px] text-white/30 uppercase">Rating</div>
                        </div>

                        {/* Maps */}
                        <div className="text-right w-16">
                            <div className="text-white/60">{player.mapsPlayed}</div>
                            <div className="text-[10px] text-white/30 uppercase">Maps</div>
                        </div>
                    </motion.div>
                ))}
            </div>

            {players.length === 0 && (
                <div className="py-12 text-center text-white/40">
                    No player data available
                </div>
            )}
        </motion.div>
    )
}

// Top Teams Table Component
function TopTeamsTable({ teams: topTeams, allTeams }: { teams: TournamentTeamStats[], allTeams: TeamSaveData[] }) {
    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-panel rounded-2xl border border-white/5 overflow-hidden"
        >
            {/* Header */}
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Award size={18} className="text-primary" />
                    <h3 className="text-sm font-normal uppercase tracking-widest text-white">
                        Top Teams
                    </h3>
                </div>
            </div>

            {/* Table */}
            <div className="divide-y divide-white/5">
                {topTeams.map((team, index) => {
                    const teamData = allTeams.find(t => t.id === team.teamId)

                    return (
                        <motion.div
                            key={team.teamId}
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className={cn(
                                "flex items-center gap-4 px-6 py-3 hover:bg-white/5 transition-colors",
                                index === 0 && "bg-amber-500/5"
                            )}
                        >
                            {/* Rank */}
                            <div className={cn(
                                "w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold",
                                index === 0 ? "bg-amber-500/20 text-amber-400" :
                                    index === 1 ? "bg-gray-400/20 text-gray-300" :
                                        index === 2 ? "bg-orange-600/20 text-orange-400" :
                                            "bg-white/5 text-white/40"
                            )}>
                                {index + 1}
                            </div>

                            {/* Logo & Name */}
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className="w-8 h-8 rounded bg-white/5 overflow-hidden flex-shrink-0">
                                    {teamData?.logoPath ? (
                                        <Image
                                            src={teamData.logoPath}
                                            alt={team.teamName}
                                            width={32}
                                            height={32}
                                            className="w-full h-full object-contain"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-white/20">
                                            <Users size={16} />
                                        </div>
                                    )}
                                </div>
                                <div className="text-white font-normal truncate">{team.teamName}</div>
                            </div>

                            {/* Rating */}
                            <div className="text-right">
                                <div className={cn(
                                    "text-lg font-normal",
                                    team.avgRating >= 1.1 ? "text-emerald-400" :
                                        team.avgRating >= 1.0 ? "text-white" :
                                            "text-red-400"
                                )}>
                                    {team.avgRating.toFixed(2)}
                                </div>
                                <div className="text-[10px] text-white/30 uppercase">Rating</div>
                            </div>

                            {/* Maps */}
                            <div className="text-right w-16">
                                <div className="text-white/60">{team.mapsPlayed}</div>
                                <div className="text-[10px] text-white/30 uppercase">Maps</div>
                            </div>
                        </motion.div>
                    )
                })}
            </div>

            {topTeams.length === 0 && (
                <div className="py-12 text-center text-white/40">
                    No team data available
                </div>
            )}
        </motion.div>
    )
}
