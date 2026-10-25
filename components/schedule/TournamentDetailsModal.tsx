"use client"

import React, { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { getDynamicTournamentName } from "@/lib/utils-extended"
import {
    TournamentDefinition,
    formatPrizePool,
    getEntryTypeLabel,
} from "@/data/tournament-calendar"
import { useGameStore } from "@/store/game-store"
import { teamOvrMap } from "@/lib/team-ovr"
import { useShallow } from "zustand/react/shallow"
import { ScheduleMatchCard } from "@/components/schedule/ScheduleMatchCard"
import TournamentStandings from "@/components/tournament/TournamentStandings"
import TournamentBracket from "@/components/tournament/TournamentBracket"
import { isQualificationForTournament, getSeasonFromWeek, buildInstanceId } from "@/engine/circuit-engine"
import { ScheduleDialog } from "./ScheduleDialog"

interface TournamentDetailsModalProps {
    isOpen: boolean
    onClose: () => void
    tournament: TournamentDefinition
    status?: "QUALIFIED" | "REGISTERED" | "PENDING" | "ELIMINATED" | "INVITED"
}

type Tab = "overview" | "matches" | "standings" | "bracket"

const TIER_LABEL: Record<string, string> = { S_TIER: "S-tier", A_TIER: "A-tier", B_TIER: "B-tier", C_TIER: "C-tier" }

const STATUS_COPY: Record<NonNullable<TournamentDetailsModalProps["status"]>, { label: string; detail: string; className: string }> = {
    QUALIFIED: { label: "Qualified", detail: "Your team plays in this event.", className: "text-positive" },
    REGISTERED: { label: "Registered", detail: "Your team is entered in this event.", className: "text-positive" },
    INVITED: { label: "Invited", detail: "Accept the invite to take part.", className: "text-gold" },
    PENDING: { label: "Pending", detail: "Your entry has not been confirmed yet.", className: "text-ink-2" },
    ELIMINATED: { label: "Eliminated", detail: "Your team is out of this event.", className: "text-ink-3" },
}

/** Playoff stage → bracket round name. */
function roundName(stage: string): string {
    if (stage.includes("Quarter-final")) return "Quarter-finals"
    if (stage.includes("Semi-final")) return "Semi-finals"
    if (stage.includes("Grand Final")) return "Grand Final"
    if (stage.includes("Swiss Round")) return `Round ${stage.match(/\d+/)?.[0] || ""}`
    const roundOf = stage.match(/Round of (\d+)/)?.[1]
    if (roundOf) return `Round of ${roundOf}`
    return stage
}

export function TournamentDetailsModal({
    isOpen,
    onClose,
    tournament,
    status
}: TournamentDetailsModalProps) {
    const { tournaments, scheduledMatches, completedMatches, teams, players, playerTeamId, currentWeek, tournamentQualifications, registerForTournament, activeMatchId } = useGameStore(useShallow(state => ({
        tournaments: state.tournaments,
        players: state.players,
        scheduledMatches: state.scheduledMatches,
        completedMatches: state.completedMatches,
        teams: state.teams,
        playerTeamId: state.playerTeamId,
        currentWeek: state.currentWeek,
        tournamentQualifications: state.tournamentQualifications,
        registerForTournament: state.registerForTournament,
        activeMatchId: state.activeMatchId,
    })))
    const [activeTab, setActiveTab] = useState<Tab>("standings")

    // Find the actual seasonal tournament instance, e.g. "major" -> "major_s1"
    const seasonalTournament = tournaments.find(t =>
        t.id === tournament.id || t.id.startsWith(`${tournament.id}_`)
    )

    // Rank and OVR beside each bracket name.
    const bracketOvrs = useMemo(() => {
        const ids = new Set((seasonalTournament?.playoffBracket ?? []).flatMap(m => [m.homeTeamId, m.awayTeamId]))
        return teamOvrMap(teams.filter(t => ids.has(t.id)), players)
    }, [seasonalTournament, teams, players])

    // Get qualified/invited team IDs from the qualification system
    const qualifiedTeamIds = useMemo(() => {
        const seasonNumber = getSeasonFromWeek(currentWeek)
        const instanceId = buildInstanceId(tournament.id, seasonNumber)
        return (tournamentQualifications || [])
            .filter(q =>
                (q.status === "QUALIFIED" || q.status === "REGISTERED" || q.status === "INVITED") &&
                isQualificationForTournament(q, instanceId, currentWeek)
            )
            .map(q => q.teamId)
    }, [tournamentQualifications, tournament.id, currentWeek])

    // Get matches for this tournament
    const tournamentMatches = seasonalTournament
        ? [
            ...scheduledMatches.filter(m => m.tournamentId === seasonalTournament.id),
            ...completedMatches.filter(m => m.tournamentId === seasonalTournament.id)
        ].sort((a, b) => a.week - b.week)
        : []

    const endWeek = tournament.startWeek + Math.max(1, tournament.duration) - 1
    const statusCopy = status ? STATUS_COPY[status] : null

    return (
        <ScheduleDialog
            isOpen={isOpen}
            onClose={onClose}
            titleId="modal-title-tournament-details"
            title={getDynamicTournamentName(tournament.name, currentWeek)}
            subtitle={`${TIER_LABEL[tournament.tier] ?? tournament.tier} · ${getEntryTypeLabel(tournament.entryType)} · Weeks ${tournament.startWeek}–${endWeek} · ${formatPrizePool(tournament.prizePool)} prize pool`}
            closeLabel="Close tournament details"
            className={activeTab === "bracket" ? "max-w-[90vw]" : "max-w-3xl"}
        >
            <div className="sticky top-0 z-10 border-b border-line bg-panel px-6">
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tab)}>
                    <TabsList aria-label="Tournament sections" className="border-b-0!">
                        <TabsTrigger value="standings">Standings</TabsTrigger>
                        <TabsTrigger value="matches">
                            Matches {tournamentMatches.length > 0 && <span className="tabular-nums text-ink-3">{tournamentMatches.length}</span>}
                        </TabsTrigger>
                        <TabsTrigger value="bracket">Bracket</TabsTrigger>
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            <div className={cn("p-6", activeTab === "bracket" && "overflow-x-hidden p-0")}>
                {activeTab === "overview" ? (
                    <div className="space-y-5">
                        {statusCopy && (
                            <div className="flex items-center justify-between gap-4 rounded-md border border-line bg-shell px-4 py-3">
                                <div>
                                    <p className={cn("text-sm font-semibold", statusCopy.className)}>{statusCopy.label}</p>
                                    <p className="text-xs text-ink-3">{statusCopy.detail}</p>
                                </div>
                                {status === "INVITED" && (
                                    <Button size="sm" onClick={() => { registerForTournament(tournament.id); onClose() }}>
                                        Accept invite
                                    </Button>
                                )}
                            </div>
                        )}

                        <dl className="grid grid-cols-2 gap-x-8 text-sm">
                            {[
                                ["Start", `Week ${tournament.startWeek}`],
                                ["Region", tournament.region],
                                ["Duration", `${tournament.duration} week${tournament.duration === 1 ? "" : "s"}`],
                                ["Teams", tournament.slots],
                                ["Format", tournament.format.replace(/_/g, " ").toLowerCase()],
                                ["Invites", tournament.inviteSlots || 0],
                            ].map(([label, value]) => (
                                <div key={label as string} className="flex justify-between border-b border-line py-2">
                                    <dt className="text-ink-3">{label}</dt>
                                    <dd className="font-semibold capitalize tabular-nums text-ink-1">{value}</dd>
                                </div>
                            ))}
                        </dl>

                        {tournament.description && <p className="text-sm leading-relaxed text-ink-2">{tournament.description}</p>}
                    </div>
                ) : activeTab === "standings" ? (
                    <TournamentStandings
                        tournament={tournament}
                        matches={tournamentMatches}
                        teams={teams}
                        playerTeamId={playerTeamId}
                        qualifiedTeamIds={qualifiedTeamIds}
                    />
                ) : activeTab === "bracket" ? (
                    <div className="min-h-[400px]">
                        {seasonalTournament && seasonalTournament.playoffBracket && seasonalTournament.playoffBracket.length > 0 ? (
                            <TournamentBracket
                                matches={seasonalTournament.playoffBracket.map(m => {
                                    const homeTeam = teams.find(t => t.id === m.homeTeamId)
                                    const awayTeam = teams.find(t => t.id === m.awayTeamId)
                                    const completedMatch = completedMatches.find(cm => cm.id === m.id)
                                    const matchStatus = m.isCompleted ? "completed" : (activeMatchId === m.id ? "live" : "scheduled")
                                    return {
                                        id: m.id,
                                        round: roundName(m.stage),
                                        status: matchStatus,
                                        team1: {
                                            id: m.homeTeamId || "TBD",
                                            name: homeTeam?.name || "TBD",
                                            logo: homeTeam?.logoPath,
                                            score: completedMatch?.result ? completedMatch.result.homeScore : undefined,
                                            isWinner: m.winnerId === m.homeTeamId,
                                            recentForm: homeTeam?.recentForm,
                                            rank: homeTeam?.worldRanking,
                                            ovr: homeTeam ? bracketOvrs.get(homeTeam.id) : undefined,
                                        },
                                        team2: {
                                            id: m.awayTeamId || "TBD",
                                            name: awayTeam?.name || "TBD",
                                            logo: awayTeam?.logoPath,
                                            score: completedMatch?.result ? completedMatch.result.awayScore : undefined,
                                            isWinner: m.winnerId === m.awayTeamId,
                                            recentForm: awayTeam?.recentForm,
                                            rank: awayTeam?.worldRanking,
                                            ovr: awayTeam ? bracketOvrs.get(awayTeam.id) : undefined,
                                        }
                                    }
                                })}
                                rounds={Array.from(new Set(seasonalTournament.playoffBracket.map(m => roundName(m.stage))))}
                            />
                        ) : (
                            <p className="p-6 text-sm text-ink-3">The bracket is drawn when the qualification stage ends or the event starts.</p>
                        )}
                    </div>
                ) : (
                    tournamentMatches.length > 0 ? (
                        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                            {tournamentMatches.map(match => (
                                <ScheduleMatchCard
                                    key={match.id}
                                    match={match}
                                    teams={teams}
                                    playerTeamId={playerTeamId || ""}
                                    isScrim={match.isScrim}
                                    tournamentName={`Week ${match.week}${match.stage ? ` · ${match.stage}` : ""}`}
                                />
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-ink-3">Matches are generated when the event starts.</p>
                    )
                )}
            </div>
        </ScheduleDialog>
    )
}

export default TournamentDetailsModal;
