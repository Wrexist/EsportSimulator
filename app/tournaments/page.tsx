"use client"

import React, { useMemo } from "react"
import { useRouteViewState } from "@/hooks/use-route-view-state"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import Image from "next/image"
import { trophyArtFor, trophyKindForTournament } from "@/lib/trophy-art"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Trophy, Lock, CheckCircle2, ChevronRight, Search, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { getDynamicTournamentName } from "@/lib/utils-extended"
import {
    FULL_TOURNAMENT_CALENDAR,
    getDiscoveredTournaments,
    formatPrizePool,
    getEntryTypeLabel,
    TournamentDefinition,
} from "@/data/tournament-calendar"
import {
    QualificationEngine,
    CircuitPointsManager,
    TournamentParticipationManager,
    CircuitPointsEntry,
    QualificationStatus
} from "@/engine/tournament-qualification"
import { getSeasonFromWeek, buildInstanceId } from "@/engine/circuit-engine"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { pressable } from "@/lib/accessibility"
import { ScreenHeader } from "@/src/components/ui/ScreenHeader"
import { Kpi, KpiStrip } from "@/src/components/ui/Kpi"
import { Panel } from "@/src/components/ui/Panel"
import { TierTag } from "@/src/components/ui/TierTag"
import { EmptyState } from "@/src/components/ui/EmptyState"

// Tab types
type ViewTab = "ALL" | "S_TIER" | "A_TIER" | "B_TIER" | "C_TIER" | "QUALIFIERS" | "MY_TOURNAMENTS"

const FORMAT_LABEL: Record<string, string> = { bracket: "Single elim", double_elim: "Double elim", swiss: "Swiss", league: "League" }
const REGION_LABEL: Record<string, string> = { INTERNATIONAL: "International", EU: "Europe", NA: "North America", SA: "South America", ASIA: "Asia", CIS: "CIS", OCEANIA: "Oceania", MENA: "MENA" }

type RowStatus = { label: string; tone: "live" | "good" | "muted" | "bad" | "neutral"; detail?: string }

const STATUS_TONE: Record<RowStatus["tone"], string> = {
    live: "text-negative",
    good: "text-positive",
    bad: "text-negative",
    muted: "text-ink-3",
    neutral: "text-ink-2",
}

