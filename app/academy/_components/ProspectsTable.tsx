"use client"

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
    ACADEMY_ROLES, BENCH_XP_SHARE, DRILL_STAT_LABEL, FATIGUE_THRESHOLD, FOCUS_OPTIONS, POTENTIAL_REVEAL_WEEKS, PROMOTION_MINIMUMS,
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
    if (prospect.readyForPromotion) return "Ready to promote"
    const missing = PROMOTION_MINIMUMS.filter(m => (player[m.key] ?? 0) < m.min).map(m => `${m.label} ${m.min}`)
    if (prospect.developmentProgress < PROMOTION_PROGRESS) return `${Math.round(prospect.developmentProgress)} / ${PROMOTION_PROGRESS} progress${missing.length ? ` · needs ${missing.join(", ")}` : ""}`
    if (missing.length) return `Needs ${missing.join(", ")}`
    return "Checked at the weekly update"
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
                        <th data-slot="table-head" className="pl-4">Prospect</th>
                        <th data-slot="table-head" className="px-3 text-center">OVR</th>
                        <th data-slot="table-head" className="px-3 text-center">Potential</th>
                        <th data-slot="table-head" className="px-3">Readiness</th>
                        <th data-slot="table-head" className="px-3 text-right">Weeks</th>
                        <th data-slot="table-head" className="px-3 text-right">Last week</th>
                        <th data-slot="table-head" className="px-3" title={`Starters get full drill XP, the bench ${Math.round(BENCH_XP_SHARE * 100)}%`}>Plays as</th>
                        <th data-slot="table-head" className="px-3">Focus</th>
                        <th data-slot="table-head" className="pr-4"><span className="sr-only">Actions</span></th>
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
                                                <CountryFlag country={player.nationality} size={14} /> {player.age} yrs <RoleTag role={player.role} />
                                            </span>
                                        </span>
                                    </Link>
                                </td>
                                <td className="px-3 text-center"><RatingChip value={ovr} /></td>
                                <td className="px-3 text-center">
                                    {potential != null
                                        ? <RatingChip value={potential} />
                                        : <span className="text-xs text-ink-3" title="Potential is revealed after time in the academy; sooner at higher levels.">{weeksToReveal > 0 ? `In ${weeksToReveal} wk${weeksToReveal === 1 ? "" : "s"}` : "Next update"}</span>}
                                </td>
                                <td className="px-3">
                                    <div className="w-[170px]">
                                        <Meter value={prospect.developmentProgress} label="Development progress" tone={prospect.readyForPromotion ? "positive" : "neutral"} showValue={false} trackClassName="w-full" />
                                        <p title={readiness(prospect, player)} className={cn("mt-1 truncate text-xs", prospect.readyForPromotion ? "font-semibold text-positive" : "text-ink-3")}>{readiness(prospect, player)}</p>
                                        {tired && <p className="text-xs text-caution">Tired: drills give 20% less XP</p>}
                                    </div>
                                </td>
                                <td className="px-3 text-right text-sm tabular-nums text-ink-2">{weeksIn}</td>
                                <td className="px-3 text-right text-sm tabular-nums">
                                    {(() => {
                                        const last = lastByPlayer.get(player.id)
                                        if (!last) return <span className="text-ink-3">—</span>
                                        const gains = Object.entries(last.statImprovements).filter(([, v]) => (v ?? 0) >= 0.05)
                                            .map(([k, v]) => `${DRILL_STAT_LABEL[k] ?? k} +${(v ?? 0).toFixed(1)}`).join(" · ")
                                        return <span className={last.xpGained > 0 ? "text-ink-1" : "text-ink-3"} title={gains || "No stat gains"}>+{last.xpGained} XP</span>
                                    })()}
                                </td>
                                <td className="px-3">
                                    <Select value={lineupRole ?? "BENCH"} onValueChange={val => onSetLineup(prospect.id, val === "BENCH" ? null : val)}>
                                        <SelectTrigger className="h-9 w-[110px] text-sm" aria-label={`${player.nickname} academy lineup role`}>
                                            <SelectValue>{lineupRole ?? "Bench"}</SelectValue>
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="BENCH">Bench · {Math.round(BENCH_XP_SHARE * 100)}% XP</SelectItem>
                                            {ACADEMY_ROLES.map(r => {
                                                const holder = academyRoster[r]
                                                const taken = holder && holder !== prospect.id ? rows.find(x => x.prospect.id === holder)?.player.nickname : null
                                                return <SelectItem key={r} value={r}>{r}{taken ? ` · replaces ${taken}` : ""}</SelectItem>
                                            })}
                                        </SelectContent>
                                    </Select>
                                </td>
                                <td className="px-3">
                                    <Select value={focus.id} onValueChange={val => onSetFocus(prospect.id, val as AcademyTrainingFocus)}>
                                        <SelectTrigger className="h-9 w-[120px] text-sm" aria-label={`${player.nickname} development focus`}>
                                            <SelectValue>{focus.label}</SelectValue>
                                        </SelectTrigger>
                                        <SelectContent>
                                            {FOCUS_OPTIONS.map(f => (
                                                <SelectItem key={f.id} value={f.id}>
                                                    <span className="flex flex-col"><span>{f.label}</span><span className="text-xs text-ink-3">{f.stats}</span></span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </td>
                                <td className="pr-4">
                                    <div className="flex items-center justify-end gap-2">
                                        <ConfirmDialog
                                            title={`Promote ${player.nickname}?`}
                                            description={`Joins the senior squad on ${formatCurrency(PROMOTION_TERMS.salaryPerWeek, "$", false)}/wk for ${PROMOTION_TERMS.lengthWeeks} weeks. The roster holds 7 players, and any roster change costs a little chemistry.`}
                                            onConfirm={() => onPromote(prospect.id)}
                                            confirmText="Promote"
                                            icon="info"
                                        >
                                            <Button size="sm" variant={prospect.readyForPromotion ? "default" : "outline"} className="h-8 px-3 text-xs" disabled={!prospect.readyForPromotion}
                                                title={prospect.readyForPromotion ? undefined : "Not ready yet"}>
                                                Promote
                                            </Button>
                                        </ConfirmDialog>
                                        <ConfirmDialog
                                            title={`Release ${player.nickname}?`}
                                            description={`Costs a ${formatCurrency(RELEASE_FEE, "$", false)} termination fee. Released prospects leave the game for good.`}
                                            onConfirm={() => onRelease(prospect.id)}
                                            destructive
                                            confirmText="Release"
                                            icon="danger"
                                        >
                                            <Button size="sm" variant="ghost" className="h-8 px-3 text-xs">Release</Button>
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
