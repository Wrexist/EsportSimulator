"use client"

import React, { memo, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Trophy, Minus, DollarSign, Users, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { TournamentDefinition, formatPrizePool } from "@/data/tournament-calendar"
import { TeamSaveData, MatchSaveData, CompletedMatchSaveData } from "@/engine"
import { textOnBrand as textOn } from "@/lib/branding/fallback"
import { pressable } from "@/lib/accessibility"
import { TeamLink } from "@/components/ui/EntityLink"

interface TournamentStandingsProps {
    tournament: TournamentDefinition
    matches: (MatchSaveData | CompletedMatchSaveData)[]
    teams: TeamSaveData[]
    playerTeamId?: string | null
    qualifiedTeamIds?: string[]
}

interface TeamStanding {
    teamId: string
    team: TeamSaveData | undefined
    wins: number
    losses: number
    draws: number
    roundsWon: number
    roundsLost: number
    roundDiff: number
    streak: number // Positive for win streak, negative for loss streak
    points: number
}

function TournamentStandings({ tournament, matches, teams, playerTeamId, qualifiedTeamIds }: TournamentStandingsProps) {
    const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null)
    const standings = useMemo(() => {
        const stats: Record<string, TeamStanding> = {}

        // Initialize for all participating teams found in matches
        // Note: Ideally we'd have a list of participants, but for now we infer from matches 
        // or just use teams if they have a match in this tournament.
        // A better approach if available: tournament.participants

        // 1. Find all teams that have played or are scheduled to play
        const participatingTeamIds = new Set<string>()
        matches.forEach(m => {
            if (m.homeTeamId) participatingTeamIds.add(m.homeTeamId)
            if (m.awayTeamId) participatingTeamIds.add(m.awayTeamId)
        })

        // 2. Initialize stats object
        Array.from(participatingTeamIds).forEach(teamId => {
            stats[teamId] = {
                teamId,
                team: teams.find(t => t.id === teamId),
                wins: 0,
                losses: 0,
                draws: 0,
                roundsWon: 0,
                roundsLost: 0,
                roundDiff: 0,
                streak: 0,
                points: 0
            }
        })

        // 3. Process matches
        matches.forEach(match => {
            if (!match.result || !match.homeTeamId || !match.awayTeamId) return

            const { homeScore, awayScore } = match.result
            if (homeScore === undefined || awayScore === undefined) return

            const home = stats[match.homeTeamId]
            const away = stats[match.awayTeamId]

            if (home && away) {
                // Update Rounds
                home.roundsWon += homeScore
                home.roundsLost += awayScore
                home.roundDiff += (homeScore - awayScore)

                away.roundsWon += awayScore
                away.roundsLost += homeScore
                away.roundDiff += (awayScore - homeScore)

                // Update W/L/D and Streak
                if (homeScore > awayScore) {
                    home.wins++
                    home.points += 3
                    home.streak = home.streak > 0 ? home.streak + 1 : 1

                    away.losses++
                    away.streak = away.streak < 0 ? away.streak - 1 : -1
                } else if (awayScore > homeScore) {
                    away.wins++
                    away.points += 3
                    away.streak = away.streak > 0 ? away.streak + 1 : 1

                    home.losses++
                    home.streak = home.streak < 0 ? home.streak - 1 : -1
                } else {
                    home.draws++
                    home.points += 1
                    home.streak = 0 // Reset streak on draw?

                    away.draws++
                    away.points += 1
                    away.streak = 0
                }
            }
        })

        // 4. Sort Rankings
        // Priority: Points -> Round Diff -> Rounds Won -> Alphabetical
        return Object.values(stats)
            .filter(s => s.team !== undefined) // Filter out incomplete data
            .sort((a, b) => {
                if (b.points !== a.points) return b.points - a.points
                if (b.roundDiff !== a.roundDiff) return b.roundDiff - a.roundDiff
                if (b.roundsWon !== a.roundsWon) return b.roundsWon - a.roundsWon
                return (a.team?.name || "").localeCompare(b.team?.name || "")
            })
    }, [matches, teams])

    // Prize Distribution Helper
    // This is valid for standard structures. 
    // In a bracket, prizes usually map to placement (1st, 2nd, 3-4th).
    // In a Swiss/Group, it might trigger qualification.
    const getPrizeForRank = (rank: number) => {
        if (tournament.prizePool === 0) return null

        // Simple heuristic approximation for visualization
        // Real logic would need a proper prize distribution table in tournament definition
        const pool = tournament.prizePool
        if (rank === 1) return pool * 0.40
        if (rank === 2) return pool * 0.20
        if (rank <= 4) return pool * 0.10
        if (rank <= 8) return pool * 0.05
        return null
    }

    const getRowStyle = (rank: number) => {
        // Qualifier Slots styling
        if (tournament.qualifierSlots && rank <= tournament.qualifierSlots) {
            return "bg-positive/10 border-positive/40"
        }
        // Invite slots styling??
        return "bg-raised border-line"
    }

    // Pre-tournament participant list: show qualified teams when no matches yet
    const qualifiedTeams = useMemo(() => {
        if (!qualifiedTeamIds || qualifiedTeamIds.length === 0) return []
        return qualifiedTeamIds
            .map(id => teams.find(t => t.id === id))
            .filter((t): t is TeamSaveData => t !== undefined)
            .sort((a, b) => (a.worldRanking || 999) - (b.worldRanking || 999))
    }, [qualifiedTeamIds, teams])

    if (standings.length === 0 && qualifiedTeams.length > 0) {
        const qualifierSlots = tournament.qualifierSlots || 0
        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-ink-3 px-2">
                    <div className="flex items-center gap-2">
                        <Users size={12} className="text-ink-1" />
                        <span className="uppercase tracking-wider font-bold">Invited Teams</span>
                    </div>
                    <span className="tabular-nums">
                        {qualifiedTeams.length}/{tournament.slots} slots
                        {qualifierSlots > 0 && <span className="text-ink-3 ml-1">({qualifierSlots} via qualifier)</span>}
                    </span>
                </div>

                <div className="overflow-hidden rounded-xl border border-line bg-shell">
                    <div className="grid grid-cols-[3rem_2fr_1fr_1fr] bg-raised text-[11px] font-bold uppercase tracking-wider text-ink-3 py-3 px-4">
                        <div className="text-center">#</div>
                        <div className="text-left">Team</div>
                        <div className="text-center">World Rank</div>
                        <div className="text-right">Status</div>
                    </div>

                    <div className="divide-y divide-line">
                        {qualifiedTeams.map((team, index) => {
                            const isPlayer = team.id === playerTeamId
                            return (
                                <motion.div
                                    key={team.id}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.03 }}
                                    className={cn(
                                        "grid grid-cols-[3rem_2fr_1fr_1fr] items-center py-3 px-4 text-sm hover:bg-hover transition-colors",
                                        isPlayer && "bg-gold/[0.06] shadow-[inset_2px_0_0_var(--gold)]"
                                    )}
                                >
                                    <div className="text-center font-bold text-ink-3">{index + 1}</div>
                                    <div className="flex items-center gap-3 min-w-0">
                                        <Avatar className="w-8 h-8 rounded-md bg-shell border border-line">
                                            <AvatarImage src={team.logoPath} />
                                            <AvatarFallback className="rounded-md bg-raised text-[11px]">{team.name.substring(0, 2)}</AvatarFallback>
                                        </Avatar>
                                        <TeamLink id={team.id} className="font-bold truncate text-ink-1">
                                            {team.name}
                                        </TeamLink>
                                    </div>
                                    <div className="text-center tabular-nums text-xs text-ink-2">
                                        #{team.worldRanking || "—"}
                                    </div>
                                    <div className="text-right">
                                        <Badge className="bg-positive/10 text-positive border-0 h-5 px-1.5 text-[11px]">
                                            Invited
                                        </Badge>
                                    </div>
                                </motion.div>
                            )
                        })}

                        {/* Qualifier TBD slots */}
                        {Array.from({ length: qualifierSlots }).map((_, i) => (
                            <div
                                key={`qualifier-tbd-${i}`}
                                className="grid grid-cols-[3rem_2fr_1fr_1fr] items-center py-3 px-4 text-sm opacity-40"
                            >
                                <div className="text-center font-bold text-ink-3">{qualifiedTeams.length + i + 1}</div>
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-8 h-8 rounded-md bg-raised border border-dashed border-line flex items-center justify-center">
                                        <span className="text-[11px] text-ink-3">?</span>
                                    </div>
                                    <span className="text-ink-3 italic">TBD</span>
                                </div>
                                <div className="text-center tabular-nums text-xs text-ink-3">—</div>
                                <div className="text-right">
                                    <Badge className="bg-gold/[0.06] text-gold border-0 h-5 px-1.5 text-[11px]">
                                        Qualifier
                                    </Badge>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )
    }

    if (standings.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-ink-3">
                <Trophy size={48} className="mb-4 opacity-50" />
                <p>No standings data available yet.</p>
                <p className="text-xs mt-2">Standings will update as matches are played.</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* Legend / Info */}
            <div className="flex items-center gap-4 text-xs text-ink-3 px-2">
                {tournament.qualifierSlots && (
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-positive" />
                        <span>Qualifies for <span className="text-ink-1 font-semibold">{tournament.qualifierFor ? "Next Stage" : "Main Event"}</span></span>
                    </div>
                )}
                {tournament.prizePool > 0 && (
                    <div className="flex items-center gap-2">
                        <DollarSign size={12} className="text-gold" />
                        <span>Prize Pool: <span className="text-gold tabular-nums">{formatPrizePool(tournament.prizePool)}</span></span>
                    </div>
                )}
            </div>

            <div className="overflow-hidden rounded-xl border border-line bg-shell">
                {/* Header — mirrors the M / RW / RL / RD / Record / E column set */}
                <div className="grid grid-cols-[3.5rem_minmax(0,2fr)_repeat(5,minmax(0,0.7fr))_2rem] bg-raised text-[11px] font-bold uppercase tracking-wider text-ink-3 py-3 px-4 gap-2">
                    <div className="text-center">#</div>
                    <div className="text-left">Team</div>
                    <div className="text-center" title="Matches Played">M</div>
                    <div className="text-center" title="Rounds Won">RW</div>
                    <div className="text-center" title="Rounds Lost">RL</div>
                    <div className="text-center" title="Round Differential">RD</div>
                    <div className="text-center" title="Record (Wins-Losses)">Record</div>
                    <div className="text-center" title="Expand">E</div>
                </div>

                {/* Rows */}
                <div className="divide-y divide-line">
                    {standings.map((team, index) => {
                        const rank = index + 1
                        const isPlayer = team.teamId === playerTeamId
                        const prize = getPrizeForRank(rank)
                        const isQualified = tournament.qualifierSlots ? rank <= tournament.qualifierSlots : false
                        const isExpanded = expandedTeamId === team.teamId
                        const matchesPlayed = team.wins + team.losses + team.draws

                        return (
                            <div key={team.teamId}>
                                <motion.div
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                    {...pressable(() => setExpandedTeamId(isExpanded ? null : team.teamId), { expanded: isExpanded })}
                                    className={cn(
                                        "grid grid-cols-[3.5rem_minmax(0,2fr)_repeat(5,minmax(0,0.7fr))_2rem] items-center py-3 px-4 gap-2 text-sm hover:bg-hover transition-colors cursor-pointer",
                                        getRowStyle(rank),
                                        isPlayer && "bg-gold/[0.06] shadow-[inset_2px_0_0_var(--gold)]"
                                    )}
                                >
                                    {/* Rank chip — brand-colored when team has branding, otherwise gold/silver/bronze for top-3 */}
                                    <div className="text-center font-bold text-ink-3">
                                        {team.team?.branding?.primaryColor ? (
                                            <div
                                                className="w-11 h-6 mx-auto flex items-center justify-center rounded font-bold text-[11px] tracking-tight"
                                                style={{
                                                    backgroundColor: team.team.branding.primaryColor,
                                                    color: textOn(team.team.branding.primaryColor),
                                                }}
                                            >
                                                #{rank}
                                            </div>
                                        ) : rank <= 3 ? (
                                            <div className={cn(
                                                "w-6 h-6 mx-auto flex items-center justify-center rounded-full text-black font-bold text-xs",
                                                rank === 1 ? "bg-gold" : "bg-ink-2"
                                            )}>
                                                {rank}
                                            </div>
                                        ) : rank}
                                    </div>

                                    {/* Team */}
                                    <div className="flex items-center gap-3 min-w-0">
                                        <Avatar className="w-8 h-8 rounded-md bg-shell border border-line">
                                            <AvatarImage src={team.team?.logoPath} />
                                            <AvatarFallback className="rounded-md bg-raised text-[11px]">{team.team?.name.substring(0, 2)}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex flex-col min-w-0">
                                            <TeamLink id={team.team?.id} className="font-bold truncate text-ink-1">
                                                {team.team?.name}
                                            </TeamLink>
                                            <span className="text-[11px] text-ink-3">
                                                {team.points} pts{team.team?.worldRanking ? ` · World #${team.team.worldRanking}` : ""}
                                            </span>
                                        </div>
                                    </div>

                                    {/* M — matches played */}
                                    <div className="text-center tabular-nums text-xs text-ink-2">{matchesPlayed}</div>

                                    {/* RW — rounds won */}
                                    <div className="text-center tabular-nums text-xs text-ink-2">{team.roundsWon}</div>

                                    {/* RL — rounds lost */}
                                    <div className="text-center tabular-nums text-xs text-ink-2">{team.roundsLost}</div>

                                    {/* RD — round differential */}
                                    <div className={cn("text-center tabular-nums text-xs", team.roundDiff > 0 ? "text-positive" : team.roundDiff < 0 ? "text-negative" : "text-ink-3")}>
                                        {team.roundDiff > 0 ? "+" : ""}{team.roundDiff}
                                    </div>

                                    {/* Record */}
                                    <div className="text-center tabular-nums text-xs">
                                        <span className="text-positive">{team.wins}</span>
                                        <span className="text-ink-3 mx-0.5">-</span>
                                        <span className="text-negative">{team.losses}</span>
                                    </div>

                                    {/* E — expand chevron */}
                                    <div className="flex items-center justify-center text-ink-3">
                                        <ChevronDown
                                            size={14}
                                            className={cn("transition-transform duration-150", isExpanded && "rotate-180")}
                                        />
                                    </div>
                                </motion.div>

                                <AnimatePresence initial={false}>
                                    {isExpanded && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.18 }}
                                            className="overflow-hidden bg-shell"
                                        >
                                            <div className="px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px]">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-ink-3 uppercase tracking-wider">Streak</span>
                                                    {team.streak > 0 ? (
                                                        <Badge className="bg-positive/10 text-positive border-0 h-5 px-1.5 text-[11px]">
                                                            W{team.streak}
                                                        </Badge>
                                                    ) : team.streak < 0 ? (
                                                        <Badge className="bg-negative/10 text-negative border-0 h-5 px-1.5 text-[11px]">
                                                            L{Math.abs(team.streak)}
                                                        </Badge>
                                                    ) : (
                                                        <Minus size={12} className="text-ink-3" />
                                                    )}
                                                </div>
                                                {isQualified && (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-ink-3 uppercase tracking-wider">Status</span>
                                                        <span className="text-positive font-bold uppercase tracking-wider">Qualified</span>
                                                    </div>
                                                )}
                                                {prize ? (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-ink-3 uppercase tracking-wider">Prize</span>
                                                        <span className="tabular-nums text-gold">{formatPrizePool(prize)}</span>
                                                    </div>
                                                ) : null}
                                                {team.draws > 0 && (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-ink-3 uppercase tracking-wider">Draws</span>
                                                        <span className="tabular-nums text-gold">{team.draws}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

export default memo(TournamentStandings)

function Badge({ children, className }: { children: React.ReactNode, className?: string }) {
    return (
        <div className={cn("inline-flex items-center justify-center rounded-sm border px-2.5 py-0.5 text-xs font-semibold", className)}>
            {children}
        </div>
    )
}
