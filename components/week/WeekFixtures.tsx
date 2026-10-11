"use client"

import { useMemo } from "react"
import Link from "next/link"
import { ArrowUpRight, Swords } from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { getActivePlayersByRosterOrder } from "@/lib/live-match-builders"
import { pendingPlayableMatch } from "@/lib/playable-match"
import { gameCalendarDate, formatGameCalendarDate } from "@/lib/game-calendar"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { Panel } from "@/src/components/ui/Panel"
import { RatingChip } from "@/src/components/ui/RatingChip"
import { matchFatigue } from "./week-preview"

type MatchRow = {
    id: string
    week: number
    day?: number
    homeTeamId: string
    awayTeamId: string
    tournamentId: string | null
    stage: string | null
    format: string
    isScrim?: boolean
    result?: { winnerId?: string | null; homeScore: number; awayScore: number }
}

/**
 * Week plan → this week's matches (official fixtures and booked scrims) with
 * the opponent and the way into match prep.
 */
export function WeekFixtures() {
    const s = useGameStore(useShallow(st => ({
        playerTeamId: st.playerTeamId,
        scheduledMatches: st.scheduledMatches,
        completedMatches: st.completedMatches,
        currentWeek: st.currentWeek,
        currentDay: st.currentDay,
        timeMode: st.timeMode,
        teams: st.teams,
        players: st.players,
        tournaments: st.tournaments,
        gameStartDate: st.gameStartDate,
    })))
    const me = s.playerTeamId

    const { rows, next } = useMemo(() => {
        const mine = (m: MatchRow) => m.homeTeamId === me || m.awayTeamId === me
        const done = new Map<string, MatchRow>()
        for (const m of s.completedMatches as MatchRow[]) if (m.week === s.currentWeek && mine(m)) done.set(m.id, m)
        const open = (s.scheduledMatches as MatchRow[]).filter(m => m.week === s.currentWeek && mine(m) && !done.has(m.id))
        const all = [...done.values(), ...open].sort((a, b) => (a.day ?? 6) - (b.day ?? 6))
        const later = (s.scheduledMatches as MatchRow[]).filter(m => m.week > s.currentWeek && mine(m))
            .sort((a, b) => (a.week - b.week) || ((a.day ?? 6) - (b.day ?? 6)))[0]
        return { rows: all, next: later }
    }, [s.completedMatches, s.scheduledMatches, s.currentWeek, me])

    const playableId = useMemo(() => pendingPlayableMatch({
        playerTeamId: me, scheduledMatches: s.scheduledMatches, currentWeek: s.currentWeek, currentDay: s.currentDay,
        timeMode: s.timeMode, teams: s.teams, players: s.players,
    })?.id ?? null, [me, s.scheduledMatches, s.currentWeek, s.currentDay, s.timeMode, s.teams, s.players])

    const teamById = useMemo(() => new Map(s.teams.map(t => [t.id, t])), [s.teams])
    const playerById = useMemo(() => new Map(s.players.map(p => [p.id, p])), [s.players])
    const ovrOf = (teamId: string) => {
        const team = teamById.get(teamId)
        if (!team) return null
        const five = getActivePlayersByRosterOrder(team, s.players, playerById)
            .map(p => playerById.get(p.id))
            .filter((p): p is NonNullable<typeof p> => !!p)
        if (five.length === 0) return null
        return Math.round(five.reduce((sum, p) => sum + evaluatePlayer(p).overallRating, 0) / five.length)
    }
    const competition = (m: MatchRow) => {
        if (m.isScrim) return "Scrim"
        const t = s.tournaments.find(x => x.id === m.tournamentId)
        return [t?.shortName || t?.name || "Match", m.stage].filter(Boolean).join(" · ")
    }
    const when = (m: MatchRow) => formatGameCalendarDate(gameCalendarDate(s.gameStartDate, m.week, m.day ?? 6), { weekday: "short", month: "short", day: "numeric" })

    return (
        <Panel
            title="Matches this week"
            actions={<Link href="/schedule" className="inline-flex items-center gap-1 text-xs font-semibold text-ink-3 hover:text-ink-1">Calendar <ArrowUpRight size={12} /></Link>}
            padded={false}
        >
            {rows.length === 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
                    <p className="text-sm text-ink-3">
                        No match this week.{next && <> Next: week {((next.week - 1) % 52) + 1} vs <span className="font-semibold text-ink-1">{teamById.get(next.homeTeamId === me ? next.awayTeamId : next.homeTeamId)?.name ?? "TBD"}</span>.</>}
                    </p>
                    {next && <Button asChild size="sm" variant="outline" className="h-8 px-3 text-xs"><Link href={`/match/${next.id}/tactics`}>Scout opponent</Link></Button>}
                </div>
            ) : (
                <ul className="divide-y divide-line">
                    {rows.map(m => {
                        const oppId = m.homeTeamId === me ? m.awayTeamId : m.homeTeamId
                        const opp = teamById.get(oppId)
                        const ovr = ovrOf(oppId)
                        const played = !!m.result
                        const won = played && m.result?.winnerId === me
                        const score = played ? (m.homeTeamId === me ? `${m.result!.homeScore}–${m.result!.awayScore}` : `${m.result!.awayScore}–${m.result!.homeScore}`) : null
                        const playable = m.id === playableId
                        return (
                            <li key={m.id} className="flex items-center gap-4 px-4 py-3">
                                <div className="w-24 shrink-0">
                                    <p className="text-sm font-semibold text-ink-1">{when(m)}</p>
                                    <p className="text-xs text-ink-3">{m.format}{played ? "" : ` · +${matchFatigue(m.format)} fatigue`}</p>
                                </div>
                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-line bg-raised">
                                    <TeamLogoDisplay team={opp} size={32} />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[15px] font-semibold text-ink-1">{opp?.name ?? "To be decided"}</p>
                                    <p className="truncate text-xs text-ink-3">{competition(m)}{opp?.worldRanking ? ` · World #${opp.worldRanking}` : ""}</p>
                                </div>
                                {ovr != null && <span className="hidden items-center gap-2 sm:flex"><span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">OVR</span><RatingChip value={ovr} size="sm" /></span>}
                                <div className="w-36 shrink-0 text-right">
                                    {played ? (
                                        <Link href={`/match/${m.id}/result`} className="inline-flex items-center gap-2 text-sm font-semibold hover:underline">
                                            <span className={cn(won ? "text-positive" : "text-negative")}>{won ? "W" : "L"}</span>
                                            <span className="font-display text-lg tabular-nums text-ink-1">{score}</span>
                                        </Link>
                                    ) : (
                                        <Button asChild size="sm" variant={playable ? "default" : "outline"} className="h-8 gap-1.5 px-3 text-xs">
                                            <Link href={`/match/${m.id}/tactics`}><Swords size={13} /> {playable ? "Play match" : "Match prep"}</Link>
                                        </Button>
                                    )}
                                </div>
                            </li>
                        )
                    })}
                </ul>
            )}
        </Panel>
    )
}
