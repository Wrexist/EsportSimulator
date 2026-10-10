"use client"

import { Check, Lock, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Meter } from "@/src/components/ui/Meter"
import { cn } from "@/lib/utils"
import { formatCurrency, formatSignedCurrency } from "@/lib/utils-extended"
import type { SponsorSaveData } from "@/engine/save-types"

const money = (v: number) => formatCurrency(v, "$", false)

export function TierTag({ tier }: { tier: string }) {
    const label = tier === "BASIC" ? "Standard" : tier.charAt(0) + tier.slice(1).toLowerCase()
    return <span className="inline-flex items-center rounded-sm border border-line-strong px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-2">{label}</span>
}

/** Weekly non-cash side effects, applied by the weekly sponsor processor. */
export function BrandEffects({ fx }: { fx: SponsorSaveData["brandEffect"] }) {
    const parts: { text: string; good: boolean }[] = []
    if (fx?.reputationPerWeek) parts.push({ text: `${fx.reputationPerWeek > 0 ? "+" : "−"}${Math.abs(fx.reputationPerWeek)} reputation`, good: fx.reputationPerWeek > 0 })
    if (fx?.moralePerWeek) parts.push({ text: `${fx.moralePerWeek > 0 ? "+" : "−"}${Math.abs(fx.moralePerWeek)} morale`, good: fx.moralePerWeek > 0 })
    if (fx?.followerGrowthPerWeek) parts.push({ text: `${fx.followerGrowthPerWeek > 0 ? "+" : "−"}${Math.abs(fx.followerGrowthPerWeek).toLocaleString("en-US")} followers`, good: fx.followerGrowthPerWeek > 0 })
    if (parts.length === 0) return <span className="text-xs text-ink-3">None</span>
    return (
        <span className="flex flex-col gap-0.5 text-xs">
            {parts.map(p => <span key={p.text} className={p.good ? "text-ink-2" : "text-caution"}>{p.text} / wk</span>)}
        </span>
    )
}

/** Goal wording with its target (the engine keys progress off the description). */
export function goalText(description: string, target: number): string {
    const n = target.toLocaleString("en-US")
    if (description.includes("Maintain Morale > 80")) return `Morale above 80 for ${n} weeks`
    if (description.includes("Gain Followers")) return `Gain ${n} followers`
    if (description.includes("Win Tournament maps")) return `Win ${n} tournament maps`
    if (description.includes("Win Matches")) return `Win ${n} matches`
    return `${description} · ${n}`
}

function Head({ children, className }: { children?: React.ReactNode; className?: string }) {
    return <th data-slot="table-head" className={cn("px-3", className)}>{children}</th>
}

