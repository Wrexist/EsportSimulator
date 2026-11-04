"use client"

/**
 * Manager reputation and the per-club timeline (Phase 5.1). Every number is
 * what the engine recorded: reputation changes with their causes
 * (engine/manager-timeline.ts) and one stint per club managed.
 */

import Link from "next/link"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import type { TeamSaveData } from "@/engine/save-types"
import type { ManagerStint, StintEnd } from "@/engine/records-types"
import { isMajorTournament } from "@/engine/official-stats"
import { REPUTATION_DELTA } from "@/engine/board-expectations"
import { WIN_REPUTATION_BONUS, LOSS_REPUTATION_PENALTY } from "@/engine/processors/match-manager-xp"
import { Panel } from "@/src/components/ui/Panel"
import { Meter } from "@/src/components/ui/Meter"
import { cn } from "@/lib/utils"
import { LEGACY_GOALS } from "@/engine/legacy-goals"
import { t, tn } from "@/lib/i18n"
import { Trans } from "@/lib/trans"

const LEGACY_REP_MIN = Math.min(...LEGACY_GOALS.flatMap(g => g.reputation))
const LEGACY_REP_MAX = Math.max(...LEGACY_GOALS.flatMap(g => g.reputation))

const endedLabel = (ended: StintEnd) => t(`car.ended.${ended}`)
const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`
const weekLabel = (week: number) => `S${Math.ceil(week / 52)} W${((week - 1) % 52) + 1}`

/** Titles won in a stint: counted as they happen; for a stint tracked late, the club's trophies in the window. */
export function stintTitles(stint: ManagerStint, team: TeamSaveData | undefined): { titles: number; majors: number } {
    const inWindow = (team?.trophies ?? []).filter(t => t.week >= stint.fromWeek && (stint.toWeek == null || t.week <= stint.toWeek))
    const majors = inWindow.filter(t => isMajorTournament(t.tournamentId)).length
    return { titles: stint.trackedFromWeek ? inWindow.length : stint.trophies, majors }
}

/** Clubs managed, including the open stint (lazily opened for older saves only when the engine first records). */
export function useManagerStints(): { stints: ManagerStint[]; dismissals: number; teams: TeamSaveData[] } {
    const { md, teams } = useGameStore(useShallow(s => ({ md: s.managerDetails, teams: s.teams })))
    return { stints: md?.stints ?? [], dismissals: md?.dismissals ?? 0, teams }
}

export function ReputationPanel() {
    const { reputation, log } = useGameStore(useShallow(s => ({
        reputation: s.managerDetails?.reputation ?? 0,
        log: s.managerDetails?.reputationLog,
    })))
    const recent = [...(log ?? [])].reverse().slice(0, 8)
    return (
        <Panel title={t("car.kpi.reputation")} actions={<span className="font-display text-2xl font-bold tabular-nums text-ink-1">{Math.round(reputation)}<span className="ml-0.5 text-sm font-normal text-ink-3">/100</span></span>}>
            <Meter value={reputation} label={t("car.repAria")} tone="neutral" showValue={false} trackClassName="w-full h-2" />
            <p className="mt-3 text-xs leading-relaxed text-ink-3">
                {t("car.repNote")}
            </p>
            <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{t("car.repMoves")}</h3>
            <ul className="mt-2 space-y-1 text-sm text-ink-2">
                <li className="flex justify-between gap-3"><span>{t("car.rep.reviewGood")}</span><span className="tabular-nums text-positive">{signed(REPUTATION_DELTA.EXCEEDED)} / {signed(REPUTATION_DELTA.MET)}</span></li>
                <li className="flex justify-between gap-3"><span>{t("car.rep.reviewBad")}</span><span className="tabular-nums text-negative">{signed(REPUTATION_DELTA.MISSED)} / {signed(REPUTATION_DELTA.FAILED)}</span></li>
                <li className="flex justify-between gap-3"><span>{t("car.rep.dismissed")}</span><span className="tabular-nums text-negative">{signed(REPUTATION_DELTA.FAILED)}</span></li>
                <li className="flex justify-between gap-3"><span>{t("car.rep.legacy")}</span><span className="tabular-nums text-positive">{t("car.rep.range", { min: LEGACY_REP_MIN, max: LEGACY_REP_MAX })}</span></li>
                <li className="flex justify-between gap-3"><span>{t("car.rep.delegated")}</span><span className="tabular-nums text-ink-1">{signed(WIN_REPUTATION_BONUS)} / {signed(-LOSS_REPUTATION_PENALTY)}</span></li>
            </ul>
            <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{t("car.repRecent")}</h3>
            {recent.length > 0 ? (
                <ul className="mt-2 divide-y divide-line rounded border border-line">
                    {recent.map((c, i) => (
                        <li key={`${c.week}-${i}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                            <span className="w-16 shrink-0 tabular-nums text-ink-3">{weekLabel(c.week)}</span>
                            <span className="min-w-0 flex-1 truncate text-ink-2" title={c.cause}>{c.cause}</span>
                            <span className={cn("shrink-0 font-semibold tabular-nums", c.delta > 0 ? "text-positive" : "text-negative")}>{signed(c.delta)}</span>
                        </li>
                    ))}
                </ul>
            ) : <p className="mt-2 text-sm text-ink-3">{t("car.repEmpty")}</p>}
        </Panel>
    )
}

