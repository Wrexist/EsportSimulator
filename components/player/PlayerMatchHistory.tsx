"use client"

import { useMemo, memo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { cn } from "@/lib/utils"

export interface RecordedPerformance {
    matchId: string
    week: number
    opponentId?: string
    opponentName: string
    event: string
    won: boolean
    ownScore: number
    oppScore: number
    kills: number
    deaths: number
    assists: number
    adr: number
    rating: number
}

/**
 * Matches with a recorded performance line for this player (newest first).
 * Side comes from the match-time lineup when the result stored one; current
 * roster membership is only a fallback for older saves.
 */
export function usePlayerPerformances(playerId: string): RecordedPerformance[] {
    const { completedMatches, teams } = useGameStore(useShallow(state => ({
        completedMatches: state.completedMatches,
        teams: state.teams,
    })))
    return useMemo(() => {
        const teamById = new Map(teams.map(t => [t.id, t]))
        const rows: RecordedPerformance[] = []
        for (const match of completedMatches) {
            const stats = match.result?.playerStats?.[playerId]
            if (!stats) continue
            const lineups = (match.result as { lineups?: Record<string, string[]> }).lineups
            const onHome = lineups?.[match.homeTeamId]
                ? lineups[match.homeTeamId].includes(playerId)
                : !!teamById.get(match.homeTeamId)?.rosterIds.includes(playerId)
            const ownScore = onHome ? match.result.homeScore : match.result.awayScore
            const oppScore = onHome ? match.result.awayScore : match.result.homeScore
            const opponentId = onHome ? match.awayTeamId : match.homeTeamId
            const event = match.isScrim ? "Scrim" : match.stage || (match.tournamentId && match.tournamentId !== "SCRIM" ? "Tournament" : "Match")
            rows.push({
                matchId: match.id,
                week: match.week,
                opponentId,
                opponentName: teamById.get(opponentId)?.name ?? "Unknown",
                event,
                won: ownScore > oppScore,
                ownScore,
                oppScore,
                kills: stats.kills ?? 0,
                deaths: stats.deaths ?? 0,
                assists: stats.assists ?? 0,
                adr: stats.adr ?? 0,
                rating: stats.rating ?? 0,
            })
        }
        return rows.sort((a, b) => b.week - a.week)
    }, [completedMatches, teams, playerId])
}

interface PlayerMatchHistoryProps {
    playerId: string
    limit?: number
}

/** PlayerMatchHistory — dense table of recorded performances, rows open the match report. */
export const PlayerMatchHistory = memo(function PlayerMatchHistory({ playerId, limit = 10 }: PlayerMatchHistoryProps) {
    const getDateForWeek = useGameStore(state => state.getDateForWeek)
    const router = useRouter()
    const rows = usePlayerPerformances(playerId)
    const shown = rows.slice(0, limit)

    if (shown.length === 0) {
        return (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-5">
                <p className="text-sm text-ink-3">No recorded matches yet. His next official match or scrim starts this record.</p>
                <Link href="/tournaments" className="text-sm font-semibold text-ink-2 hover:text-gold">Find an event</Link>
            </div>
        )
    }

    return (
        <div className="overflow-x-auto">
            <table data-slot="table" className="w-full min-w-[720px] border-collapse text-left">
                <thead data-slot="table-header">
                    <tr className="border-b border-line">
                        <th data-slot="table-head" className="pl-4">Week</th>
                        <th data-slot="table-head" className="px-3">Opponent</th>
                        <th data-slot="table-head" className="px-3">Event</th>
                        <th data-slot="table-head" className="px-3 text-center">Result</th>
                        <th data-slot="table-head" className="px-3 text-right">K–D–A</th>
                        <th data-slot="table-head" className="px-3 text-right">ADR</th>
                        <th data-slot="table-head" className="pr-4 text-right">Rating</th>
                    </tr>
                </thead>
                <tbody>
                    {shown.map(r => (
                        <tr
                            key={r.matchId}
                            data-slot="table-row"
                            tabIndex={0}
                            onClick={() => router.push(`/match/${r.matchId}/result`)}
                            onKeyDown={e => { if (e.key === "Enter") router.push(`/match/${r.matchId}/result`) }}
                            aria-label={`Week ${r.week} versus ${r.opponentName}, open match report`}
                            className="h-11 cursor-pointer border-b border-line outline-none focus-visible:bg-hover"
                        >
                            <td className="pl-4 text-sm tabular-nums text-ink-2">
                                W{r.week}
                                <span className="ml-2 text-xs text-ink-3">{format(getDateForWeek(r.week), "MMM d")}</span>
                            </td>
                            <td className="max-w-[220px] truncate px-3 text-sm font-semibold text-ink-1">{r.opponentName}</td>
                            <td className="px-3 text-sm text-ink-3">{r.event}</td>
                            <td className="px-3 text-center text-sm tabular-nums">
                                <span className={cn("mr-2 font-semibold", r.won ? "text-positive" : "text-ink-3")}>{r.won ? "W" : "L"}</span>
                                <span className="text-ink-2">{r.ownScore}–{r.oppScore}</span>
                            </td>
                            <td className="px-3 text-right text-sm tabular-nums text-ink-2">{r.kills}–{r.deaths}–{r.assists}</td>
                            <td className="px-3 text-right text-sm tabular-nums text-ink-2">{Math.round(r.adr)}</td>
                            <td className={cn("pr-4 text-right text-sm font-semibold tabular-nums", r.rating >= 1.2 ? "text-positive" : "text-ink-1")}>{r.rating.toFixed(2)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {rows.length > shown.length && (
                <p className="border-t border-line px-4 py-2.5 text-xs text-ink-3">Showing the latest {shown.length} of {rows.length} recorded matches.</p>
            )}
        </div>
    )
})

export default PlayerMatchHistory
