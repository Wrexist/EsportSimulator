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
import { intlLocale, t, tn } from "@/lib/i18n"
import { eventFormatName, eventRegionName } from "@/lib/display-names"
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
import { getSeasonFromWeek, buildInstanceId, isQualificationForTournament, resolveTournamentIdentity } from "@/engine/circuit-engine"
import { currentSeasonInstance, seasonStartWeek } from "@/lib/tournament-instances"
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


type RowStatus = { key: "eliminated" | "live" | "completed" | "qualified" | "registered" | "onSchedule" | "inviteOnly" | "locked" | "open"; tone: "live" | "good" | "muted" | "bad" | "neutral"; detail?: string }

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
        gameStartDate,
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
        gameStartDate: state.gameStartDate,
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

    // Rows describe this season's event: registrations, status and teams of
    // last season's instance must not carry over.
    const currentSeason = getSeasonFromWeek(currentWeek)
    const isThisSeason = (q: QualificationStatus) =>
        resolveTournamentIdentity(q.instanceId || q.tournamentId, currentWeek).seasonNumber === currentSeason

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
                        qualificationStatuses, playerTeam.id, buildInstanceId(t.id, currentSeason)
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
    }, [discovered, activeTab, searchTerm, playerTeam, qualificationStatuses, currentSeason])

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
        // This season's entries only, counted the way the tab lists them.
        myTournaments: playerTeam
            ? discovered.filter(t => TournamentParticipationManager.isTeamInTournament(qualificationStatuses, playerTeam.id, buildInstanceId(t.id, currentSeason))).length
            : 0
    }), [discovered, playerTeam, qualificationStatuses, currentSeason])

    const renderRow = (tournament: TournamentDefinition) => {
        // This season's instance only. Before it is created the row is drawn
        // from the calendar (last season's finished instance would show
        // "Completed" and open the old bracket).
        const liveTournament = currentSeasonInstance(tournaments, tournament.id, currentWeek)
        const instanceId = liveTournament?.id ?? buildInstanceId(tournament.id, currentSeason)
        const displayId = instanceId

        const eligibility = getEligibility(tournament)
        const isLocked = eligibility && QualificationEngine.isTournamentLocked(tournament, eligibility)
        const isQualified = qualificationStatuses.some(
            qs => qs.teamId === playerTeam?.id && qs.status === "QUALIFIED" && isQualificationForTournament(qs, instanceId, currentWeek)
        )
        const isRegistered = qualificationStatuses.some(
            qs => qs.teamId === playerTeam?.id && qs.status === "REGISTERED" && isQualificationForTournament(qs, instanceId, currentWeek)
        )
        const effectiveStart = liveTournament?.startWeek ?? seasonStartWeek(tournament, currentSeason)
        const isActive = currentWeek >= effectiveStart && currentWeek < effectiveStart + tournament.duration
        const isPast = currentWeek >= effectiveStart + tournament.duration || liveTournament?.isCompleted === true
        const weeksUntil = effectiveStart - currentWeek

        // Check if on schedule (only if player's team has a match)
        const isOnSchedule = scheduledMatches.some(m =>
            m.tournamentId === instanceId &&
            (m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId)
        )

        // Check if player's team was eliminated (format-specific logic)
        const isEliminated = (() => {
            if (!playerTeamId) return false
            const matchesTournament = (m: { tournamentId?: string | null }) => m.tournamentId === instanceId
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
            isActive && isEliminated ? { key: "eliminated", tone: "bad" }
                : isActive && !isTournamentCompleted ? { key: "live", tone: "live" }
                    : isPast || (isActive && isTournamentCompleted) ? { key: "completed", tone: "muted" }
                        : isQualified ? { key: "qualified", tone: "good" }
                            : isRegistered ? { key: "registered", tone: "good" }
                                : isOnSchedule ? { key: "onSchedule", tone: "neutral" }
                                    : isLocked ? { key: tournament.entryType === "INVITE" ? "inviteOnly" : "locked", tone: "muted", detail: eligibility?.reason }
                                        : { key: "open", tone: "neutral" }

        const teamsEntered = liveTournament?.teamIds?.length || 0
        const canRegister = !!eligibility?.canRegister && !isRegistered && !isQualified && !isPast && !isEliminated
        const name = getDynamicTournamentName(tournament.name, effectiveStart, gameStartDate, tournament.duration)

        return (
            <tr
                key={tournament.id}
                data-slot="table-row"
                className="group h-14 cursor-pointer border-b border-line outline-none transition-colors focus-visible:bg-hover"
                {...pressable(() => router.push(`/tournaments/${displayId}`), { label: t("tm.openEvent", { name }) })}
            >
                <td className="max-w-[280px] py-2 pl-4 pr-3">
                    <div className="flex min-w-0 items-center gap-3">
                        {/* Locked events dim only the logo and the name: the status and
                            reason text stay at full contrast (CROSSCUT-07). */}
                        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-raised", isLocked && "opacity-50")}>
                            {tournament.logoPath
                                ? <Image src={tournament.logoPath} alt="" width={36} height={36} className="object-contain" />
                                : <Image src={trophyArtFor(trophyKindForTournament(tournament.tier)).src} alt="" width={32} height={32} className="h-8 w-8 object-contain" />}
                        </div>
                        <div className="min-w-0">
                            <p className={cn("truncate text-[15px] font-semibold group-hover:text-gold", isLocked ? "text-ink-2" : "text-ink-1")}>{name}</p>
                            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3">
                                <CountryFlag country={tournament.region} size={12} />
                                <span>{eventRegionName(tournament.region)}</span>
                                <span aria-hidden="true">·</span>
                                <span>{eventFormatName(tournament.format)}</span>
                            </div>
                        </div>
                    </div>
                </td>
                <td className="px-3"><TierTag tier={tournament.tier} /></td>
                <td className="px-3">
                    <span className={cn("inline-flex items-center gap-1.5 text-sm font-semibold", STATUS_TONE[status.tone])}>
                        {status.tone === "live" && <span className="h-1.5 w-1.5 rounded-full bg-negative" aria-hidden="true" />}
                        {status.tone === "good" && <CheckCircle2 size={13} aria-hidden="true" />}
                        {status.key === "locked" || status.key === "inviteOnly" ? <Lock size={12} aria-hidden="true" /> : null}
                        {t(`tm.status.${status.key}`)}
                    </span>
                    {status.detail && <p className="mt-0.5 line-clamp-2 max-w-[200px] text-xs text-ink-3" title={status.detail}>{status.detail}</p>}
                </td>
                <td className="whitespace-nowrap px-3 text-sm tabular-nums text-ink-2">
                    {t("common.weekShort", { n: tournament.startWeek })}
                    {!isPast && !isActive && <span className="block text-xs text-ink-3">{weeksUntil > 0 ? tn("tm.inWeeks", weeksUntil) : t("tm.starting")}</span>}
                    {isActive && <span className="block text-xs text-ink-3">{tn("tm.eventLength", tournament.duration)}</span>}
                </td>
                <td className="px-3 text-right text-sm tabular-nums text-ink-2">
                    {liveTournament && teamsEntered > 0 ? `${teamsEntered}/${tournament.slots}` : tournament.slots}
                </td>
                <td className="px-3 text-right font-display text-lg font-bold tabular-nums text-ink-1">
                    {tournament.tier === "QUALIFIER" || tournament.prizePool === 0
                        ? <span className="font-sans text-xs font-normal text-ink-3">{t("tm.qualification")}</span>
                        : formatPrizePool(tournament.prizePool)}
                </td>
                <td className="px-3 text-xs text-ink-3">{getEntryTypeLabel(tournament.entryType)}</td>
                <td className="w-32 pr-4 text-right" onClick={e => e.stopPropagation()}>
                    {canRegister ? (
                        <Button size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={() => registerForTournament(displayId)}>
                            {t("tm.register")}
                        </Button>
                    ) : isOnSchedule && !isPast ? (
                        <Button size="sm" variant="ghost" className="h-8 gap-1 px-2 text-xs" onClick={() => router.push("/schedule")}>
                            <Calendar size={13} aria-hidden="true" /> {t("tm.schedule")}
                        </Button>
                    ) : (
                        <ChevronRight size={16} className="ml-auto text-ink-3 group-hover:text-ink-1" aria-hidden="true" />
                    )}
                </td>
            </tr>
        )
    }

    const tabs: { id: ViewTab; label: string; count: number }[] = [
        { id: "ALL", label: t("tm.tab.all"), count: counts.all },
        { id: "S_TIER", label: t("common.tier.S_TIER"), count: counts.s_tier },
        { id: "A_TIER", label: t("common.tier.A_TIER"), count: counts.a_tier },
        { id: "B_TIER", label: t("common.tier.B_TIER"), count: counts.b_tier },
        { id: "C_TIER", label: t("common.tier.C_TIER"), count: counts.c_tier },
        { id: "QUALIFIERS", label: t("tm.tab.qualifiers"), count: counts.qualifiers },
        { id: "MY_TOURNAMENTS", label: t("tm.tab.mine"), count: counts.myTournaments },
    ]

    const leaders = [...teams].sort((a, b) => (a.worldRanking || 9999) - (b.worldRanking || 9999)).slice(0, 10)

    return (
        <div className="mx-auto max-w-[1600px] space-y-6 pb-16">
            <ScreenHeader
                eyebrow={t("rk.eyebrow", { n: getSeasonFromWeek(currentWeek) })}
                title={t("tm.title")}
                subtitle={t("tm.subtitle", { n: discovered.length, total: FULL_TOURNAMENT_CALENDAR.length })}
                aside={playerTeam && (
                    <KpiStrip>
                        <Kpi label={t("rk.kpi.world")} value={`#${playerRanking}`} />
                        <Kpi label={t("tm.kpi.circuit")} value={CircuitPointsManager.getTeamPoints(circuitPoints, playerTeam.id).toLocaleString(intlLocale())} />
                        <Kpi label={t("tm.kpi.qualified")} value={qualificationStatuses.filter(qs => qs.teamId === playerTeam.id && qs.status === "QUALIFIED" && isThisSeason(qs)).length} />
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
                        placeholder={t("tm.search")}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="h-9 pl-9 text-sm"
                    />
                </div>
            </div>

            {/* The table needs ~1000px: below 1440px the world-rank panel goes under it. */}
            <div className="grid grid-cols-1 gap-4 min-[1440px]:grid-cols-[minmax(0,1fr)_340px]">
                <Panel padded={false} className="self-start overflow-hidden">
                    {filteredTournaments.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table data-slot="table" className="w-full min-w-[980px] border-collapse text-left">
                                <thead data-slot="table-header">
                                    <tr className="border-b border-line">
                                        <th data-slot="table-head" className="pl-4">{t("tm.col.event")}</th>
                                        <th data-slot="table-head" className="px-3">{t("rk.col.tier")}</th>
                                        <th data-slot="table-head" className="px-3">{t("tm.col.status")}</th>
                                        <th data-slot="table-head" className="px-3">{t("tm.col.starts")}</th>
                                        <th data-slot="table-head" className="px-3 text-right">{t("tm.col.teams")}</th>
                                        <th data-slot="table-head" className="px-3 text-right">{t("tm.col.prizePool")}</th>
                                        <th data-slot="table-head" className="px-3">{t("tm.col.entry")}</th>
                                        <th data-slot="table-head" className="pr-4"><span className="sr-only">{t("sp.col.actions")}</span></th>
                                    </tr>
                                </thead>
                                <tbody>{filteredTournaments.map(renderRow)}</tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="p-8"><EmptyState icon={Trophy} title={t("tm.noneFound")} description={t("tm.noneFoundBody")} /></div>
                    )}
                </Panel>

                <aside className="min-w-0">
                    <Panel title={t("rk.kpi.world")} actions={<Link href="/rankings" className="text-xs font-semibold text-ink-3 hover:text-gold">{t("tm.fullTable")}</Link>} padded={false}>
                        {leaders.length === 0 && (
                            <p className="px-4 py-4 text-sm text-ink-3">{t("tm.leadersEmpty")}</p>
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
