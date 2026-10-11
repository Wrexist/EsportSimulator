"use client"

import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import Image from "next/image"
import Link from "next/link"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import { WEEKS_PER_YEAR } from "@/lib/constants"
import { FULL_TOURNAMENT_CALENDAR } from "@/data/tournament-calendar"
import { Panel } from "@/src/components/ui/Panel"
import { Kpi, KpiStrip } from "@/src/components/ui/Kpi"
import { ScreenHeader } from "@/src/components/ui/ScreenHeader"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { Button } from "@/components/ui/button"
import { trophyArtKind } from "@/components/squad/TrophyCabinet"
import { cn } from "@/lib/utils"
import { trophyArtFor, trophyKindForTournament } from "@/lib/trophy-art"
import { RECORD_LABEL } from "@/lib/season-review-view"
import { isMajorTournament, isOfficialMatch } from "@/engine/official-stats"
import { isLeagueMatchId, ordinal } from "@/engine/season/regional-league"
import { RECORD_KEYS, type RecordEntry, type RecordKey } from "@/engine/records-types"

const SeasonReviewReplay = dynamic(() => import("@/components/moments/season-review/SeasonReviewReplay").then(m => m.SeasonReviewReplay), { ssr: false })

const TIER_ORDER = ["S_TIER", "A_TIER", "B_TIER", "C_TIER"] as const
const TIER_LABEL: Record<string, string> = { S_TIER: "S-tier", A_TIER: "A-tier", B_TIER: "B-tier", C_TIER: "C-tier" }
const displayName = (name: string) => name.replace(/\s+\d{4}$/, "")
const weekLabel = (week: number) => `S${Math.ceil(week / WEEKS_PER_YEAR)} W${((week - 1) % WEEKS_PER_YEAR) + 1}`
const baseId = (id: string) => id.replace(/_s\d+$/, "")

