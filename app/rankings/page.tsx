"use client"

import React, { useMemo, useState, useRef } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useDebounce } from "@/hooks/useDebounce"
import { useRouteViewState } from "@/hooks/use-route-view-state"
import Link from "next/link"
import { useGameStore } from "@/store/game-store"
import { PlayerLink } from "@/components/ui/EntityLink"
import { useShallow } from "zustand/react/shallow"
import { PlayerPortrait, TeamLogoImage } from "@/components/ui/asset-images"
import { HelpTooltip, StatExplanations } from "@/components/ui/stat-tooltip"
import Image from "next/image"
import { Award, ChevronRight, Search, X, ArrowUp, ArrowDown } from "lucide-react"
import { trophyArtKind } from "@/components/squad/TrophyCabinet"
import { trophyArtFor } from "@/lib/trophy-art"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { motion, AnimatePresence } from "framer-motion"
import { useFocusTrap } from "@/lib/accessibility"
import { cn } from "@/lib/utils"
import { calculateTeamTier, getTierStyle } from "@/engine/tier-system"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { getTeamFlag } from "@/engine/region-logic"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { LeagueEngine, TIER_DISPLAY, LeagueTier } from "@/engine/league-engine"
import { seasonEndTierMove } from "@/engine/world-ranking"
import { CircuitPointsManager } from "@/engine/tournament-qualification"
import { CIRCUIT_POINTS } from "@/data/tournament-calendar"
import { ErrorBoundary } from "@/components/ui/error-boundary"
import { EmptyState } from "@/src/components/ui/EmptyState"
import { PlayerCardSkeleton } from "@/src/components/ui/Skeleton"
import { ScreenHeader } from "@/src/components/ui/ScreenHeader"
import { Kpi, KpiStrip } from "@/src/components/ui/Kpi"
import { Panel } from "@/src/components/ui/Panel"
import { RatingChip } from "@/src/components/ui/RatingChip"
import { RoleTag } from "@/src/components/ui/RoleTag"
import { TierTag } from "@/src/components/ui/TierTag"

type RankingsRowProps = {
    team: any
    posInTier: number
    tierSize: number
    /** Clubs in the world (tier bands are shares of it). */
    worldSize: number
    teamFlag: string
    isPlayerTeam: boolean
    revealPlaystyle: boolean
    onSelect: (team: any) => void
}

