"use client"
import { eventFormatName, eventRegionName, stageName } from "@/lib/display-names"
import { Trans } from "@/lib/trans"
import { ordinalLabel, t, tn } from "@/lib/i18n"

import React, { useState, useMemo, useEffect, type ReactNode } from "react"
import { ErrorBoundary } from "@/components/ui/error-boundary"
import { useParams, useRouter } from "next/navigation"
import Image from "next/image"
import { trophyArtFor, trophyKindForTournament } from "@/lib/trophy-art"
import { useGameStore } from "@/store/game-store"
import { teamOvrMap } from "@/lib/team-ovr"
import { useShallow } from "zustand/react/shallow"
import type { TournamentDefinition } from "@/data/tournament-calendar"
import type { TournamentSaveData } from "@/engine/save-types"

/** Merged type for display: definition fields + runtime save fields */
type DisplayTournament = TournamentDefinition & {
    teamIds?: string[]
    currentStage?: string
    standings?: TournamentSaveData['standings']
    playoffBracket?: TournamentSaveData['playoffBracket']
    groups?: TournamentSaveData['groups']
    isCompleted?: boolean
    winnerId?: string
    endWeek?: number
    mvpPlayerId?: string
    mvpRating?: number
    rewardsGranted?: boolean
    seriesId?: string
    instanceId?: string
    seasonNumber?: number
}
import { FULL_TOURNAMENT_CALENDAR, getQualifiersFor, getTournamentById, getEntryTypeLabel } from "@/data/tournament-calendar"
import { QualificationEngine } from "@/engine/tournament-qualification"
import { TournamentManager } from "@/engine/tournament-manager"
import { buildInstanceId, getSeasonFromTournamentId, getSeasonFromWeek, isQualificationForTournament } from "@/engine/circuit-engine"
import { instanceSeason, instancesOfSeries, seasonStartWeek } from "@/lib/tournament-instances"
import {
    Trophy,
    Calendar,
    ArrowLeft,
    ChevronRight,
    Layers,
    LayoutGrid,
    History,
    CheckCircle2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { getDynamicTournamentName, formatCurrency } from "@/lib/utils-extended"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { TeamLogoImage } from "@/components/ui/asset-images"
import { pressable } from "@/lib/accessibility"
import { Panel } from "@/src/components/ui/Panel"
import { Kpi } from "@/src/components/ui/Kpi"
import { TierTag } from "@/src/components/ui/TierTag"
import TournamentBracket from "@/components/tournament/TournamentBracket"
import TournamentStats from "@/components/tournament/TournamentStats"
import { TeamLink } from "@/components/ui/EntityLink"

// Prize split by placement — mirrors PRIZE_DISTRIBUTION_8 / _16 in
// engine/processors/standings-processor.ts (deep fields use the 16-place
// table). The old screen always showed the top-8 split and a "club share"
// the engine never pays.
const PRIZE_SPLIT_8: Record<number, number> = { 1: 0.40, 2: 0.20, 3: 0.10, 4: 0.10, 5: 0.05, 6: 0.05, 7: 0.05, 8: 0.05 }
const PRIZE_SPLIT_16: Record<number, number> = {
    1: 0.36, 2: 0.18, 3: 0.09, 4: 0.09, 5: 0.04, 6: 0.04, 7: 0.04, 8: 0.04,
    9: 0.02, 10: 0.02, 11: 0.02, 12: 0.02, 13: 0.01, 14: 0.01, 15: 0.01, 16: 0.01,
}
const prizeSplitFor = (slots: number | undefined) => ((slots ?? 0) > 8 ? PRIZE_SPLIT_16 : PRIZE_SPLIT_8)
/** Collapse equal consecutive shares into rows like "5th–8th · 4% each". */
function splitRows(split: Record<number, number>): { label: string; pct: number; count: number }[] {
    const places = Object.keys(split).map(Number).sort((a, b) => a - b)
    const rows: { from: number; to: number; pct: number }[] = []
    for (const place of places) {
        const last = rows[rows.length - 1]
        if (last && last.pct === split[place] && place > 2) last.to = place
        else rows.push({ from: place, to: place, pct: split[place] })
    }
    return rows.map(r => ({ label: r.from === r.to ? ordinalLabel(r.from) : `${ordinalLabel(r.from)}–${ordinalLabel(r.to)}`, pct: r.pct, count: r.to - r.from + 1 }))
}

// Format display helper
// Pure helpers hoisted to module scope so they don't get a new identity on
// every render and accidentally bust downstream useMemo deps.
// Matches belong to one season's instance (`iem_katowice_s2`), never to the
// whole series: other seasons have their own results.
const isMatchForTournament = (matchTournamentId: string | null | undefined, tournamentId: string) =>
    !!matchTournamentId && matchTournamentId === tournamentId
const ENTERED_STATUSES = new Set(["QUALIFIED", "REGISTERED", "INVITED"])

const formatDisplayName = (format: string): string => eventFormatName(format, true)

type TimelineNodeStatus = "UPCOMING" | "LIVE" | "COMPLETED"
type TimelineNodeRole = "OPEN_QUALIFIER" | "CLOSED_QUALIFIER" | "MAIN_EVENT"

interface PathTimelineNode {
    tournament: TournamentDefinition
    status: TimelineNodeStatus
    role: TimelineNodeRole
    isCurrent: boolean
    incomingQualifierCount: number
    playerStatus: string | null
}

const getTimelineNodeStatus = (tournament: TournamentDefinition, currentWeek: number, season: number): TimelineNodeStatus => {
    const startWeek = seasonStartWeek({ startWeek: tournament.startWeek || 1 }, season)
    const endWeek = startWeek + Math.max(1, tournament.duration || 1) - 1
    if (currentWeek < startWeek) return "UPCOMING"
    if (currentWeek > endWeek) return "COMPLETED"
    return "LIVE"
}

const getTimelineNodeRole = (tournament: TournamentDefinition): TimelineNodeRole => {
    if (!tournament.qualifierFor) return "MAIN_EVENT"
    if ((tournament.entryType || "").toUpperCase() === "OPEN") return "OPEN_QUALIFIER"
    return "CLOSED_QUALIFIER"
}

/** QUALIFIED, REGISTERED, … as a word. */
const qualStatusLabel = (status: string): string => {
    const key = `tm.qual.${status}`
    const label = t(key)
    return label === key ? status.toLowerCase() : label
}

const getTimelineRoleLabel = (role: TimelineNodeRole): string => {
    return t(`tm.role.${role}`)
}

// Helper to map match data to bracket format
function mapToBracketMatch(m: any, teams: any[], completedMatches: any[], ovrs?: Map<string, number>): any {
    // Improve data resolution: Check if match is actually completed/scheduled elsewhere
    const completedMatch = completedMatches.find(cm => cm.id === m.id)
    const activeMatch = m.result ? m : (completedMatch || m)

    const team1 = teams.find(t => t.id === activeMatch.homeTeamId)
    const team2 = teams.find(t => t.id === activeMatch.awayTeamId)

    // Helper to get form
    const getForm = (teamId: string) => {
        if (!teamId) return []
        return completedMatches
            .filter(match => match.homeTeamId === teamId || match.awayTeamId === teamId)
            .sort((a, b) => b.week - a.week) // Newest first
            .slice(0, 5)
            .reverse() // Oldest to newest
            .map(match => {
                const isHome = match.homeTeamId === teamId
                const isWin = isHome ? match.result.homeScore > match.result.awayScore : match.result.awayScore > match.result.homeScore
                return isWin ? "W" : "L"
            })
    }

    return {
        id: activeMatch.id,
        round: activeMatch.stage || "Tournament Match",
        status: activeMatch.isCompleted || activeMatch.result ? "completed" : "scheduled",
        team1: team1 ? {
            id: team1.id,
            name: team1.name,
            score: activeMatch.result?.homeScore,
            isWinner: (activeMatch.isCompleted || activeMatch.result) && activeMatch.result && activeMatch.result.homeScore > activeMatch.result.awayScore,
            logo: team1.logoPath,
            recentForm: getForm(team1.id),
            branding: team1.branding,
            rank: team1.worldRanking,
            ovr: ovrs?.get(team1.id),
        } : undefined,
        team2: team2 ? {
            id: team2.id,
            name: team2.name,
            score: activeMatch.result?.awayScore,
            isWinner: (activeMatch.isCompleted || activeMatch.result) && activeMatch.result && activeMatch.result.awayScore > activeMatch.result.homeScore,
            logo: team2.logoPath,
            recentForm: getForm(team2.id),
            branding: team2.branding,
            rank: team2.worldRanking,
            ovr: ovrs?.get(team2.id),
        } : undefined
    }
}

export default function TournamentDetailPage() {
    const { id } = useParams()
    const router = useRouter()
    const { tournaments, teams, players, currentWeek, scheduledMatches, completedMatches, playerTeamId, tournamentQualifications, circuitPoints, registerForTournament } = useGameStore(useShallow(state => ({
        tournaments: state.tournaments,
        teams: state.teams,
        players: state.players,
        currentWeek: state.currentWeek,
        scheduledMatches: state.scheduledMatches,
        completedMatches: state.completedMatches,
        playerTeamId: state.playerTeamId,
        tournamentQualifications: state.tournamentQualifications,
        circuitPoints: state.circuitPoints,
        registerForTournament: state.registerForTournament,
    })))

    const gameStartDate = useGameStore(state => state.gameStartDate)
    const rawId = (Array.isArray(id) ? id[0] : id) || ""

    const [activeTab, setActiveTab] = useState<"overview" | "groups" | "playoffs" | "schedule" | "history" | "stats">("overview")
    const [selectedSeason, setSelectedSeason] = useState<string | null>(null)

    // Resolve the calendar definition. Only a trailing season suffix is
    // stripped (`major_shanghai_s1` → `major_shanghai`,
    // `esea_premier_s48_s2` → `esea_premier_s48`).
    const definition = useMemo(() => getTournamentById(rawId), [rawId])
    // Season named in the URL (none for a bare calendar id).
    const urlSeason = definition && rawId !== definition.id ? getSeasonFromTournamentId(rawId) : null
    const currentSeason = getSeasonFromWeek(currentWeek)

    // Saved instances of this series only (not its qualifiers), latest first.
    const seasonalInstances = useMemo(
        () => (definition ? instancesOfSeries(tournaments, definition.id) : []),
        [tournaments, definition],
    )

    // A new URL starts from its own season again.
    useEffect(() => { setSelectedSeason(null) }, [rawId])

    // Compute display tournament purely (no side effects)
    const displayTournament = useMemo((): DisplayTournament | undefined => {
        if (!definition) return undefined
        // A season that hasn't been created yet: the calendar entry, dated
        // in that season, so status and registration refer to that event.
        const upcoming = (season: number): DisplayTournament => ({
            ...definition,
            id: buildInstanceId(definition.id, season),
            instanceId: buildInstanceId(definition.id, season),
            seriesId: definition.id,
            seasonNumber: season,
            startWeek: seasonStartWeek(definition, season),
        })
        // A season picked with the season buttons
        if (selectedSeason) {
            const found = seasonalInstances.find(t => t.id === selectedSeason)
            if (found) return { ...definition, ...found } as DisplayTournament
        }
        // The exact instance in the URL
        const exactMatch = seasonalInstances.find(t => t.id === rawId)
        if (exactMatch) return { ...definition, ...exactMatch } as DisplayTournament
        // A season in the URL whose event hasn't been created yet
        if (urlSeason !== null) return upcoming(urlSeason)
        // Bare calendar id: this season's event, else the latest one played
        const thisSeason = seasonalInstances.find(t => instanceSeason(t) === currentSeason)
        if (thisSeason) return { ...definition, ...thisSeason } as DisplayTournament
        if (seasonalInstances.length === 0 || seasonStartWeek(definition, currentSeason) >= currentWeek) return upcoming(currentSeason)
        return { ...definition, ...seasonalInstances[0] } as DisplayTournament
    }, [seasonalInstances, definition, rawId, urlSeason, currentSeason, currentWeek, selectedSeason])
    const displaySeason = displayTournament ? instanceSeason(displayTournament) : currentSeason
    // The saved instance on screen (undefined before the event is created).
    const tournament = useMemo(
        () => seasonalInstances.find(t => t.id === displayTournament?.id),
        [seasonalInstances, displayTournament?.id],
    )

    const playerTeam = useMemo(() => teams.find(t => t.id === playerTeamId), [teams, playerTeamId])
    // Index teams by id once — was being scanned 8+ times per render across the
    // podium / playoff / standings sections.
    const teamsById = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams])
    // isMatchForTournament is
    // hoisted at module scope (top of file) — pure helpers, no closure
    // capture needed, and stable refs across renders so they don't bust
    // the useMemo deps below.

    // Pre-filter `completedMatches` down to just this tournament's matches.
    // The page renders standings/bracket blocks that scan completedMatches
    // multiple times per render (3 league-standings IIFEs plus the semi/
    // quarter-final find/filter chain). On long careers completedMatches
    // reaches 1500+; doing the `isMatchForTournament` check inside each
    // per-team .map() iteration was costing ~24k ops per render for the
    // league podium alone. Cached here — downstream code filters this
    // smaller list (~100 matches per tournament) by team.
    const tournamentMatches = useMemo(() => {
        if (!displayTournament?.id) return [] as typeof completedMatches
        return completedMatches.filter(m => isMatchForTournament(m.tournamentId, displayTournament.id))
        // isMatchForTournament is a pure helper above; not a dep.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [completedMatches, displayTournament?.id])
    const playerRanking = playerTeam?.worldRanking || 999 // Fallback
    const eligibility = definition && playerTeam ? QualificationEngine.checkEligibility(
        { ...definition, id: displayTournament?.id || definition.id },
        playerTeam,
        playerRanking,
        circuitPoints as any,
        tournamentQualifications
    ) : null

    const pathToEvent = useMemo<PathTimelineNode[]>(() => {
        if (!definition) return []

        const getById = (targetId: string) =>
            FULL_TOURNAMENT_CALENDAR.find(t => t.id === targetId)

        const upstream: TournamentDefinition[] = []
        const seenUpstream = new Set<string>()
        let targetId = definition.id

        while (true) {
            const incoming = getQualifiersFor(targetId).sort((a, b) => a.startWeek - b.startWeek)
            if (incoming.length === 0) break

            const preferred = incoming.find(t => t.entryType === "OPEN") || incoming[0]
            if (seenUpstream.has(preferred.id)) break

            upstream.unshift(preferred)
            seenUpstream.add(preferred.id)
            targetId = preferred.id
        }

        const downstream: TournamentDefinition[] = []
        const seenDownstream = new Set<string>([definition.id])
        let cursor: TournamentDefinition | undefined = definition

        while (cursor?.qualifierFor) {
            const next = getById(cursor.qualifierFor)
            if (!next || seenDownstream.has(next.id)) break

            downstream.push(next)
            seenDownstream.add(next.id)
            cursor = next
        }

        const orderedPath: TournamentDefinition[] = []
        const seenIds = new Set<string>()
        for (const entry of [...upstream, definition, ...downstream]) {
            if (seenIds.has(entry.id)) continue
            seenIds.add(entry.id)
            orderedPath.push(entry)
        }

        if (orderedPath.length <= 1) return []

        const currentIndex = orderedPath.findIndex(entry => entry.id === definition.id)

        return orderedPath.map((entry, index) => {
            const playerRow = playerTeamId
                ? [...tournamentQualifications]
                    .reverse()
                    .find(q => q.teamId === playerTeamId && isQualificationForTournament(q, buildInstanceId(entry.id, displaySeason), currentWeek))
                : undefined

            return {
                tournament: entry,
                status: getTimelineNodeStatus(entry, currentWeek, displaySeason),
                role: getTimelineNodeRole(entry),
                isCurrent: index === currentIndex,
                incomingQualifierCount: getQualifiersFor(entry.id).length,
                playerStatus: playerRow?.status || null,
            }
        })
    }, [currentWeek, definition, displaySeason, playerTeamId, tournamentQualifications])

    if (!displayTournament) {
        return (
            <div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
                <h1 className="font-display text-3xl font-bold uppercase text-ink-1">{t("tm.notFound")}</h1>
                <Button onClick={() => router.push("/tournaments")} variant="outline" className="mt-5 gap-2">
                    <ArrowLeft className="h-4 w-4" /> {t("tm.back")}
                </Button>
            </div>
        )
    }

    // Registrations for this season's instance (not last season's, not the
    // qualifiers'). One row per team.
    const enteredTeamIds = [...new Set(tournamentQualifications
        .filter(q => ENTERED_STATUSES.has(q.status) && isQualificationForTournament(q, displayTournament.id, currentWeek))
        .map(q => q.teamId))]
    const isRegistered = !!playerTeamId && tournamentQualifications.some(q =>
        q.teamId === playerTeamId && isQualificationForTournament(q, displayTournament.id, currentWeek)
    )

    // Check start based on the specific displayTournament
    const isStarted = currentWeek >= (displayTournament.startWeek || 0)
    const isCompleted = displayTournament.isCompleted

    const startWeek = displayTournament.startWeek || 0
    const duration = (displayTournament.duration ?? 1) || 1
    // Leagues run past the calendar's nominal duration: end at the last
    // scheduled or played match when that is later.
    const lastMatchWeek = [...scheduledMatches, ...tournamentMatches]
        .filter(m => isMatchForTournament(m.tournamentId, displayTournament.id))
        .reduce((max, m) => Math.max(max, m.week || 0), 0)
    const endWeek = Math.max(startWeek + duration - 1, displayTournament.endWeek ?? 0, lastMatchWeek)
    const weeksUntil = startWeek - currentWeek
    const isQualifierEvent = displayTournament.tier === "QUALIFIER" || displayTournament.name?.toLowerCase().includes("qualifier")
    const qualifierDest = displayTournament.qualifierFor ? getTournamentById(displayTournament.qualifierFor) : null
    const prizePool = displayTournament.prizePool || 0
    const split = prizeSplitFor(displayTournament.slots)

    // Check if player was eliminated from this bracket tournament
    const isPlayerEliminated = !!playerTeamId && definition?.format === "bracket" && completedMatches.some(
        (m: any) => (isMatchForTournament(m.tournamentId, definition.id) || isMatchForTournament(m.tournamentId, displayTournament.id || "")) &&
            (m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId) &&
            m.result && m.result.winnerId && m.result.winnerId !== playerTeamId
    )
    const status: { label: string; tone: string; live?: boolean } = currentWeek < startWeek
        ? { label: tn("tm.startsIn", weeksUntil), tone: "text-ink-2" }
        : isPlayerEliminated && currentWeek <= endWeek
            ? { label: t("tm.status.eliminated"), tone: "text-negative" }
            : currentWeek <= endWeek && !displayTournament.isCompleted
                ? { label: t("tm.status.live"), tone: "text-negative", live: true }
                : { label: t("tm.status.completed"), tone: "text-ink-3" }

    const registeredCount = enteredTeamIds.length
    const participantCount = isStarted ? (displayTournament.teamIds?.length || 0) : registeredCount
    const progress = Math.max(0, Math.min(100, ((currentWeek - startWeek) / Math.max(1, endWeek - startWeek)) * 100))

    // Tabs depend on the format.
    const format = displayTournament.format
    const tabs: { id: typeof activeTab; label: string }[] = [{ id: "overview", label: t("tm.tab.overview") }]
    // Only formats that have a stage before the bracket get the tab: the
    // Swiss stage of Majors/RMRs, and GSL groups when the event has them.
    if (format !== "league" && (format === "swiss" || (displayTournament.groups?.length ?? 0) > 0)) tabs.push({ id: "groups", label: format === "swiss" ? t("tm.swissStage") : t("stage.groupStage") })
    if (format !== "league") tabs.push({ id: "playoffs", label: t("tm.tab.bracket") })
    if (format === "league") tabs.push({ id: "groups", label: t("tm.tab.standings") })
    tabs.push({ id: "schedule", label: format === "league" ? t("tm.schedule") : t("tm.tab.allMatches") })
    tabs.push({ id: "history", label: t("tm.tab.yours") })
    tabs.push({ id: "stats", label: t("sx.title") })

    const overline = "text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3"
    const emptyBlock = (Icon: any, title: string, text: ReactNode, action?: ReactNode) => (
        <Panel>
            <div className="flex flex-col items-center justify-center py-12 text-center">
                <Icon className="mb-3 h-8 w-8 text-ink-3" aria-hidden="true" />
                <h3 className="text-base font-semibold text-ink-1">{title}</h3>
                <p className="mt-1 max-w-md text-sm text-ink-3">{text}</p>
                {action}
            </div>
        </Panel>
    )

    const prizeSplitPanel = (
                    <Panel title={isQualifierEvent ? t("tm.qualification") : t("tm.prizeSplit")} padded={false} actions={!isQualifierEvent ? <span className="text-xs text-ink-3">{t("tm.total", { amount: formatCurrency(prizePool, "$", false) })}</span> : undefined}>
                        {isQualifierEvent ? (
                            <p className="px-4 py-3 text-sm text-ink-2"><Trans k="tm.advance" params={{ n: displayTournament.qualifierSlots || 1, event: qualifierDest?.name ?? t("tm.nextStage") }} tags={{ b: x => <span className="font-semibold tabular-nums text-ink-1">{x}</span> }} /></p>
                        ) : (
                            <table data-slot="table" className="w-full border-collapse text-left">
                                <tbody>
                                    {splitRows(split).map(row => (
                                        <tr key={row.label} className="h-9 border-b border-line last:border-b-0">
                                            <td className="pl-4 text-sm text-ink-2">{row.label}</td>
                                            <td className="text-right text-xs tabular-nums text-ink-3">{row.count > 1 ? t("tm.pctEach", { pct: Math.round(row.pct * 100) }) : `${Math.round(row.pct * 100)}%`}</td>
                                            <td className="pr-4 text-right font-display text-lg font-bold tabular-nums text-ink-1">{formatCurrency(Math.round(prizePool * row.pct), "$", false)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </Panel>
    )

    return (
        <ErrorBoundary section="Tournament">
            <div className="mx-auto max-w-[1600px] space-y-5 pb-16">
                <div className="flex items-center justify-between">
                    <button onClick={() => router.push("/tournaments")} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-3 transition-colors hover:text-ink-1">
                        <ArrowLeft size={15} aria-hidden="true" /> {t("tm.title")}
                    </button>
                    {seasonalInstances.length > 1 && (
                        <div className="flex items-center gap-1.5" role="group" aria-label={t("md.season")}>
                            <span className={overline}>{t("md.season")}</span>
                            {seasonalInstances.map(inst => {
                                const seasonNum = instanceSeason(inst)
                                const active = displayTournament.id === inst.id
                                return (
                                    <button
                                        key={inst.id}
                                        onClick={() => setSelectedSeason(inst.id)}
                                        aria-pressed={active}
                                        className={cn("h-7 min-w-7 rounded-[3px] border px-1.5 text-xs font-semibold tabular-nums transition-colors", active ? "border-gold text-ink-1" : "border-line text-ink-3 hover:text-ink-1")}
                                    >
                                        {seasonNum}
                                    </button>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* Header */}
                <section className="rounded-[10px] border border-line bg-panel">
                    <div className="flex flex-wrap items-center gap-6 px-6 py-5">
                        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-line bg-raised">
                            {definition?.logoPath
                                ? <Image src={definition.logoPath} alt="" width={64} height={64} className="object-contain" />
                                : <Image src={trophyArtFor(trophyKindForTournament(displayTournament.tier)).src} alt="" width={64} height={64} className="h-16 w-16 object-contain" />}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
                                <TierTag tier={displayTournament.tier} />
                                <span className="flex items-center gap-1.5"><CountryFlag country={displayTournament.region} size={12} />{eventRegionName(displayTournament.region)}</span>
                                <span aria-hidden="true">·</span>
                                <span className="flex items-center gap-1"><Calendar size={12} aria-hidden="true" />{t("tm.weekRange", { from: startWeek, to: endWeek })}</span>
                                <span aria-hidden="true">·</span>
                                <span className={cn("flex items-center gap-1.5 font-semibold", status.tone)}>
                                    {status.live && <span className="h-1.5 w-1.5 rounded-full bg-negative" aria-hidden="true" />}
                                    {status.label}
                                </span>
                            </div>
                            <h1 className="page-title mt-1 truncate">{getDynamicTournamentName(displayTournament.name, startWeek, gameStartDate, duration)}</h1>
                        </div>
                        {!isStarted && (
                            isRegistered ? (
                                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-positive"><CheckCircle2 size={16} aria-hidden="true" /> {t("tm.status.registered")}</span>
                            ) : eligibility?.canRegister ? (
                                <Button onClick={() => registerForTournament(displayTournament?.id || definition?.id || (id as string))} className="h-11 px-6 text-base">
                                    {t("tm.registerTeam")}
                                </Button>
                            ) : null
                        )}
                    </div>
                    <div className="grid grid-cols-2 divide-x divide-line border-t border-line md:grid-cols-4">
                        <Kpi className="px-6 py-3" label={isQualifierEvent ? t("tm.reward") : t("tm.col.prizePool")} value={isQualifierEvent ? t("tm.spot", { event: qualifierDest?.shortName ?? t("tm.nextStageShort") }) : formatCurrency(prizePool, "$", false)} />
                        <Kpi className="px-6 py-3" label={isStarted ? t("tm.col.teams") : t("tm.registeredCount")} value={<>{participantCount}<span className="text-ink-3"> / {displayTournament.slots}</span></>} />
                        <Kpi className="px-6 py-3" label={t("tm.stage")} value={displayTournament.currentStage ? stageName(displayTournament.currentStage) : (isStarted ? t("tm.inProgress") : t("tm.notStarted"))} valueClassName="text-[22px]" />
                        <Kpi className="px-6 py-3" label={t("tm.format")} value={formatDisplayName(displayTournament.format)} valueClassName="text-[22px]" />
                    </div>
                    {currentWeek >= startWeek && (
                        <div className="flex items-center gap-3 border-t border-line px-6 py-2.5 text-xs tabular-nums text-ink-3">
                            <span>{t("common.week", { n: startWeek })}</span>
                            <div className="h-1 flex-1 overflow-hidden rounded-full bg-hover">
                                <div className="h-full rounded-full bg-ink-2" style={{ width: `${progress}%` }} />
                            </div>
                            <span>{t("tm.weekOf", { n: Math.min(currentWeek, endWeek), total: endWeek })}</span>
                        </div>
                    )}
                </section>

                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
                    <TabsList>
                        {tabs.map(tab => <TabsTrigger key={tab.id + tab.label} value={tab.id}>{tab.label}</TabsTrigger>)}
                    </TabsList>
                </Tabs>

                {activeTab === "overview" && (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
                        <div className="min-w-0 space-y-4">
                            <Panel title={t("tm.about")}>
                                <p className="max-w-3xl text-sm leading-relaxed text-ink-2">{displayTournament.description || t("tm.noDescription")}</p>
                                <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
                                    <div><dt className={overline}>{t("tm.col.entry")}</dt><dd className="mt-0.5 text-ink-1">{getEntryTypeLabel(displayTournament.entryType)}</dd></div>
                                    <div><dt className={overline}>{t("tm.region")}</dt><dd className="mt-0.5 text-ink-1">{eventRegionName(displayTournament.region)}</dd></div>
                                    <div><dt className={overline}>{t("tm.col.status")}</dt><dd className="mt-0.5 text-ink-1">{isCompleted ? t("tm.status.completed") : isStarted ? t("tm.inProgress") : (isRegistered || eligibility?.canRegister) ? t("tm.registrationOpen") : displayTournament.entryType === "INVITE" ? t("tm.status.inviteOnly") : t("tm.status.locked")}</dd></div>
                                    <div><dt className={overline}>{t("tm.format")}</dt><dd className="mt-0.5 text-ink-1">{formatDisplayName(displayTournament.format)}</dd></div>
                                </dl>
                            </Panel>

                            {pathToEvent.length > 0 && (
                                <Panel title={t("tm.path")}>
                                    <ol className="flex items-stretch gap-2 overflow-x-auto pb-1">
                                        {pathToEvent.map((node, index) => {
                                            const weekStart = node.tournament.startWeek
                                            const weekEnd = weekStart + Math.max(1, node.tournament.duration || 1) - 1
                                            return (
                                                <React.Fragment key={node.tournament.id}>
                                                    <li className={cn("min-w-[200px] rounded-[4px] border p-3", node.isCurrent ? "border-gold bg-gold/[0.04]" : "border-line bg-raised")}>
                                                        <p className={overline}>{getTimelineRoleLabel(node.role)}{node.isCurrent ? ` · ${t("tm.thisEvent")}` : ""}</p>
                                                        <p className="mt-1 text-sm font-semibold text-ink-1">{node.tournament.shortName}</p>
                                                        <p className="mt-0.5 text-xs tabular-nums text-ink-3">{weekStart === weekEnd ? t("common.week", { n: weekStart }) : t("tm.weekRange", { from: weekStart, to: weekEnd })} · <span className={node.status === "LIVE" ? "text-negative" : undefined}>{t(`tm.node.${node.status}`)}</span></p>
                                                        {node.incomingQualifierCount > 1 && <p className="mt-0.5 text-xs text-ink-3">{tn("tm.feeders", node.incomingQualifierCount)}</p>}
                                                        {node.playerStatus && <p className="mt-1 text-xs font-semibold text-positive">{t("tm.you", { status: qualStatusLabel(node.playerStatus) })}</p>}
                                                    </li>
                                                    {index < pathToEvent.length - 1 && <ChevronRight className="h-4 w-4 shrink-0 self-center text-ink-3" aria-hidden="true" />}
                                                </React.Fragment>
                                            )
                                        })}
                                    </ol>
                                </Panel>
                            )}

                            {/* Final standings (completed) */}
                            {isCompleted && (() => {
                                // Places as the engine paid them (prize ledger, circuit
                                // points): every paid place, not just the top 8.
                                // Teams knocked out in the same round share a place
                                // ("5–8"); the prize column still shows what each was paid.
                                const standings: { team: any, place: number, tiedFrom?: number, tiedThrough?: number }[] = []
                                if (displayTournament?.format !== "league") {
                                    const placements = tournament ? TournamentManager.calculatePlacements({ teams } as any, tournament) : []
                                    placements.forEach(p => {
                                        const team = teamsById.get(p.teamId)
                                        if (team) standings.push({ team, place: p.position, tiedFrom: p.tiedFrom, tiedThrough: p.tiedThrough })
                                    })
                                } else {
                                    // League: the engine-sorted standings (points → wins → H2H → diff).
                                    const engineStandings = displayTournament?.standings as { teamId: string }[] | undefined
                                    const ordered = (engineStandings && engineStandings.length > 0)
                                        ? engineStandings.map(s => teamsById.get(s.teamId))
                                        : (displayTournament?.teamIds?.map((tid: string) => teamsById.get(tid)) ?? [])
                                    ordered.forEach((team: any, idx: number) => { if (team) standings.push({ team, place: idx + 1 }) })
                                }
                                standings.sort((a, b) => a.place - b.place)
                                const qSlots = displayTournament?.qualifierSlots || 0
                                return (
                                    <Panel title={t("tm.finalStandings")} padded={false} actions={<span className="text-xs text-ink-3">{isQualifierEvent ? tn("tm.topQualify", qSlots || 1) : t("tm.prizeByPlace")}</span>}>
                                        <table data-slot="table" className="w-full border-collapse text-left">
                                            <thead data-slot="table-header">
                                                <tr className="border-b border-line">
                                                    <th data-slot="table-head" className="w-14 pl-4">#</th>
                                                    <th data-slot="table-head">{t("rk.col.team")}</th>
                                                    <th data-slot="table-head" className="pr-4 text-right">{isQualifierEvent ? t("tm.outcome") : t("tm.prize")}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {standings.map(s => {
                                                    const prize = Math.round(prizePool * (split[s.place] ?? 0))
                                                    const own = s.team.id === playerTeamId
                                                    return (
                                                        <tr key={s.team.id} data-slot="table-row" className={cn("h-11 border-b border-line last:border-b-0", own && "bg-gold/[0.05] shadow-[inset_2px_0_0_var(--gold)]")}>
                                                            <td className="pl-4 font-display text-lg font-bold tabular-nums text-ink-2">{s.place === 1 ? <Trophy size={16} className="text-gold" aria-label={t("tm.champion")} /> : s.tiedFrom && s.tiedThrough && s.tiedThrough > s.tiedFrom ? <span className="text-base">{s.tiedFrom}–{s.tiedThrough}</span> : s.place}</td>
                                                            <td>
                                                                <span className="flex items-center gap-2.5">
                                                                    <TeamLogoImage src={s.team.logoPath} alt="" size={22} />
                                                                    <TeamLink id={s.team.id} className="text-sm font-semibold text-ink-1">{s.team.name}</TeamLink>
                                                                </span>
                                                            </td>
                                                            <td className="pr-4 text-right text-sm tabular-nums">
                                                                {isQualifierEvent
                                                                    ? (qSlots > 0 && s.place <= qSlots ? <span className="font-semibold text-positive">{t("tm.qualifiedFor", { event: qualifierDest?.shortName ?? t("tm.nextStageShort") })}</span> : <span className="text-ink-3">—</span>)
                                                                    : prize > 0 ? <span className="font-semibold text-ink-1">{formatCurrency(prize, "$", false)}</span> : <span className="text-ink-3">—</span>}
                                                            </td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    </Panel>
                                )
                            })()}

                            {/* Participants */}
                            <Panel title={isStarted ? t("tm.col.teams") : t("tm.registeredTeams")} actions={<span className="text-xs tabular-nums text-ink-3">{participantCount} / {displayTournament.slots}</span>} padded={false}>
                                {(() => {
                                    const rawParticipants = isStarted
                                        ? (tournament?.teamIds || [])
                                        : enteredTeamIds
                                    const participants = [...new Set(rawParticipants)]
                                        .map(tid => teamsById.get(tid))
                                        .filter(Boolean)
                                        .sort((a, b) => (a?.worldRanking || 999) - (b?.worldRanking || 999))
                                    if (participants.length === 0) return <p className="px-4 py-4 text-sm text-ink-3">{t("tm.noTeams")}</p>
                                    return (
                                        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                                            {participants.map(team => (
                                                <li key={team!.id} className={cn("flex h-10 items-center gap-2.5 border-b border-line px-4", team!.id === playerTeamId && "bg-gold/[0.05]")}>
                                                    <TeamLogoImage src={team!.logoPath} alt="" size={20} />
                                                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-1">{team!.name}</span>
                                                    <span className="text-xs tabular-nums text-ink-3">#{team!.worldRanking || "—"}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )
                                })()}
                            </Panel>
                        </div>

                        <aside className="min-w-0 space-y-4">
                            {/* Registration */}
                            {tournament && !isStarted && !isRegistered && (
                                <Panel title={t("tm.col.entry")}>
                                    {eligibility?.canRegister ? (
                                        <p className="text-sm text-ink-2">{t("tm.canEnter", { week: startWeek })}</p>
                                    ) : eligibility?.eligible ? (
                                        <p className="text-sm text-ink-2"><Trans k="tm.invitePending" tags={{ b: x => <span className="font-semibold text-ink-1">{x}</span> }} /></p>
                                    ) : (
                                        <p className="text-sm text-ink-2"><span className="font-semibold text-negative">{t("tm.notEligible")}</span> {eligibility?.reason || t("tm.notEligibleBody")}</p>
                                    )}
                                </Panel>
                            )}

                            {prizeSplitPanel}

                            {/* Past winners */}
                            {seasonalInstances.some(inst => (inst as any).isCompleted) && (
                                <Panel title={t("tm.pastWinners")} padded={false}>
                                    <ul>
                                        {seasonalInstances.filter(inst => (inst as any).isCompleted).map((inst: any) => {
                                            const winner = teamsById.get(inst.winnerId)
                                            const seasonNum = instanceSeason(inst)
                                            return (
                                                <li key={inst.id}>
                                                    <button
                                                        onClick={() => setSelectedSeason(inst.id)}
                                                        aria-label={t("tm.viewSeason", { n: seasonNum })}
                                                        className="flex h-10 w-full items-center gap-3 border-b border-line px-4 text-left transition-colors hover:bg-hover"
                                                    >
                                                        <span className="w-16 text-xs tabular-nums text-ink-3">{t("common.season", { n: seasonNum })}</span>
                                                        <Trophy size={13} className="text-gold" aria-hidden="true" />
                                                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-1">{winner?.name || t("tm.unknownWinner")}</span>
                                                    </button>
                                                </li>
                                            )
                                        })}
                                    </ul>
                                </Panel>
                            )}
                        </aside>
                    </div>
                )}

                {activeTab === "groups" && (
                    displayTournament?.format === "swiss" ? (
                        (displayTournament.standings?.length ?? 0) > 0 ? (
                        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
                        <Panel title={t("tm.swissStage")} actions={<span className="text-xs text-ink-3">{t("tm.swissNote")}</span>} padded={false}>
                            {(() => {
                                // The engine's Swiss table (wins → head-to-head → map/round diff).
                                const playoffTeams = new Set((displayTournament.playoffBracket ?? [])
                                    .filter(m => !m.id.includes("swiss"))
                                    .flatMap(m => [m.homeTeamId, m.awayTeamId]))
                                return (
                                    <table data-slot="table" className="w-full border-collapse text-left">
                                        <thead data-slot="table-header">
                                            <tr className="border-b border-line">
                                                <th data-slot="table-head" className="w-14 pl-4">#</th>
                                                <th data-slot="table-head">{t("rk.col.team")}</th>
                                                <th data-slot="table-head" className="px-3 text-right">{t("common.win.short")}</th>
                                                <th data-slot="table-head" className="px-3 text-right">{t("common.loss.short")}</th>
                                                <th data-slot="table-head" className="px-3 text-right" title={t("tm.col.rdLong")}>{t("tm.col.rd")}</th>
                                                <th data-slot="table-head" className="pr-4 text-right">{t("tm.col.status")}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {displayTournament.standings!.map((st, idx) => {
                                                const team = teamsById.get(st.teamId)
                                                const own = st.teamId === playerTeamId
                                                const advanced = st.wins >= 3 || playoffTeams.has(st.teamId)
                                                const out = !advanced && st.losses >= 3
                                                return (
                                                    <tr key={st.teamId} data-slot="table-row" className={cn("h-11 border-b border-line last:border-b-0", own && "bg-gold/[0.05] shadow-[inset_2px_0_0_var(--gold)]", out && "text-ink-3")}>
                                                        <td className="pl-4 text-sm font-semibold tabular-nums text-ink-3">{idx + 1}</td>
                                                        <td>
                                                            <span className="flex items-center gap-2.5">
                                                                <TeamLogoImage src={team?.logoPath} alt="" size={22} />
                                                                {team ? <TeamLink id={team.id} className={cn("text-sm font-semibold", out ? "text-ink-3" : "text-ink-1")}>{team.name}</TeamLink> : <span className="text-sm text-ink-3">{t("tm.unknownTeam")}</span>}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 text-right text-sm tabular-nums text-ink-1">{st.wins}</td>
                                                        <td className="px-3 text-right text-sm tabular-nums text-ink-2">{st.losses}</td>
                                                        <td className="px-3 text-right text-sm tabular-nums text-ink-2">{st.roundDiff > 0 ? `+${st.roundDiff}` : st.roundDiff}</td>
                                                        <td className="pr-4 text-right text-sm">
                                                            {advanced ? <span className="font-semibold text-positive">{t("tm.swiss.advanced")}</span>
                                                                : out ? <span className="text-negative">{t("tm.status.eliminated")}</span>
                                                                    : <span className="text-ink-3">—</span>}
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                )
                            })()}
                        </Panel>
                        {prizeSplitPanel}
                        </div>
                        ) : emptyBlock(LayoutGrid, t("tm.noStandings"), t("tm.noStandingsBody"))
                    ) : displayTournament?.format === "league" ? (
                        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
                        <Panel title={t("tm.leagueStandings")} actions={<span className="text-xs text-ink-3">{t("tm.leagueStandingsNote")}</span>} padded={false}>
                            {(() => {
                                // Prefer the engine's authoritative standings (points → wins →
                                // head-to-head → map/round diff); recompute only if missing.
                                const engineStandings = displayTournament?.standings as Array<{ teamId: string; wins: number; losses: number; points: number; matchesPlayed: number }> | undefined
                                const leagueStandings = (engineStandings && engineStandings.length > 0)
                                    ? engineStandings.map(s => ({
                                        team: teamsById.get(s.teamId),
                                        wins: s.wins, losses: s.losses, points: s.points, matchesPlayed: s.matchesPlayed,
                                    }))
                                    : (displayTournament?.teamIds?.map((tid: string) => {
                                        const team = teamsById.get(tid)
                                        const matches = tournamentMatches.filter(m => m.homeTeamId === tid || m.awayTeamId === tid)
                                        const wins = matches.filter(m => (m.result.homeScore > m.result.awayScore && m.homeTeamId === tid) || (m.result.awayScore > m.result.homeScore && m.awayTeamId === tid)).length
                                        const losses = matches.length - wins
                                        const points = wins * 3
                                        return { team, wins, losses, points, matchesPlayed: matches.length }
                                    }).sort((a: any, b: any) => b.points - a.points || b.wins - a.wins) ?? [])

                                return (
                                    <table data-slot="table" className="w-full border-collapse text-left">
                                        <thead data-slot="table-header">
                                            <tr className="border-b border-line">
                                                <th data-slot="table-head" className="w-14 pl-4">#</th>
                                                <th data-slot="table-head">{t("rk.col.team")}</th>
                                                <th data-slot="table-head" className="px-3">{t("rk.col.last5")}</th>
                                                <th data-slot="table-head" className="px-3 text-right" title={t("tm.col.playedLong")}>{t("tm.col.played")}</th>
                                                <th data-slot="table-head" className="px-3 text-right">{t("common.win.short")}</th>
                                                <th data-slot="table-head" className="px-3 text-right">{t("common.loss.short")}</th>
                                                <th data-slot="table-head" className="pr-4 text-right">{t("tm.col.pts")}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {leagueStandings?.map((entry: any, idx: number) => {
                                                const own = entry.team?.id === playerTeamId
                                                const teamMatches = tournamentMatches
                                                    .filter(m => m.homeTeamId === entry.team?.id || m.awayTeamId === entry.team?.id)
                                                    .sort((a, b) => b.week - a.week)
                                                    .slice(0, 5)
                                                    .reverse()
                                                return (
                                                    <tr key={entry.team?.id || idx} data-slot="table-row" className={cn("h-11 border-b border-line last:border-b-0", own && "bg-gold/[0.05] shadow-[inset_2px_0_0_var(--gold)]")}>
                                                        <td className="pl-4 text-sm font-semibold tabular-nums text-ink-3">{idx + 1}</td>
                                                        <td>
                                                            <span className="flex items-center gap-2.5">
                                                                <TeamLogoImage src={entry.team?.logoPath} alt="" size={22} />
                                                                <span className="text-sm font-semibold text-ink-1">{entry.team?.name || t("tm.unknownTeam")}</span>
                                                            </span>
                                                        </td>
                                                        <td className="px-3">
                                                            <span className="flex gap-1">
                                                                {teamMatches.map(m => {
                                                                    const isHome = m.homeTeamId === entry.team?.id
                                                                    const isWin = isHome ? m.result.homeScore > m.result.awayScore : m.result.awayScore > m.result.homeScore
                                                                    const opponent = teamsById.get(isHome ? m.awayTeamId : m.homeTeamId)
                                                                    const label = t(isWin ? "tm.formWin" : "tm.formLoss", { team: opponent?.name || t("common.unknown"), score: `${m.result.homeScore}–${m.result.awayScore}` })
                                                                    return (
                                                                        <span key={m.id} title={label} aria-label={label} className={cn("flex h-5 w-5 items-center justify-center rounded-sm text-[11px] font-bold", isWin ? "bg-positive/15 text-positive" : "bg-negative/15 text-negative")}>
                                                                            {isWin ? t("common.win.short") : t("common.loss.short")}
                                                                        </span>
                                                                    )
                                                                })}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 text-right text-sm tabular-nums text-ink-2">{entry.matchesPlayed}</td>
                                                        <td className="px-3 text-right text-sm tabular-nums text-ink-1">{entry.wins}</td>
                                                        <td className="px-3 text-right text-sm tabular-nums text-ink-2">{entry.losses}</td>
                                                        <td className="pr-4 text-right font-display text-lg font-bold tabular-nums text-ink-1">{entry.points}</td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                )
                            })()}
                        </Panel>
                        {prizeSplitPanel}
                        </div>
                    ) : displayTournament?.groups ? (
                        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                            {displayTournament?.groups?.map((group: any, idx: number) => (
                                <Panel key={group.id || idx} title={stageName(group.name)} actions={<span className="text-xs text-ink-3">{t("tm.groupNote")}</span>}>
                                    <div className="space-y-5">
                                        <div>
                                            <p className={cn(overline, "mb-2")}>{t("tm.upper")}</p>
                                            <div className="grid grid-cols-1 gap-2 xl:grid-cols-3">
                                                <div className="space-y-2">
                                                    {group.matches.filter((m: string) => m.includes("opening")).map((mid: string) => <MatchCardComponent key={mid} matchId={mid} tournament={tournament} />)}
                                                </div>
                                                <div className="flex flex-col justify-around gap-2">
                                                    {group.matches.filter((m: string) => m.includes("upper_semi")).map((mid: string) => <MatchCardComponent key={mid} matchId={mid} tournament={tournament} />)}
                                                </div>
                                                <div className="flex flex-col justify-center">
                                                    {group.matches.filter((m: string) => m.includes("upper_final")).map((mid: string) => <MatchCardComponent key={mid} matchId={mid} tournament={tournament} />)}
                                                </div>
                                            </div>
                                        </div>
                                        <div>
                                            <p className={cn(overline, "mb-2")}>{t("tm.lower")}</p>
                                            <div className="grid grid-cols-1 gap-2 xl:grid-cols-3">
                                                <div className="space-y-2">
                                                    {displayTournament?.playoffBracket?.filter((m: any) => m.id.includes(group.id) && m.id.includes("lower_r1")).map((m: any) => <MatchCardComponent key={m.id} matchId={m.id} tournament={displayTournament as DisplayTournament} />)}
                                                </div>
                                                <div className="flex flex-col justify-center gap-2">
                                                    {displayTournament?.playoffBracket?.filter((m: any) => m.id.includes(group.id) && m.id.includes("lower_semi")).map((m: any) => <MatchCardComponent key={m.id} matchId={m.id} tournament={displayTournament as DisplayTournament} />)}
                                                </div>
                                                <div className="flex flex-col justify-center">
                                                    {displayTournament?.playoffBracket?.filter((m: any) => m.id.includes(group.id) && m.id.includes("lower_final")).map((m: any) => <MatchCardComponent key={m.id} matchId={m.id} tournament={displayTournament as DisplayTournament} />)}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </Panel>
                            ))}
                        </div>
                    ) : displayTournament?.id ? (
                        emptyBlock(Trophy, t("tm.direct"), t("tm.directBody"),
                            <Button onClick={() => setActiveTab("playoffs")} className="mt-4" variant="outline">{t("tm.viewBracket")}</Button>)
                    ) : (
                        emptyBlock(LayoutGrid, t("tm.noGroups"), t("tm.noGroupsBody", { week: displayTournament.startWeek }))
                    )
                )}

                {activeTab === "playoffs" && (
                    displayTournament?.playoffBracket && displayTournament?.playoffBracket.length > 0 ? (
                        <Panel title={t("tm.tab.bracket")} padded={false}>
                            <div className="overflow-x-auto">
                                <div className="min-w-max">
                                    {(() => {
                                        // TournamentBracket sorts the stages (RO32 → Final).
                                        const bracketMatches = displayTournament?.playoffBracket || []
                                        const uniqueStages = [...new Set(bracketMatches.map((m: any) => m.stage).filter(Boolean))] as string[]
                                        const bracketIds = new Set(bracketMatches.flatMap((m: any) => [m.homeTeamId, m.awayTeamId]))
                                        const bracketOvrs = teamOvrMap(teams.filter(t => bracketIds.has(t.id)), players)
                                        return (
                                            <TournamentBracket
                                                matches={bracketMatches.map((m: any) => mapToBracketMatch(m, teams, completedMatches, bracketOvrs))}
                                                rounds={uniqueStages.length > 0 ? uniqueStages : ["Quarter-Finals", "Semi-Finals", "Grand Final"]}
                                                playerTeamId={playerTeamId || undefined}
                                                onMatchClick={() => { /* bracket matches open from the schedule */ }}
                                            />
                                        )
                                    })()}
                                </div>
                            </div>
                        </Panel>
                    ) : (
                        emptyBlock(Layers, t("tm.noBracket"), t("tm.noBracketBody"))
                    )
                )}

                {activeTab === "schedule" && (
                    isStarted ? (() => {
                        // This season's instance only (other seasons and the
                        // qualifiers have their own pages).
                        const isMatchForThis = (m: any) => m.tournamentId === displayTournament.id
                        const allMatches = [
                            ...scheduledMatches.filter(isMatchForThis),
                            ...completedMatches.filter(isMatchForThis) as any
                        ]
                        const playerNextMatch = scheduledMatches
                            .filter(m => isMatchForThis(m) && (m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId))
                            .sort((a, b) => a.week - b.week)[0]
                        const opponent = playerNextMatch
                            ? teamsById.get(playerNextMatch.homeTeamId === playerTeamId ? playerNextMatch.awayTeamId : playerNextMatch.homeTeamId)
                            : null

                        if (allMatches.length === 0) return emptyBlock(Calendar, t("tm.noMatches"), t("tm.noMatchesBody"))

                        const matchesByWeek: Record<number, any[]> = {}
                        allMatches.forEach(m => {
                            if (!matchesByWeek[m.week]) matchesByWeek[m.week] = []
                            matchesByWeek[m.week].push(m)
                        })
                        // Newest week first; earlier rounds below.
                        const sortedWeeks = Object.keys(matchesByWeek).map(Number).sort((a, b) => b - a)

                        return (
                            <div className="space-y-4">
                                {playerNextMatch && opponent && (
                                    <Panel title={t("tm.nextMatch")} actions={<span className="text-xs text-ink-3">{t("common.week", { n: playerNextMatch.week })} · {playerNextMatch.stage ? stageName(playerNextMatch.stage) : t("tm.match")}</span>}>
                                        <div className="flex items-center gap-6">
                                            <span className="flex flex-1 items-center gap-3">
                                                <TeamLogoImage src={playerTeam?.logoPath} alt="" size={36} />
                                                <span>
                                                    <span className="block font-display text-2xl font-bold uppercase leading-none text-ink-1">{playerTeam?.name || t("tm.yourTeam")}</span>
                                                    <span className="text-xs text-ink-3">{t("common.worldRank", { rank: playerTeam?.worldRanking || "—" })}</span>
                                                </span>
                                            </span>
                                            <span className="font-display text-xl font-bold text-ink-3">{t("common.vs")}</span>
                                            <span className="flex flex-1 items-center justify-end gap-3 text-right">
                                                <span>
                                                    <TeamLink id={opponent.id} className="block font-display text-2xl font-bold uppercase leading-none text-ink-1">{opponent.name}</TeamLink>
                                                    <span className="text-xs text-ink-3">{t("common.worldRank", { rank: opponent.worldRanking || "—" })}</span>
                                                </span>
                                                <TeamLogoImage src={opponent.logoPath} alt="" size={36} />
                                            </span>
                                        </div>
                                    </Panel>
                                )}
                                {sortedWeeks.map(week => (
                                    <section key={week} className="space-y-2">
                                        <div className="flex items-baseline justify-between border-b border-line pb-1.5">
                                            <h3 className="text-sm font-semibold text-ink-1">
                                                {t("common.week", { n: week })} <span className="font-normal text-ink-3">· {week === currentWeek ? t("tm.thisWeek") : week < currentWeek ? t("tm.played") : t("tm.upcoming")}</span>
                                            </h3>
                                            <span className="text-xs text-ink-3">{matchesByWeek[week][0].stage ? stageName(matchesByWeek[week][0].stage) : t("stage.groupStage")}</span>
                                        </div>
                                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                                            {matchesByWeek[week].map((match: any) => <MatchCardComponent key={match.id} matchId={match.id} tournament={tournament} />)}
                                        </div>
                                    </section>
                                ))}
                            </div>
                        )
                    })() : (
                        emptyBlock(Calendar, t("tm.noSchedule"), t("tm.noScheduleBody"))
                    )
                )}

                {activeTab === "history" && (() => {
                    const playerMatches = completedMatches
                        .filter(m => isMatchForTournament(m.tournamentId, displayTournament.id) && (m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId))
                        .sort((a, b) => b.week - a.week)
                    if (playerMatches.length === 0) return emptyBlock(History, t("common.noMatchesYet"), t("tm.noResultsBody"))
                    return (
                        <Panel title={t("tm.tab.yours")} padded={false}>
                            <table data-slot="table" className="w-full border-collapse text-left">
                                <thead data-slot="table-header">
                                    <tr className="border-b border-line">
                                        <th data-slot="table-head" className="w-16 pl-4">{t("sx.col.result")}</th>
                                        <th data-slot="table-head">{t("sx.col.opponent")}</th>
                                        <th data-slot="table-head" className="px-3">{t("tm.stage")}</th>
                                        <th data-slot="table-head" className="px-3">{t("sx.col.week")}</th>
                                        <th data-slot="table-head" className="pr-4 text-right">{t("tm.score")}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {playerMatches.map(match => {
                                        const isHome = match.homeTeamId === playerTeamId
                                        const opponent = teamsById.get(isHome ? match.awayTeamId : match.homeTeamId)
                                        const playerScore = isHome ? match.result.homeScore : match.result.awayScore
                                        const opponentScore = isHome ? match.result.awayScore : match.result.homeScore
                                        const isWin = playerScore > opponentScore
                                        return (
                                            <tr
                                                key={match.id}
                                                data-slot="table-row"
                                                className="h-11 cursor-pointer border-b border-line last:border-b-0"
                                                {...pressable(() => router.push(`/match/${match.id}/result`), { label: t("tm.openResult", { team: opponent?.name || t("common.unknown") }) })}
                                            >
                                                <td className={cn("pl-4 text-sm font-bold", isWin ? "text-positive" : "text-negative")}>{isWin ? t("common.win.short") : t("common.loss.short")}</td>
                                                <td>
                                                    <span className="flex items-center gap-2.5">
                                                        <TeamLogoImage src={opponent?.logoPath} alt="" size={22} />
                                                        <span className="text-sm font-semibold text-ink-1">{opponent?.name || t("common.unknown")}</span>
                                                        <span className="text-xs tabular-nums text-ink-3">#{opponent?.worldRanking || "—"}</span>
                                                    </span>
                                                </td>
                                                <td className="px-3 text-sm text-ink-2">{match.stage ? stageName(match.stage) : t("tm.match")}</td>
                                                <td className="px-3 text-sm tabular-nums text-ink-3">{match.week}</td>
                                                <td className="pr-4 text-right font-display text-lg font-bold tabular-nums text-ink-1">{playerScore}–{opponentScore}</td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </Panel>
                    )
                })()}

                {activeTab === "stats" && (
                    <TournamentStats
                        tournamentId={displayTournament.id}
                        completedMatches={completedMatches}
                        players={players}
                        teams={teams}
                        isCompleted={displayTournament?.isCompleted}
                    />
                )}
            </div>
        </ErrorBoundary>
    )
}

function MatchCardComponent({
    matchId,
    tournament,
    className
}: {
    matchId: string,
    tournament: any,
    vertical?: boolean,
    className?: string
}) {
    const { scheduledMatches, completedMatches, teams, playerTeamId } = useGameStore(useShallow(state => ({
        scheduledMatches: state.scheduledMatches,
        completedMatches: state.completedMatches,
        teams: state.teams,
        playerTeamId: state.playerTeamId,
    })))

    const matchData = useMemo(() => {
        return (
            scheduledMatches.find((m: any) => m.id === matchId) ||
            completedMatches.find((m: any) => m.id === matchId) ||
            (tournament as any)?.playoffBracket?.find((m: any) => m.id === matchId)
        )
    }, [scheduledMatches, completedMatches, tournament, matchId])

    const team1 = matchData ? teams.find((t: any) => t.id === matchData.homeTeamId) : undefined
    const team2 = matchData ? teams.find((t: any) => t.id === matchData.awayTeamId) : undefined
    const result = matchData?.result
    const isCompleted = !!matchData && (matchData.isCompleted || !!result)
    const isPlayerMatch = !!playerTeamId && !!matchData && (matchData.homeTeamId === playerTeamId || matchData.awayTeamId === playerTeamId)

    const row = (team: any, score: number | undefined, won: boolean, lost: boolean) => (
        <div className="flex h-8 items-center gap-2.5 px-3">
            {team ? <TeamLogoImage src={team.logoPath} alt="" size={18} /> : <span className="h-[18px] w-[18px] rounded-sm bg-hover" />}
            <span className={cn("min-w-0 flex-1 truncate text-sm", team ? (lost ? "text-ink-3" : "font-semibold text-ink-1") : "text-ink-3")}>{team?.name ?? t("common.tbd")}</span>
            <span className={cn("w-6 text-right font-display text-base font-bold tabular-nums", won ? "text-ink-1" : "text-ink-3")}>{isCompleted ? score : ""}</span>
        </div>
    )

    const homeWon = isCompleted && !!result && result.homeScore > result.awayScore
    const awayWon = isCompleted && !!result && result.awayScore > result.homeScore
    return (
        <div className={cn(
            "overflow-hidden rounded-[4px] border bg-raised",
            isPlayerMatch ? "border-line-strong shadow-[inset_2px_0_0_var(--gold)]" : "border-line",
            className,
        )}>
            {row(team1, result?.homeScore, homeWon, awayWon)}
            <div className="h-px bg-line" />
            {row(team2, result?.awayScore, awayWon, homeWon)}
        </div>
    )
}
