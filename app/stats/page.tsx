"use client"

import React, { Fragment, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, ChevronRight } from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import {
    Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import { useGameStore } from "@/store/game-store"
import type { CompletedMatchSaveData, PlayerSaveData } from "@/engine/save-types"
import { cn } from "@/lib/utils"
import { ErrorBoundary } from "@/components/ui/error-boundary"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { PlayerPortrait } from "@/components/ui/asset-images"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TrophyCabinet } from "@/components/squad/TrophyCabinet"
import { Panel } from "@/src/components/ui/Panel"
import { Kpi, KpiStrip } from "@/src/components/ui/Kpi"
import { ScreenHeader } from "@/src/components/ui/ScreenHeader"
import { RoleTag } from "@/src/components/ui/RoleTag"
import { Sparkline } from "@/src/components/ui/Sparkline"
import { MapDataPanel } from "@/components/stats/MapDataPanel"

/** Chart styling from the v2 tokens (app/premium-ui.css custom properties). */
const AXIS = { stroke: "var(--border-subtle)", tick: { fill: "var(--text-muted)", fontSize: 11 }, axisLine: false, tickLine: false } as const
const TOOLTIP = {
    contentStyle: { background: "var(--surface-800)", border: "1px solid var(--border-strong)", borderRadius: 6, color: "var(--text-strong)", fontSize: 12 },
    labelStyle: { color: "var(--text-muted)" },
    cursor: { fill: "rgba(255,255,255,0.03)" },
}

interface PlayerLine {
    player: PlayerSaveData
    matches: number
    maps: number
    kills: number
    deaths: number
    adrSum: number
    ratingSum: number
    clutches: number
    ratings: number[]
}

function ourSide(match: CompletedMatchSaveData, teamId: string | null) {
    return match.homeTeamId === teamId
}

function won(match: CompletedMatchSaveData, teamId: string | null) {
    const home = ourSide(match, teamId)
    return home ? match.result.homeScore > match.result.awayScore : match.result.awayScore > match.result.homeScore
}

function mapScore(m: CompletedMatchSaveData["result"]["maps"][number]) {
    const home = (m as { homeScore?: number }).homeScore ?? m.finalScore?.team1 ?? 0
    const away = (m as { awayScore?: number }).awayScore ?? m.finalScore?.team2 ?? 0
    return { home, away }
}

