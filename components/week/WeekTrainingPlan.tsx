"use client"

import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import type { PlayerSaveData } from "@/engine/save-types"
import { cn } from "@/lib/utils"
import { PlayerPortrait } from "@/components/ui/asset-images"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Panel } from "@/src/components/ui/Panel"
import { RoleTag } from "@/src/components/ui/RoleTag"
import { FOCUS_OPTIONS, STAT_LABEL, TEAM_TRAINING_INTENSITY, type WeeklyPreview } from "@/components/training/weekly-training"
import type { PlayerProjection } from "./week-preview"

/** "Rifle, AWP +0.42 · Aim +0.21 · Pistol at potential" — stats grouped by equal weekly gain. */
export function GainSummary({ preview }: { preview: WeeklyPreview }) {
    if (preview.gains.length === 0) {
        return <span className="text-ink-2">Recovers {Math.abs(preview.fatigue).toFixed(0)} fatigue{preview.morale ? `, +${preview.morale} morale` : ""}</span>
    }
    const growing = preview.gains.filter(g => g.amount >= 0.005)
    const capped = preview.gains.filter(g => g.amount < 0.005).map(g => STAT_LABEL[g.stat] ?? g.stat)
    if (growing.length === 0) return <span className="text-ink-3">All focus stats at potential — no gains</span>
    const groups = new Map<string, string[]>()
    for (const g of growing) {
        const key = g.amount.toFixed(2)
        groups.set(key, [...(groups.get(key) || []), STAT_LABEL[g.stat] ?? g.stat])
    }
    return (
        <span className="text-ink-2">
            {[...groups.entries()].sort((a, b) => Number(b[0]) - Number(a[0])).map(([amount, stats], i) => (
                <span key={amount}>
                    {i > 0 && <span className="text-ink-3"> · </span>}
                    {stats.join(", ")} <span className="font-semibold tabular-nums text-ink-1">+{amount}</span>
                </span>
            ))}
            {capped.length > 0 && <span className="text-ink-3"> · {capped.join(", ")} at potential</span>}
        </span>
    )
}

/** "62 → 41" with the end value coloured by direction (lower fatigue is good). */
function Change({ now, end, lowerIsGood, label }: { now: number; end: number; lowerIsGood: boolean; label: string }) {
    const a = Math.round(now), b = Math.round(end)
    const better = lowerIsGood ? b < a : b > a
    const worse = lowerIsGood ? b > a : b < a
    return (
        <span className="whitespace-nowrap text-sm tabular-nums" aria-label={`${label} ${a} now, ${b} after the update`}>
            <span className="text-ink-3">{a}</span>
            <span className="px-1 text-ink-3">→</span>
            <span className={cn("font-semibold", better ? "text-positive" : worse ? "text-caution" : "text-ink-1")}>{b}</span>
        </span>
    )
}

interface WeekTrainingPlanProps {
    roster: PlayerSaveData[]
    projections: Map<string, PlayerProjection>
    retrainingTarget: Map<string, { targetRole: string; weeksCompleted: number; totalWeeks: number }>
    onSetFocus: (playerId: string, focus: string) => void
}

/**
 * Week plan → training focus per player (was the table on /training): the
 * regimen each player trains at the update, what it gains, and fatigue /
 * morale now → after the update from the full week projection.
 */
export function WeekTrainingPlan({ roster, projections, retrainingTarget, onSetFocus }: WeekTrainingPlanProps) {
    return (
        <Panel
            title="Training focus"
            eyebrow="At the update"
            actions={
                <Link href="/training" className="inline-flex items-center gap-1 text-xs font-semibold text-ink-3 hover:text-ink-1">
                    Drills, retraining &amp; weapons <ArrowUpRight size={12} />
                </Link>
            }
            padded={false}
        >
            <div id="training-focus" className="scroll-mt-24 overflow-x-auto">
                <table data-slot="table" className="w-full min-w-[960px] border-collapse text-left">
                    <thead data-slot="table-header">
                        <tr className="border-b border-line">
                            <th data-slot="table-head" className="pl-4">Player</th>
                            <th data-slot="table-head" className="px-3">Focus</th>
                            <th data-slot="table-head" className="px-3">Gains this week</th>
                            <th data-slot="table-head" className="px-3">Fatigue</th>
                            <th data-slot="table-head" className="px-3">Morale</th>
                            <th data-slot="table-head" className="pr-4 text-right">XP</th>
                        </tr>
                    </thead>
                    <tbody>
                        {roster.map(p => {
                            const proj = projections.get(p.id)
                            const retraining = retrainingTarget.get(p.id)
                            const value = p.trainingFocus || "BALANCED"
                            return (
                                <tr key={p.id} data-slot="table-row" className="h-14 border-b border-line last:border-0">
                                    <td className="py-2 pl-4 pr-3">
                                        <Link href={`/player/${p.id}`} className="group flex min-w-0 items-center gap-3">
                                            <span className="h-9 w-9 shrink-0 overflow-hidden rounded bg-raised">
                                                <PlayerPortrait src={p.portraitPath} seed={p.id} alt={p.nickname} size={36} />
                                            </span>
                                            <span className="min-w-0">
                                                <span className="block truncate text-[15px] font-semibold text-ink-1 group-hover:text-gold">{p.nickname}</span>
                                                <span className="mt-0.5 flex items-center gap-2 text-xs text-ink-3"><RoleTag role={p.role} /> potential {p.potential}</span>
                                            </span>
                                        </Link>
                                    </td>
                                    <td className="px-3">
                                        {retraining ? (
                                            <span className="text-sm text-ink-2">Retraining to {retraining.targetRole.toUpperCase()} · {retraining.weeksCompleted}/{retraining.totalWeeks} wks</span>
                                        ) : (
                                            <Select value={value} onValueChange={val => onSetFocus(p.id, val)}>
                                                <SelectTrigger className="h-9 w-[190px] text-sm" aria-label={`${p.nickname} training focus`}>
                                                    <SelectValue>{FOCUS_OPTIONS.find(o => o.value === value)?.label ?? "Club default (aim)"}</SelectValue>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {FOCUS_OPTIONS.map(o => (
                                                        <SelectItem key={o.value} value={o.value}>
                                                            <span className="flex flex-col">
                                                                <span>{o.label}</span>
                                                                <span className="text-xs text-ink-3">{o.trains}</span>
                                                            </span>
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        )}
                                    </td>
                                    <td className="px-3 text-sm">
                                        {retraining || !proj?.training ? <span className="text-ink-3">Skips weekly training</span> : <GainSummary preview={proj.training} />}
                                    </td>
                                    <td className="px-3">{proj && <Change now={proj.fatigueNow} end={proj.fatigueEnd} lowerIsGood label="Fatigue" />}</td>
                                    <td className="px-3">{proj && <Change now={proj.moraleNow} end={proj.moraleEnd} lowerIsGood={false} label="Morale" />}</td>
                                    <td className="pr-4 text-right text-sm tabular-nums text-ink-2">{proj ? `+${proj.xpMin}–${proj.xpMax}` : "—"}</td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
            <p className="border-t border-line px-4 py-3 text-xs leading-relaxed text-ink-3">
                Club regimen: aim at intensity {TEAM_TRAINING_INTENSITY}; players on &ldquo;Club default&rdquo; train aim. Gains include your coach and facilities and stop at each player&apos;s potential.
                Fatigue and morale after the update include the plan, training, recovery and rest days, but not match results or events.
            </p>
        </Panel>
    )
}