export function ClubTimelinePanel() {
    const { stints, dismissals, teams } = useManagerStints()
    const teamOf = (id: string) => teams.find(t => t.id === id)
    const rows = [...stints].reverse()
    return (
        <Panel
            title={t("car.clubs")}
            actions={<span className="text-xs tabular-nums text-ink-3">{tn("car.clubsN", stints.length)} · {tn("car.dismissalsN", dismissals)}</span>}
            padded={false}
        >
            {rows.length > 0 ? (
                <div className="overflow-x-auto">
                    <table data-slot="table" className="w-full min-w-[620px] border-collapse text-left">
                        <thead data-slot="table-header">
                            <tr className="border-b border-line">
                                <th data-slot="table-head" className="pl-4">{t("car.col.club")}</th>
                                <th data-slot="table-head" className="px-3">{t("car.col.fromTo")}</th>
                                <th data-slot="table-head" className="px-3 text-right">{t("car.col.wl")}</th>
                                <th data-slot="table-head" className="px-3 text-right">{t("tro.kpi.titles")}</th>
                                <th data-slot="table-head" className="pl-3 pr-4">{t("car.col.ended")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((s, i) => {
                                const { titles, majors } = stintTitles(s, teamOf(s.teamId))
                                const rate = s.matches > 0 ? Math.round((s.wins / s.matches) * 100) : null
                                return (
                                    <tr key={`${s.teamId}-${s.fromWeek}-${i}`} data-slot="table-row" className="h-11 border-b border-line last:border-0">
                                        <td className="max-w-[220px] truncate pl-4 text-sm font-semibold text-ink-1">{teamOf(s.teamId)?.name ?? s.teamName}</td>
                                        <td className="px-3 text-sm tabular-nums text-ink-2">
                                            {weekLabel(s.fromWeek)} – {s.toWeek != null ? weekLabel(s.toWeek) : t("hof.now")}
                                            {s.trackedFromWeek && <span className="ml-1.5 text-xs text-ink-3">{t("car.resultsFrom", { week: weekLabel(s.trackedFromWeek) })}</span>}
                                        </td>
                                        <td className="px-3 text-right text-sm tabular-nums text-ink-2">
                                            {s.wins}<span className="text-ink-3">–</span>{s.losses}{rate != null && <span className="ml-1.5 text-xs text-ink-3">{rate}%</span>}
                                        </td>
                                        <td className={cn("px-3 text-right text-sm tabular-nums", titles > 0 ? "font-semibold text-gold" : "text-ink-3")}>
                                            {titles}{majors > 0 && <span className="ml-1 text-xs">({tn("car.kpi.majors", majors)})</span>}
                                        </td>
                                        <td className={cn("pl-3 pr-4 text-sm", s.ended === "sacked" || s.ended === "folded" ? "text-negative" : s.ended ? "text-ink-2" : "text-ink-3")}>
                                            {s.ended ? endedLabel(s.ended) : t("car.inCharge")}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            ) : <p className="px-4 py-5 text-sm text-ink-3">{t("car.clubsEmpty")}</p>}
            <p className="border-t border-line px-4 py-2.5 text-xs leading-relaxed text-ink-3">
                <Trans k="car.clubsNote" tags={{ link: x => <Link href="/career/board" className="font-semibold text-ink-2 hover:text-gold">{x}</Link> }} />
            </p>
        </Panel>
    )
}