export default function StatsPage() {
    const { players, teams, playerTeamId, completedMatches, currentWeek } = useGameStore(useShallow(state => ({
        players: state.players,
        teams: state.teams,
        playerTeamId: state.playerTeamId,
        completedMatches: state.completedMatches,
        currentWeek: state.currentWeek,
    })))
    const router = useRouter()
    const [expanded, setExpanded] = useState<string | null>(null)

    const team = useMemo(() => teams.find(t => t.id === playerTeamId), [teams, playerTeamId])
    const teamById = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams])

    const teamMatches = useMemo(() => completedMatches
        .filter(m => m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId)
        .sort((a, b) => (b.week || 0) - (a.week || 0)),
    [completedMatches, playerTeamId])

    const record = useMemo(() => {
        let w = 0, mapW = 0, mapL = 0
        for (const m of teamMatches) {
            if (won(m, playerTeamId)) w++
            const home = ourSide(m, playerTeamId)
            for (const map of m.result.maps || []) {
                const s = mapScore(map)
                const mapWon = map.winner ? map.winner === playerTeamId : home ? s.home > s.away : s.away > s.home
                if (mapWon) mapW++; else mapL++
            }
        }
        return { w, l: teamMatches.length - w, mapW, mapL, rate: teamMatches.length ? Math.round((w / teamMatches.length) * 100) : 0 }
    }, [teamMatches, playerTeamId])

    // Per-player lines from this club's matches only (oldest → newest for the trend).
    const lines = useMemo(() => {
        const byId = new Map(players.map(p => [p.id, p]))
        const roster = (team?.rosterIds || []).map(id => byId.get(id)).filter((p): p is PlayerSaveData => !!p)
        const acc = new Map<string, PlayerLine>(roster.map(p => [p.id, { player: p, matches: 0, maps: 0, kills: 0, deaths: 0, adrSum: 0, ratingSum: 0, clutches: 0, ratings: [] }]))
        for (const m of [...teamMatches].reverse()) {
            for (const [pid, st] of Object.entries(m.result.playerStats || {})) {
                const line = acc.get(pid)
                if (!line) continue
                line.matches++
                line.maps += m.result.maps?.length || 1
                line.kills += st.kills || 0
                line.deaths += st.deaths || 0
                line.adrSum += st.adr || 0
                line.ratingSum += st.rating || 0
                line.clutches += st.clutches || 0
                line.ratings.push(st.rating || 0)
            }
        }
        return [...acc.values()]
    }, [players, team, teamMatches])

    const trend = useMemo(() => teamMatches.slice(0, 12).reverse().map(m => {
        const own = (m.result.lineups?.[playerTeamId ?? ""] ?? team?.rosterIds ?? [])
        const stats = Object.entries(m.result.playerStats || {}).filter(([pid]) => own.includes(pid)).map(([, s]) => s.rating || 0)
        return { week: `W${m.week}`, rating: stats.length ? Number((stats.reduce((a, b) => a + b, 0) / stats.length).toFixed(2)) : null }
    }), [teamMatches, playerTeamId, team])

    const maps = useMemo(() => {
        const acc: Record<string, { played: number; wins: number }> = {}
        for (const m of teamMatches) {
            const home = ourSide(m, playerTeamId)
            for (const map of m.result.maps || []) {
                const key = String(map.map)
                acc[key] ??= { played: 0, wins: 0 }
                acc[key].played++
                const s = mapScore(map)
                if (map.winner ? map.winner === playerTeamId : home ? s.home > s.away : s.away > s.home) acc[key].wins++
            }
        }
        return Object.entries(acc).map(([map, d]) => ({ map, played: d.played, wins: d.wins, rate: Math.round((d.wins / d.played) * 100), record: `${d.wins}/${d.played}` }))
            .sort((a, b) => b.played - a.played || b.rate - a.rate)
    }, [teamMatches, playerTeamId])

    const rivalries = useMemo(() => [...(team?.rivalries || [])]
        .sort((a, b) => b.matchesPlayed - a.matchesPlayed)
        .map(r => ({ ...r, opponent: teamById.get(r.opponentTeamId) })), [team, teamById])

    if (!team) {
        return <div role="status" className="mx-auto max-w-[1600px] py-10 text-sm text-ink-3">Loading statistics…</div>
    }

    return (
        <ErrorBoundary section="Statistics">
            <div className="mx-auto max-w-[1600px] space-y-6 pb-16">
                <ScreenHeader
                    eyebrow={`Season ${Math.ceil(currentWeek / 52)} · Statistics`}
                    title="Statistics"
                    subtitle="Every number here comes from matches your club has played."
                    aside={
                        <KpiStrip>
                            <Kpi label="Record" value={`${record.w}–${record.l}`} hint={`${record.rate}% won`} />
                            <Kpi label="Maps" value={`${record.mapW}–${record.mapL}`} />
                            <Kpi label="World rank" value={team.worldRanking ? `#${team.worldRanking}` : "—"} />
                            <Kpi label="Elo" value={Math.round(team.elo || 1000)} />
                        </KpiStrip>
                    }
                />

                <Tabs defaultValue="players">
                    <TabsList>
                        <TabsTrigger value="players">Players</TabsTrigger>
                        <TabsTrigger value="results">Results</TabsTrigger>
                        <TabsTrigger value="trophies">Trophies</TabsTrigger>
                        <TabsTrigger value="rivalries">Rivalries</TabsTrigger>
                        <TabsTrigger value="maps">Maps</TabsTrigger>
                    </TabsList>

                    <TabsContent value="players" className="mt-3 space-y-4">
                        <Panel title="Player performance" actions={<span className="text-xs text-ink-3">Current roster · matches for {team.name}</span>} padded={false}>
                            <div className="overflow-x-auto">
                                <table data-slot="table" className="w-full min-w-[980px] border-collapse text-left">
                                    <thead data-slot="table-header">
                                        <tr className="border-b border-line">
                                            <th data-slot="table-head" className="pl-4">Player</th>
                                            <th data-slot="table-head" className="px-3">Role</th>
                                            <th data-slot="table-head" className="px-3 text-right">Matches</th>
                                            <th data-slot="table-head" className="px-3 text-right">Maps</th>
                                            <th data-slot="table-head" className="px-3 text-right">K–D</th>
                                            <th data-slot="table-head" className="px-3 text-right">K/D</th>
                                            <th data-slot="table-head" className="px-3 text-right">ADR</th>
                                            <th data-slot="table-head" className="px-3 text-right">Rating</th>
                                            <th data-slot="table-head" className="px-3 text-right">Clutches</th>
                                            <th data-slot="table-head" className="pl-6 pr-4">Last ratings</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {lines.map(l => {
                                            const has = l.matches > 0
                                            const rating = has ? l.ratingSum / l.matches : null
                                            return (
                                                <tr key={l.player.id} data-slot="table-row" tabIndex={0} onClick={() => router.push(`/player/${l.player.id}`)}
                                                    onKeyDown={e => { if (e.key === "Enter") router.push(`/player/${l.player.id}`) }}
                                                    aria-label={`${l.player.nickname}, open profile`}
                                                    className="group h-14 cursor-pointer border-b border-line outline-none focus-visible:bg-hover">
                                                    <td className="py-2 pl-4 pr-3">
                                                        <div className="flex items-center gap-3">
                                                            <span className="h-9 w-9 shrink-0 overflow-hidden rounded bg-raised"><PlayerPortrait src={l.player.portraitPath} seed={l.player.id} alt={l.player.nickname} size={36} /></span>
                                                            <span className="truncate text-[15px] font-semibold text-ink-1 group-hover:text-gold">{l.player.nickname}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-3"><RoleTag role={l.player.role} /></td>
                                                    <td className="px-3 text-right text-sm tabular-nums text-ink-2">{l.matches}</td>
                                                    <td className="px-3 text-right text-sm tabular-nums text-ink-2">{has ? l.maps : "—"}</td>
                                                    <td className="px-3 text-right text-sm tabular-nums text-ink-2">{has ? `${l.kills}–${l.deaths}` : "—"}</td>
                                                    <td className="px-3 text-right text-sm tabular-nums text-ink-1">{has ? (l.deaths ? (l.kills / l.deaths).toFixed(2) : l.kills.toFixed(2)) : "—"}</td>
                                                    <td className="px-3 text-right text-sm tabular-nums text-ink-1">{has ? Math.round(l.adrSum / l.matches) : "—"}</td>
                                                    <td className={cn("px-3 text-right text-sm font-semibold tabular-nums", rating != null && rating >= 1.2 ? "text-positive" : "text-ink-1")}>{rating != null ? rating.toFixed(2) : "—"}</td>
                                                    <td className="px-3 text-right text-sm tabular-nums text-ink-2">{has ? l.clutches : "—"}</td>
                                                    <td className="pl-6 pr-4">
                                                        {l.ratings.length > 1
                                                            ? <Sparkline values={l.ratings.slice(-8)} baseline={1} width={96} height={24} label={`${l.player.nickname} last ${Math.min(8, l.ratings.length)} ratings`} />
                                                            : <span className="text-sm text-ink-3">—</span>}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            {teamMatches.length === 0 && <p className="border-t border-line px-4 py-3 text-sm text-ink-3">No matches yet. Stats fill in after your first official match or scrim.</p>}
                        </Panel>

                        {teamMatches.length > 0 && (
                            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                                <Panel title="Team rating" actions={<span className="text-xs text-ink-3">Average player rating, last {trend.length} matches</span>}>
                                    <div className="h-[240px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={trend} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                                                <CartesianGrid stroke="var(--border-subtle)" vertical={false} />
                                                <XAxis dataKey="week" {...AXIS} />
                                                <YAxis domain={[0.6, 1.6]} {...AXIS} />
                                                <ReferenceLine y={1} stroke="var(--border-strong)" strokeDasharray="3 3" />
                                                <Tooltip {...TOOLTIP} />
                                                <Line type="monotone" dataKey="rating" name="Rating" stroke="var(--gold)" strokeWidth={2} dot={{ r: 2.5, fill: "var(--gold)", strokeWidth: 0 }} isAnimationActive={false} connectNulls />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                </Panel>
                                <Panel title="Maps" actions={<span className="text-xs text-ink-3">Win rate by map</span>}>
                                    <div className="h-[240px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={maps} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 0 }}>
                                                <CartesianGrid stroke="var(--border-subtle)" horizontal={false} />
                                                <XAxis type="number" domain={[0, 100]} unit="%" {...AXIS} />
                                                <YAxis type="category" dataKey="map" width={84} {...AXIS} tick={{ fill: "var(--text)", fontSize: 12 }} />
                                                <ReferenceLine x={50} stroke="var(--border-strong)" strokeDasharray="3 3" />
                                                <Tooltip {...TOOLTIP} formatter={(v: number, _n, item) => [`${v}% (${item?.payload?.wins}/${item?.payload?.played})`, "Won"]} />
                                                <Bar dataKey="rate" name="Win rate" fill="var(--text)" fillOpacity={0.55} radius={[0, 3, 3, 0]} barSize={14} isAnimationActive={false}>
                                                    <LabelList dataKey="record" position="right" fill="var(--text-muted)" fontSize={11} />
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </Panel>
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="results" className="mt-3">
                        <Panel title="Results" actions={<span className="text-xs text-ink-3">{teamMatches.length} played · select a row for the breakdown</span>} padded={false}>
                            {teamMatches.length === 0 ? (
                                <p className="px-4 py-5 text-sm text-ink-3">No matches played yet.</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table data-slot="table" className="w-full min-w-[900px] border-collapse text-left">
                                        <thead data-slot="table-header">
                                            <tr className="border-b border-line">
                                                <th data-slot="table-head" className="w-8 pl-4"><span className="sr-only">Expand</span></th>
                                                <th data-slot="table-head" className="px-3">Week</th>
                                                <th data-slot="table-head" className="px-3">Opponent</th>
                                                <th data-slot="table-head" className="px-3">Event</th>
                                                <th data-slot="table-head" className="px-3 text-center">Result</th>
                                                <th data-slot="table-head" className="px-3">Maps</th>
                                                <th data-slot="table-head" className="pr-4 text-right">Side</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {teamMatches.slice(0, 30).map(m => {
                                                const home = ourSide(m, playerTeamId)
                                                const opp = teamById.get(home ? m.awayTeamId : m.homeTeamId)
                                                const w = won(m, playerTeamId)
                                                const isOpen = expanded === m.id
                                                return (
                                                    <Fragment key={m.id}>
                                                        <tr data-slot="table-row" data-state={isOpen ? "selected" : undefined} tabIndex={0} aria-expanded={isOpen}
                                                            onClick={() => setExpanded(isOpen ? null : m.id)}
                                                            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(isOpen ? null : m.id) } }}
                                                            className="h-12 cursor-pointer border-b border-line outline-none focus-visible:bg-hover">
                                                            <td className="pl-4 text-ink-3">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                                                            <td className="px-3 text-sm tabular-nums text-ink-2">W{m.week}</td>
                                                            <td className="px-3">
                                                                <span className="flex items-center gap-2 text-sm font-semibold text-ink-1">
                                                                    {opp && <TeamLogoDisplay team={opp} size={20} />}{opp?.name ?? "Unknown"}
                                                                </span>
                                                            </td>
                                                            <td className="px-3 text-sm text-ink-3">{m.isScrim ? "Scrim" : m.stage || "League match"}</td>
                                                            <td className="px-3 text-center text-sm tabular-nums">
                                                                <span className={cn("mr-2 font-semibold", w ? "text-positive" : "text-ink-3")}>{w ? "W" : "L"}</span>
                                                                <span className="text-ink-1">{home ? m.result.homeScore : m.result.awayScore}–{home ? m.result.awayScore : m.result.homeScore}</span>
                                                            </td>
                                                            <td className="px-3 text-sm tabular-nums text-ink-3">
                                                                {(m.result.maps || []).map((map, i) => {
                                                                    const s = mapScore(map)
                                                                    return <span key={i} className="mr-3 whitespace-nowrap">{String(map.map)} {home ? s.home : s.away}–{home ? s.away : s.home}</span>
                                                                })}
                                                            </td>
                                                            <td className="pr-4 text-right text-sm text-ink-3">{home ? "Home" : "Away"}</td>
                                                        </tr>
                                                        {isOpen && (
                                                            <tr className="border-b border-line bg-shell">
                                                                <td colSpan={7} className="px-4 py-4">
                                                                    <MatchBreakdown match={m} teamId={playerTeamId} />
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </Fragment>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </Panel>
                    </TabsContent>

                    <TabsContent value="trophies" className="mt-3">
                        <TrophyCabinet trophies={(team.trophies || []) as never} title="Trophy cabinet" />
                    </TabsContent>

                    <TabsContent value="maps" className="mt-3">
                        <MapDataPanel />
                    </TabsContent>

                    <TabsContent value="rivalries" className="mt-3">
                        <Panel title="Rivalries" padded={false}>
                            {rivalries.length === 0 ? (
                                <p className="px-4 py-5 text-sm text-ink-3">Rivalries form after you meet the same clubs a few times.</p>
                            ) : (
                                <table data-slot="table" className="w-full border-collapse text-left">
                                    <thead data-slot="table-header">
                                        <tr className="border-b border-line">
                                            <th data-slot="table-head" className="pl-4">Opponent</th>
                                            <th data-slot="table-head" className="px-3">Intensity</th>
                                            <th data-slot="table-head" className="px-3 text-right">Played</th>
                                            <th data-slot="table-head" className="px-3 text-right">W–L</th>
                                            <th data-slot="table-head" className="px-3 text-right">Win %</th>
                                            <th data-slot="table-head" className="pr-4 text-right">Last met</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rivalries.map(r => (
                                            <tr key={r.opponentTeamId} data-slot="table-row" className="h-12 border-b border-line last:border-0">
                                                <td className="pl-4">
                                                    <span className="flex items-center gap-2 text-sm font-semibold text-ink-1">
                                                        {r.opponent && <TeamLogoDisplay team={r.opponent} size={22} />}{r.opponent?.name ?? "Unknown"}
                                                    </span>
                                                </td>
                                                <td className="px-3 text-sm capitalize text-ink-2">{r.intensity.toLowerCase()}</td>
                                                <td className="px-3 text-right text-sm tabular-nums text-ink-2">{r.matchesPlayed}</td>
                                                <td className="px-3 text-right text-sm tabular-nums text-ink-1">{r.wins}–{r.losses}</td>
                                                <td className="px-3 text-right text-sm tabular-nums text-ink-1">{r.matchesPlayed ? Math.round((r.wins / r.matchesPlayed) * 100) : 0}%</td>
                                                <td className="pr-4 text-right text-sm tabular-nums text-ink-3">W{r.lastPlayed}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </Panel>
                    </TabsContent>
                </Tabs>
            </div>
        </ErrorBoundary>
    )
}

function MatchBreakdown({ match, teamId }: { match: CompletedMatchSaveData; teamId: string | null }) {
    const firstMap = match.result.maps?.[0]
    return (
        <div className="space-y-4">
            {match.analysis ? (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                    <div className="lg:col-span-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Summary</p>
                        <p className="mt-1 text-sm text-ink-2">{match.analysis.summary}</p>
                    </div>
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Winning factor</p>
                        <p className="mt-1 text-sm text-ink-2">{match.analysis.winningFactor}</p>
                    </div>
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Losing factor</p>
                        <p className="mt-1 text-sm text-ink-2">{match.analysis.losingFactor}</p>
                    </div>
                </div>
            ) : <p className="text-sm text-ink-3">No written analysis for this match.</p>}

            {firstMap?.rounds?.length ? (
                <div>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Rounds · {String(firstMap.map)}</p>
                    <div className="flex flex-wrap gap-0.5" aria-label="Round results, first map">
                        {firstMap.rounds.map((round, i) => {
                            // The round stores the winning side and that round's side assignment.
                            const winnerId = round.winningTeamId ?? (round.winner === "ct" ? round.ctTeam : round.tTeam)
                            const weWon = winnerId === teamId
                            return (
                                <span key={i} title={`Round ${i + 1}: ${weWon ? "won" : "lost"}${round.winType ? ` (${String(round.winType).toLowerCase().replace(/_/g, " ")})` : ""}`}
                                    className={cn("h-5 w-2.5 rounded-sm", weWon ? "bg-positive/70" : "bg-hover")} />
                            )
                        })}
                    </div>
                </div>
            ) : null}
        </div>
    )
}