const GRID = "grid-cols-[72px_minmax(240px,1fr)_96px_90px_72px_128px_120px_40px]"
const ordinal = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`

// React.memo on the row means it skips re-render when parent re-renders
// unless one of its primitive/stable-reference props actually changed.
// This is the hot-path dedupe: without it, a keystroke in the search box
// re-renders every row even though most rows haven't changed.
const RankingsRow = React.memo(function RankingsRow({
    team,
    posInTier,
    tierSize,
    worldSize,
    teamFlag,
    isPlayerTeam,
    revealPlaystyle,
    onSelect,
}: RankingsRowProps) {
    const tierStyle = getTierStyle(team.tier)
    // Real end-of-season rule: tiers are re-banded by world rank, so the zone
    // is "ranked inside another tier's band", not a fixed top/bottom three.
    const move = seasonEndTierMove(team.leagueTier, team.worldRanking, worldSize)
    const isPromotionZone = move === "up"
    const isRelegationZone = move === "down"

    return (
        <div
            role="row"
            tabIndex={0}
            onClick={() => onSelect(team)}
            onKeyDown={e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelect(team) } }}
            aria-label={`${team.name}, world rank ${team.worldRanking}. Open roster`}
            className={cn(
                "group grid h-14 cursor-pointer items-center border-b border-line px-4 outline-none transition-colors hover:bg-hover focus-visible:bg-hover",
                GRID,
                isPlayerTeam && "bg-gold/[0.06] shadow-[inset_2px_0_0_var(--gold)]",
            )}
        >
            {/* Rank */}
            <div className="flex items-baseline gap-1.5">
                <span className={cn("font-display text-xl font-bold tabular-nums", team.worldRanking <= 3 ? "text-ink-1" : "text-ink-2")}>{team.worldRanking}</span>
                {/* Career-best rank — only for the player team and only once
                    they've been higher than now, so the ladder reads as a climb. */}
                {isPlayerTeam && team.peakWorldRanking && team.peakWorldRanking < team.worldRanking && (
                    <span className="text-[11px] tabular-nums text-ink-3" title="Career-best ranking">best {team.peakWorldRanking}</span>
                )}
            </div>

            {/* Team */}
            <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded bg-raised">
                    <TeamLogoImage src={team.logoPath} alt="" size={30} team={team} />
                </div>
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="truncate text-[15px] font-semibold text-ink-1 group-hover:text-gold">{team.name}</span>
                        {/* Analyst "Data Entry" talent (scout_info) reveals opponent playstyle. */}
                        {revealPlaystyle && !isPlayerTeam && team.playstyle && team.playstyle !== "default" && (
                            <span className="shrink-0 rounded-sm border border-line-strong px-1.5 text-[11px] font-semibold capitalize leading-4 text-ink-2" title="Revealed by your Analyst's Data Entry talent">
                                {team.playstyle}
                            </span>
                        )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3">
                        <CountryFlag country={teamFlag} showName={false} size={14} />
                        <span>{tierStyle.label}</span>
                    </div>
                </div>
            </div>

            {/* League */}
            <div><TierTag tier={team.leagueTier} /></div>

            {/* Elo */}
            <div className="text-right font-display text-lg font-bold tabular-nums text-ink-1">{team.elo || 1000}</div>

            {/* OVR */}
            <div className="flex justify-end"><RatingChip value={team.avgRating} size="sm" /></div>

            {/* Form */}
            <div className="flex items-center justify-center gap-1">
                {(team.recentForm || []).length > 0 ? (
                    team.recentForm.map((result: string, i: number) => (
                        <span
                            // Stable key: index + value, since form is a small fixed-order list.
                            key={`${i}-${result}`}
                            className={cn("flex h-5 w-5 items-center justify-center rounded-sm text-[11px] font-bold", result === "W" ? "bg-positive/15 text-positive" : "bg-negative/15 text-negative")}
                        >
                            {result}
                        </span>
                    ))
                ) : (
                    <span className="text-xs text-ink-3">—</span>
                )}
            </div>

            {/* Division position */}
            <div className="text-right text-xs tabular-nums">
                <span className="text-ink-2">{posInTier ? `${ordinal(posInTier)} of ${tierSize}` : "—"}</span>
                {isPromotionZone && <span className="ml-1.5 inline-flex items-center text-positive" title="Promotion zone"><ArrowUp size={12} aria-label="Promotion zone" /></span>}
                {isRelegationZone && <span className="ml-1.5 inline-flex items-center text-negative" title="Relegation zone"><ArrowDown size={12} aria-label="Relegation zone" /></span>}
            </div>

            <div className="flex justify-end text-ink-3 group-hover:text-ink-1" aria-hidden="true"><ChevronRight size={16} /></div>
        </div>
    )
})

type VirtualizedRankingsListProps = {
    displayTeams: any[]
    playerTeamId: string | null | undefined
    revealPlaystyle: boolean
    posInTierByTeamId: Map<string, { posInTier: number; tierSize: number }>
    teamFlagByTeamId: Map<string, string>
    worldSize: number
    onSelectTeam: (team: any) => void
}

const VirtualizedRankingsList = React.memo(function VirtualizedRankingsList({
    displayTeams,
    playerTeamId,
    revealPlaystyle,
    posInTierByTeamId,
    teamFlagByTeamId,
    worldSize,
    onSelectTeam,
}: VirtualizedRankingsListProps) {
    const parentRef = useRef<HTMLDivElement | null>(null)
    // 56 px matches the row class (`h-14`) so the scroll height matches the layout.
    const rowVirtualizer = useVirtualizer({
        count: displayTeams.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 56,
        overscan: 8,
    })

    return (
        <Panel padded={false} className="overflow-hidden">
            {/* Header */}
            <div className={cn("grid h-9 items-center border-b border-line bg-raised px-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3", GRID)} role="row">
                <div>Rank</div>
                <div>Team</div>
                <div>League</div>
                <div className="flex items-center justify-end gap-1">Elo <HelpTooltip content={StatExplanations.elo} size={11} /></div>
                <div className="text-right">OVR</div>
                <div className="text-center">Last 5</div>
                <div className="text-right">Division</div>
                <div />
            </div>

            {/* Scroll container + virtualized rows. Height follows the window. */}
            <div ref={parentRef} className="h-[calc(100dvh-420px)] min-h-[420px] overflow-y-auto [scrollbar-width:thin]">
                <div style={{ height: rowVirtualizer.getTotalSize(), width: "100%", position: "relative" }}>
                    {rowVirtualizer.getVirtualItems().map(v => {
                        const team = displayTeams[v.index]
                        if (!team) return null
                        const posMeta = posInTierByTeamId.get(team.id)
                        return (
                            <div
                                key={team.id}
                                style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${v.start}px)` }}
                            >
                                <RankingsRow
                                    team={team}
                                    posInTier={posMeta?.posInTier ?? 0}
                                    tierSize={posMeta?.tierSize ?? 0}
                                    worldSize={worldSize}
                                    teamFlag={teamFlagByTeamId.get(team.id) ?? "un"}
                                    isPlayerTeam={team.id === playerTeamId}
                                    revealPlaystyle={revealPlaystyle}
                                    onSelect={onSelectTeam}
                                />
                            </div>
                        )
                    })}
                </div>
            </div>
        </Panel>
    )
})

