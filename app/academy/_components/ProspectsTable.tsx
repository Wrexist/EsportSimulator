"use client"
import { intlLocale, t, tn } from "@/lib/i18n"

import { useMemo } from "react"
import Link from "next/link"
import type { PlayerSaveData } from "@/engine/save-types"
import type { AcademyPlayer, AcademyTrainingFocus, AcademyWeeklyReport } from "@/types/academy"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { visibleAcademyPotential } from "@/engine/academy-engine"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { PlayerPortrait } from "@/components/ui/asset-images"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RatingChip } from "@/src/components/ui/RatingChip"
import { RoleTag } from "@/src/components/ui/RoleTag"
import { Meter } from "@/src/components/ui/Meter"
import {
    ACADEMY_ROLES, BENCH_XP_SHARE, drillStatName, FATIGUE_THRESHOLD, FOCUS_OPTIONS, POTENTIAL_REVEAL_WEEKS, PROMOTION_MINIMUMS,
    PROMOTION_PROGRESS, PROMOTION_TERMS, RELEASE_FEE,
} from "./academy-facts"
import { formatCurrency } from "@/lib/utils-extended"

interface Row {
    prospect: AcademyPlayer
    player: PlayerSaveData
}

interface ProspectsTableProps {
    rows: Row[]
    academyLevel: number
    currentWeek: number
    academyRoster: Record<string, string | null>
    /** The academy's latest weekly result (XP and stat gains per prospect). */
    lastWeek?: AcademyWeeklyReport
    onSetFocus: (prospectId: string, focus: AcademyTrainingFocus) => void
    onSetLineup: (prospectId: string, role: string | null) => void
    onPromote: (prospectId: string) => void
    onRelease: (prospectId: string) => void
}

/** What still blocks promotion, in the engine's own terms. */
export function readiness(prospect: AcademyPlayer, player: PlayerSaveData): string {
    if (prospect.readyForPromotion) return t("ac.ready")
    const missing = PROMOTION_MINIMUMS.filter(m => (player[m.key] ?? 0) < m.min).map(m => `${t(m.label)} ${m.min}`)
    if (prospect.developmentProgress < PROMOTION_PROGRESS) return `${t("ac.progress", { n: Math.round(prospect.developmentProgress), max: PROMOTION_PROGRESS })}${missing.length ? t("ac.needsLower", { list: missing.join(", ") }) : ""}`
    if (missing.length) return t("ac.needs", { list: missing.join(", ") })
    return t("ac.checked")
}

/**
 * Academy prospects: rating, potential, age, readiness and weeks enrolled,
 * with the two levers that change development (starter slot, focus) and
 * promote / release.
 */
