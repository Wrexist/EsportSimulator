"use client"

import { useMemo } from "react"
import Image from "next/image"
import { Armchair, Check, Cpu, Headphones, Keyboard, Monitor, Mouse } from "lucide-react"
import { useGameStore } from "@/store/game-store"
import { Button } from "@/components/ui/button"
import { Panel } from "@/src/components/ui/Panel"
import { Meter } from "@/src/components/ui/Meter"
import { equipmentArtwork } from "@/lib/ui-assets"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/utils-extended"
import { NON_PLAYER_BONUS_CAP } from "@/engine/match/round-sim/team-edge"
import {
    EquipmentManager,
    EQUIPMENT_CATALOG,
    EQUIPMENT_TYPE_DISPLAY,
    EQUIPMENT_TIER_DISPLAY,
    type EquipmentCatalogItem,
    type EquipmentType,
} from "@/engine/equipment-manager"
import type { EquipmentItem, TeamSaveData } from "@/engine/save-types"

const ICON: Record<string, typeof Mouse> = { Mouse, Keyboard, Monitor, Headphones, Armchair, Cpu }
export const GEAR_SLOTS = Object.keys(EQUIPMENT_TYPE_DISPLAY) as EquipmentType[]
const money = (v: number) => formatCurrency(v, "$", false)
/** Team-strength share of one item, exactly as the match engine applies it. */
export const gearStrengthPct = (item: { type: string; bonus?: { value: number } }) => EquipmentManager.itemStrengthBonus(item) * 100

