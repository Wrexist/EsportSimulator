"use client"

import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import type { LeagueState, TeamSaveData } from "@/engine/save-types"
import { ordinalLabel, t } from "@/lib/i18n"
import { divisionName } from "@/lib/display-names"
import { formatGameCalendarDate, gameCalendarDate } from "@/lib/game-calendar"
import { cn } from "@/lib/utils"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { Panel } from "@/src/components/ui/Panel"
import {
    bottomLevelOf,
    clubFixtures,
    leagueTableRows,
    nextDrawLabel,
    previousSplitOutcome,
    signed,
    splitOutcomeText,
    splitProgressLabel,
    tableSituation,
} from "./league-view"

const TONE_TEXT = { positive: "text-positive", neutral: "text-ink-3", caution: "text-caution", negative: "text-negative" } as const

export interface LeagueSnapshotProps {
    league: LeagueState | undefined
    playerTeamId: string
    teamsById: Map<string, TeamSaveData>
    /** Scheduled match days by fixture id. */
    dayById: Map<string, number | undefined>
    gameStartDate?: string | null
    className?: string
}

const TableLink = () => (
    <Link href="/league" className="inline-flex items-center gap-1 rounded-sm text-xs font-semibold text-ink-3 hover:text-ink-1">
        {t("leagueCard.table")} <ArrowUpRight size={12} />
    </Link>
)

/** Home's league card: table position, points, the zone situation and the next league opponent. */
export function LeagueSnapshot({ league, playerTeamId, teamsById, dayById, gameStartDate, className }: LeagueSnapshotProps) {
    const split = league?.current
    const own = split?.divisions.find(d => d.teamIds.includes(playerTeamId))
    if (!split || !own) {
        return (
            <Panel eyebrow={t("common.league")} title={t("common.regionalLeague")} actions=<TableLink /> className={className}>
                <p className="text-sm text-ink-3">{t("leagueCard.noDivision")}</p>
            </Panel>
        )
    }

    const bottom = bottomLevelOf(split, own.region)
    const rows = leagueTableRows(own, bottom, playerTeamId)
    const me = rows.find(r => r.isPlayer)
    const started = rows.some(r => r.played > 0)
    const situation = tableSituation(rows, playerTeamId, own.level)
    const next = clubFixtures(own, playerTeamId).upcoming[0]
    const opp = next ? teamsById.get(next.opponentId) : undefined
    const oppPos = next && started ? rows.find(r => r.teamId === next.opponentId)?.position : undefined
    const day = next ? dayById.get(next.fixture.id) : undefined
    const when = next
        ? (gameStartDate && day !== undefined
            ? formatGameCalendarDate(gameCalendarDate(gameStartDate, next.fixture.week, day), { weekday: "short", month: "short", day: "numeric" })
            : t("common.week", { n: ((next.fixture.week - 1) % 52) + 1 }))
        : null
    const outcome = split.completed ? previousSplitOutcome(league, playerTeamId) : null

    return (
        <Panel eyebrow={t("common.league")} title={divisionName(own.name)} actions=<TableLink /> className={className}>
            <div className="flex items-center gap-5">
                <p className="shrink-0 font-display text-[40px] font-bold leading-none tabular-nums text-ink-1">
                    {me && started ? ordinalLabel(me.position) : "—"}<span className="text-lg text-ink-3">/{rows.length}</span>
                </p>
                <dl className="grid min-w-0 flex-1 grid-cols-3 gap-3">
                    <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{t("leagueCard.points")}</dt>
                        <dd className="font-display text-xl font-bold tabular-nums text-ink-1">{me?.points ?? 0}</dd>
                    </div>
                    <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{t("leagueCard.record")}</dt>
                        <dd className="font-display text-xl font-bold tabular-nums text-ink-1">{me ? `${me.wins}–${me.losses}` : "0–0"}</dd>
                    </div>
                    <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{t("leagueCard.roundDiff")}</dt>
                        <dd className="font-display text-xl font-bold tabular-nums text-ink-1">{signed(me?.roundDiff ?? 0)}</dd>
                    </div>
                </dl>
            </div>
            <p className="mt-2 text-xs text-ink-3">
                {situation && <span className={cn("font-semibold", TONE_TEXT[situation.tone])}>{situation.text}</span>}
                {situation && " · "}{splitProgressLabel(split, own)}
            </p>
            <div className="mt-3 flex min-h-9 items-center gap-2.5 border-t border-line pt-3">
                {next ? (
                    <>
                        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{t("leagueCard.next")}</span>
                        <TeamLogoDisplay team={opp} size={22} className="shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-1">
                            {opp?.name ?? t("common.tbd")}{oppPos ? <span className="font-normal text-ink-3"> · {ordinalLabel(oppPos)}</span> : null}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-ink-3">{next.home ? t("leagueCard.home") : t("leagueCard.away")} · {when}</span>
                    </>
                ) : (
                    <span className="text-sm text-ink-3">
                        {outcome ? t("leagueCard.outcomeNext", { outcome: splitOutcomeText(outcome), draw: nextDrawLabel(split) }) : t("leagueCard.noFixtures")}
                    </span>
                )}
            </div>
        </Panel>
    )
}