export function ActiveDealsTable({ sponsors, currentWeek, repFactor }: { sponsors: SponsorSaveData[]; currentWeek: number; repFactor: number }) {
    return (
        <div className="overflow-x-auto">
            <table data-slot="table" className="w-full min-w-[760px] border-collapse text-left">
                <thead data-slot="table-header">
                    <tr className="border-b border-line">
                        <Head className="pl-4">Sponsor</Head>
                        <Head className="text-right">Value / wk</Head>
                        <Head>Term</Head>
                        <Head>Brand effect</Head>
                        <Head className="pr-4">Goals (bonus when reached)</Head>
                    </tr>
                </thead>
                <tbody>
                    {sponsors.map(s => {
                        const elapsed = s.signedWeek !== undefined ? Math.max(0, currentWeek - s.signedWeek) : 0
                        const total = Math.max(1, elapsed + s.remainingWeeks)
                        return (
                            <tr key={s.id} data-slot="table-row" className="border-b border-line align-top">
                                <td className="py-3 pl-4 pr-3">
                                    <p className="text-sm font-semibold text-ink-1">{s.name}</p>
                                    <div className="mt-1"><TierTag tier={s.tier} /></div>
                                </td>
                                <td className="px-3 py-3 text-right">
                                    <p className="text-sm tabular-nums text-ink-1">{money(Math.floor(s.weeklyPayout * repFactor))}</p>
                                    <p className="text-xs tabular-nums text-ink-3">base {money(s.weeklyPayout)}</p>
                                </td>
                                <td className="px-3 py-3">
                                    <Meter value={(elapsed / total) * 100} label={`${s.name} term elapsed`} tone="neutral" showValue={false} trackClassName="w-24" />
                                    <p className={cn("mt-1 text-xs tabular-nums", s.remainingWeeks <= 2 ? "text-caution" : "text-ink-3")}>{s.remainingWeeks} of {total} wks left</p>
                                </td>
                                <td className="px-3 py-3"><BrandEffects fx={s.brandEffect} /></td>
                                <td className="py-3 pl-3 pr-4">
                                    {s.goals && s.goals.length > 0 ? (
                                        <ul className="space-y-2">
                                            {s.goals.map(g => (
                                                <li key={g.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
                                                    <span className="truncate text-xs text-ink-1">{goalText(g.description, g.target)}</span>
                                                    <span className={cn("text-xs tabular-nums", g.isCompleted ? "text-positive" : "text-ink-3")}>
                                                        {g.isCompleted ? <span className="inline-flex items-center gap-1"><Check size={11} /> Paid {money(g.bonusPayout)}</span> : `+${money(g.bonusPayout)}`}
                                                    </span>
                                                    <Meter value={g.target > 0 ? (g.current / g.target) * 100 : 0} label={g.description} tone={g.isCompleted ? "positive" : "neutral"} showValue={false} trackClassName="w-full" className="col-span-1" />
                                                    <span className="text-xs tabular-nums text-ink-3">{g.current.toLocaleString("en-US")} / {g.target.toLocaleString("en-US")}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : <span className="text-xs text-ink-3">No goals</span>}
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}

export interface OfferRowState {
    offer: SponsorSaveData
    incomeChange: number
    lockReason: string | null
}

export function OffersTable({ rows, slotsFull, onAccept, onDecline }: {
    rows: OfferRowState[]
    slotsFull: boolean
    onAccept: (offer: SponsorSaveData) => void
    onDecline: (offerId: string) => void
}) {
    return (
        <div className="overflow-x-auto">
            <table data-slot="table" className="w-full min-w-[860px] border-collapse text-left">
                <thead data-slot="table-header">
                    <tr className="border-b border-line">
                        <Head className="pl-4">Sponsor</Head>
                        <Head className="text-right">Base / wk</Head>
                        <Head className="text-right">Length</Head>
                        <Head className="text-right">Your income</Head>
                        <Head>Brand effect</Head>
                        <Head>Goal bonuses</Head>
                        <Head className="pr-4 text-right"><span className="sr-only">Actions</span></Head>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(({ offer, incomeChange, lockReason }) => {
                        const blocked = lockReason ?? (slotsFull ? "All three slots are full" : null)
                        const bonusTotal = (offer.goals ?? []).reduce((sum, g) => sum + g.bonusPayout, 0)
                        return (
                            <tr key={offer.id} data-slot="table-row" className="border-b border-line align-top">
                                <td className="py-3 pl-4 pr-3">
                                    <p className="text-sm font-semibold text-ink-1">{offer.name}</p>
                                    <div className="mt-1"><TierTag tier={offer.tier} /></div>
                                </td>
                                <td className="px-3 py-3 text-right text-sm tabular-nums text-ink-1">{money(offer.weeklyPayout)}</td>
                                <td className="px-3 py-3 text-right text-sm tabular-nums text-ink-2">{offer.remainingWeeks} wks</td>
                                <td className="px-3 py-3 text-right">
                                    <p className={cn("text-sm tabular-nums", incomeChange > 0 ? "text-positive" : "text-ink-3")}>{formatSignedCurrency(incomeChange, "$", false)}</p>
                                    {incomeChange <= 0 && <p className="text-xs text-ink-3">Floor pays more</p>}
                                </td>
                                <td className="px-3 py-3"><BrandEffects fx={offer.brandEffect} /></td>
                                <td className="px-3 py-3">
                                    {offer.goals && offer.goals.length > 0 ? (
                                        <ul className="space-y-0.5 text-xs">
                                            {offer.goals.map(g => (
                                                <li key={g.id} className="flex justify-between gap-3">
                                                    <span className="text-ink-2">{goalText(g.description, g.target)}</span>
                                                    <span className="tabular-nums text-ink-3">+{money(g.bonusPayout)}</span>
                                                </li>
                                            ))}
                                            <li className="pt-0.5 text-ink-3">Up to {money(bonusTotal)} · no penalty if missed</li>
                                        </ul>
                                    ) : <span className="text-xs text-ink-3">None</span>}
                                </td>
                                <td className="py-3 pl-3 pr-4">
                                    <div className="flex items-center justify-end gap-1.5">
                                        {blocked ? (
                                            <span className="inline-flex max-w-[180px] items-center gap-1.5 text-right text-xs text-ink-3"><Lock size={12} className="shrink-0" />{blocked}</span>
                                        ) : (
                                            <Button size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={() => onAccept(offer)}>Sign</Button>
                                        )}
                                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-ink-3" aria-label={`Decline ${offer.name}`} onClick={() => onDecline(offer.id)}>
                                            <X size={14} />
                                        </Button>
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
