"use client"

import React, { useMemo, useState } from "react"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Trophy, Search, ChevronUp, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { PlayerPortrait } from "@/components/ui/asset-images"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { getFPLPlayerTypeLabel, FPL_CONSTANTS } from "@/types/fpl"
import { formatCurrency } from "@/lib/utils-extended"
import { ScreenHeader } from "@/src/components/ui/ScreenHeader"
import { Kpi, KpiStrip } from "@/src/components/ui/Kpi"
import { Panel } from "@/src/components/ui/Panel"
import { EmptyState } from "@/src/components/ui/EmptyState"

export default function FPLPage() {
    const { players, playerTeamId, teams, currentWeek, fplData } = useGameStore(useShallow(state => ({
        players: state.players,
        playerTeamId: state.playerTeamId,
        teams: state.teams,
        currentWeek: state.currentWeek,
        fplData: state.fplData,
    })))

    const [searchTerm, setSearchTerm] = useState("")
    const [activeTab, setActiveTab] = useState("fpl")

    const playerTeam = useMemo(() => teams.find(t => t.id === playerTeamId), [teams, playerTeamId])
    const myRosterIds = useMemo(() => playerTeam?.rosterIds || [], [playerTeam?.rosterIds])

    // Get non-pro player metadata lookup
    const nonProLookup = useMemo(() => {
        if (!fplData?.nonProPlayers) return new Map()
        return new Map(fplData.nonProPlayers.map(np => [np.playerId, np]))
    }, [fplData?.nonProPlayers])

    // Index players by id (O(1) lookup) and players by team via roster index.
    // Previously each standings row did `players.find()` + `teams.find(...includes())`
    // — O(standings × (players + teams × roster)). On a 200-player FPL this was
    // a serious hit on every render of the page.
    const playersById = useMemo(() => new Map(players.map(p => [p.id, p])), [players])
    const teamByRosterPlayerId = useMemo(() => {
        const m = new Map<string, typeof teams[number]>()
        for (const t of teams) {
            for (const pid of t.rosterIds || []) m.set(pid, t)
        }
        return m
    }, [teams])

    // Get FPL standings with player details
    const fplStandings = useMemo(() => {
        if (!fplData?.fplStandings) return []

        return fplData.fplStandings
            .map(standing => {
                const player = playersById.get(standing.playerId)
                const stats = fplData.playerStats[standing.playerId]
                const team = teamByRosterPlayerId.get(standing.playerId)
                const nonProMeta = nonProLookup.get(standing.playerId)
                return player && stats ? { player, stats, team, standing, nonProMeta } : null
            })
            .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
            .filter(entry => {
                if (!searchTerm) return true
                const q = searchTerm.toLowerCase()
                return entry.player.nickname.toLowerCase().includes(q) ||
                    entry.player.name.toLowerCase().includes(q)
            })
    }, [fplData, playersById, teamByRosterPlayerId, nonProLookup, searchTerm])

    // Get FPL-C standings with player details
    const fplCStandings = useMemo(() => {
        if (!fplData?.fplCStandings) return []

        return fplData.fplCStandings
            .map(standing => {
                const player = playersById.get(standing.playerId)
                const stats = fplData.playerStats[standing.playerId]
                const team = teamByRosterPlayerId.get(standing.playerId)
                const nonProMeta = nonProLookup.get(standing.playerId)
                return player && stats ? { player, stats, team, standing, nonProMeta } : null
            })
            .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
            .filter(entry => {
                if (!searchTerm) return true
                const q = searchTerm.toLowerCase()
                return entry.player.nickname.toLowerCase().includes(q) ||
                    entry.player.name.toLowerCase().includes(q)
            })
    }, [fplData, playersById, teamByRosterPlayerId, nonProLookup, searchTerm])

    // Get season leaderboard
    const seasonLeaderboard = useMemo(() => {
        if (!fplData?.currentSeason?.leaderboard) return []

        return fplData.currentSeason.leaderboard.map(entry => {
            const player = playersById.get(entry.playerId)
            const stats = fplData.playerStats[entry.playerId]
            const team = teamByRosterPlayerId.get(entry.playerId)
            return player && stats ? { player, stats, team, points: entry.points, winRate: entry.winRate } : null
        }).filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    }, [fplData, playersById, teamByRosterPlayerId])

    // My players' FPL rankings
    const myPlayersInFPL = useMemo(() => {
        return fplStandings.filter(entry => myRosterIds.includes(entry.player.id))
    }, [fplStandings, myRosterIds])

    const myPlayersInFPLC = useMemo(() => {
        return fplCStandings.filter(entry => myRosterIds.includes(entry.player.id))
    }, [fplCStandings, myRosterIds])

    // Hall of Champions: aggregate championship wins and earnings from all players
    const hallOfChampions = useMemo(() => {
        if (!fplData?.playerStats) return []
        return Object.values(fplData.playerStats)
            .filter(s => (s.fplChampionships || 0) > 0)
            .sort((a, b) => (b.fplChampionships || 0) - (a.fplChampionships || 0) || (b.totalFPLEarnings || 0) - (a.totalFPLEarnings || 0))
            .slice(0, 10)
            .map(stats => {
                const player = playersById.get(stats.playerId)
                return player ? { player, stats } : null
            })
            .filter((e): e is NonNullable<typeof e> => e !== null)
    }, [fplData?.playerStats, playersById])

    if (!fplData) {
        return (
            <div className="mx-auto max-w-[1600px] space-y-6 pb-16">
                <ScreenHeader eyebrow="Competition" title="FPL" subtitle="The Fantasy Player League ranks every pro by individual results across the season." />
                <EmptyState icon={Trophy} title="FPL season not started" description="Tracking starts after your first game week. Advance time to get going." />
            </div>
        )
    }

    const season = fplData.currentSeason
    const weeksRemaining = Math.max(0, season.endWeek - currentWeek + 1)
    const isOffSeason = !!(fplData.offSeasonEndWeek && currentWeek <= fplData.offSeasonEndWeek)
    const offSeasonWeeksLeft = isOffSeason ? fplData.offSeasonEndWeek! - currentWeek + 1 : 0

    const ratingTone = (r: number) => r >= 1.15 ? "text-positive" : r < 0.85 ? "text-ink-3" : "text-ink-1"
    const rankCell = (rank: number) => (
        <span className={cn("font-display text-lg font-bold tabular-nums", rank <= 3 ? "text-ink-1" : "text-ink-3")}>{rank}</span>
    )

    // Render standings table with zone indicators
    const renderStandingsTable = (
        standings: typeof fplStandings,
        isChallenger: boolean
    ) => (
        <table data-slot="table" className="w-full border-collapse text-left">
            <thead data-slot="table-header">
                <tr className="border-b border-line">
                    <th data-slot="table-head" className="w-16 pl-4">#</th>
                    <th data-slot="table-head">Player</th>
                    <th data-slot="table-head" className="px-3">Team</th>
                    <th data-slot="table-head" className="px-3 text-right">Points</th>
                    <th data-slot="table-head" className="px-3 text-right">W</th>
                    <th data-slot="table-head" className="px-3 text-right">L</th>
                    <th data-slot="table-head" className="px-3 text-right">Rating</th>
                    <th data-slot="table-head" className="px-3 text-right">Elo</th>
                    <th data-slot="table-head" className="pr-4 text-right">Zone</th>
                </tr>
            </thead>
            <tbody>
                {standings.slice(0, 100).map((entry) => {
                    const isMyPlayer = myRosterIds.includes(entry.player.id)
                    const isInZone = isChallenger ? entry.standing.isInPromotionZone : entry.standing.isInRelegationZone
                    return (
                        <tr
                            key={entry.player.id}
                            data-slot="table-row"
                            className={cn("h-12 border-b border-line last:border-b-0", isMyPlayer && "bg-gold/[0.06] shadow-[inset_2px_0_0_var(--gold)]")}
                        >
                            <td className="pl-4">{rankCell(entry.standing.rank)}</td>
                            <td className="py-1.5 pr-3">
                                <Link href={`/player/${entry.player.id}`} className="group flex min-w-0 items-center gap-3">
                                    <span className="h-9 w-9 shrink-0 overflow-hidden rounded bg-raised">
                                        <PlayerPortrait src={entry.player.portraitPath} seed={entry.player.id} alt={entry.player.nickname} size={36} />
                                    </span>
                                    <CountryFlag country={entry.player.nationality} showName={false} size={14} />
                                    <span className="truncate text-sm font-semibold text-ink-1 group-hover:text-gold">{entry.player.nickname}</span>
                                    {entry.nonProMeta && (
                                        <span className="shrink-0 rounded-sm border border-line-strong px-1.5 text-[11px] font-semibold leading-4 text-ink-2">
                                            {getFPLPlayerTypeLabel(entry.nonProMeta.playerType)}
                                        </span>
                                    )}
                                </Link>
                            </td>
                            <td className="px-3 text-sm text-ink-2">{entry.team?.name || <span className="text-ink-3">Free agent</span>}</td>
                            <td className="px-3 text-right font-display text-lg font-bold tabular-nums text-ink-1">{entry.standing.points}</td>
                            <td className="px-3 text-right text-sm tabular-nums text-ink-1">{entry.standing.wins}</td>
                            <td className="px-3 text-right text-sm tabular-nums text-ink-2">{entry.standing.losses}</td>
                            <td className={cn("px-3 text-right text-sm font-semibold tabular-nums", ratingTone(entry.standing.avgRating))}>{entry.standing.avgRating.toFixed(2)}</td>
                            <td className="px-3 text-right text-sm tabular-nums text-ink-3">{entry.stats.fplElo}</td>
                            <td className="pr-4 text-right">
                                {isInZone && (isChallenger
                                    ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-positive"><ChevronUp size={13} aria-hidden="true" /> Promotion</span>
                                    : <span className="inline-flex items-center gap-1 text-xs font-semibold text-negative"><ChevronDown size={13} aria-hidden="true" /> Relegation</span>)}
                            </td>
                        </tr>
                    )
                })}
            </tbody>
        </table>
    )

    const searchBox = (
        <div className="relative w-full max-w-[320px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" size={15} />
            <Input placeholder="Search players" aria-label="Search players" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="h-9 pl-9 text-sm" />
        </div>
    )

    return (
        <div className="mx-auto max-w-[1600px] space-y-6 pb-16">
            <ScreenHeader
                eyebrow={`Season ${season.seasonNumber} · Competition`}
                title="FPL"
                subtitle="Every pro ranked by individual results. It runs on its own: the top three earn player XP and prize money, not club money."
                aside={
                    <KpiStrip>
                        <Kpi label="FPL Pro pool" value={formatCurrency(FPL_CONSTANTS.PRIZE_POOL_BASE, "$", false)} />
                        <Kpi label="Challenger pool" value={formatCurrency(FPL_CONSTANTS.PRIZE_POOL_FPL_C, "$", false)} />
                        {isOffSeason
                            ? <Kpi label="Off-season" value={`${offSeasonWeeksLeft} wk`} hint={`until season ${season.seasonNumber}`} />
                            : <Kpi label="Weeks left" value={weeksRemaining} />}
                    </KpiStrip>
                }
            />

            {/* Your players */}
            {(myPlayersInFPL.length > 0 || myPlayersInFPLC.length > 0) && (
                <Panel title="Your players" padded={false} actions={<span className="text-xs text-ink-3">{myPlayersInFPL.length} in Pro · {myPlayersInFPLC.length} in Challenger</span>}>
                    <ul className="grid grid-cols-1 divide-line md:grid-cols-5 md:divide-x">
                        {[...myPlayersInFPL, ...myPlayersInFPLC].slice(0, 5).map(entry => (
                            <li key={entry.player.id}>
                                <Link href={`/player/${entry.player.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-hover">
                                    <span className="h-10 w-10 shrink-0 overflow-hidden rounded bg-raised">
                                        <PlayerPortrait src={entry.player.portraitPath} seed={entry.player.id} alt={entry.player.nickname} size={40} />
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block truncate text-sm font-semibold text-ink-1">{entry.player.nickname}</span>
                                        <span className="block text-xs tabular-nums text-ink-3">
                                            #{entry.standing.rank} in {entry.stats.fplTier === "FPL" ? "Pro" : entry.stats.fplTier === "FPL_C" ? "Challenger" : entry.stats.fplTier} · {entry.stats.fplElo} Elo
                                        </span>
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </Panel>
            )}

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <TabsList>
                        <TabsTrigger value="fpl">FPL Pro <span className="tabular-nums text-ink-3">{fplStandings.length}</span></TabsTrigger>
                        <TabsTrigger value="fpl-c">FPL Challenger <span className="tabular-nums text-ink-3">{fplCStandings.length}</span></TabsTrigger>
                        <TabsTrigger value="season">Season</TabsTrigger>
                        <TabsTrigger value="history">History</TabsTrigger>
                    </TabsList>
                    {(activeTab === "fpl" || activeTab === "fpl-c") && searchBox}
                </div>

                <TabsContent value="fpl" className="mt-4">
                    <Panel title="FPL Pro" padded={false} actions={<span className="text-xs text-ink-3">Bottom {FPL_CONSTANTS.RELEGATION_SLOTS} non-pros drop to Challenger at season end</span>}>
                        {renderStandingsTable(fplStandings, false)}
                    </Panel>
                </TabsContent>

                <TabsContent value="fpl-c" className="mt-4">
                    <Panel title="FPL Challenger" padded={false} actions={<span className="text-xs text-ink-3">Top {FPL_CONSTANTS.PROMOTION_SLOTS} go up to FPL Pro at season end</span>}>
                        {renderStandingsTable(fplCStandings, true)}
                    </Panel>
                </TabsContent>

                {/* Season Leaderboard Tab */}
                <TabsContent value="season" className="mt-4">
                    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                        <Panel title={`Season ${season.seasonNumber} leaderboard`} padded={false} actions={<span className="text-xs tabular-nums text-ink-3">Week {Math.max(1, currentWeek - season.startWeek + 1)} of {FPL_CONSTANTS.SEASON_LENGTH}</span>}>
                            <table data-slot="table" className="w-full border-collapse text-left">
                                <thead data-slot="table-header">
                                    <tr className="border-b border-line">
                                        <th data-slot="table-head" className="w-16 pl-4">#</th>
                                        <th data-slot="table-head">Player</th>
                                        <th data-slot="table-head" className="px-3 text-right">Points</th>
                                        <th data-slot="table-head" className="px-3 text-right">Matches</th>
                                        <th data-slot="table-head" className="pr-4 text-right">Win rate</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {seasonLeaderboard.slice(0, 50).map((entry, idx) => (
                                        <tr key={entry.player.id} data-slot="table-row" className={cn("h-11 border-b border-line last:border-b-0", myRosterIds.includes(entry.player.id) && "bg-gold/[0.06] shadow-[inset_2px_0_0_var(--gold)]")}>
                                            <td className="pl-4">{rankCell(idx + 1)}</td>
                                            <td>
                                                <span className="flex items-center gap-3">
                                                    <span className="h-8 w-8 overflow-hidden rounded bg-raised">
                                                        <PlayerPortrait src={entry.player.portraitPath} seed={entry.player.id} alt={entry.player.nickname} size={32} />
                                                    </span>
                                                    <span className="text-sm font-semibold text-ink-1">{entry.player.nickname}</span>
                                                </span>
                                            </td>
                                            <td className="px-3 text-right font-display text-lg font-bold tabular-nums text-ink-1">{entry.points}</td>
                                            <td className="px-3 text-right text-sm tabular-nums text-ink-2">{entry.stats.matchesPlayed}</td>
                                            <td className={cn("pr-4 text-right text-sm font-semibold tabular-nums", entry.winRate >= 60 ? "text-positive" : entry.winRate >= 50 ? "text-ink-1" : "text-ink-3")}>{entry.winRate}%</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Panel>
                        <Panel title="Season rewards" padded={false}>
                            <table data-slot="table" className="w-full border-collapse text-left">
                                <tbody>
                                    {[1, 2, 3].map(place => {
                                        const entry = seasonLeaderboard[place - 1]
                                        const reward = season.rewards[place - 1]
                                        return (
                                            <tr key={place} className="h-14 border-b border-line last:border-b-0">
                                                <td className="w-12 pl-4">{place === 1 ? <Trophy size={16} className="text-gold" aria-label="1st" /> : <span className="font-display text-lg font-bold text-ink-2">{place}</span>}</td>
                                                <td>
                                                    <span className="block text-sm font-semibold text-ink-1">{entry?.player.nickname ?? "—"}</span>
                                                    {entry && <span className="block text-xs tabular-nums text-ink-3">{entry.points} pts so far</span>}
                                                </td>
                                                <td className="pr-4 text-right">
                                                    <span className="block font-display text-lg font-bold tabular-nums text-ink-1">{reward ? formatCurrency(reward.prize, "$", false) : "—"}</span>
                                                    {reward?.xpBonus != null && <span className="block text-xs tabular-nums text-ink-3">+{reward.xpBonus} XP</span>}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </Panel>
                    </div>
                </TabsContent>

                {/* History Tab */}
                <TabsContent value="history" className="mt-4 space-y-4">
                    {hallOfChampions.length > 0 && (
                        <Panel title="Hall of champions" padded={false}>
                            <table data-slot="table" className="w-full border-collapse text-left">
                                <thead data-slot="table-header">
                                    <tr className="border-b border-line">
                                        <th data-slot="table-head" className="pl-4">Player</th>
                                        <th data-slot="table-head" className="px-3 text-right">Titles</th>
                                        <th data-slot="table-head" className="pr-4 text-right">FPL earnings</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {hallOfChampions.map(entry => (
                                        <tr key={entry.player.id} data-slot="table-row" className="h-11 border-b border-line last:border-b-0">
                                            <td className="pl-4">
                                                <Link href={`/player/${entry.player.id}`} className="flex items-center gap-3 hover:text-gold">
                                                    <span className="h-8 w-8 overflow-hidden rounded bg-raised">
                                                        <PlayerPortrait src={entry.player.portraitPath} seed={entry.player.id} alt={entry.player.nickname} size={32} />
                                                    </span>
                                                    <span className="text-sm font-semibold text-ink-1">{entry.player.nickname}</span>
                                                </Link>
                                            </td>
                                            <td className="px-3 text-right">
                                                <span className="inline-flex items-center gap-1 text-sm font-semibold tabular-nums text-ink-1"><Trophy size={13} className="text-gold" aria-hidden="true" />{entry.stats.fplChampionships || 0}</span>
                                            </td>
                                            <td className="pr-4 text-right text-sm tabular-nums text-ink-2">{formatCurrency(entry.stats.totalFPLEarnings || 0, "$", false)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Panel>
                    )}

                    {fplData.seasonHistory.length === 0 ? (
                        <EmptyState icon={Trophy} title="No completed seasons yet" description={`The first champion is crowned at the end of season ${season.seasonNumber}.`} />
                    ) : (
                        [...fplData.seasonHistory].reverse().map(pastSeason => {
                            const champion = playersById.get(pastSeason.champion ?? "")
                            const seasonTierChanges = fplData.tierChanges?.filter(tc => tc.seasonNumber === pastSeason.seasonNumber) || []
                            const promotions = seasonTierChanges.filter(tc => tc.reason === 'PROMOTION')
                            const demotions = seasonTierChanges.filter(tc => tc.reason === 'DEMOTION')
                            return (
                                <Panel
                                    key={pastSeason.id}
                                    title={`Season ${pastSeason.seasonNumber}`}
                                    actions={<span className="text-xs tabular-nums text-ink-3">Weeks {pastSeason.startWeek}–{pastSeason.endWeek} · pool {formatCurrency(pastSeason.prizePool, "$", false)}{champion ? ` · champion ${champion.nickname}` : ""}</span>}
                                    padded={false}
                                >
                                    {pastSeason.leaderboard && pastSeason.leaderboard.length > 0 && (
                                        <table data-slot="table" className="w-full border-collapse text-left">
                                            <thead data-slot="table-header">
                                                <tr className="border-b border-line">
                                                    <th data-slot="table-head" className="w-16 pl-4">#</th>
                                                    <th data-slot="table-head">Player</th>
                                                    <th data-slot="table-head" className="px-3 text-right">Points</th>
                                                    <th data-slot="table-head" className="px-3 text-right">Matches</th>
                                                    <th data-slot="table-head" className="px-3 text-right">Win rate</th>
                                                    <th data-slot="table-head" className="pr-4 text-right">Prize</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {pastSeason.leaderboard.slice(0, 10).map((entry, idx) => {
                                                    const p = playersById.get(entry.playerId)
                                                    const isMyPlayer = myRosterIds.includes(entry.playerId)
                                                    const prize = idx < pastSeason.rewards.length ? pastSeason.rewards[idx].prize : 0
                                                    return (
                                                        <tr key={entry.playerId} data-slot="table-row" className={cn("h-10 border-b border-line last:border-b-0", isMyPlayer && "bg-gold/[0.06] shadow-[inset_2px_0_0_var(--gold)]")}>
                                                            <td className="pl-4">{idx === 0 ? <Trophy size={15} className="text-gold" aria-label="Champion" /> : rankCell(idx + 1)}</td>
                                                            <td className="text-sm font-semibold text-ink-1">{p ? <Link href={`/player/${p.id}`} className="hover:text-gold">{p.nickname}</Link> : <span className="text-ink-3">Unknown player</span>}</td>
                                                            <td className="px-3 text-right text-sm font-semibold tabular-nums text-ink-1">{entry.points}</td>
                                                            <td className="px-3 text-right text-sm tabular-nums text-ink-2">{entry.matchesPlayed}</td>
                                                            <td className="px-3 text-right text-sm tabular-nums text-ink-2">{entry.winRate}%</td>
                                                            <td className="pr-4 text-right text-sm tabular-nums text-ink-1">{prize > 0 ? formatCurrency(prize, "$", false) : <span className="text-ink-3">—</span>}</td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    )}
                                    {(promotions.length > 0 || demotions.length > 0) && (
                                        <div className="grid grid-cols-2 divide-x divide-line border-t border-line text-sm">
                                            <div className="px-4 py-3">
                                                <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-positive"><ChevronUp size={12} aria-hidden="true" /> Promoted to FPL Pro</p>
                                                <p className="text-ink-2">{promotions.map(tc => tc.playerName).join(", ") || "—"}</p>
                                            </div>
                                            <div className="px-4 py-3">
                                                <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-negative"><ChevronDown size={12} aria-hidden="true" /> Relegated to Challenger</p>
                                                <p className="text-ink-2">{demotions.map(tc => tc.playerName).join(", ") || "—"}</p>
                                            </div>
                                        </div>
                                    )}
                                </Panel>
                            )
                        })
                    )}
                </TabsContent>
            </Tabs>
        </div>
    )
}