function GearTile({ item, equipped, budget, onBuy }: {
    item: EquipmentCatalogItem
    equipped: EquipmentItem | undefined
    budget: number
    onBuy: (item: EquipmentCatalogItem) => void
}) {
    const isEquipped = equipped?.id === item.id
    const delta = gearStrengthPct(item) - (equipped ? gearStrengthPct(equipped) : 0)
    const upkeepDelta = item.weeklyCost - (equipped?.weeklyCost ?? 0)
    const short = item.purchaseCost - budget
    return (
        <div className={cn("flex min-w-0 gap-3 rounded border p-3", isEquipped ? "border-line-strong bg-raised" : "border-line bg-shell")}>
            <div className="relative h-14 w-14 shrink-0">
                <Image src={equipmentArtwork(item.type, item.tier, item.imagePath || EQUIPMENT_TYPE_DISPLAY[item.type].imagePath)} alt="" fill sizes="56px" className="object-contain" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3 lg:hidden">{EQUIPMENT_TIER_DISPLAY[item.tier].label}</p>
                        <p className="truncate text-sm font-semibold text-ink-1" title={item.name}>{item.name}</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-ink-1" title="Share of team strength in matches">+{gearStrengthPct(item).toFixed(1)}%</span>
                </div>
                <p className="mt-0.5 text-xs tabular-nums text-ink-3">{money(item.purchaseCost)} · {money(item.weeklyCost)}/wk upkeep</p>
                <div className="mt-auto pt-2">
                    {isEquipped ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-positive"><Check size={12} /> Equipped</span>
                    ) : short > 0 ? (
                        <span className="text-xs text-ink-3">{money(short)} short</span>
                    ) : (
                        <div className="flex items-center justify-between gap-2">
                            <span className={cn("text-xs tabular-nums", !equipped ? "text-ink-3" : delta > 0 ? "text-positive" : delta < 0 ? "text-caution" : "text-ink-3")}>
                                {equipped ? `${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(1)}% · ${upkeepDelta >= 0 ? "+" : "−"}${money(Math.abs(upkeepDelta))}/wk` : "Empty slot"}
                            </span>
                            <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => onBuy(item)}>
                                {equipped ? (delta >= 0 ? "Upgrade" : "Swap down") : "Buy"}
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

/**
 * Facilities → Gear (was the `/equipment` screen). One item per slot; each
 * adds a fixed share of team strength (EquipmentManager.itemStrengthBonus),
 * capped at EquipmentManager.STRENGTH_CAP for a full elite set.
 */
export function GearCatalog({ team }: { team: TeamSaveData }) {
    const purchaseEquipment = useGameStore(s => s.purchaseEquipment)

    const equippedByType = useMemo(() => {
        const map = new Map<EquipmentType, EquipmentItem | undefined>()
        for (const type of GEAR_SLOTS) map.set(type, EquipmentManager.getTeamEquipment(team, type))
        return map
    }, [team])

    const strength = EquipmentManager.strengthBonus(team) * 100
    const cap = EquipmentManager.STRENGTH_CAP * 100
    const aiGear = EquipmentManager.implicitStrengthBonus({ reputation: 100 }) * 100

    const handleBuy = (item: EquipmentCatalogItem) => {
        const result = purchaseEquipment(item.id)
        if (result.success) toast.success(`${item.name} installed`, { description: `Upkeep ${money(item.weeklyCost)}/wk from the next settlement. The old item is not refunded.` })
        else toast.error("Purchase failed", { description: result.error })
    }

    return (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <Panel padded={false} className="overflow-hidden">
                <div className="hidden grid-cols-[180px_repeat(3,minmax(0,1fr))] gap-3 border-b border-line bg-raised px-4 py-2.5 lg:grid">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Slot</span>
                    {([1, 2, 3] as const).map(t => <span key={t} className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">{EQUIPMENT_TIER_DISPLAY[t].label}</span>)}
                </div>
                <div className="divide-y divide-line">
                    {GEAR_SLOTS.map(type => {
                        const display = EQUIPMENT_TYPE_DISPLAY[type]
                        const Icon = ICON[display.icon] ?? Cpu
                        const equipped = equippedByType.get(type)
                        const items = EQUIPMENT_CATALOG.filter(i => i.type === type).sort((a, b) => a.tier - b.tier)
                        return (
                            <div key={type} className="grid grid-cols-1 gap-3 px-4 py-3 lg:grid-cols-[180px_repeat(3,minmax(0,1fr))]">
                                <div className="flex items-center gap-3">
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-raised text-ink-2"><Icon size={18} /></span>
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-ink-1">{display.label}</p>
                                        <p className="truncate text-xs text-ink-3">{equipped ? `+${gearStrengthPct(equipped).toFixed(1)}% now` : "Empty"}</p>
                                    </div>
                                </div>
                                {items.map(item => <GearTile key={item.id} item={item} equipped={equipped} budget={team.budget} onBuy={handleBuy} />)}
                            </div>
                        )
                    })}
                </div>
            </Panel>

            <aside className="min-w-0 space-y-4">
                <Panel title="Team strength from gear">
                    <div className="flex items-baseline justify-between">
                        <span className="font-display text-4xl font-bold tabular-nums text-ink-1">+{strength.toFixed(1)}%</span>
                        <span className="text-xs text-ink-3">cap +{cap.toFixed(0)}%</span>
                    </div>
                    <Meter value={(strength / cap) * 100} label="Gear strength toward cap" tone="neutral" showValue={false} className="mt-2" trackClassName="w-full" />
                    <dl className="mt-4 divide-y divide-line">
                        {GEAR_SLOTS.map(type => {
                            const item = equippedByType.get(type)
                            return (
                                <div key={type} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                                    <dt className="text-ink-3">{EQUIPMENT_TYPE_DISPLAY[type].label}</dt>
                                    <dd className={cn("tabular-nums", item ? "text-ink-1" : "text-ink-3")}>{item ? `+${gearStrengthPct(item).toFixed(1)}%` : "—"}</dd>
                                </div>
                            )
                        })}
                    </dl>
                </Panel>
                <Panel title="How gear works">
                    <ul className="space-y-3 text-sm text-ink-2">
                        <li>One item per slot. Buying replaces the current item at once, with no refund for the old one.</li>
                        <li>Each item adds a fixed share of team strength; a full elite set reaches the +{cap.toFixed(0)}% cap. It doesn&apos;t change player attributes or training.</li>
                        <li>AI clubs count as owning gear that scales with reputation, up to +{aiGear.toFixed(0)}% for the best known clubs.</li>
                        <li>Gear, facilities, staff and prep are summed per side; the difference between the two sides is capped at ±{Math.round(NON_PLAYER_BONUS_CAP * 100)}%.</li>
                        <li>Upkeep is charged every weekly settlement. A cheaper item lowers it.</li>
                    </ul>
                </Panel>
            </aside>
        </div>
    )
}