export default function TrophyRoomPage() {
    const { teams, playerTeamId, players, completedMatches, gameStartDate, currentWeek, tournaments, recordBook } = useGameStore(useShallow(state => ({
        teams: state.teams,
        playerTeamId: state.playerTeamId,
        players: state.players,
        completedMatches: state.completedMatches,
        gameStartDate: state.gameStartDate,
        currentWeek: state.currentWeek,
        tournaments: state.tournaments,
        recordBook: state.recordBook,
    })))

    const team = teams.find(t => t.id === playerTeamId)
    const parsedYear = gameStartDate ? new Date(gameStartDate).getFullYear() : 2025
    const startYear = Number.isNaN(parsedYear) ? 2025 : parsedYear

    const titles = useMemo(() => {
        const byId = new Map(players.map(p => [p.id, p]))
        // Tournament MVP: recorded on the trophy (Phase 5.1), else on the event while it is kept.
        const eventMvp = new Map(tournaments.filter(t => t.mvpPlayerId).map(t => [t.id, t.mvpPlayerId!]))
        return ((team?.trophies || []) as { tournamentId?: string; tournamentName?: string; week?: number; tier?: string; mvpId?: string }[])
            .map((t, i) => {
                const cal = FULL_TOURNAMENT_CALENDAR.find(c => c.id === t.tournamentId || c.id === baseId(t.tournamentId || ""))
                const mvpId = t.mvpId ?? (t.tournamentId ? eventMvp.get(t.tournamentId) : undefined)
                const tier = t.tier || cal?.tier || "B_TIER"
                return {
                    key: `${t.tournamentId || "tr"}_${t.week || 0}_${i}`,
                    calId: cal?.id ?? null,
                    name: displayName(t.tournamentName || cal?.name || "Tournament"),
                    tier,
                    tierLabel: isLeagueMatchId(t.tournamentId) ? "League" : TIER_LABEL[tier] ?? tier,
                    art: trophyArtFor(trophyArtKind({ tournamentId: t.tournamentId ?? "", tier })),
                    major: isMajorTournament(t.tournamentId),
                    week: t.week || 0,
                    year: Math.floor(startYear + (t.week || 0) / WEEKS_PER_YEAR),
                    mvp: mvpId ? byId.get(mvpId) : undefined,
                }
            })
            .sort((a, b) => b.week - a.week)
    }, [team?.trophies, players, startYear, tournaments])

    // The cabinet: every title on the calendar, gold only where you've won it.
    const cabinet = useMemo(() => {
        const wins = new Map<string, number>()
        for (const t of titles) if (t.calId) wins.set(t.calId, (wins.get(t.calId) ?? 0) + 1)
        return FULL_TOURNAMENT_CALENDAR
            .filter(c => c.tier !== "QUALIFIER")
            .map(c => ({ id: c.id, name: displayName(c.name), tier: c.tier as string, logo: c.logoPath, art: trophyArtFor(trophyKindForTournament(c.tier, { major: isMajorTournament(c.id) })), won: wins.get(c.id) ?? 0 }))
            .sort((a, b) => TIER_ORDER.indexOf(a.tier as typeof TIER_ORDER[number]) - TIER_ORDER.indexOf(b.tier as typeof TIER_ORDER[number]) || b.won - a.won)
    }, [titles])

    const stats = useMemo(() => {
        const teamMap = new Map(teams.map(t => [t.id, t]))
        let wins = 0, losses = 0
        const opponents = new Map<string, { team: typeof teams[number]; wins: number; losses: number }>()
        for (const m of completedMatches) {
            const home = m.homeTeamId === playerTeamId
            if (!home && m.awayTeamId !== playerTeamId) continue
            if (!isOfficialMatch(m)) continue
            const won = m.result?.winnerId === playerTeamId
            if (won) wins++; else losses++
            const opp = teamMap.get(home ? m.awayTeamId : m.homeTeamId)
            if (!opp) continue
            const row = opponents.get(opp.id) ?? { team: opp, wins: 0, losses: 0 }
            if (won) row.wins++; else row.losses++
            opponents.set(opp.id, row)
        }
        const rivals = [...opponents.values()].sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses)).slice(0, 6)
        return { wins, losses, rate: wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0, rivals }
    }, [completedMatches, playerTeamId, teams])

    const majors = titles.filter(t => t.major).length
    const clubRecords = playerTeamId ? recordBook?.clubs[playerTeamId] : undefined
    const teamName = (id: string) => teams.find(t => t.id === id)?.name ?? "Former club"
    const recordLine = (key: RecordKey, r: RecordEntry) => {
        const value = key === "bestMapRating" ? r.value.toFixed(2) : key === "biggestWin" ? r.score ?? `+${r.value}` : key === "longestWinStreak" ? `${r.value} wins` : String(r.value)
        const who = r.playerName ? `${r.playerName} · ` : ""
        const when = key === "longestWinStreak" && r.fromWeek ? `${weekLabel(r.fromWeek)}–${weekLabel(r.week)}${r.endedBy ? `, ended by ${teamName(r.endedBy)}` : ", running"}` : weekLabel(r.week)
        return { value, detail: `${who}vs ${teamName(r.opponentId)}${r.map ? ` · ${r.map}` : ""} · ${when}` }
    }
    const season = Math.floor((currentWeek - 1) / WEEKS_PER_YEAR) + 1

    // Closed seasons (stored honours), newest first: each replays its season review.
    const [replaySeason, setReplaySeason] = useState<number | null>(null)
    const reviews = useMemo(() => [...(recordBook?.honours ?? [])].reverse().map(h => {
        const uc = h.userClub
        const pos = uc?.finalLeaguePosition
        return {
            season: h.season,
            club: uc ? teams.find(t => t.id === uc.teamId)?.name : undefined,
            line: [
                pos ? `${ordinal(pos.position)} in ${pos.division}` : null,
                uc ? `${uc.record.wins}–${uc.record.losses}` : null,
                uc?.trophies.length ? `${uc.trophies.length} title${uc.trophies.length === 1 ? "" : "s"}` : null,
                uc?.tierMove === "promoted" ? "promoted" : uc?.tierMove === "relegated" ? "relegated" : null,
            ].filter(Boolean).join(" · "),
            mvp: h.mvp?.name,
        }
    }), [recordBook, teams])

    return (
        <div className="mx-auto max-w-[1600px] space-y-5 pb-16">
            <ScreenHeader
                eyebrow={`Season ${season} · Legacy`}
                title="Trophy room"
                subtitle={`${team?.name ?? "Your club"} — every title on the calendar. Won ones light up.`}
                leading={team ? (
                    <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-line bg-panel">
                        <TeamLogoDisplay team={team} size={52} />
                    </div>
                ) : undefined}
                aside={
                    <KpiStrip>
                        <Kpi label="Titles" value={titles.length} valueClassName={titles.length > 0 ? "text-gold" : undefined} />
                        <Kpi label="Majors" value={majors} valueClassName={majors > 0 ? "text-gold" : undefined} />
                        <Kpi label="Record" value={<span>{stats.wins}<span className="text-ink-3">–</span>{stats.losses}</span>} hint="Recent official matches" />
                        <Kpi label="Win rate" value={`${stats.rate}%`} />
                    </KpiStrip>
                }
            />

            <Panel title="Cabinet" actions={<span className="text-xs tabular-nums text-ink-3">{cabinet.filter(c => c.won > 0).length} of {cabinet.length} won</span>}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                    {cabinet.map(c => (
                        <div
                            key={c.id}
                            className={cn(
                                "flex min-w-0 flex-col items-center rounded border px-2 pb-3 pt-4 text-center",
                                c.won > 0 ? "border-gold/50 bg-gold/5" : "border-line bg-shell",
                            )}
                        >
                            <div className={cn("relative h-16 w-16", c.won === 0 && "opacity-30 grayscale")}>
                                <Image src={c.art.src} alt={c.won > 0 ? c.art.label : ""} fill sizes="64px" className="object-contain" />
                            </div>
                            <p className={cn("mt-2 line-clamp-2 min-h-[2.5em] text-xs font-semibold leading-tight", c.won > 0 ? "text-ink-1" : "text-ink-3")}>{c.name}</p>
                            <p className="mt-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.06em] text-ink-3">
                                {c.logo && <span className="relative h-3.5 w-3.5 shrink-0"><Image src={c.logo} alt="" fill sizes="14px" className="object-contain" /></span>}
                                {TIER_LABEL[c.tier] ?? c.tier}
                            </p>
                            <p className={cn("mt-1.5 text-xs font-semibold tabular-nums", c.won > 0 ? "text-gold" : "text-ink-3")}>{c.won > 0 ? `Won ×${c.won}` : "Not won"}</p>
                        </div>
                    ))}
                </div>
            </Panel>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
                <Panel title="Title history" padded={false}>
                    {titles.length > 0 ? (
                        <table data-slot="table" className="w-full border-collapse text-left">
                            <thead data-slot="table-header">
                                <tr className="border-b border-line">
                                    <th data-slot="table-head" className="pl-4">Year</th>
                                    <th data-slot="table-head" className="px-3">Tournament</th>
                                    <th data-slot="table-head" className="px-3">Tier</th>
                                    <th data-slot="table-head" className="px-3 text-right">Week</th>
                                    <th data-slot="table-head" className="pl-3 pr-4">MVP</th>
                                </tr>
                            </thead>
                            <tbody>
                                {titles.map(t => (
                                    <tr key={t.key} data-slot="table-row" className="h-11 border-b border-line">
                                        <td className="pl-4 text-sm tabular-nums text-ink-3">{t.year}</td>
                                        <td className="px-3 text-sm font-semibold text-gold">
                                            <span className="flex items-center gap-2.5">
                                                <Image src={t.art.src} alt="" width={26} height={26} className="h-[26px] w-[26px] shrink-0 object-contain" />
                                                {t.name}
                                            </span>
                                        </td>
                                        <td className="px-3 text-xs text-ink-2">{t.tierLabel}</td>
                                        <td className="px-3 text-right text-sm tabular-nums text-ink-2">{t.week}</td>
                                        <td className="pl-3 pr-4 text-sm text-ink-1">{t.mvp ? <Link href={`/player/${t.mvp.id}`} className="hover:text-gold">{t.mvp.nickname}</Link> : <span className="text-ink-3">—</span>}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="px-4 py-6">
                            <p className="text-sm text-ink-3">No titles yet. Your first one goes here.</p>
                            <Link href="/tournaments" className="mt-2 inline-block text-sm font-semibold text-ink-2 underline underline-offset-2 hover:text-ink-1">See upcoming tournaments</Link>
                        </div>
                    )}
                </Panel>

                <div className="min-w-0 space-y-4">
                <Panel title="Season reviews" padded={false}>
                    {reviews.length > 0 ? (
                        <ul className="divide-y divide-line">
                            {reviews.map(r => (
                                <li key={r.season} className="flex items-center gap-3 px-4 py-2.5">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-ink-1">Season {r.season}{r.club ? <span className="font-normal text-ink-3"> · {r.club}</span> : null}</p>
                                        <p className="mt-0.5 truncate text-xs text-ink-3" title={r.line}>{[r.line, r.mvp ? `MVP ${r.mvp}` : null].filter(Boolean).join(" · ") || "No official results"}</p>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={() => setReplaySeason(r.season)}>Replay</Button>
                                </li>
                            ))}
                        </ul>
                    ) : <p className="px-4 py-6 text-sm text-ink-3">Each season ends with a review: your season, the awards, the team of the season and its records. Replay them here.</p>}
                </Panel>

                <Panel title="Club records" padded={false}>
                    {clubRecords && RECORD_KEYS.some(k => clubRecords[k]) ? (
                        <ul className="divide-y divide-line">
                            {RECORD_KEYS.filter(k => clubRecords[k]).map(k => {
                                const line = recordLine(k, clubRecords[k]!)
                                return (
                                    <li key={k} className="px-4 py-2.5">
                                        <div className="flex items-baseline justify-between gap-3">
                                            <span className="text-sm text-ink-3">{RECORD_LABEL[k]}</span>
                                            <span className="text-sm font-semibold tabular-nums text-ink-1">{line.value}</span>
                                        </div>
                                        <p className="mt-0.5 truncate text-xs text-ink-3" title={line.detail}>{line.detail}</p>
                                    </li>
                                )
                            })}
                        </ul>
                    ) : <p className="px-4 py-6 text-sm text-ink-3">Records start with your first official match.</p>}
                    {clubRecords?.streak && clubRecords.streak.count > 1 && (
                        <p className="border-t border-line px-4 py-2.5 text-xs text-ink-3">Current run: {clubRecords.streak.count} official wins since {weekLabel(clubRecords.streak.fromWeek)}.</p>
                    )}
                </Panel>

                <Panel title="Most-played opponents" padded={false}>
                    {stats.rivals.length > 0 ? (
                        <ul className="divide-y divide-line">
                            {stats.rivals.map(r => (
                                <li key={r.team.id} className="flex items-center gap-3 px-4 py-2.5">
                                    <TeamLogoDisplay team={r.team} size={22} />
                                    <span className="min-w-0 flex-1 truncate text-sm text-ink-1">{r.team.name}</span>
                                    <span className="text-sm tabular-nums text-ink-2">{r.wins}<span className="text-ink-3">–</span>{r.losses}</span>
                                </li>
                            ))}
                        </ul>
                    ) : <p className="px-4 py-6 text-sm text-ink-3">No matches played yet.</p>}
                </Panel>
                </div>
            </div>
            {replaySeason != null && <SeasonReviewReplay season={replaySeason} onClose={() => setReplaySeason(null)} />}
        </div>
    )
}
