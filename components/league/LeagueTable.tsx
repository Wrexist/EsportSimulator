"use client"

import { Trophy } from "lucide-react"
import type { LeagueDivision, TeamSaveData } from "@/engine/save-types"
import { cn } from "@/lib/utils"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { FormGuide } from "@/src/components/ui/FixtureBanner"
import { leagueTableRows, showsMapDiff, signed, zoneRules } from "./league-view"
import { TeamLink } from "@/components/ui/EntityLink"

export interface LeagueTableProps {
    division: LeagueDivision
    bottomLevel: number
    teamsById: Map<string, TeamSaveData>
    playerTeamId?: string | null
}

const ZONE_BAR = { promotion: "bg-positive", relegation: "bg-negative" } as const

/**
 * A division table (design system v2): position with a zone bar (green up,
 * red down), crest and name, P/W/L, map and round difference, points and
 * the last five results. The managed club's row carries the gold edge.
 */
export function LeagueTable({ division, bottomLevel, teamsById, playerTeamId }: LeagueTableProps) {
    const rows = leagueTableRows(division, bottomLevel, playerTeamId)
    const mapDiff = showsMapDiff(division)
    const rules = zoneRules(division.level, bottomLevel)
    const hasPromotion = division.level > 1
    const hasRelegation = division.level < bottomLevel

    return (
        <div>
            <div className="overflow-x-auto">
                <table data-slot="table" className="w-full min-w-[640px] border-collapse text-left">
                    <thead data-slot="table-header">
                        <tr className="border-b border-line">
                            <th data-slot="table-head" className="w-14 pl-4">#</th>
                            <th data-slot="table-head">Team</th>
                            <th data-slot="table-head" className="w-10 px-2 text-center"><abbr title="Played" className="no-underline">P</abbr></th>
                            <th data-slot="table-head" className="w-10 px-2 text-center"><abbr title="Won" className="no-underline">W</abbr></th>
                            <th data-slot="table-head" className="w-10 px-2 text-center"><abbr title="Lost" className="no-underline">L</abbr></th>
                            {mapDiff && <th data-slot="table-head" className="w-14 px-2 text-right"><abbr title="Map difference" className="no-underline">Maps</abbr></th>}
                            <th data-slot="table-head" className="w-16 px-2 text-right"><abbr title="Round difference" className="no-underline">Rounds</abbr></th>
                            <th data-slot="table-head" className="w-14 px-2 text-right"><abbr title="Points (3 a win)" className="no-underline">Pts</abbr></th>
                            <th data-slot="table-head" className="w-36 pl-4 pr-4">Form</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r, i) => {
                            const team = teamsById.get(r.teamId)
                            const next = rows[i + 1]
                            const boundary = !!next && next.zone !== r.zone
                            const champion = division.completed && division.championId === r.teamId
                            return (
                                <tr
                                    key={r.teamId}
                                    data-slot="table-row"
                                    data-zone={r.zone ?? undefined}
                                    className={cn(
                                        "h-11 border-b border-line last:border-b-0",
                                        boundary && "border-b-line-strong",
                                        r.isPlayer && "bg-gold/[0.06] shadow-[inset_2px_0_0_var(--gold)]",
                                    )}
                                >
                                    <td className="pl-4">
                                        <span className="flex items-center gap-2.5">
                                            <span aria-hidden="true" className={cn("h-5 w-1 rounded-full", r.zone ? ZONE_BAR[r.zone] : "bg-transparent")} />
                                            <span className={cn("font-display text-lg font-bold tabular-nums", r.isPlayer ? "text-ink-1" : "text-ink-2")}>{r.position}</span>
                                            {r.zone && <span className="sr-only">{r.zone === "promotion" ? "promotion place" : "relegation place"}</span>}
                                        </span>
                                    </td>
                                    <td className="min-w-0 pr-3">
                                        <span className="flex min-w-0 items-center gap-2.5">
                                            <TeamLogoDisplay team={team} size={22} className="shrink-0" />
                                            <TeamLink id={team ? r.teamId : null} className={cn("truncate text-sm font-semibold", r.isPlayer ? "text-gold" : "text-ink-1")}>{team?.name ?? r.teamId}</TeamLink>
                                            {champion && <Trophy size={13} className="shrink-0 text-gold" aria-label="Division champions" />}
                                        </span>
                                    </td>
                                    <td className="px-2 text-center text-sm tabular-nums text-ink-2">{r.played}</td>
                                    <td className="px-2 text-center text-sm tabular-nums text-ink-2">{r.wins}</td>
                                    <td className="px-2 text-center text-sm tabular-nums text-ink-2">{r.losses}</td>
                                    {mapDiff && <td className="px-2 text-right text-sm tabular-nums text-ink-2">{signed(r.mapDiff)}</td>}
                                    <td className="px-2 text-right text-sm tabular-nums text-ink-2">{signed(r.roundDiff)}</td>
                                    <td className="px-2 text-right font-display text-lg font-bold tabular-nums text-ink-1">{r.points}</td>
                                    <td className="pl-4 pr-4"><FormGuide results={r.form} emptyLabel="—" /></td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-line px-4 py-2.5 text-xs text-ink-3">
                {hasPromotion && <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-1 rounded-full bg-positive" />{rules[0]}</span>}
                {!hasPromotion && <span className="inline-flex items-center gap-1.5"><Trophy size={12} className="text-gold" aria-hidden="true" />{rules[0]}</span>}
                {hasRelegation && <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-1 rounded-full bg-negative" />{rules[1]}</span>}
                <span>3 points a win · ties: head-to-head, then map and round difference</span>
            </div>
        </div>
    )
}
