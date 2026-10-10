"use client"

import React, { useState, useMemo, useEffect, type ReactNode } from "react"
import { ErrorBoundary } from "@/components/ui/error-boundary"
import { useParams, useRouter } from "next/navigation"
import Image from "next/image"
import { useGameStore } from "@/store/game-store"
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
const ordinal = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`
/** Collapse equal consecutive shares into rows like "5th–8th · 4% each". */
function splitRows(split: Record<number, number>): { label: string; pct: number; count: number }[] {
    const places = Object.keys(split).map(Number).sort((a, b) => a - b)
    const rows: { from: number; to: number; pct: number }[] = []
    for (const place of places) {
        const last = rows[rows.length - 1]
        if (last && last.pct === split[place] && place > 2) last.to = place
        else rows.push({ from: place, to: place, pct: split[place] })
    }
    return rows.map(r => ({ label: r.from === r.to ? ordinal(r.from) : `${ordinal(r.from)}–${ordinal(r.to)}`, pct: r.pct, count: r.to - r.from + 1 }))
}

// Format display helper
// Pure helpers hoisted to module scope so they don't get a new identity on
// every render and accidentally bust downstream useMemo deps.
const toSeriesId = (value?: string) => (value || "").replace(/_s\d+$/, "")
const isQualificationForTournament = (q: any, tournamentId: string) =>
    toSeriesId(q.seriesId || q.tournamentId) === toSeriesId(tournamentId)
const isMatchForTournament = (matchTournamentId: string | null | undefined, tournamentId: string) =>
    toSeriesId(matchTournamentId || "") === toSeriesId(tournamentId)

const formatDisplayName = (format: string): string => {
    const formatMap: Record<string, string> = {
        "league": "Round Robin",
        "swiss": "Swiss System",
        "bracket": "Single Elimination",
        "double_elim": "Double Elimination",
    }
    return formatMap[format?.toLowerCase()] || format || "TBD"
}

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

const getTimelineNodeStatus = (tournament: TournamentDefinition, currentWeek: number): TimelineNodeStatus => {
    const startWeek = tournament.startWeek || 1
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

const getTimelineRoleLabel = (role: TimelineNodeRole): string => {
    switch (role) {
        case "OPEN_QUALIFIER":
            return "Open Qualifier"
        case "CLOSED_QUALIFIER":
            return "Closed Qualifier"
        default:
            return "Main Event"
    }
}

// Helper to map match data to bracket format
function mapToBracketMatch(m: any, teams: any[], completedMatches: any[]): any {
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
        } : undefined,
        team2: team2 ? {
            id: team2.id,
            name: team2.name,
            score: activeMatch.result?.awayScore,
            isWinner: (activeMatch.isCompleted || activeMatch.result) && activeMatch.result && activeMatch.result.awayScore > activeMatch.result.homeScore,
            logo: team2.logoPath,
            recentForm: getForm(team2.id),
            branding: team2.branding,
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

    const tournament = useMemo(() => tournaments.find(t => t.id === id), [tournaments, id])

    const [activeTab, setActiveTab] = useState<"overview" | "groups" | "playoffs" | "schedule" | "history" | "stats">("overview")
    const [selectedSeason, setSelectedSeason] = useState<string | null>(null)

    // Resolve base definition (handle seasonal IDs)
    const definition = useMemo(() => {
        const rawId = (Array.isArray(id) ? id[0] : id) || ""
        // Try exact match first
        const exact = FULL_TOURNAMENT_CALENDAR.find(t => t.id === rawId)
        if (exact) return exact

        // Try stripped match
        const baseId = rawId.split('_s')[0]
        return FULL_TOURNAMENT_CALENDAR.find(t => t.id === baseId)
    }, [id])

    // Find all seasonal instances of this tournament
    const seasonalInstances = useMemo(() => {
        if (!definition) return []
        return tournaments
            .filter(t => t.id.startsWith(definition.id) || t.id.includes(definition.id))
            .sort((a, b) => {
                // Parse season number
                const sA = parseInt(a.id.split('_s')[1] || "1")
                const sB = parseInt(b.id.split('_s')[1] || "1")
                return sB - sA // Descending (latest first)
            })
    }, [tournaments, definition])

    // Compute display tournament purely (no side effects)
    const displayTournament = useMemo((): DisplayTournament | undefined => {
        // If we explicitly selected a season via dropdown, find that one
        if (selectedSeason) {
            const found = seasonalInstances.find(t => t.id === selectedSeason)
            if (found) return { ...definition, ...found } as DisplayTournament
        }

        // Otherwise, try to match URL ID
        const urlId = (Array.isArray(id) ? id[0] : id) || ""
        const exactMatch = seasonalInstances.find(t => t.id === urlId)
        if (exactMatch) return { ...definition, ...exactMatch } as DisplayTournament

        // Fallback: Use latest season available
        if (seasonalInstances.length > 0) return { ...definition, ...seasonalInstances[0] } as DisplayTournament

        // Final fallback: Just the definition
        return definition
    }, [seasonalInstances, definition, id, selectedSeason])

    // Sync selectedSeason state (moved out of useMemo to avoid setState during render)
    useEffect(() => {
        if (selectedSeason) return // Already explicitly selected
        const urlId = (Array.isArray(id) ? id[0] : id) || ""
        const exactMatch = seasonalInstances.find(t => t.id === urlId)
        if (exactMatch) {
            setSelectedSeason(exactMatch.id)
        } else if (seasonalInstances.length > 0) {
            setSelectedSeason(seasonalInstances[0].id)
        }
    }, [seasonalInstances, id, selectedSeason])

    const playerTeam = useMemo(() => teams.find(t => t.id === playerTeamId), [teams, playerTeamId])
    // Index teams by id once — was being scanned 8+ times per render across the
    // podium / playoff / standings sections.
    const teamsById = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams])
    // toSeriesId / isQualificationForTournament / isMatchForTournament are
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
        // isMatchForTournament/toSeriesId are pure helpers above; not deps.
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
                    .find(q => q.teamId === playerTeamId && isQualificationForTournament(q, entry.id))
                : undefined

            return {
                tournament: entry,
                status: getTimelineNodeStatus(entry, currentWeek),
                role: getTimelineNodeRole(entry),
                isCurrent: index === currentIndex,
                incomingQualifierCount: getQualifiersFor(entry.id).length,
                playerStatus: playerRow?.status || null,
            }
        })
    }, [currentWeek, definition, playerTeamId, tournamentQualifications])

    if (!displayTournament) {
        return (
            <div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
                <h1 className="font-display text-3xl font-bold uppercase text-ink-1">Tournament not found</h1>
                <Button onClick={() => router.push("/tournaments")} variant="outline" className="mt-5 gap-2">
                    <ArrowLeft className="h-4 w-4" /> Back to tournaments
                </Button>
            </div>
        )
    }

    // Check registration against the specific displayTournament ID
    const isRegistered = tournamentQualifications.some(q =>
        isQualificationForTournament(q, displayTournament.id) && q.teamId === playerTeamId
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
    const status: { label: string; tone: string } = currentWeek < startWeek
        ? { label: `Starts in ${weeksUntil} week${weeksUntil !== 1 ? "s" : ""}`, tone: "text-ink-2" }
        : isPlayerEliminated && currentWeek <= endWeek
            ? { label: "Eliminated", tone: "text-negative" }
            : currentWeek <= endWeek && !displayTournament.isCompleted
                ? { label: "Live", tone: "text-negative" }
                : { label: "Completed", tone: "text-ink-3" }

    const registeredCount = tournamentQualifications.filter(q => isQualificationForTournament(q, (definition?.id || id) as string)).length
    const participantCount = isStarted ? (displayTournament.teamIds?.length || 0) : registeredCount
    const progress = Math.max(0, Math.min(100, ((currentWeek - startWeek) / Math.max(1, endWeek - startWeek)) * 100))

    // Tabs depend on the format.
    const format = displayTournament.format
    const slots = displayTournament.slots || 32
    const tabs: { id: typeof activeTab; label: string }[] = [{ id: "overview", label: "Overview" }]
    if (format !== "league" && (format === "swiss" || slots === 16 || slots === 24)) tabs.push({ id: "groups", label: "Group stage" })
    if (format !== "league") tabs.push({ id: "playoffs", label: "Bracket" })
    if (format === "league") tabs.push({ id: "groups", label: "Standings" })
    tabs.push({ id: "schedule", label: format === "league" ? "Schedule" : "All matches" })
    tabs.push({ id: "history", label: "Your matches" })
    tabs.push({ id: "stats", label: "Stats" })

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
                    <Panel title={isQualifierEvent ? "Qualification" : "Prize split"} padded={false} actions={!isQualifierEvent ? <span className="text-xs text-ink-3">{formatCurrency(prizePool, "$", false)} total</span> : undefined}>
                        {isQualifierEvent ? (
                            <p className="px-4 py-3 text-sm text-ink-2">Top <span className="font-semibold tabular-nums text-ink-1">{displayTournament.qualifierSlots || 1}</span> advance to <span className="font-semibold text-ink-1">{qualifierDest?.name ?? "the next stage"}</span>.</p>
                        ) : (
                            <table data-slot="table" className="w-full border-collapse text-left">
                                <tbody>
                                    {splitRows(split).map(row => (
                                        <tr key={row.label} className="h-9 border-b border-line last:border-b-0">
                                            <td className="pl-4 text-sm text-ink-2">{row.label}</td>
                                            <td className="text-right text-xs tabular-nums text-ink-3">{Math.round(row.pct * 100)}%{row.count > 1 ? " each" : ""}</td>
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
                        <ArrowLeft size={15} aria-hidden="true" /> Tournaments
                    </button>
                    {seasonalInstances.length > 1 && (
                        <div className="flex items-center gap-1.5" role="group" aria-label="Season">
                            <span className={overline}>Season</span>
                            {seasonalInstances.map(t => {
                                const seasonNum = t.id.split('_s')[1] || "1"
                                const active = displayTournament.id === t.id
                                return (
                                    <button
                                        key={t.id}
                                        onClick={() => setSelectedSeason(t.id)}
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
                                : <Trophy className="h-8 w-8 text-ink-3" />}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
                                <TierTag tier={displayTournament.tier} />
                                <span className="flex items-center gap-1.5"><CountryFlag country={displayTournament.region} size={12} />{displayTournament.region}</span>
                                <span aria-hidden="true">·</span>
                                <span className="flex items-center gap-1"><Calendar size={12} aria-hidden="true" />Week {startWeek}–{endWeek}</span>
                                <span aria-hidden="true">·</span>
                                <span className={cn("flex items-center gap-1.5 font-semibold", status.tone)}>
                                    {status.label === "Live" && <span className="h-1.5 w-1.5 rounded-full bg-negative" aria-hidden="true" />}
                                    {status.label}
                                </span>
                            </div>
                            <h1 className="page-title mt-1 truncate">{getDynamicTournamentName(displayTournament.name, currentWeek)}</h1>
                        </div>
                        {!isStarted && (
                            isRegistered ? (
                                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-positive"><CheckCircle2 size={16} aria-hidden="true" /> Registered</span>
                            ) : eligibility?.canRegister ? (
                                <Button onClick={() => registerForTournament(displayTournament?.id || definition?.id || (id as string))} className="h-11 px-6 text-base">
                                    Register team
                                </Button>
                            ) : null
                        )}
                    </div>
                    <div className="grid grid-cols-2 divide-x divide-line border-t border-line md:grid-cols-4">
                        <Kpi className="px-6 py-3" label={isQualifierEvent ? "Reward" : "Prize pool"} value={isQualifierEvent ? `${qualifierDest?.shortName ?? "Next stage"} spot` : formatCurrency(prizePool, "$", false)} />
                        <Kpi className="px-6 py-3" label={isStarted ? "Teams" : "Registered"} value={<>{participantCount}<span className="text-ink-3"> / {displayTournament.slots}</span></>} />
                        <Kpi className="px-6 py-3" label="Stage" value={displayTournament.currentStage || (isStarted ? "In progress" : "Not started")} valueClassName="text-[22px]" />
                        <Kpi className="px-6 py-3" label="Format" value={formatDisplayName(displayTournament.format)} valueClassName="text-[22px]" />
                    </div>
                    {currentWeek >= startWeek && (
                        <div className="flex items-center gap-3 border-t border-line px-6 py-2.5 text-xs tabular-nums text-ink-3">
                            <span>Week {startWeek}</span>
                            <div className="h-1 flex-1 overflow-hidden rounded-full bg-hover">
                                <div className="h-full rounded-full bg-ink-2" style={{ width: `${progress}%` }} />
                            </div>
                            <span>Week {Math.min(currentWeek, endWeek)} of {endWeek}</span>
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
                            <Panel title="About">
                                <p className="max-w-3xl text-sm leading-relaxed text-ink-2">{displayTournament.description || "No description available."}</p>
                                <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
                                    <div><dt className={overline}>Entry</dt><dd className="mt-0.5 text-ink-1">{getEntryTypeLabel(displayTournament.entryType)}</dd></div>
                                    <div><dt className={overline}>Region</dt><dd className="mt-0.5 text-ink-1">{displayTournament.region}</dd></div>
                                    <div><dt className={overline}>Status</dt><dd className="mt-0.5 text-ink-1">{isCompleted ? "Completed" : isStarted ? "In progress" : "Registration open"}</dd></div>
                                    <div><dt className={overline}>Format</dt><dd className="mt-0.5 text-ink-1">{formatDisplayName(displayTournament.format)}</dd></div>
                                </dl>
                            </Panel>

                            {pathToEvent.length > 0 && (
                                <Panel title="Path to the event">
                                    <ol className="flex items-stretch gap-2 overflow-x-auto pb-1">
                                        {pathToEvent.map((node, index) => {
                                            const weekStart = node.tournament.startWeek
                                            const weekEnd = weekStart + Math.max(1, node.tournament.duration || 1) - 1
                                            return (
                                                <React.Fragment key={node.tournament.id}>
                                                    <li className={cn("min-w-[200px] rounded-[4px] border p-3", node.isCurrent ? "border-gold bg-gold/[0.04]" : "border-line bg-raised")}>
                                                        <p className={overline}>{getTimelineRoleLabel(node.role)}{node.isCurrent ? " · this event" : ""}</p>
                                                        <p className="mt-1 text-sm font-semibold text-ink-1">{node.tournament.shortName}</p>
                                                        <p className="mt-0.5 text-xs tabular-nums text-ink-3">Week {weekStart}–{weekEnd} · <span className={node.status === "LIVE" ? "text-negative" : undefined}>{node.status.toLowerCase()}</span></p>
                                                        {node.incomingQualifierCount > 1 && <p className="mt-0.5 text-xs text-ink-3">{node.incomingQualifierCount} feeder qualifiers</p>}
                                                        {node.playerStatus && <p className="mt-1 text-xs font-semibold text-positive">You: {node.playerStatus.toLowerCase()}</p>}
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
                                const standings: { team: any, place: number }[] = []
                                if (displayTournament?.format !== "league") {
                                    const final = tournamentMatches.find(m => m.stage === "Grand Final")
                                    const semiFinals = tournamentMatches.filter(m => m.stage?.includes("Semi-final"))
                                    const quarterFinals = tournamentMatches.filter(m => m.stage?.includes("Quarter-final"))
                                    if (final) {
                                        const winId = final.result.winnerId || (final.result.homeScore > final.result.awayScore ? final.homeTeamId : final.awayTeamId)
                                        const loseId = winId === final.homeTeamId ? final.awayTeamId : final.homeTeamId
                                        const winner = teamsById.get(winId)
                                        const runnerUp = teamsById.get(loseId)
                                        if (winner) standings.push({ team: winner, place: 1 })
                                        if (runnerUp) standings.push({ team: runnerUp, place: 2 })
                                    }
                                    // 3rd / 4th — prefer the 3rd-place decider (engine-authoritative);
                                    // otherwise fall back to semi-final losers.
                                    const thirdDecider = tournamentMatches.find(m => m.stage === "3rd Place Decider")
                                    if (thirdDecider?.result) {
                                        const dWin = thirdDecider.result.winnerId || (thirdDecider.result.homeScore > thirdDecider.result.awayScore ? thirdDecider.homeTeamId : thirdDecider.awayTeamId)
                                        const dLose = dWin === thirdDecider.homeTeamId ? thirdDecider.awayTeamId : thirdDecider.homeTeamId
                                        const third = teamsById.get(dWin)
                                        const fourth = teamsById.get(dLose)
                                        if (third && !standings.some(s => s.team.id === dWin)) standings.push({ team: third, place: 3 })
                                        if (fourth && !standings.some(s => s.team.id === dLose)) standings.push({ team: fourth, place: 4 })
                                    } else {
                                        let semiPlace = 3
                                        semiFinals.forEach(m => {
                                            const loserId = m.result.homeScore > m.result.awayScore ? m.awayTeamId : m.homeTeamId
                                            if (loserId && !standings.some(s => s.team.id === loserId)) {
                                                const t = teamsById.get(loserId)
                                                if (t) { standings.push({ team: t, place: semiPlace }); semiPlace++ }
                                            }
                                        })
                                    }
                                    let qfPlace = 5
                                    quarterFinals.forEach(m => {
                                        const loserId = m.result.homeScore > m.result.awayScore ? m.awayTeamId : m.homeTeamId
                                        if (loserId && !standings.some(s => s.team.id === loserId)) {
                                            const t = teamsById.get(loserId)
                                            if (t) { standings.push({ team: t, place: qfPlace }); qfPlace++ }
                                        }
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
                                    <Panel title="Final standings" padded={false} actions={<span className="text-xs text-ink-3">{isQualifierEvent ? `Top ${qSlots || 1} qualify` : "Prize by placement"}</span>}>
                                        <table data-slot="table" className="w-full border-collapse text-left">
                                            <thead data-slot="table-header">
                                                <tr className="border-b border-line">
                                                    <th data-slot="table-head" className="w-14 pl-4">#</th>
                                                    <th data-slot="table-head">Team</th>
                                                    <th data-slot="table-head" className="pr-4 text-right">{isQualifierEvent ? "Outcome" : "Prize"}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {standings.slice(0, 16).map(s => {
                                                    const prize = Math.round(prizePool * (split[s.place] ?? 0))
                                                    const own = s.team.id === playerTeamId
                                                    return (
                                                        <tr key={s.team.id} data-slot="table-row" className={cn("h-11 border-b border-line last:border-b-0", own && "bg-gold/[0.05] shadow-[inset_2px_0_0_var(--gold)]")}>
                                                            <td className="pl-4 font-display text-lg font-bold tabular-nums text-ink-2">{s.place === 1 ? <Trophy size={16} className="text-gold" aria-label="Champion" /> : s.place}</td>
                                                            <td>
                                                                <span className="flex items-center gap-2.5">
                                                                    <TeamLogoImage src={s.team.logoPath} alt="" size={22} />
                                                                    <span className="text-sm font-semibold text-ink-1">{s.team.name}</span>
                                                                </span>
                                                            </td>
                                                            <td className="pr-4 text-right text-sm tabular-nums">
                                                                {isQualifierEvent
                                                                    ? (qSlots > 0 && s.place <= qSlots ? <span className="font-semibold text-positive">Qualified for {qualifierDest?.shortName ?? "next stage"}</span> : <span className="text-ink-3">—</span>)
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
                            <Panel title={isStarted ? "Teams" : "Registered teams"} actions={<span className="text-xs tabular-nums text-ink-3">{participantCount} / {displayTournament.slots}</span>} padded={false}>
                                {(() => {
                                    const rawParticipants = isStarted
                                        ? (tournament?.teamIds || [])
                                        : (tournamentQualifications.filter(q => isQualificationForTournament(q, (definition?.id || id) as string)).map(q => q.teamId))
                                    const participants = [...new Set(rawParticipants)]
                                        .map(tid => teamsById.get(tid))
                                        .filter(Boolean)
                                        .sort((a, b) => (a?.worldRanking || 999) - (b?.worldRanking || 999))
                                    if (participants.length === 0) return <p className="px-4 py-4 text-sm text-ink-3">No teams yet.</p>
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
                                <Panel title="Entry">
                                    {eligibility?.canRegister ? (
                                        <p className="text-sm text-ink-2">You can enter this event. Register from the header before week {startWeek}.</p>
                                    ) : eligibility?.eligible ? (
                                        <p className="text-sm text-ink-2"><span className="font-semibold text-ink-1">Invitation pending.</span> You meet the requirements; an invitation arrives in your inbox.</p>
                                    ) : (
                                        <p className="text-sm text-ink-2"><span className="font-semibold text-negative">Not eligible.</span> {eligibility?.reason || "You do not meet the requirements for this tournament."}</p>
                                    )}
                                </Panel>
                            )}

                            {prizeSplitPanel}

                            {/* Past winners */}
                            {seasonalInstances.some(t => (t as any).isCompleted) && (
                                <Panel title="Past winners" padded={false}>
                                    <ul>
                                        {seasonalInstances.filter(t => (t as any).isCompleted).map((t: any) => {
                                            const winner = teamsById.get(t.winnerId)
                                            const seasonNum = t.id.split('_s')[1]
                                            return (
                                                <li key={t.id}>
                                                    <button
                                                        onClick={() => setSelectedSeason(t.id)}
                                                        aria-label={`View Season ${seasonNum} results`}
                                                        className="flex h-10 w-full items-center gap-3 border-b border-line px-4 text-left transition-colors hover:bg-hover"
                                                    >
                                                        <span className="w-16 text-xs tabular-nums text-ink-3">Season {seasonNum}</span>
                                                        <Trophy size={13} className="text-gold" aria-hidden="true" />
                                                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-1">{winner?.name || "Unknown winner"}</span>
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
                    displayTournament?.format === "league" ? (
                        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
                        <Panel title="League standings" actions={<span className="text-xs text-ink-3">Round robin · top teams advance to playoffs</span>} padded={false}>
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
                                                <th data-slot="table-head">Team</th>
                                                <th data-slot="table-head" className="px-3">Last 5</th>
                                                <th data-slot="table-head" className="px-3 text-right">P</th>
                                                <th data-slot="table-head" className="px-3 text-right">W</th>
                                                <th data-slot="table-head" className="px-3 text-right">L</th>
                                                <th data-slot="table-head" className="pr-4 text-right">Pts</th>
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
                                                                <span className="text-sm font-semibold text-ink-1">{entry.team?.name || "Unknown team"}</span>
                                                            </span>
                                                        </td>
                                                        <td className="px-3">
                                                            <span className="flex gap-1">
                                                                {teamMatches.map(m => {
                                                                    const isHome = m.homeTeamId === entry.team?.id
                                                                    const isWin = isHome ? m.result.homeScore > m.result.awayScore : m.result.awayScore > m.result.homeScore
                                                                    const opponent = teamsById.get(isHome ? m.awayTeamId : m.homeTeamId)
                                                                    const label = `${isWin ? "Win" : "Loss"} vs ${opponent?.name || "unknown"} ${m.result.homeScore}–${m.result.awayScore}`
                                                                    return (
                                                                        <span key={m.id} title={label} aria-label={label} className={cn("flex h-5 w-5 items-center justify-center rounded-sm text-[11px] font-bold", isWin ? "bg-positive/15 text-positive" : "bg-negative/15 text-negative")}>
                                                                            {isWin ? "W" : "L"}
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
                                <Panel key={group.id || idx} title={group.name} actions={<span className="text-xs text-ink-3">8 teams · double elimination</span>}>
                                    <div className="space-y-5">
                                        <div>
                                            <p className={cn(overline, "mb-2")}>Upper bracket</p>
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
                                            <p className={cn(overline, "mb-2")}>Lower bracket</p>
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
                        emptyBlock(Trophy, "Direct bracket format", "This tournament goes straight to a single-elimination bracket without a group stage.",
                            <Button onClick={() => setActiveTab("playoffs")} className="mt-4" variant="outline">View bracket</Button>)
                    ) : (
                        emptyBlock(LayoutGrid, "Group stage not generated", `Groups are drawn when the event begins in week ${displayTournament.startWeek}.`)
                    )
                )}

                {activeTab === "playoffs" && (
                    displayTournament?.playoffBracket && displayTournament?.playoffBracket.length > 0 ? (
                        <Panel title="Bracket" padded={false}>
                            <div className="overflow-x-auto">
                                <div className="min-w-max">
                                    {(() => {
                                        // TournamentBracket sorts the stages (RO32 → Final).
                                        const bracketMatches = displayTournament?.playoffBracket || []
                                        const uniqueStages = [...new Set(bracketMatches.map((m: any) => m.stage).filter(Boolean))] as string[]
                                        return (
                                            <TournamentBracket
                                                matches={bracketMatches.map((m: any) => mapToBracketMatch(m, teams, completedMatches))}
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
                        emptyBlock(Layers, "Bracket not drawn yet", "The playoff bracket is set from the group or league results.")
                    )
                )}

                {activeTab === "schedule" && (
                    isStarted ? (() => {
                        const isMatchForThis = (m: any) => {
                            // Handle seasonal IDs and base IDs robustly
                            const matchTid = m.tournamentId
                            const defId = definition?.id || ""
                            const urlId = Array.isArray(id) ? id[0] : id
                            if (matchTid === displayTournament.id) return true
                            if (matchTid === defId) return true
                            if (matchTid === urlId) return true
                            if (defId && matchTid?.startsWith(defId + "_s")) return true
                            return false
                        }
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

                        if (allMatches.length === 0) return emptyBlock(Calendar, "No matches scheduled", "Matches appear here once the bracket is drawn.")

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
                                    <Panel title="Your next match" actions={<span className="text-xs text-ink-3">Week {playerNextMatch.week} · {playerNextMatch.stage || "Tournament match"}</span>}>
                                        <div className="flex items-center gap-6">
                                            <span className="flex flex-1 items-center gap-3">
                                                <TeamLogoImage src={playerTeam?.logoPath} alt="" size={36} />
                                                <span>
                                                    <span className="block font-display text-2xl font-bold uppercase leading-none text-ink-1">{playerTeam?.name || "Your team"}</span>
                                                    <span className="text-xs text-ink-3">World #{playerTeam?.worldRanking || "—"}</span>
                                                </span>
                                            </span>
                                            <span className="font-display text-xl font-bold text-ink-3">VS</span>
                                            <span className="flex flex-1 items-center justify-end gap-3 text-right">
                                                <span>
                                                    <span className="block font-display text-2xl font-bold uppercase leading-none text-ink-1">{opponent.name}</span>
                                                    <span className="text-xs text-ink-3">World #{opponent.worldRanking || "—"}</span>
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
                                                Week {week} <span className="font-normal text-ink-3">{week === currentWeek ? "· this week" : week < currentWeek ? "· played" : "· upcoming"}</span>
                                            </h3>
                                            <span className="text-xs text-ink-3">{matchesByWeek[week][0].stage || "Group stage"}</span>
                                        </div>
                                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                                            {matchesByWeek[week].map((match: any) => <MatchCardComponent key={match.id} matchId={match.id} tournament={tournament} />)}
                                        </div>
                                    </section>
                                ))}
                            </div>
                        )
                    })() : (
                        emptyBlock(Calendar, "Schedule not out yet", "The full match schedule is released when the tournament begins.")
                    )
                )}

                {activeTab === "history" && (() => {
                    const playerMatches = completedMatches
                        .filter(m => isMatchForTournament(m.tournamentId, displayTournament.id) && (m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId))
                        .sort((a, b) => b.week - a.week)
                    if (playerMatches.length === 0) return emptyBlock(History, "No matches yet", "Your results in this event appear here after you play.")
                    return (
                        <Panel title="Your matches" padded={false}>
                            <table data-slot="table" className="w-full border-collapse text-left">
                                <thead data-slot="table-header">
                                    <tr className="border-b border-line">
                                        <th data-slot="table-head" className="w-16 pl-4">Result</th>
                                        <th data-slot="table-head">Opponent</th>
                                        <th data-slot="table-head" className="px-3">Stage</th>
                                        <th data-slot="table-head" className="px-3">Week</th>
                                        <th data-slot="table-head" className="pr-4 text-right">Score</th>
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
                                                {...pressable(() => router.push(`/match/${match.id}/result`), { label: `Open result vs ${opponent?.name || "unknown"}` })}
                                            >
                                                <td className={cn("pl-4 text-sm font-bold", isWin ? "text-positive" : "text-negative")}>{isWin ? "W" : "L"}</td>
                                                <td>
                                                    <span className="flex items-center gap-2.5">
                                                        <TeamLogoImage src={opponent?.logoPath} alt="" size={22} />
                                                        <span className="text-sm font-semibold text-ink-1">{opponent?.name || "Unknown"}</span>
                                                        <span className="text-xs tabular-nums text-ink-3">#{opponent?.worldRanking || "—"}</span>
                                                    </span>
                                                </td>
                                                <td className="px-3 text-sm text-ink-2">{match.stage || "Tournament match"}</td>
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
            <span className={cn("min-w-0 flex-1 truncate text-sm", team ? (lost ? "text-ink-3" : "font-semibold text-ink-1") : "text-ink-3")}>{team?.name ?? "TBD"}</span>
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
