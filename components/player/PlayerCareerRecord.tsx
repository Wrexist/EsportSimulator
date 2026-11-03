"use client"
import { t, tn } from "@/lib/i18n"

import { useMemo } from "react"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import type { PlayerSaveData } from "@/engine/save-types"
import type { PersonalBest, PlayerSeasonLine } from "@/engine/records-types"
import { lineOfTally } from "@/engine/official-stats"
import { Panel } from "@/src/components/ui/Panel"
import { Kpi, KpiStrip } from "@/src/components/ui/Kpi"
import { cn } from "@/lib/utils"


type Line = PlayerSeasonLine & { current?: boolean }

const ratingClass = (rating: number) => rating >= 1.2 ? "text-positive" : "text-ink-1"

/**
 * A player's official-match record in this career (Phase 5.1): career
 * totals, season awards, personal bests and one line per season and club.
 * Everything here is counted from league and tournament maps the engine
 * played; friendlies don't count.
 */
export function PlayerCareerRecord({ player }: { player: PlayerSaveData }) {
    const { teams } = useGameStore(useShallow(s => ({ teams: s.teams })))
    const teamName = (id: string) => teams.find(tm => tm.id === id)?.name ?? t("career.formerClub")

    const lines = useMemo<Line[]>(() => {
        const tally = player.seasonTally
        const open: Line[] = tally && (tally.maps > 0 || tally.trophies > 0) ? [{ ...lineOfTally(tally), current: true }] : []
        return [...(player.seasonLines ?? []), ...open].reverse()
    }, [player.seasonLines, player.seasonTally])

    const maps = player.mapsPlayed ?? 0
    const lineRounds = lines.reduce((n, l) => n + l.rounds, 0)
    const adr = lineRounds > 0 ? lines.reduce((s, l) => s + l.adr * l.rounds, 0) / lineRounds : null
    const kills = player.totalKills ?? 0, deaths = player.totalDeaths ?? 0
    const honours = useMemo(() => [...(player.honours ?? [])].sort((a, b) => b.season - a.season || (a.rank ?? 0) - (b.rank ?? 0)), [player.honours])

    const best = (label: string, b: PersonalBest | undefined, format: (v: number) => string) => b ? (
        <div className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm">
            <span className="text-ink-3">{label}</span>
            <span className="min-w-0 truncate text-right text-ink-2">
                <span className="font-semibold tabular-nums text-ink-1">{format(b.value)}</span> {t("common.vsLower")} {teamName(b.vs)} · {b.map} · S{Math.ceil(b.week / 52)} W{((b.week - 1) % 52) + 1}
            </span>
        </div>
    ) : null

    return (
        <div className="space-y-4">
            <KpiStrip className="w-fit max-w-full flex-wrap">
                <Kpi label={t("career.officialMaps")} value={maps} hint={tn("career.matches", player.matchesPlayed || 0)} />
                <Kpi label={t("career.rating")} value={maps ? player.avgRating.toFixed(2) : "—"} valueClassName={maps ? ratingClass(player.avgRating) : undefined} hint={t("career.roundsWeighted")} />
                <Kpi label="K–D" value={maps ? <span>{kills}<span className="text-ink-3">–</span>{deaths}</span> : "—"} hint={maps && deaths > 0 ? t("career.ratio", { n: (kills / deaths).toFixed(2) }) : undefined} />
                <Kpi label="ADR" value={adr != null ? adr.toFixed(1) : "—"} />
                <Kpi label={t("career.titles")} value={player.careerTrophies ?? 0} valueClassName={(player.careerTrophies ?? 0) > 0 ? "text-gold" : undefined} hint={(player.majorWins ?? 0) > 0 ? tn("career.majors", player.majorWins ?? 0) : undefined} />
            </KpiStrip>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Panel title={t("career.awards")} padded={false}>
                    {honours.length > 0 ? (
                        <ul className="flex flex-wrap gap-1.5 p-4">
                            {honours.map(h => (
                                <li key={`${h.season}-${h.award}`} className={cn("rounded-sm border px-1.5 py-0.5 text-xs", h.award === "MVP" ? "border-line-strong font-semibold text-ink-1" : "border-line text-ink-2")}>
                                    S{h.season} · {t(`career.honour.${h.award}`)}{h.award === "TOP20" && h.rank ? ` #${h.rank}` : ""}
                                </li>
                            ))}
                        </ul>
                    ) : <p className="px-4 py-5 text-sm text-ink-3">{t("career.noAwards")}</p>}
                </Panel>
                <Panel title={t("career.bests")} padded={false}>
                    {player.bestMapRating || player.mostMapKills ? (
                        <div className="divide-y divide-line">
                            {best(t("career.bestRating"), player.bestMapRating, v => v.toFixed(2))}
                            {best(t("career.mostKills"), player.mostMapKills, v => String(v))}
                        </div>
                    ) : <p className="px-4 py-5 text-sm text-ink-3">{t("career.noBests")}</p>}
                </Panel>
            </div>

            <Panel title={t("career.seasonBySeason")} padded={false}>
                {lines.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table data-slot="table" className="w-full min-w-[640px] border-collapse text-left">
                            <thead data-slot="table-header">
                                <tr className="border-b border-line">
                                    <th data-slot="table-head" className="pl-4">{t("career.col.season")}</th>
                                    <th data-slot="table-head" className="px-3">{t("career.col.club")}</th>
                                    <th data-slot="table-head" className="px-3 text-right">{t("career.col.maps")}</th>
                                    <th data-slot="table-head" className="px-3 text-right">{t("career.rating")}</th>
                                    <th data-slot="table-head" className="px-3 text-right">K–D</th>
                                    <th data-slot="table-head" className="px-3 text-right">ADR</th>
                                    <th data-slot="table-head" className="px-3 text-right">{t("career.col.mvps")}</th>
                                    <th data-slot="table-head" className="pl-3 pr-4 text-right">{t("career.titles")}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lines.map((l, i) => (
                                    <tr key={`${l.season}-${l.clubId}-${i}`} data-slot="table-row" className="h-10 border-b border-line last:border-0">
                                        <td className="pl-4 text-sm tabular-nums text-ink-2">S{l.season}{l.current && <span className="ml-1.5 text-xs text-ink-3">{t("career.soFar")}</span>}</td>
                                        <td className="max-w-[220px] truncate px-3 text-sm text-ink-1">{teamName(l.clubId)}</td>
                                        <td className="px-3 text-right text-sm tabular-nums text-ink-2">{l.maps}</td>
                                        <td className={cn("px-3 text-right text-sm font-semibold tabular-nums", l.maps ? ratingClass(l.rating) : "text-ink-3")}>{l.maps ? l.rating.toFixed(2) : "—"}</td>
                                        <td className="px-3 text-right text-sm tabular-nums text-ink-2">{l.kills}<span className="text-ink-3">–</span>{l.deaths}</td>
                                        <td className="px-3 text-right text-sm tabular-nums text-ink-2">{l.maps ? l.adr.toFixed(1) : "—"}</td>
                                        <td className="px-3 text-right text-sm tabular-nums text-ink-2">{l.mvps ?? 0}</td>
                                        <td className={cn("pl-3 pr-4 text-right text-sm tabular-nums", l.trophies ? "font-semibold text-gold" : "text-ink-3")}>{l.trophies ?? 0}{l.majors ? <span className="ml-1 text-xs">{t("career.majorTag", { n: l.majors })}</span> : null}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : <p className="px-4 py-5 text-sm text-ink-3">{t("career.noMaps")}</p>}
                <p className="border-t border-line px-4 py-2.5 text-xs leading-relaxed text-ink-3">
                    {t("career.footnote")}
                </p>
            </Panel>
        </div>
    )
}