export default function RankingsPage() {
    return (
        <ErrorBoundary section="Rankings">
            <RankingsPageInner />
        </ErrorBoundary>
    )
}

function RankingsPageInner() {
    const { teams, playerTeamId, players, staff, currentWeek, isPlayerScouted, completedMatches, circuitPoints } = useGameStore(useShallow(state => ({
        teams: state.teams,
        playerTeamId: state.playerTeamId,
        players: state.players,
        staff: state.staff,
        currentWeek: state.currentWeek,
        isPlayerScouted: state.isPlayerScouted,
        completedMatches: state.completedMatches,
        circuitPoints: state.circuitPoints,
    })))

    // Analyst "Data Entry" talent (scout_info) reveals opponent playstyle.
    // Any analyst on the player team with the talent unlocked is enough.
    const revealPlaystyle = useMemo(() => {
        if (!playerTeamId) return false
        return staff.some(s =>
            s.teamId === playerTeamId &&
            s.role === "analyst" &&
            (s.unlockedTalentIds || []).some(id => id === "analyst_basics")
        )
    }, [staff, playerTeamId])
    const viewCareerId = useGameStore(state => state.saveId)
    const [searchTerm, setSearchTerm] = useRouteViewState(viewCareerId, "rankings:search", "")
    const debouncedSearch = useDebounce(searchTerm, 300)
    const [activeTab, setActiveTab] = useRouteViewState<"WORLD" | "S_TIER" | "A_TIER" | "B_TIER" | "C_TIER" | "TROPHIES" | "CIRCUIT">(viewCareerId, "rankings:tab", "WORLD")
    const [selectedTeam, setSelectedTeam] = useState<any | null>(null)
    const teamDialogRef = useFocusTrap(!!selectedTeam, () => setSelectedTeam(null))

    const playerTeam = useMemo(() => teams.find(t => t.id === playerTeamId), [teams, playerTeamId])

    // Build an O(1) player-id → player index once per `players` change. Used
    // below to replace the `players.find(p => p.id === id)` loop that
    // previously ran O(roster × players) per row per render.
    const playerById = useMemo(() => {
        const map = new Map<string, typeof players[number]>()
        for (const p of players) map.set(p.id, p)
        return map
    }, [players])

    // Precompute recent form per team once (instead of filtering the full
    // completedMatches array for every row on every render).
    const recentFormByTeamId = useMemo(() => {
        const byTeam = new Map<string, string[]>()
        // completedMatches sorted desc by week (cheap fallback when it isn't).
        const sorted = [...completedMatches].sort((a, b) => b.week - a.week)
        for (const m of sorted) {
            const homeId = m.homeTeamId
            const awayId = m.awayTeamId
            const homeList = byTeam.get(homeId)
            if (!homeList) byTeam.set(homeId, [m.result.homeScore > m.result.awayScore ? "W" : "L"])
            else if (homeList.length < 5) homeList.push(m.result.homeScore > m.result.awayScore ? "W" : "L")
            const awayList = byTeam.get(awayId)
            if (!awayList) byTeam.set(awayId, [m.result.awayScore > m.result.homeScore ? "W" : "L"])
            else if (awayList.length < 5) awayList.push(m.result.awayScore > m.result.homeScore ? "W" : "L")
        }
        return byTeam
    }, [completedMatches])

    // Calculate rankings based on Elo (Phase 19). Uses `playerById` for O(1)
    // roster lookup and `recentFormByTeamId` for O(1) form lookup.
    const rankedTeams = useMemo(() => {
        return [...teams]
            // Match the engine's tiebreaker (LeagueEngine.refreshWorldRankings:
            // elo → reputation → numeric id) so the displayed rank is
            // deterministic and consistent with team.worldRanking used elsewhere
            // — an Elo-only sort left equal-Elo teams in arbitrary order.
            .sort((a, b) => {
                if ((b.elo || 1000) !== (a.elo || 1000)) return (b.elo || 1000) - (a.elo || 1000)
                if ((b.reputation || 0) !== (a.reputation || 0)) return (b.reputation || 0) - (a.reputation || 0)
                const aNum = parseInt(a.id.replace(/\D/g, ''), 10) || 0
                const bNum = parseInt(b.id.replace(/\D/g, ''), 10) || 0
                return aNum - bNum
            })
            .map((team, index) => {
                const worldRanking = index + 1
                const tier = calculateTeamTier(worldRanking)

                // Calculate team overall rating via O(1) playerById lookups.
                let ratingSum = 0
                let ratingCount = 0
                for (const id of team.rosterIds) {
                    const player = playerById.get(id)
                    if (!player) continue
                    ratingSum += evaluatePlayer(player).overallRating
                    ratingCount++
                }
                const avgRating = ratingCount > 0 ? Math.round(ratingSum / ratingCount) : 0

                const recentForm = recentFormByTeamId.get(team.id) ?? []

                return {
                    ...team,
                    worldRanking,
                    tier,
                    avgRating,
                    recentForm,
                }
            })
    }, [teams, playerById, recentFormByTeamId])

    // Precompute:
    //   - teamsByLeagueTier: O(1) tier-filtered list + per-tier counts
    //   - posInTierByTeamId:  O(1) "which position is team X within its tier?"
    //   - teamFlagByTeamId:   O(1) majority-region flag (replaces the
    //     getTeamFlag(rosterIds, players) scan that previously ran per row
    //     with O(roster × players) cost).
    // Single O(rankedTeams) pass per data change replaces an O(rankedTeams²)
    // inline computation on every render.
    const rankingMeta = useMemo(() => {
        const teamsByLeagueTier: Record<LeagueTier, typeof rankedTeams> = {
            S_TIER: [],
            A_TIER: [],
            B_TIER: [],
            C_TIER: [],
        }
        for (const t of rankedTeams) {
            const tier = t.leagueTier as LeagueTier
            if (teamsByLeagueTier[tier]) teamsByLeagueTier[tier].push(t)
        }
        const posInTierByTeamId = new Map<string, { posInTier: number; tierSize: number }>()
        for (const tier of Object.keys(teamsByLeagueTier) as LeagueTier[]) {
            const list = teamsByLeagueTier[tier]
            list.forEach((t, i) => posInTierByTeamId.set(t.id, { posInTier: i + 1, tierSize: list.length }))
        }
        const teamFlagByTeamId = new Map<string, string>()
        for (const t of rankedTeams) {
            teamFlagByTeamId.set(t.id, getTeamFlag(t.rosterIds, players as any))
        }
        return {
            teamsByLeagueTier,
            posInTierByTeamId,
            teamFlagByTeamId,
            counts: {
                S_TIER: teamsByLeagueTier.S_TIER.length,
                A_TIER: teamsByLeagueTier.A_TIER.length,
                B_TIER: teamsByLeagueTier.B_TIER.length,
                C_TIER: teamsByLeagueTier.C_TIER.length,
            },
        }
    }, [rankedTeams, players])

    const leagueTierCounts = rankingMeta.counts

    // Filter teams for display
    const displayTeams = useMemo(() => {
        let filtered: typeof rankedTeams = rankedTeams

        // Apply league tier filter
        if (activeTab === "S_TIER" || activeTab === "A_TIER" || activeTab === "B_TIER" || activeTab === "C_TIER") {
            filtered = rankingMeta.teamsByLeagueTier[activeTab as LeagueTier]
        }

        // Apply search filter
        if (debouncedSearch) {
            const q = debouncedSearch.toLowerCase()
            filtered = filtered.filter(t => t.name.toLowerCase().includes(q))
        }

        return filtered
    }, [rankedTeams, rankingMeta, activeTab, debouncedSearch])

    // Season info
    const seasonInfo = useMemo(() => ({
        season: LeagueEngine.getCurrentSeason(currentWeek || 1),
        weeksRemaining: LeagueEngine.getWeeksRemainingInSeason(currentWeek || 1),
        isSeasonEnd: LeagueEngine.isSeasonEnd(currentWeek || 1),
    }), [currentWeek])

    // Circuit Points leaderboard
    const circuitLeaderboard = useMemo(() => {
        if (!circuitPoints) return []
        return CircuitPointsManager.getLeaderboard(circuitPoints, 50).map(entry => ({
            ...entry,
            team: teams.find(t => t.id === entry.teamId)
        })).filter(e => e.team)
    }, [circuitPoints, teams])

    // Player team's league position
    const playerLeaguePosition = useMemo(() => {
        if (!playerTeamId) return null
        const team = rankedTeams.find(t => t.id === playerTeamId)
        if (!team) return null

        const tierTeams = rankedTeams.filter(t => t.leagueTier === team.leagueTier)
        const positionInTier = tierTeams.findIndex(t => t.id === playerTeamId) + 1

        return {
            worldRank: team.worldRanking,
            tier: team.leagueTier,
            positionInTier,
            totalInTier: tierTeams.length,
            isPromotionZone: seasonEndTierMove(team.leagueTier, team.worldRanking, rankedTeams.length) === "up",
            isRelegationZone: seasonEndTierMove(team.leagueTier, team.worldRanking, rankedTeams.length) === "down",
            elo: team.elo,
        }
    }, [rankedTeams, playerTeamId])

    const title = activeTab === "TROPHIES" ? "Trophy room"
        : activeTab === "CIRCUIT" ? "Circuit points"
            : activeTab === "WORLD" ? "World rankings"
                : `${TIER_DISPLAY[activeTab as LeagueTier]?.label} division`
    const subtitle = activeTab === "TROPHIES" ? "Every title your organisation has won."
        : activeTab === "CIRCUIT" ? "Points from tournament placements decide invites to the biggest events."
            : `Ordered by Elo from match results; ties go to reputation. ${seasonInfo.weeksRemaining} weeks until the season ends: the top three of each lower division go up, the bottom three of each higher one go down.`

    return (
        <div className="mx-auto max-w-[1600px] space-y-6 pb-16">
            <ScreenHeader
                eyebrow={`Season ${seasonInfo.season} · Competition`}
                title={title}
                subtitle={subtitle}
                aside={playerLeaguePosition && (
                    <KpiStrip>
                        <Kpi label="World rank" value={`#${playerLeaguePosition.worldRank}`} />
                        <Kpi
                            label={`${TIER_DISPLAY[playerLeaguePosition.tier as LeagueTier]?.label ?? "League"} position`}
                            value={<>{playerLeaguePosition.positionInTier}<span className="text-ink-3">/{playerLeaguePosition.totalInTier}</span></>}
                            hint={playerLeaguePosition.isPromotionZone ? <span className="text-positive">Promotion zone</span> : playerLeaguePosition.isRelegationZone ? <span className="text-negative">Relegation zone</span> : undefined}
                        />
                        <Kpi label="Elo" value={playerLeaguePosition.elo || 1000} />
                    </KpiStrip>
                )}
            />

            <div className="flex flex-wrap items-end justify-between gap-4">
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
                    <TabsList>
                        <TabsTrigger value="WORLD">World <span className="tabular-nums text-ink-3">{rankedTeams.length}</span></TabsTrigger>
                        {(["S_TIER", "A_TIER", "B_TIER", "C_TIER"] as const).filter(tier => leagueTierCounts[tier] > 0 || activeTab === tier).map(tier => (
                            <TabsTrigger key={tier} value={tier}>{TIER_DISPLAY[tier].label} <span className="tabular-nums text-ink-3">{leagueTierCounts[tier]}</span></TabsTrigger>
                        ))}
                        <TabsTrigger value="CIRCUIT">Circuit points</TabsTrigger>
                        <TabsTrigger value="TROPHIES">Trophies</TabsTrigger>
                    </TabsList>
                </Tabs>
                {activeTab !== "TROPHIES" && activeTab !== "CIRCUIT" && (
                    <div className="relative w-full max-w-[320px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" size={15} />
                        <Input
                            placeholder="Search teams"
                            aria-label="Search teams"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="h-9 pl-9 text-sm"
                        />
                    </div>
                )}
            </div>

            {activeTab !== "TROPHIES" && activeTab !== "CIRCUIT" ? (
                rankedTeams.length === 0 ? (
                    <Panel>
                        <div className="space-y-3">
                            {Array.from({ length: 6 }).map((_, i) => <PlayerCardSkeleton key={i} />)}
                        </div>
                    </Panel>
                ) : displayTeams.length === 0 ? (
                    <EmptyState
                        icon={Search}
                        title="No teams match your search"
                        description={debouncedSearch ? `No team named "${debouncedSearch}". Try a different query.` : "Adjust the filter to see results."}
                        action={debouncedSearch ? { label: "Clear search", onClick: () => setSearchTerm("") } : undefined}
                    />
                ) : (
                    <VirtualizedRankingsList
                        displayTeams={displayTeams}
                        playerTeamId={playerTeamId}
                        revealPlaystyle={revealPlaystyle}
                        posInTierByTeamId={rankingMeta.posInTierByTeamId}
                        teamFlagByTeamId={rankingMeta.teamFlagByTeamId}
                        worldSize={rankedTeams.length}
                        onSelectTeam={setSelectedTeam}
                    />
                )
            ) : activeTab === "TROPHIES" ? (
                playerTeam?.trophies && playerTeam.trophies.length > 0 ? (
                    <Panel title="Titles" padded={false} actions={<span className="text-xs tabular-nums text-ink-3">{playerTeam.trophies.length}</span>}>
                        <table data-slot="table" className="w-full border-collapse text-left">
                            <thead data-slot="table-header">
                                <tr className="border-b border-line">
                                    <th data-slot="table-head" className="w-12 pl-4"><span className="sr-only">Trophy</span></th>
                                    <th data-slot="table-head">Tournament</th>
                                    <th data-slot="table-head" className="px-3">Tier</th>
                                    <th data-slot="table-head" className="pr-4 text-right">Won</th>
                                </tr>
                            </thead>
                            <tbody>
                                {playerTeam.trophies.map((trophy: any, idx: number) => (
                                    <tr key={`${trophy.tournamentId}_${idx}`} data-slot="table-row" className="h-11 border-b border-line last:border-b-0">
                                        <td className="pl-4"><Image src={trophyArtFor(trophyArtKind(trophy)).src} alt="" aria-hidden="true" width={28} height={28} className="h-7 w-7 object-contain" /></td>
                                        <td className="text-sm font-semibold text-ink-1">{trophy.tournamentName}</td>
                                        <td className="px-3"><TierTag tier={trophy.tier} /></td>
                                        <td className="pr-4 text-right text-sm tabular-nums text-ink-2">Week {trophy.week}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </Panel>
                ) : (
                    <EmptyState icon={Award} title="No titles yet" description="Win tournaments to fill your trophy room." />
                )
            ) : (
                <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                    <Panel title="Circuit leaderboard" padded={false}>
                        <table data-slot="table" className="w-full border-collapse text-left">
                            <thead data-slot="table-header">
                                <tr className="border-b border-line">
                                    <th data-slot="table-head" className="w-16 pl-4">Rank</th>
                                    <th data-slot="table-head">Team</th>
                                    <th data-slot="table-head" className="px-3 text-right">Points</th>
                                    <th data-slot="table-head" className="px-3 text-right">Events</th>
                                    <th data-slot="table-head" className="pr-4 text-right">Best finish</th>
                                </tr>
                            </thead>
                            <tbody>
                                {circuitLeaderboard.length > 0 ? circuitLeaderboard.map((entry: any, idx: number) => {
                                    const team = entry.team
                                    const bestResult = entry.results?.reduce((best: any, r: any) =>
                                        !best || r.placement < best.placement ? r : best, null)
                                    const own = team?.id === playerTeamId
                                    return (
                                        <tr key={entry.teamId} data-slot="table-row" className={cn("h-11 border-b border-line last:border-b-0", own && "bg-gold/[0.06] shadow-[inset_2px_0_0_var(--gold)]")}>
                                            <td className="pl-4 font-display text-lg font-bold tabular-nums text-ink-2">{idx + 1}</td>
                                            <td>
                                                <span className="flex items-center gap-2.5">
                                                    <TeamLogoImage src={team?.logoPath} alt="" size={22} team={team} />
                                                    <span className="text-sm font-semibold text-ink-1">{team?.name || "Unknown"}</span>
                                                </span>
                                            </td>
                                            <td className="px-3 text-right font-display text-lg font-bold tabular-nums text-ink-1">{entry.points.toLocaleString("en-US")}</td>
                                            <td className="px-3 text-right text-sm tabular-nums text-ink-2">{entry.results?.length || 0}</td>
                                            <td className="pr-4 text-right text-sm">
                                                {bestResult ? (
                                                    <span className="text-ink-2"><span className={cn("font-semibold tabular-nums", bestResult.placement === 1 ? "text-gold" : "text-ink-1")}>{ordinal(bestResult.placement)}</span> <span className="text-ink-3">· {bestResult.tournamentName}</span></span>
                                                ) : <span className="text-ink-3">—</span>}
                                            </td>
                                        </tr>
                                    )
                                }) : (
                                    <tr>
                                        <td colSpan={5} className="p-6">
                                            <EmptyState icon={Award} title="No circuit points awarded yet" description="Teams earn circuit points by placing in tournaments." framed={false} />
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </Panel>
                    <Panel title="Points by placement" padded={false}>
                        <table data-slot="table" className="w-full border-collapse text-left">
                            <thead data-slot="table-header">
                                <tr className="border-b border-line">
                                    <th data-slot="table-head" className="pl-4">Tier</th>
                                    <th data-slot="table-head" className="px-3 text-right">1st</th>
                                    <th data-slot="table-head" className="px-3 text-right">2nd</th>
                                    <th data-slot="table-head" className="pr-4 text-right">Places paid</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(["S_TIER", "A_TIER", "B_TIER", "C_TIER"] as const).map(tier => {
                                    const table = CIRCUIT_POINTS[tier] as Record<number, number>
                                    return (
                                        <tr key={tier} className="h-10 border-b border-line last:border-b-0">
                                            <td className="pl-4"><TierTag tier={tier} /></td>
                                            <td className="px-3 text-right font-display text-lg font-bold tabular-nums text-ink-1">{table[1].toLocaleString("en-US")}</td>
                                            <td className="px-3 text-right text-sm tabular-nums text-ink-2">{table[2].toLocaleString("en-US")}</td>
                                            <td className="pr-4 text-right text-sm tabular-nums text-ink-2">{Object.keys(table).length}</td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                        <p className="border-t border-line px-4 py-2.5 text-xs text-ink-3">Qualifiers award event slots, not points.</p>
                    </Panel>
                </div>
            )}

            {/* Team Detail Modal */}
            <AnimatePresence>
                {selectedTeam && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4" onClick={() => setSelectedTeam(null)}>
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 8 }}
                            transition={{ duration: 0.15 }}
                            onClick={(e) => e.stopPropagation()}
                            ref={teamDialogRef} tabIndex={-1}
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="modal-title-team-detail"
                            className="flex max-h-[min(85vh,calc(100dvh-2rem))] w-full max-w-2xl flex-col rounded-[10px] border border-line-strong bg-panel"
                        >
                            {/* Modal Header */}
                            <div className="flex shrink-0 items-center justify-between border-b border-line p-5">
                                <div className="flex items-center gap-4">
                                    <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border border-line bg-raised">
                                        <TeamLogoImage src={selectedTeam.logoPath} alt="" size={44} team={selectedTeam} />
                                    </div>
                                    <div>
                                        <h2 id="modal-title-team-detail" className="font-display text-3xl font-bold uppercase leading-none text-ink-1">{selectedTeam.name}</h2>
                                        <div className="mt-1.5 flex items-center gap-2 text-xs text-ink-3">
                                            <span className="font-semibold text-ink-2">World #{selectedTeam.worldRanking}</span>
                                            <span aria-hidden="true">·</span>
                                            <span>{getTierStyle(selectedTeam.tier).label}</span>
                                            <span aria-hidden="true">·</span>
                                            <CountryFlag country={selectedTeam.region} showName={true} size={14} />
                                        </div>
                                    </div>
                                </div>
                                <Link href={`/team/${encodeURIComponent(selectedTeam.id)}`} className="ml-auto mr-2 rounded px-2.5 py-1.5 text-xs font-semibold text-ink-2 transition-colors hover:bg-hover hover:text-gold">Club page</Link>
                                <button onClick={() => setSelectedTeam(null)} aria-label="Close team details" className="rounded p-2 text-ink-3 transition-colors hover:bg-hover hover:text-ink-1">
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Roster */}
                            <div className="overflow-y-auto">
                                <table data-slot="table" className="w-full border-collapse text-left">
                                    <thead data-slot="table-header">
                                        <tr className="border-b border-line">
                                            <th data-slot="table-head" className="pl-5">Player</th>
                                            <th data-slot="table-head" className="px-3">Role</th>
                                            <th data-slot="table-head" className="pr-5 text-right">OVR</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selectedTeam.rosterIds.map((id: string) => {
                                            const player = playerById.get(id)
                                            if (!player) return null
                                            const ev = evaluatePlayer(player)
                                            // Fog of war: exact only if scouted or own team.
                                            const isScouted = isPlayerScouted(player.id) || selectedTeam.id === playerTeamId
                                            return (
                                                <tr key={id} data-slot="table-row" className="h-12 border-b border-line last:border-b-0">
                                                    <td className="py-1.5 pl-5">
                                                        <span className="flex items-center gap-3">
                                                            <span className="h-9 w-9 shrink-0 overflow-hidden rounded bg-raised">
                                                                <PlayerPortrait src={player.portraitPath} seed={player.id} alt={player.nickname} size={36} variant="card" />
                                                            </span>
                                                            <CountryFlag country={player.nationality} size={14} />
                                                            <PlayerLink id={player.id} className="text-sm font-semibold text-ink-1">{player.nickname}</PlayerLink>
                                                        </span>
                                                    </td>
                                                    <td className="px-3"><RoleTag role={(player.role || "Rifler").split(",")[0]} /></td>
                                                    <td className="pr-5 text-right">
                                                        {isScouted
                                                            ? <RatingChip value={ev.overallRating} size="sm" />
                                                            : <span className="text-sm tabular-nums text-ink-3" title="Scout this player to see the exact rating">{Math.max(0, ev.overallRating - 15)}–{Math.min(99, ev.overallRating + 15)}</span>}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    )
}
