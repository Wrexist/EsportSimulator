"use client"

import React, { useState, useMemo } from "react"
import Image from "next/image"
import { motion } from "framer-motion"
import { Monitor, Keyboard, Mouse, Headphones, Armchair, Cpu, Check, CheckCircle2, ArrowUp, ArrowDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { useCurrentTeam } from "@/hooks/useCurrentTeam"
import { toast } from "@/lib/toast"
import { EQUIPMENT_CATALOG, EQUIPMENT_TYPE_DISPLAY, EquipmentType } from "@/engine/equipment-manager"

export function ShopApp() {
    const { purchaseEquipment } = useGameStore(useShallow(state => ({
        purchaseEquipment: state.purchaseEquipment,
    })))
    const team = useCurrentTeam()
    const [selectedType, setSelectedType] = useState<EquipmentType>("PC")

    const currentItem = team?.equipment?.find(e => e.type === selectedType)
    const getCatalogItem = (id: string) => EQUIPMENT_CATALOG.find(i => i.id === id)

    const availableItems = useMemo(() => {
        return EQUIPMENT_CATALOG
            .filter(item => item.type === selectedType)
            .sort((a, b) => a.tier - b.tier)
    }, [selectedType])

    const handlePurchase = (itemId: string) => {
        const result = purchaseEquipment(itemId)
        if (result.success) {
            const item = getCatalogItem(itemId)
            toast.success("Equipment Purchased", {
                description: item ? `${item.name} added to ${item.type.toLowerCase()} loadout.` : undefined,
            })
        } else {
            toast.error("Purchase Failed", { description: result.error })
        }
    }

    if (!team) return <div className="p-4 text-white">Team not found</div>

    const equipmentTypes: EquipmentType[] = ["PC", "MONITOR", "KEYBOARD", "MOUSE", "HEADSET", "CHAIR"]

    return (
        <div className="flex h-full bg-neutral-900 text-white font-sans overflow-hidden">
            {/* Sidebar */}
            <div className="w-64 bg-black/40 border-r border-white/5 flex flex-col shrink-0">
                <div className="p-5 border-b border-white/5">
                    <h2 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-3">My Setup</h2>
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                        <span className="text-xs font-medium text-white/80">Avg. Tier</span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-lg font-bold text-white">
                                {(team.equipment?.reduce((acc, curr) => acc + curr.tier, 0) || 0) / 6 > 0
                                    ? ((team.equipment?.reduce((acc, curr) => acc + curr.tier, 0) || 0) / (team.equipment?.length || 1)).toFixed(1)
                                    : "0.0"}
                            </span>
                            <span className="text-[10px] text-white/40">/ 3.0</span>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {equipmentTypes.map(type => {
                        const equipped = team.equipment?.find(e => e.type === type)
                        const catalogEquipped = equipped ? getCatalogItem(equipped.id) : null
                        const display = EQUIPMENT_TYPE_DISPLAY[type]
                        const Icon = display.icon === "Monitor" ? Monitor :
                            display.icon === "Keyboard" ? Keyboard :
                                display.icon === "Mouse" ? Mouse :
                                    display.icon === "Headphones" ? Headphones :
                                        display.icon === "Armchair" ? Armchair : Cpu

                        return (
                            <button
                                key={type}
                                onClick={() => setSelectedType(type)}
                                className={cn(
                                    "w-full flex items-center gap-3 p-2 rounded-xl transition-all border group relative",
                                    selectedType === type
                                        ? "bg-white/10 border-white/10 shadow-lg"
                                        : "bg-transparent border-transparent hover:bg-white/5"
                                )}
                            >
                                <div className={cn(
                                    "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-all overflow-hidden bg-black/50 border border-white/5 p-1",
                                    selectedType === type ? "ring-1 ring-indigo-500/50" : ""
                                )}>
                                    {catalogEquipped?.imagePath ? (
                                        <Image src={catalogEquipped.imagePath} alt={type} width={36} height={36} className="w-full h-full object-contain" unoptimized />
                                    ) : (
                                        <Icon size={16} className="text-white/20" />
                                    )}
                                </div>
                                <div className="text-left flex-1 min-w-0">
                                    <div className="flex justify-between items-center mb-0.5">
                                        <p className={cn("text-xs font-bold", selectedType === type ? "text-white" : "text-white/60")}>
                                            {display.label}
                                        </p>
                                        {equipped && (
                                            <Badge variant="outline" className={cn(
                                                "h-3.5 px-1 text-[9px] border-0",
                                                equipped.tier === 3 ? "bg-amber-500/20 text-amber-300" :
                                                    equipped.tier === 2 ? "bg-blue-500/20 text-blue-300" : "bg-white/10 text-white/40"
                                            )}>T{equipped.tier}</Badge>
                                        )}
                                    </div>
                                    <p className="text-[10px] text-white/40 truncate">
                                        {equipped ? equipped.name : "Stock Model"}
                                    </p>
                                </div>
                            </button>
                        )
                    })}
                </div>

                <div className="p-4 bg-black/60 border-t border-white/5">
                    <div className="flex justify-between items-center text-[10px] text-white/50">
                        <span>Weekly Cost</span>
                        <span className="text-white font-mono">${((team.equipment?.reduce((acc, curr) => acc + curr.weeklyCost, 0)) || 0).toLocaleString()}</span>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col bg-neutral-900 min-w-0">
                <div className="p-6 pb-2 border-b border-white/5">
                    <h1 className="text-xl font-normal text-white">{EQUIPMENT_TYPE_DISPLAY[selectedType].label} Store</h1>
                    <p className="text-xs text-white/50 mt-1">Upgrade your hardware to maximize potential.</p>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                    <div className="flex flex-col gap-4 max-w-4xl mx-auto">
                        {availableItems.map(item => {
                            const isOwned = currentItem?.id === item.id
                            const canAfford = team.budget >= item.purchaseCost
                            const currentBonus = currentItem?.bonus.value || 0
                            const statDiff = item.bonus.value - currentBonus

                            return (
                                <motion.div
                                    key={item.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={cn(
                                        "group flex flex-col sm:flex-row rounded-xl border transition-all duration-300 overflow-hidden relative",
                                        isOwned
                                            ? "bg-emerald-950/20 border-emerald-500/30 ring-1 ring-emerald-500/20"
                                            : "bg-white/[0.03] border-white/5 hover:border-white/20 hover:bg-white/[0.05]"
                                    )}
                                >
                                    {/* Left: Image */}
                                    <div className="w-full sm:w-48 h-48 sm:h-auto bg-black/20 relative flex items-center justify-center p-4 shrink-0">
                                        <div className="absolute top-2 left-2 z-10">
                                            <Badge className={cn(
                                                "font-bold border-0 text-[10px] px-2 h-5 shadow-lg",
                                                item.tier === 3 ? "bg-amber-500 text-black" :
                                                    item.tier === 2 ? "bg-blue-500 text-white" : "bg-neutral-700 text-white"
                                            )}>TIER {item.tier}</Badge>
                                        </div>
                                        <img
                                            src={item.imagePath || "/team_placeholder.png"}
                                            alt={item.name}
                                            className="max-w-[80%] max-h-[80%] object-contain filter drop-shadow-xl group-hover:scale-105 transition-transform duration-500"
                                        />
                                    </div>

                                    {/* Right: Content */}
                                    <div className="flex-1 p-4 sm:p-5 flex flex-col min-w-0">
                                        <div className="flex justify-between items-start gap-4 mb-2">
                                            <div>
                                                <h3 className="font-bold text-white text-lg leading-tight mb-1">{item.name}</h3>
                                                <p className="text-xs text-white/50 leading-relaxed">{item.description}</p>
                                            </div>
                                            {isOwned && <CheckCircle2 className="text-emerald-500 shrink-0 mt-1" size={20} />}
                                        </div>

                                        <div className="h-px bg-white/5 my-3" />

                                        {/* Specs Row */}
                                        <div className="grid grid-cols-2 gap-8 mb-4">
                                            <div>
                                                <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">Performance</div>
                                                <div className="flex items-baseline gap-2">
                                                    <span className="text-lg font-bold text-white">+{item.bonus.value}</span>
                                                    <span className="text-[10px] text-white/40 uppercase font-bold">{item.bonus.stat}</span>
                                                </div>
                                                {!isOwned && statDiff !== 0 && (
                                                    <div className={cn(
                                                        "text-[10px] font-bold mt-1 flex items-center gap-1",
                                                        statDiff > 0 ? "text-emerald-400" : "text-red-400"
                                                    )}>
                                                        {statDiff > 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                                                        <span>{Math.abs(statDiff)} vs Current</span>
                                                    </div>
                                                )}
                                            </div>

                                            <div>
                                                <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">Upkeep</div>
                                                <div className="text-lg font-mono text-white/80">${item.weeklyCost}<span className="text-[10px] text-white/40 ml-1">/wk</span></div>
                                            </div>
                                        </div>

                                        {/* Footer */}
                                        <div className="mt-auto flex items-center justify-between gap-4 pt-2">
                                            {isOwned ? (
                                                <div className="ml-auto px-4 py-2 text-xs font-bold text-emerald-500 uppercase tracking-widest bg-emerald-500/10 rounded-lg flex items-center gap-2">
                                                    <Check size={14} /> Owned & Equipped
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] text-white/40 uppercase tracking-wider">Price</span>
                                                        <span className={cn("text-xl font-normal font-mono leading-none", canAfford ? "text-white" : "text-red-400")}>
                                                            ${(item.purchaseCost / 1000).toFixed(item.purchaseCost % 1000 === 0 ? 0 : 1)}k
                                                        </span>
                                                    </div>
                                                    <Button
                                                        onClick={() => handlePurchase(item.id)}
                                                        disabled={!canAfford}
                                                        size="sm"
                                                        className={cn(
                                                            "px-8 font-bold transition-all shadow-lg h-10 ml-auto active:scale-95",
                                                            canAfford
                                                                ? "bg-white text-black hover:bg-indigo-500 hover:text-white"
                                                                : "bg-white/10 text-white/40"
                                                        )}
                                                    >
                                                        Purchase
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            )
                        })}
                    </div>
                </div>
            </div>
        </div>
    )
}
