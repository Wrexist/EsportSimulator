"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import type { PlayerSaveData } from "@/engine/save-types"
import type { AcademyPlayer, AcademyTrainingFocus } from "@/types/academy"
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
    ACADEMY_ROLES, FATIGUE_THRESHOLD, FOCUS_OPTIONS, POTENTIAL_REVEAL_WEEKS, PROMOTION_MINIMUMS,
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
    onSetFocus: (prospectId: string, focus: AcademyTrainingFocus) => void
    onSetLineup: (prospectId: string, role: string | null) => void
    onPromote: (prospectId: string) => void
    onRelease: (prospectId: string) => void
}

/** What still blocks promotion, in the engine's own terms. */
function readiness(prospect: AcademyPlayer, player: PlayerSaveData): string {
    if (prospect.readyForPromotion) return "Ready"
    const missing = PROMOTION_MINIMUMS.filter(m => (player[m.key] ?? 0) < m.min).map(m => `${m.label} ${m.min}`)
    if (prospect.developmentProgress < PROMOTION_PROGRESS) return `${Math.round(prospect.developmentProgress)} / ${PROMOTION_PROGRESS} progress${missing.length ? ` · needs ${missing.join(", ")}` : ""}`
    if (missing.length) return `Needs ${missing.join(", ")}`
    return "Checked at the weekly update"
}

export function ProspectsTable({ rows, academyLevel, currentWeek, academyRoster, onSetFocus, onSetLineup, onPromote, onRelease }: ProspectsTableProps) {
    const router = useRouter()
    const roleOf = useMemo(() => {
        const m = new Map<string, string>()
        for (const [role, id] of Object.entries(academyRoster)) if (id) m.set(id, role)
        return m
    }, [academyRoster])
    const revealWeeks = POTENTIAL_REVEAL_WEEKS[academyLevel] ?? 12

    return (
        <div className="overflow-x-auto">
            <table data-slot="table" className="w-full min-w-[1180px] border-collapse text-left">
                <thead data-slot="table-header">
                    <tr className="border-b border-line">
                        <th data-slot="table-head" className="pl-4">Prospect</th>
                        <th data-slot="table-head" className="px-3">Role</th>
                        <th data-slot="table-head" className="px-3 text-center">OVR</th>
                        <th data-slot="table-head" className="px-3 text-center">Potential</th>
                        <th data-slot="table-head" className="px-3">Readiness</th>
                        <th data-slot="table-head" className="px-3">Energy</th>
                        <th data-slot="table-head" className="px-3">Focus</th>
                        <th data-slot="table-head" className="px-3">Lineup</th>
                        <th data-slot="table-head" className="pr-4"><span className="sr-only">Actions</span></th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(({ prospect, player }) => {
                        const ovr = evaluatePlayer(player, undefined, undefined, currentWeek).overallRating
                        const potential = visibleAcademyPotential(prospect, player)
                        const weeksToReveal = Math.max(0, revealWeeks - (currentWeek - prospect.enrolledWeek))
                        const energy = Math.round(prospect.energy ?? 100)
                        const lineupRole = roleOf.get(prospect.id) ?? null
                        const focus = FOCUS_OPTIONS.find(f => f.id === (prospect.trainingFocus || "BALANCED")) ?? FOCUS_OPTIONS[0]
                        return (
                            <tr key={prospect.id} data-slot="table-row" className="h-16 border-b border-line">
                                <td className="py-2 pl-4 pr-3">
                                    <button type="button" onClick={() => router.push(`/player/${player.id}`)} className="group flex min-w-0 items-center gap-3 text-left">
                                        <span className="h-10 w-10 shrink-0 overflow-hidden rounded bg-raised">
                                            <PlayerPortrait src={player.portraitPath} seed={player.id} alt={player.nickname} size={40} />
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block truncate text-[15px] font-semibold text-ink-1 group-hover:text-gold">{player.nickname}</span>
                                            <span className="flex items-center gap-1.5 text-xs text-ink-3">
                                                <CountryFlag country={player.nationality} size={14} /> {player.age} yrs
                                            </span>
                                        </span>
                                    </button>
                                </td>
                                <td className="px-3"><RoleTag role={player.role} /></td>
                                <td className="px-3 text-center"><RatingChip value={ovr} /></td>
                                <td className="px-3 text-center">
                                    {potential != null
                                        ? <RatingChip value={potential} />
                                        : <span className="text-xs text-ink-3" title="Potential is revealed after time in the academy; sooner at higher levels.">{weeksToReveal > 0 ? `In ${weeksToReveal} wk${weeksToReveal === 1 ? "" : "s"}` : "Next update"}</span>}
                                </td>
                                <td className="px-3">
                                    <div className="w-[190px]">
                                        <Meter value={prospect.developmentProgress} label="Development progress" tone={prospect.readyForPromotion ? "positive" : "neutral"} showValue={false} trackClassName="w-full" />
                                        <p className={cn("mt-1 truncate text-xs", prospect.readyForPromotion ? "font-semibold text-positive" : "text-ink-3")}>{readiness(prospect, player)}</p>
                                    </div>
                                </td>
                                <td className="px-3">
                                    <Meter value={energy} label="Energy" />
                                    {energy < FATIGUE_THRESHOLD && <p className="mt-1 text-xs text-caution">−20% drill XP</p>}
                                </td>
                                <td className="px-3">
                                    <Select value={focus.id} onValueChange={val => onSetFocus(prospect.id, val as AcademyTrainingFocus)}>
                                        <SelectTrigger className="h-9 w-[140px] text-sm" aria-label={`${player.nickname} development focus`}>
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
                                <td className="px-3">
                                    <Select value={lineupRole ?? "BENCH"} onValueChange={val => onSetLineup(prospect.id, val === "BENCH" ? null : val)}>
                                        <SelectTrigger className="h-9 w-[120px] text-sm" aria-label={`${player.nickname} lineup role`}>
                                            <SelectValue>{lineupRole ?? "Bench"}</SelectValue>
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="BENCH">Bench</SelectItem>
                                            {ACADEMY_ROLES.map(r => {
                                                const holder = academyRoster[r]
                                                const taken = holder && holder !== prospect.id ? rows.find(x => x.prospect.id === holder)?.player.nickname : null
                                                return <SelectItem key={r} value={r}>{r}{taken ? ` · replaces ${taken}` : ""}</SelectItem>
                                            })}
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
                                            <Button size="sm" variant="outline" className="h-8 px-3 text-xs" disabled={!prospect.readyForPromotion}
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
