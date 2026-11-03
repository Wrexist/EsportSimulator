"use client"
import { ordinalLabel, t } from "@/lib/i18n"

import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import type { LeagueDivision, TeamSaveData } from "@/engine/save-types"
import { formatGameCalendarDate, gameCalendarDate } from "@/lib/game-calendar"
import { cn } from "@/lib/utils"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { Panel } from "@/src/components/ui/Panel"
import { FormGuide } from "@/src/components/ui/FixtureBanner"
import { clubFixtures } from "./league-view"
import { TeamLink } from "@/components/ui/EntityLink"

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
    // Table places only once a round is in (before that the order is the draw).
    const position = new Map(division.standings.some(s => s.played > 0) ? division.standings.map((s, i) => [s.teamId, i + 1]) : [])
    const when = (week: number, day: number | undefined) => {
        const wk = t("common.weekShort", { n: ((week - 1) % 52) + 1 })
        if (!gameStartDate || day === undefined) return wk
        return `${formatGameCalendarDate(gameCalendarDate(gameStartDate, week, day), { weekday: "short", month: "short", day: "numeric" })}`
    }
    const next = upcoming[0]

    return (
        <>
            <Panel
                title={t("lgp.fixtures")}
                actions={next && dayById.has(next.fixture.id)
                    ? <Link href={`/match/${next.fixture.id}/tactics`} className={linkClass}>{t("lgp.matchPrep")} <ArrowUpRight size={12} /></Link>
                    : <Link href="/schedule" className={linkClass}>{t("sch.title")} <ArrowUpRight size={12} /></Link>}
                padded={false}
            >
                {upcoming.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-ink-3">{division.completed ? t("lgp.splitDone") : t("lgp.noFixtures")}</p>
                ) : (
                    <ul className="divide-y divide-line">
                        {upcoming.slice(0, limit).map(c => {
                            const opp = teamsById.get(c.opponentId)
                            return (
                                <li key={c.fixture.id} className="flex h-11 items-center gap-3 px-4">
                                    <span className="w-24 shrink-0 text-xs tabular-nums text-ink-3">{when(c.fixture.week, dayById.get(c.fixture.id))}</span>
                                    <span className="w-6 shrink-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3" title={c.home ? t("lgp.home") : t("lgp.away")}>{c.home ? t("leagueCard.home") : t("leagueCard.away")}</span>
                                    <TeamLogoDisplay team={opp} size={22} className="shrink-0" />
                                    <TeamLink id={opp ? c.opponentId : null} className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-1">{opp?.name ?? t("common.tbd")}</TeamLink>
                                    <span className="shrink-0 text-xs tabular-nums text-ink-3">{position.has(c.opponentId) ? ordinalLabel(position.get(c.opponentId)!) : ""}</span>
                                </li>
                            )
                        })}
                    </ul>
                )}
                {upcoming.length > limit && <p className="border-t border-line px-4 py-2 text-xs text-ink-3">{t("lgp.moreSplit", { n: upcoming.length - limit })}</p>}
            </Panel>

            <Panel title={t("lgp.results")} padded={false}>
                {played.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-ink-3">{t("lgp.noResults")}</p>
                ) : (
                    <ul className="divide-y divide-line">
                        {played.slice(0, limit).map(c => {
                            const opp = teamsById.get(c.opponentId)
                            const body = (
                                <>
                                    <FormGuide results={[c.won ? "W" : "L"]} />
                                    <TeamLogoDisplay team={opp} size={22} className="shrink-0" />
                                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-1">{opp?.name ?? t("common.unknown")}</span>
                                    <span className="shrink-0 text-xs text-ink-3">{t("lgp.roundShort", { n: c.fixture.round })} · {c.home ? t("leagueCard.home") : t("leagueCard.away")}</span>
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