export function ProspectsTable({ rows, academyLevel, currentWeek, academyRoster, lastWeek, onSetFocus, onSetLineup, onPromote, onRelease }: ProspectsTableProps) {
    const roleOf = useMemo(() => {
        const m = new Map<string, string>()
        for (const [role, id] of Object.entries(academyRoster)) if (id) m.set(id, role)
        return m
    }, [academyRoster])
    const lastByPlayer = useMemo(() => new Map((lastWeek?.prospectReports ?? []).map(r => [r.playerId, r])), [lastWeek])
    const revealWeeks = POTENTIAL_REVEAL_WEEKS[academyLevel] ?? 12

    return (
        <div className="overflow-x-auto">
            <table data-slot="table" className="w-full min-w-[1120px] border-collapse text-left">
                <thead data-slot="table-header">
                    <tr className="border-b border-line">
                        <th data-slot="table-head" className="pl-4">{t("ac.col.prospect")}</th>
                        <th data-slot="table-head" className="px-3 text-center">{t("common.ovr")}</th>
                        <th data-slot="table-head" className="px-3 text-center">{t("ac.col.potential")}</th>
                        <th data-slot="table-head" className="px-3">{t("ac.col.readiness")}</th>
                        <th data-slot="table-head" className="px-3 text-right">{t("ac.col.weeks")}</th>
                        <th data-slot="table-head" className="px-3 text-right">{t("ac.col.lastWeek")}</th>
                        <th data-slot="table-head" className="px-3" title={t("ac.benchShare", { pct: Math.round(BENCH_XP_SHARE * 100) })}>{t("ac.col.playsAs")}</th>
                        <th data-slot="table-head" className="px-3">{t("ac.col.focus")}</th>
                        <th data-slot="table-head" className="pr-4"><span className="sr-only">{t("ac.col.actions")}</span></th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(({ prospect, player }) => {
                        const ovr = evaluatePlayer(player, undefined, undefined, currentWeek).overallRating
                        const potential = visibleAcademyPotential(prospect, player)
                        const weeksIn = Math.max(0, currentWeek - prospect.enrolledWeek)
                        const weeksToReveal = Math.max(0, revealWeeks - weeksIn)
                        const tired = Math.round(prospect.energy ?? 100) < FATIGUE_THRESHOLD
                        const lineupRole = roleOf.get(prospect.id) ?? null
                        const focus = FOCUS_OPTIONS.find(f => f.id === (prospect.trainingFocus || "BALANCED")) ?? FOCUS_OPTIONS[0]
                        return (
                            <tr key={prospect.id} data-slot="table-row" className="h-16 border-b border-line last:border-0">
                                <td className="py-2 pl-4 pr-3">
                                    <Link href={`/player/${player.id}`} className="group flex min-w-0 items-center gap-3">
                                        <span className="h-10 w-10 shrink-0 overflow-hidden rounded bg-raised">
                                            <PlayerPortrait src={player.portraitPath} seed={player.id} alt={player.nickname} size={40} />
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block truncate text-[15px] font-semibold text-ink-1 group-hover:text-gold">{player.nickname}</span>
                                            <span className="mt-0.5 flex items-center gap-2 whitespace-nowrap text-xs text-ink-3">
                                                <CountryFlag country={player.nationality} size={14} /> {t("ac.yrs", { n: player.age })} <RoleTag role={player.role} />
                                            </span>
                                        </span>
                                    </Link>
                                </td>
                                <td className="px-3 text-center"><RatingChip value={ovr} /></td>
                                <td className="px-3 text-center">
                                    {potential != null
                                        ? <RatingChip value={potential} />
                                        : <span className="text-xs text-ink-3" title={t("ac.revealTip")}>{weeksToReveal > 0 ? tn("ac.inWeeks", weeksToReveal) : t("ac.nextUpdate")}</span>}
                                </td>
                                <td className="px-3">
                                    <div className="w-[170px]">
                                        <Meter value={prospect.developmentProgress} label={t("ac.devProgress")} tone={prospect.readyForPromotion ? "positive" : "neutral"} showValue={false} trackClassName="w-full" />
                                        <p title={readiness(prospect, player)} className={cn("mt-1 truncate text-xs", prospect.readyForPromotion ? "font-semibold text-positive" : "text-ink-3")}>{readiness(prospect, player)}</p>
                                        {tired && <p className="text-xs text-caution">{t("ac.tired")}</p>}
                                    </div>
                                </td>
                                <td className="px-3 text-right text-sm tabular-nums text-ink-2">{weeksIn}</td>
                                <td className="px-3 text-right text-sm tabular-nums">
                                    {(() => {
                                        const last = lastByPlayer.get(player.id)
                                        if (!last) return <span className="text-ink-3">—</span>
                                        const gains = Object.entries(last.statImprovements).filter(([, v]) => (v ?? 0) >= 0.05)
                                            .map(([k, v]) => `${drillStatName(k)} +${(v ?? 0).toLocaleString(intlLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`).join(" · ")
                                        return <span className={last.xpGained > 0 ? "text-ink-1" : "text-ink-3"} title={gains || t("ac.noGains")}>+{last.xpGained} XP</span>
                                    })()}
                                </td>
                                <td className="px-3">
                                    <Select value={lineupRole ?? "BENCH"} onValueChange={val => onSetLineup(prospect.id, val === "BENCH" ? null : val)}>
                                        <SelectTrigger className="h-9 w-[110px] text-sm" aria-label={t("ac.lineupAria", { name: player.nickname })}>
                                            <SelectValue>{lineupRole ?? t("ac.bench")}</SelectValue>
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="BENCH">{t("ac.benchXp", { pct: Math.round(BENCH_XP_SHARE * 100) })}</SelectItem>
                                            {ACADEMY_ROLES.map(r => {
                                                const holder = academyRoster[r]
                                                const taken = holder && holder !== prospect.id ? rows.find(x => x.prospect.id === holder)?.player.nickname : null
                                                return <SelectItem key={r} value={r}>{r}{taken ? t("ac.replaces", { name: taken }) : ""}</SelectItem>
                                            })}
                                        </SelectContent>
                                    </Select>
                                </td>
                                <td className="px-3">
                                    <Select value={focus.id} onValueChange={val => onSetFocus(prospect.id, val as AcademyTrainingFocus)}>
                                        <SelectTrigger className="h-9 w-[120px] text-sm" aria-label={t("ac.focusAria", { name: player.nickname })}>
                                            <SelectValue>{t(`ac.focus.${focus.id}`)}</SelectValue>
                                        </SelectTrigger>
                                        <SelectContent>
                                            {FOCUS_OPTIONS.map(f => (
                                                <SelectItem key={f.id} value={f.id}>
                                                    <span className="flex flex-col"><span>{t(`ac.focus.${f.id}`)}</span><span className="text-xs text-ink-3">{t(`ac.focus.${f.id}.stats`)}</span></span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </td>
                                <td className="pr-4">
                                    <div className="flex items-center justify-end gap-2">
                                        <ConfirmDialog
                                            title={t("ac.promoteTitle", { name: player.nickname })}
                                            description={t("ac.promoteBody", { salary: formatCurrency(PROMOTION_TERMS.salaryPerWeek, "$", false), weeks: PROMOTION_TERMS.lengthWeeks, total: formatCurrency(PROMOTION_TERMS.salaryPerWeek * PROMOTION_TERMS.lengthWeeks, "$", false) })}
                                            onConfirm={() => onPromote(prospect.id)}
                                            confirmText={t("ac.promote")}
                                            icon="info"
                                        >
                                            <Button size="sm" variant={prospect.readyForPromotion ? "default" : "outline"} className="h-8 px-3 text-xs" disabled={!prospect.readyForPromotion}
                                                title={prospect.readyForPromotion ? undefined : t("ac.notReady")}>
                                                {t("ac.promote")}
                                            </Button>
                                        </ConfirmDialog>
                                        <ConfirmDialog
                                            title={t("ac.releaseTitle", { name: player.nickname })}
                                            description={t("ac.releaseBody", { fee: formatCurrency(RELEASE_FEE, "$", false) })}
                                            onConfirm={() => onRelease(prospect.id)}
                                            destructive
                                            confirmText={t("ac.release")}
                                            icon="danger"
                                        >
                                            <Button size="sm" variant="ghost" className="h-8 px-3 text-xs">{t("ac.release")}</Button>
                                        </ConfirmDialog>
                                    </div>
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}