export default function TournamentsPage() {
    const {
        tournaments,
        teams,
        playerTeamId,
        currentWeek,
        circuitPoints: storeCircuitPoints,
        tournamentQualifications,
        registerForTournament,
        scheduledMatches,
        completedMatches
    } = useGameStore(useShallow(state => ({
        tournaments: state.tournaments,
        teams: state.teams,
        playerTeamId: state.playerTeamId,
        currentWeek: state.currentWeek,
        circuitPoints: state.circuitPoints,
        tournamentQualifications: state.tournamentQualifications,
        registerForTournament: state.registerForTournament,
        scheduledMatches: state.scheduledMatches,
        completedMatches: state.completedMatches,
    })))

    const router = useRouter()

    const viewCareerId = useGameStore(state => state.saveId)
    const [activeTab, setActiveTab] = useRouteViewState<ViewTab>(viewCareerId, "tournaments:tab", "ALL")
    const [searchTerm, setSearchTerm] = useRouteViewState(viewCareerId, "tournaments:search", "")

    const toSeriesId = (id: string) => id.replace(/_s\d+$/, "")
    const isQualificationForSeries = (q: QualificationStatus, tournamentId: string) => {
        const seriesId = toSeriesId(tournamentId)
        const qSeriesId = toSeriesId(q.seriesId || q.tournamentId)
        return qSeriesId === seriesId
    }

    // Get player's team and ranking
    const playerTeam = teams.find(t => t.id === playerTeamId)
    const rankedTeams = useMemo(() => {
        return [...teams]
            .sort((a, b) => (b.elo || 1000) - (a.elo || 1000))
            .map((team, idx) => ({ ...team, worldRanking: idx + 1 }))
    }, [teams])
    const playerRanking = rankedTeams.find(t => t.id === playerTeamId)?.worldRanking || 999

    // Use store circuit points
    const circuitPoints = useMemo(() => {
        return (storeCircuitPoints || []) as CircuitPointsEntry[]
    }, [storeCircuitPoints])

    // Use store qualification statuses or generate mock ones
    const qualificationStatuses: QualificationStatus[] = useMemo(() => {
        if (tournamentQualifications && tournamentQualifications.length > 0) {
            return tournamentQualifications
        }
        // Mock statuses based on ranking
        const statuses: QualificationStatus[] = []
        const currentSeason = getSeasonFromWeek(currentWeek)

        // If player is top 20, they're invited to S-Tier
        if (playerTeam && playerRanking <= 20) {
            FULL_TOURNAMENT_CALENDAR
                .filter(t => t.tier === "S_TIER" && t.entryType === "INVITE" && t.requiredRanking && t.requiredRanking >= playerRanking)
                .forEach(t => {
                    const instanceId = buildInstanceId(t.id, currentSeason)
                    statuses.push({
                        tournamentId: instanceId,
                        seriesId: t.id,
                        instanceId,
                        seasonNumber: currentSeason,
                        teamId: playerTeam.id,
                        status: "QUALIFIED",
                        qualifiedVia: "Direct Invite"
                    })
                })
        }

        return statuses
    }, [playerTeam, playerRanking, tournamentQualifications, currentWeek])

    // Events announced so far this season (more appear as it goes on).
    const discovered = useMemo(() => getDiscoveredTournaments(currentWeek), [currentWeek])

    // Filter tournaments
    const filteredTournaments = useMemo(() => {
        let filtered = discovered

        // Apply tab filter
        switch (activeTab) {
            case "S_TIER":
            case "A_TIER":
            case "B_TIER":
            case "C_TIER":
                filtered = filtered.filter(t => t.tier === activeTab)
                break
            case "QUALIFIERS":
                filtered = filtered.filter(t => t.tier === "QUALIFIER")
                break
            case "MY_TOURNAMENTS":
                filtered = filtered.filter(t => {
                    if (!playerTeam) return false
                    return TournamentParticipationManager.isTeamInTournament(
                        qualificationStatuses, playerTeam.id, t.id
                    )
                })
                break
        }

        // Apply search filter
        if (searchTerm) {
            const term = searchTerm.toLowerCase()
            filtered = filtered.filter(t =>
                t.name.toLowerCase().includes(term) ||
                t.shortName.toLowerCase().includes(term) ||
                t.region.toLowerCase().includes(term)
            )
        }

        return [...filtered].sort((a, b) => a.startWeek - b.startWeek)
    }, [discovered, activeTab, searchTerm, playerTeam, qualificationStatuses])

    // Get eligibility for a tournament
    const getEligibility = (tournament: TournamentDefinition) => {
        if (!playerTeam) return null
        return QualificationEngine.checkEligibility(
            { ...tournament, id: buildInstanceId(tournament.id, getSeasonFromWeek(currentWeek)) },
            playerTeam,
            playerRanking,
            circuitPoints,
            qualificationStatuses
        )
    }

    // Counts match what the list can show (announced events).
    const counts = useMemo(() => ({
        all: discovered.length,
        s_tier: discovered.filter(t => t.tier === "S_TIER").length,
        a_tier: discovered.filter(t => t.tier === "A_TIER").length,
        b_tier: discovered.filter(t => t.tier === "B_TIER").length,
        c_tier: discovered.filter(t => t.tier === "C_TIER").length,
        qualifiers: discovered.filter(t => t.tier === "QUALIFIER").length,
        myTournaments: qualificationStatuses.filter(qs => qs.teamId === playerTeam?.id).length
    }), [discovered, playerTeam, qualificationStatuses])

    // Live instance for a calendar entry: this season's, else the next
    // upcoming one, else the latest completed (so the detail page is populated).
    const findLiveTournament = (tournament: TournamentDefinition) => {
        const currentSeason = Math.floor((currentWeek - 1) / 52) + 1
        const precise = tournaments.find(t => t.id === `${tournament.id}_s${currentSeason}`)
        if (precise) return precise
        const upcoming = tournaments.find(t => t.id.startsWith(tournament.id + "_s") && !t.isCompleted && t.startWeek >= currentWeek)
        if (upcoming) return upcoming
        return tournaments
            .filter(t => t.id.startsWith(tournament.id + "_s"))
            .sort((a, b) => b.startWeek - a.startWeek)[0]
    }

    const renderRow = (tournament: TournamentDefinition) => {
        const liveTournament = findLiveTournament(tournament)
        const displayId = liveTournament ? liveTournament.id : tournament.id

        const eligibility = getEligibility(tournament)
        const isLocked = eligibility && QualificationEngine.isTournamentLocked(tournament, eligibility)
        const isQualified = qualificationStatuses.some(
            qs => isQualificationForSeries(qs, tournament.id) && qs.teamId === playerTeam?.id && qs.status === "QUALIFIED"
        )
        const isRegistered = qualificationStatuses.some(
            qs => isQualificationForSeries(qs, tournament.id) && qs.teamId === playerTeam?.id && qs.status === "REGISTERED"
        )
        const effectiveStart = liveTournament?.startWeek ??
            (Math.floor((currentWeek - 1) / 52) * 52 + tournament.startWeek)
        const isActive = currentWeek >= effectiveStart && currentWeek < effectiveStart + tournament.duration
        const isPast = currentWeek >= effectiveStart + tournament.duration || liveTournament?.isCompleted === true
        const weeksUntil = effectiveStart - currentWeek

        // Check if on schedule (only if player's team has a match)
        const isOnSchedule = scheduledMatches.some(m =>
            (m.tournamentId || "").replace(/_s\d+$/, "") === tournament.id &&
            (m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId)
        )

        // Check if player's team was eliminated (format-specific logic)
        const isEliminated = (() => {
            if (!playerTeamId) return false
            const matchesTournament = (m: { tournamentId?: string | null }) =>
                (m.tournamentId || "").replace(/_s\d+$/, "") === tournament.id ||
                (liveTournament && m.tournamentId === liveTournament.id)
            switch (tournament.format) {
                case "bracket":
                    // Single elimination: any loss = eliminated
                    return completedMatches.some(
                        m => matchesTournament(m) &&
                            (m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId) &&
                            m.result && m.result.winnerId && m.result.winnerId !== playerTeamId
                    )
                case "swiss": {
                    const standing = liveTournament?.standings?.find((s: { teamId: string }) => s.teamId === playerTeamId)
                    return (standing?.losses ?? 0) >= 3
                }
                case "double_elim": {
                    const standing = liveTournament?.standings?.find((s: { teamId: string }) => s.teamId === playerTeamId)
                    return (standing?.losses ?? 0) >= 2
                }
                default:
                    return false
            }
        })()
        const isTournamentCompleted = liveTournament?.isCompleted === true

        const status: RowStatus =
            isActive && isEliminated ? { label: "Eliminated", tone: "bad" }
                : isActive && !isTournamentCompleted ? { label: "Live", tone: "live" }
                    : isPast || (isActive && isTournamentCompleted) ? { label: "Completed", tone: "muted" }
                        : isQualified ? { label: "Qualified", tone: "good" }
                            : isRegistered ? { label: "Registered", tone: "good" }
                                : isOnSchedule ? { label: "On your schedule", tone: "neutral" }
                                    : isLocked ? { label: tournament.entryType === "INVITE" ? "Invite only" : "Locked", tone: "muted", detail: eligibility?.reason }
                                        : { label: "Open", tone: "neutral" }

        const teamsEntered = liveTournament?.teamIds?.length || 0
        const canRegister = !!eligibility?.canRegister && !isRegistered && !isQualified && !isPast && !isEliminated
        const name = getDynamicTournamentName(tournament.name, currentWeek)

        return (
            <tr
                key={tournament.id}
                data-slot="table-row"
                className={cn("group h-14 cursor-pointer border-b border-line outline-none transition-colors focus-visible:bg-hover", isLocked && "opacity-60")}
                {...pressable(() => router.push(`/tournaments/${displayId}`), { label: `Open ${tournament.name}` })}
            >
                <td className="py-2 pl-4 pr-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-raised">
                            {tournament.logoPath
                                ? <Image src={tournament.logoPath} alt="" width={36} height={36} className="object-contain" />
                                : <Image src={trophyArtFor(trophyKindForTournament(tournament.tier)).src} alt="" width={32} height={32} className="h-8 w-8 object-contain" />}
                        </div>
                        <div className="min-w-0">
                            <p className="truncate text-[15px] font-semibold text-ink-1 group-hover:text-gold">{name}</p>
                            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3">
                                <CountryFlag country={tournament.region} size={12} />
                                <span>{REGION_LABEL[tournament.region] ?? tournament.region}</span>
                                <span aria-hidden="true">·</span>
                                <span>{FORMAT_LABEL[tournament.format] ?? tournament.format}</span>
                            </div>
                        </div>
                    </div>
                </td>
                <td className="px-3"><TierTag tier={tournament.tier} /></td>
                <td className="px-3">
                    <span className={cn("inline-flex items-center gap-1.5 text-sm font-semibold", STATUS_TONE[status.tone])}>
                        {status.tone === "live" && <span className="h-1.5 w-1.5 rounded-full bg-negative" aria-hidden="true" />}
                        {status.tone === "good" && <CheckCircle2 size={13} aria-hidden="true" />}
                        {status.label === "Locked" || status.label === "Invite only" ? <Lock size={12} aria-hidden="true" /> : null}
                        {status.label}
                    </span>
                    {status.detail && <p className="mt-0.5 max-w-[220px] truncate text-xs text-ink-3" title={status.detail}>{status.detail}</p>}
                </td>
                <td className="px-3 text-sm tabular-nums text-ink-2">
                    W{tournament.startWeek}
                    {!isPast && !isActive && <span className="block text-xs text-ink-3">{weeksUntil > 0 ? `in ${weeksUntil} wk${weeksUntil === 1 ? "" : "s"}` : "starting"}</span>}
                    {isActive && <span className="block text-xs text-ink-3">{tournament.duration} wk event</span>}
                </td>
                <td className="px-3 text-right text-sm tabular-nums text-ink-2">
                    {liveTournament && teamsEntered > 0 ? `${teamsEntered}/${tournament.slots}` : tournament.slots}
                </td>
                <td className="px-3 text-right font-display text-lg font-bold tabular-nums text-ink-1">
                    {tournament.tier === "QUALIFIER" || tournament.prizePool === 0
                        ? <span className="font-sans text-xs font-normal text-ink-3">Qualification</span>
                        : formatPrizePool(tournament.prizePool)}
                </td>
                <td className="px-3 text-xs text-ink-3">{getEntryTypeLabel(tournament.entryType)}</td>
                <td className="w-32 pr-4 text-right" onClick={e => e.stopPropagation()}>
                    {canRegister ? (
                        <Button size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={() => registerForTournament(displayId)}>
                            Register
                        </Button>
                    ) : isOnSchedule && !isPast ? (
                        <Button size="sm" variant="ghost" className="h-8 gap-1 px-2 text-xs" onClick={() => router.push("/schedule")}>
                            <Calendar size={13} aria-hidden="true" /> Schedule
                        </Button>
                    ) : (
                        <ChevronRight size={16} className="ml-auto text-ink-3 group-hover:text-ink-1" aria-hidden="true" />
                    )}
                </td>
            </tr>
        )
    }

    const tabs: { id: ViewTab; label: string; count: number }[] = [
        { id: "ALL", label: "All", count: counts.all },
        { id: "S_TIER", label: "S-tier", count: counts.s_tier },
        { id: "A_TIER", label: "A-tier", count: counts.a_tier },
        { id: "B_TIER", label: "B-tier", count: counts.b_tier },
        { id: "C_TIER", label: "C-tier", count: counts.c_tier },
        { id: "QUALIFIERS", label: "Qualifiers", count: counts.qualifiers },
        { id: "MY_TOURNAMENTS", label: "My tournaments", count: counts.myTournaments },
    ]

    const leaders = [...teams].sort((a, b) => (a.worldRanking || 9999) - (b.worldRanking || 9999)).slice(0, 10)

    return (
        <div className="mx-auto max-w-[1600px] space-y-6 pb-16">
            <ScreenHeader
                eyebrow={`Season ${getSeasonFromWeek(currentWeek)} · Competition`}
                title="Tournaments"
                subtitle={`${discovered.length} of ${FULL_TOURNAMENT_CALENDAR.length} events announced. More appear as the season goes on; open one for its bracket and standings.`}
                aside={playerTeam && (
                    <KpiStrip>
                        <Kpi label="World rank" value={`#${playerRanking}`} />
                        <Kpi label="Circuit pts" value={CircuitPointsManager.getTeamPoints(circuitPoints, playerTeam.id).toLocaleString("en-US")} />
                        <Kpi label="Qualified" value={qualificationStatuses.filter(qs => qs.teamId === playerTeam.id && qs.status === "QUALIFIED").length} />
                    </KpiStrip>
                )}
            />

            <div className="flex flex-wrap items-end justify-between gap-4">
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ViewTab)}>
                    <TabsList>
                        {tabs.map(tab => (
                            <TabsTrigger key={tab.id} value={tab.id}>
                                {tab.label} <span className="tabular-nums text-ink-3">{tab.count}</span>
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
                <div className="relative w-full max-w-[320px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" size={15} />
                    <Input
                        placeholder="Search tournaments"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="h-9 pl-9 text-sm"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                <Panel padded={false} className="self-start overflow-hidden">
                    {filteredTournaments.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table data-slot="table" className="w-full min-w-[980px] border-collapse text-left">
                                <thead data-slot="table-header">
                                    <tr className="border-b border-line">
                                        <th data-slot="table-head" className="pl-4">Event</th>
                                        <th data-slot="table-head" className="px-3">Tier</th>
                                        <th data-slot="table-head" className="px-3">Status</th>
                                        <th data-slot="table-head" className="px-3">Starts</th>
                                        <th data-slot="table-head" className="px-3 text-right">Teams</th>
                                        <th data-slot="table-head" className="px-3 text-right">Prize pool</th>
                                        <th data-slot="table-head" className="px-3">Entry</th>
                                        <th data-slot="table-head" className="pr-4"><span className="sr-only">Actions</span></th>
                                    </tr>
                                </thead>
                                <tbody>{filteredTournaments.map(renderRow)}</tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="p-8"><EmptyState icon={Trophy} title="No tournaments found" description="Try another tier or clear the search." /></div>
                    )}
                </Panel>

                <aside className="min-w-0">
                    <Panel title="World ranking" actions={<Link href="/rankings" className="text-xs font-semibold text-ink-3 hover:text-gold">Full table</Link>} padded={false}>
                        {leaders.length === 0 && (
                            <p className="px-4 py-4 text-sm text-ink-3">The top ten clubs by Elo appear here once the world&apos;s clubs are loaded.</p>
                        )}
                        <ol className="divide-y divide-line">
                            {leaders.map((team) => {
                                const isPlayer = team.id === playerTeam?.id
                                return (
                                    <li key={team.id} className={cn("flex h-10 items-center gap-3 px-4", isPlayer && "bg-gold/[0.06] shadow-[inset_2px_0_0_var(--gold)]")}>
                                        <span className="w-6 text-right text-sm font-semibold tabular-nums text-ink-3">{team.worldRanking}</span>
                                        <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-sm bg-raised">
                                            <TeamLogoDisplay team={team} size={20} />
                                        </div>
                                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-1">{team.name}</span>
                                        <span className="text-xs tabular-nums text-ink-3">{Math.round(team.elo || 1000)}</span>
                                    </li>
                                )
                            })}
                        </ol>
                    </Panel>
                </aside>
            </div>
        </div>
    )
}
