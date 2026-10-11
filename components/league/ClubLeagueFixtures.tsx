"use client"

import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import type { LeagueDivision, TeamSaveData } from "@/engine/save-types"
import { ordinal } from "@/engine/season/regional-league"
import { formatGameCalendarDate, gameCalendarDate } from "@/lib/game-calendar"
import { cn } from "@/lib/utils"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { Panel } from "@/src/components/ui/Panel"
import { FormGuide } from "@/src/components/ui/FixtureBanner"
import { clubFixtures } from "./league-view"

export interface ClubLeagueFixturesProps {
    division: LeagueDivision
    teamId: string
    teamsById: Map<string, TeamSaveData>
    /** Scheduled match days by fixture id (the league fixture stores only the week). */
    dayById: Map<string, number | undefined>
    /** Fixture ids with a saved match record (result screen available). */
    completedIds: Set<string>
    gameStartDate?: string | null
    limit?: number
}

const linkClass = "inline-flex items-center gap-1 text-xs font-semibold text-ink-3 hover:text-ink-1"

/** The managed club's next league fixtures and latest league results. */
export function ClubLeagueFixtures({ division, teamId, teamsById, dayById, completedIds, gameStartDate, limit = 5 }: ClubLeagueFixturesProps) {
    const { upcoming, played } = clubFixtures(division, teamId)
    const position = new Map(division.standings.map((s, i) => [s.teamId, i + 1]))
    const when = (week: number, day: number | undefined) => {
        const wk = `Wk ${((week - 1) % 52) + 1}`
        if (!gameStartDate || day === undefined) return wk
        return `${formatGameCalendarDate(gameCalendarDate(gameStartDate, week, day), { weekday: "short", month: "short", day: "numeric" })}`
    }
    const next = upcoming[0]

    return (
        <>
            <Panel
                title="Your fixtures"
                actions={next && dayById.has(next.fixture.id)
                    ? <Link href={`/match/${next.fixture.id}/tactics`} className={linkClass}>Match prep <ArrowUpRight size={12} /></Link>
                    : <Link href="/schedule" className={linkClass}>Calendar <ArrowUpRight size={12} /></Link>}
                padded={false}
            >
                {upcoming.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-ink-3">{division.completed ? "The split is over." : "No league fixtures left."}</p>
                ) : (
                    <ul className="divide-y divide-line">
                        {upcoming.slice(0, limit).map(c => {
                            const opp = teamsById.get(c.opponentId)
                            return (
                                <li key={c.fixture.id} className="flex h-11 items-center gap-3 px-4">
                                    <span className="w-24 shrink-0 text-xs tabular-nums text-ink-3">{when(c.fixture.week, dayById.get(c.fixture.id))}</span>
                                    <span className="w-6 shrink-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3" title={c.home ? "Home" : "Away"}>{c.home ? "H" : "A"}</span>
                                    <TeamLogoDisplay team={opp} size={22} className="shrink-0" />
                                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-1">{opp?.name ?? "TBD"}</span>
                                    <span className="shrink-0 text-xs tabular-nums text-ink-3">{position.has(c.opponentId) ? ordinal(position.get(c.opponentId)!) : ""}</span>
                                </li>
                            )
                        })}
                    </ul>
                )}
                {upcoming.length > limit && <p className="border-t border-line px-4 py-2 text-xs text-ink-3">+{upcoming.length - limit} more this split</p>}
            </Panel>

            <Panel title="League results" padded={false}>
                {played.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-ink-3">No league results yet. The table reads results when the week closes.</p>
                ) : (
                    <ul className="divide-y divide-line">
                        {played.slice(0, limit).map(c => {
                            const opp = teamsById.get(c.opponentId)
                            const body = (
                                <>
                                    <FormGuide results={[c.won ? "W" : "L"]} />
                                    <TeamLogoDisplay team={opp} size={22} className="shrink-0" />
                                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-1">{opp?.name ?? "Unknown"}</span>
                                    <span className="shrink-0 text-xs text-ink-3">R{c.fixture.round} · {c.home ? "H" : "A"}</span>
                                    <span className={cn("w-14 shrink-0 text-right font-display text-lg font-bold tabular-nums", c.won ? "text-ink-1" : "text-ink-2")}>{c.score}</span>
                                </>
                            )
                            return (
                                <li key={c.fixture.id}>
                                    {completedIds.has(c.fixture.id)
                                        ? <Link href={`/match/${c.fixture.id}/result`} className="flex h-11 items-center gap-3 px-4 transition-colors hover:bg-raised">{body}</Link>
                                        : <div className="flex h-11 items-center gap-3 px-4">{body}</div>}
                                </li>
                            )
                        })}
                    </ul>
                )}
            </Panel>
        </>
    )
}
