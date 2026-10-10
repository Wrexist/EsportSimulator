"use client"

import { memo, useMemo } from "react"
import { motion } from "framer-motion"
import Image from "next/image"
import { Trophy, Users, Target, Crosshair, Award } from "lucide-react"
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
                <Target size={48} className="text-ink-3 mb-4" />
                <h3 className="text-lg font-normal text-ink-2 mb-2">No Stats Available Yet</h3>
                <p className="text-sm text-ink-3 max-w-md">
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
            className="relative overflow-hidden bg-panel p-6 rounded-lg border border-gold/40 bg-raised"
        >
            

            <div className="relative z-10 flex items-center gap-6">
                {/* MVP Icon */}
                <div className="shrink-0 w-12 h-12 rounded-xl bg-gold/15 border border-gold/40 flex items-center justify-center">
                    <Trophy className="w-6 h-6 text-gold" />
                </div>

                {/* Player Portrait */}
                <div className="shrink-0 w-20 h-20 rounded-xl overflow-hidden bg-raised relative">
                    {mvp.portraitPath ? (
                        <Image
                            src={mvp.portraitPath}
                            alt={mvp.playerName}
                            fill
                            className="object-cover"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-ink-3">
                            <Users size={32} />
                        </div>
                    )}
                    <div className="absolute bottom-1 right-1">
                        <CountryFlag country={mvp.nationality} className="scale-75" />
                    </div>
                </div>

                {/* Player Info */}
                <div className="flex-1 min-w-0">
                    <div className="text-xs text-gold font-normal uppercase tracking-widest mb-1">
                        Tournament MVP
                    </div>
                    <div className="text-2xl font-normal text-ink-1 truncate">
                        {mvp.playerName}
                    </div>
                    <div className="text-sm text-ink-3">{mvp.teamName}</div>
                </div>

                {/* Stats */}
                <div className="hidden sm:flex items-center gap-6">
                    <div className="text-center">
                        <div className="text-2xl font-normal text-gold">{mvp.avgRating.toFixed(2)}</div>
                        <div className="text-xs text-ink-3 uppercase">Rating</div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl font-normal text-ink-1">{mvp.totalKills}</div>
                        <div className="text-xs text-ink-3 uppercase">Kills</div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl font-normal text-ink-1">{mvp.mapsPlayed}</div>
                        <div className="text-xs text-ink-3 uppercase">Maps</div>
                    </div>
                    {mvp.mvpMaps > 0 && (
                        <div className="text-center">
                            <div className="text-2xl font-normal text-ink-1">{mvp.mvpMaps}</div>
                            <div className="text-xs text-ink-3 uppercase">MVP Maps</div>
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
            className="bg-panel rounded-lg border border-line overflow-hidden"
        >
            {/* Header */}
            <div className="px-6 py-4 border-b border-line flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Crosshair size={16} className="text-ink-3" />
                    <h3 className="text-sm font-semibold text-ink-1">
                        Top players
                    </h3>
                </div>
            </div>

            {/* Table */}
            <div className="divide-y divide-line">
                {players.map((player, index) => (
                    <motion.div
                        key={player.playerId}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className={cn(
                            "flex items-center gap-4 px-6 py-3 hover:bg-hover transition-colors",
                            index === 0 && "bg-gold/[0.06]"
                        )}
                    >
                        {/* Rank */}
                        <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold",
                            index === 0 ? "bg-gold/15 text-gold" :
                                index === 1 ? "bg-hover text-ink-1" :
                                    index === 2 ? "bg-hover text-ink-2" :
                                        "bg-raised text-ink-3"
                        )}>
                            {index + 1}
                        </div>

                        {/* Flag & Name */}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                            <CountryFlag country={player.nationality} className="scale-90" />
                            <div className="min-w-0">
                                <div className="text-ink-1 font-normal truncate">{player.playerName}</div>
                                <div className="text-xs text-ink-3 truncate">{player.teamName}</div>
                            </div>
                        </div>

                        {/* Rating */}
                        <div className="text-right">
                            <div className={cn(
                                "text-lg font-normal",
                                player.rating >= 1.2 ? "text-positive" :
                                    player.rating >= 1.0 ? "text-ink-1" :
                                        "text-negative"
                            )}>
                                {player.rating.toFixed(2)}
                            </div>
                            <div className="text-[11px] text-ink-3 uppercase">Rating</div>
                        </div>

                        {/* Maps */}
                        <div className="text-right w-16">
                            <div className="text-ink-2">{player.mapsPlayed}</div>
                            <div className="text-[11px] text-ink-3 uppercase">Maps</div>
                        </div>
                    </motion.div>
                ))}
            </div>

            {players.length === 0 && (
                <div className="py-12 text-center text-ink-3">
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
            className="bg-panel rounded-lg border border-line overflow-hidden"
        >
            {/* Header */}
            <div className="px-6 py-4 border-b border-line flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Award size={16} className="text-ink-3" />
                    <h3 className="text-sm font-semibold text-ink-1">
                        Top teams
                    </h3>
                </div>
            </div>

            {/* Table */}
            <div className="divide-y divide-line">
                {topTeams.map((team, index) => {
                    const teamData = allTeams.find(t => t.id === team.teamId)

                    return (
                        <motion.div
                            key={team.teamId}
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className={cn(
                                "flex items-center gap-4 px-6 py-3 hover:bg-hover transition-colors",
                                index === 0 && "bg-gold/[0.06]"
                            )}
                        >
                            {/* Rank */}
                            <div className={cn(
                                "w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold",
                                index === 0 ? "bg-gold/15 text-gold" :
                                    index === 1 ? "bg-hover text-ink-1" :
                                        index === 2 ? "bg-hover text-ink-2" :
                                            "bg-raised text-ink-3"
                            )}>
                                {index + 1}
                            </div>

                            {/* Logo & Name */}
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className="w-8 h-8 rounded bg-raised overflow-hidden shrink-0">
                                    {teamData?.logoPath ? (
                                        <Image
                                            src={teamData.logoPath}
                                            alt={team.teamName}
                                            width={32}
                                            height={32}
                                            className="w-full h-full object-contain"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-ink-3">
                                            <Users size={16} />
                                        </div>
                                    )}
                                </div>
                                <div className="text-ink-1 font-normal truncate">{team.teamName}</div>
                            </div>

                            {/* Rating */}
                            <div className="text-right">
                                <div className={cn(
                                    "text-lg font-normal",
                                    team.avgRating >= 1.1 ? "text-positive" :
                                        team.avgRating >= 1.0 ? "text-ink-1" :
                                            "text-negative"
                                )}>
                                    {team.avgRating.toFixed(2)}
                                </div>
                                <div className="text-[11px] text-ink-3 uppercase">Rating</div>
                            </div>

                            {/* Maps */}
                            <div className="text-right w-16">
                                <div className="text-ink-2">{team.mapsPlayed}</div>
                                <div className="text-[11px] text-ink-3 uppercase">Maps</div>
                            </div>
                        </motion.div>
                    )
                })}
            </div>

            {topTeams.length === 0 && (
                <div className="py-12 text-center text-ink-3">
                    No team data available
                </div>
            )}
        </motion.div>
    )
}
