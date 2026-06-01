"use client"

import React, { useMemo, useState } from "react"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import {
    Mouse,
    Keyboard,
    Monitor,
    Headphones,
    Armchair,
    Cpu,
    Check,
    ArrowUpCircle,
    X
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { toast } from "@/lib/toast"
import Image from "next/image"
import {
    EquipmentManager,
    EQUIPMENT_CATALOG,
    EQUIPMENT_TYPE_DISPLAY,
    EQUIPMENT_TIER_DISPLAY,
    EquipmentType,
    EquipmentCatalogItem
} from "@/engine/equipment-manager"
import type { EquipmentItem } from "@/engine/save-types"

const ICON_MAP: Record<string, typeof Mouse> = { Mouse, Keyboard, Monitor, Headphones, Armchair, Cpu }
// Derived from the display map so a future EquipmentType addition can't drift
// — both lists stay in lock-step automatically.
const EQUIPMENT_TYPES = Object.keys(EQUIPMENT_TYPE_DISPLAY) as EquipmentType[]

export default function EquipmentPage() {
    const { teams, playerTeamId, purchaseEquipment } = useGameStore(useShallow(state => ({
        teams: state.teams,
        playerTeamId: state.playerTeamId,
        purchaseEquipment: state.purchaseEquipment,
    })))
    const [selectedType, setSelectedType] = useState<EquipmentType | "ALL">("ALL")
    const [selectedItem, setSelectedItem] = useState<EquipmentCatalogItem | null>(null)

    const playerTeam = useMemo(() => teams.find(t => t.id === playerTeamId), [teams, playerTeamId])

    const equipmentStatus = useMemo(() => {
        if (!playerTeam) return []
        return EQUIPMENT_TYPES.map(type => ({
            type,
            ...EQUIPMENT_TYPE_DISPLAY[type],
            current: EquipmentManager.getTeamEquipment(playerTeam, type),
        }))
    }, [playerTeam])

    // Index team's currently-equipped items by type for O(1) lookup in the
    // catalog .map() below. Was doing EquipmentManager.getTeamEquipment per
    // row × 2 (isOwned + isUpgrade) — O(catalog × team_equipment.length).
    const equippedByType = useMemo(() => {
        const map = new Map<EquipmentType, EquipmentItem | undefined>()
        if (!playerTeam) return map
        for (const type of EQUIPMENT_TYPES) {
            map.set(type, EquipmentManager.getTeamEquipment(playerTeam, type))
        }
        return map
    }, [playerTeam])

    const { bonuses, weeklyCost, completeness, avgTier } = useMemo(() => {
        if (!playerTeam) return { bonuses: null, weeklyCost: 0, completeness: 0, avgTier: 0 }
        return {
            bonuses: EquipmentManager.calculateBonuses(playerTeam),
            weeklyCost: EquipmentManager.calculateWeeklyCost(playerTeam),
            completeness: EquipmentManager.getEquipmentCompleteness(playerTeam),
            avgTier: EquipmentManager.getAverageEquipmentTier(playerTeam),
        }
    }, [playerTeam])

    const displayItems = useMemo(() => (
        selectedType === "ALL"
            ? EQUIPMENT_CATALOG
            : EQUIPMENT_CATALOG.filter(e => e.type === selectedType)
    ), [selectedType])

    if (!playerTeam) return null

    const handlePurchase = (item: EquipmentCatalogItem) => {
        if (!purchaseEquipment) return
        const result = purchaseEquipment(item.id)
        if (result.success) {
            toast.success(`Purchased ${item.name}!`, {
                description: `+${item.bonus.value} ${item.bonus.stat} bonus applied`,
            })
            setSelectedItem(null)
        } else {
            toast.error("Purchase failed", { description: result.error })
        }
    }

    const isOwned = (item: EquipmentCatalogItem) => equippedByType.get(item.type)?.id === item.id
    const isUpgrade = (item: EquipmentCatalogItem) => {
        const current = equippedByType.get(item.type)
        return !current || item.tier > current.tier
    }

    return (
        <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#0a0a0a] to-black pb-20">
            {/* Header / Hero Section */}
            <div className="relative pt-12 pb-12 px-8 overflow-hidden">
                <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:32px]" />
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-[400px] bg-primary/20 blur-[120px] rounded-full opacity-20 pointer-events-none" />

                <div className="max-w-7xl mx-auto relative z-10 flex flex-col md:flex-row justify-between items-end gap-8">
                    <div>
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-center gap-3 mb-2"
                        >
                            <Badge className="bg-white/10 text-white hover:bg-white/20 border-white/10 backdrop-blur-md">
                                LOGISTICS CENTER
                            </Badge>
                            <div className="h-px w-20 bg-gradient-to-r from-white/20 to-transparent" />
                        </motion.div>
                        <h1 className="text-6xl font-normal tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-white via-white to-white/40 mb-4">
                            EQUIPMENT
                        </h1>
                        <p className="max-w-xl text-lg text-muted-foreground font-light leading-relaxed">
                            Upgrade your facility with professional-grade hardware.
                            Better equipment directly impacts player performance, reaction times, and development speed.
                        </p>
                    </div>

                    {/* Stats HUD */}
                    <div className="flex gap-4">
                        <div className="glass-panel p-6 border-white/10 backdrop-blur-xl bg-white/[0.03] min-w-[160px]">
                            <p className="text-[10px] font-normal uppercase tracking-[0.2em] text-muted-foreground mb-1">Budget</p>
                            <p className="text-3xl font-normal font-sans text-emerald-400 tracking-tight">
                                ${(playerTeam.budget / 1000).toFixed(1)}k
                            </p>
                        </div>
                        <div className="glass-panel p-6 border-white/10 backdrop-blur-xl bg-white/[0.03] min-w-[160px]">
                            <p className="text-[10px] font-normal uppercase tracking-[0.2em] text-muted-foreground mb-1">Upkeep</p>
                            <p className="text-3xl font-normal font-sans text-red-400 tracking-tight">
                                -${weeklyCost}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-8 space-y-8">
                {/* Category Filter */}
                <div className="flex flex-wrap items-center justify-center gap-3 py-4 sticky top-4 z-30">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-xl -z-10 rounded-2xl border border-white/5 shadow-2xl" />
                    <Button
                        variant={selectedType === "ALL" ? "default" : "ghost"}
                        onClick={() => setSelectedType("ALL")}
                        className={cn("rounded-xl h-10 px-6 font-bold tracking-wide transition-all", selectedType === "ALL" ? "bg-white text-black hover:bg-white/90" : "text-muted-foreground hover:text-white")}
                    >
                        ALL
                    </Button>
                    <div className="w-px h-6 bg-white/10 mx-2" />
                    {Object.entries(EQUIPMENT_TYPE_DISPLAY).map(([type, info]) => {
                        const Icon = ICON_MAP[info.icon]
                        return (
                            <Button
                                key={type}
                                variant={selectedType === type ? "default" : "ghost"}
                                onClick={() => setSelectedType(type as EquipmentType)}
                                className={cn(
                                    "rounded-xl h-10 gap-2 font-bold tracking-wide transition-all",
                                    selectedType === type
                                        ? "bg-white text-black hover:bg-white/90 shadow-[0_0_20px_rgba(255,255,255,0.3)]"
                                        : "text-muted-foreground hover:text-white hover:bg-white/5"
                                )}
                            >
                                <Icon size={16} />
                                {info.label}
                            </Button>
                        )
                    })}
                </div>

                {/* Main Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <AnimatePresence mode="popLayout">
                        {displayItems.map((item, idx) => {
                            const typeDisplay = EQUIPMENT_TYPE_DISPLAY[item.type]
                            const tierDisplay = EQUIPMENT_TIER_DISPLAY[item.tier]
                            const owned = isOwned(item)
                            const upgrade = !owned && isUpgrade(item)

                            return (
                                <motion.div
                                    key={item.id}
                                    layout
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    transition={{ delay: idx * 0.05 }}
                                    onClick={() => setSelectedItem(item)}
                                    className={cn(
                                        "group relative h-[380px] rounded-3xl overflow-hidden cursor-pointer transition-[transform,border-color,box-shadow] duration-200 ease-out",
                                        "border border-white/5 hover:border-white/20 hover:shadow-2xl hover:-translate-y-1",
                                        owned ? "bg-emerald-950/20" : "bg-white/[0.02]"
                                    )}
                                >
                                    {/* Background Image / Glow */}
                                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/5 to-transparent" />

                                    {/* Use the new realistic image */}
                                    <div className="absolute inset-x-0 top-0 h-[240px] flex items-center justify-center p-8 transition-transform duration-300 ease-out group-hover:scale-105">
                                        <div className="relative w-full h-full">
                                            <Image
                                                src={item.imagePath || typeDisplay.imagePath}
                                                alt={item.name}
                                                fill
                                                className="object-contain drop-shadow-[0_20px_40px_rgba(0,0,0,0.5)]"
                                            />
                                        </div>
                                    </div>

                                    {/* Content Overlay */}
                                    <div className="absolute inset-x-0 bottom-0 min-h-[140px] p-6 bg-gradient-to-t from-black via-black/90 to-transparent flex flex-col justify-end">
                                        <div className="flex items-start justify-between mb-2">
                                            <div>
                                                <Badge variant="outline" className={cn("mb-2 border-none bg-white/5 backdrop-blur-sm", tierDisplay.color)}>
                                                    TIER {item.tier} • {tierDisplay.label}
                                                </Badge>
                                                <h3 className="text-xl font-normal text-white leading-tight uppercase tracking-tight group-hover:text-primary transition-colors">
                                                    {item.name}
                                                </h3>
                                            </div>
                                            {owned && (
                                                <div className="w-8 h-8 rounded-full bg-emerald-500 text-black flex items-center justify-center">
                                                    <Check size={16} strokeWidth={4} />
                                                </div>
                                            )}
                                            {upgrade && (
                                                <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold">
                                                    <ArrowUpCircle size={12} />
                                                    UPGRADE
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-center justify-between mt-2">
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <span className="text-emerald-400 font-bold">+{item.bonus.value} {item.bonus.stat}</span>
                                            </div>
                                            <p className="font-sans font-bold text-white">
                                                ${item.purchaseCost.toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                </motion.div>
                            )
                        })}
                    </AnimatePresence>
                </div>
            </div>

            {/* Detail Modal */}
            <AnimatePresence>
                {selectedItem && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedItem(null)}
                            className="absolute inset-0 bg-black/80 backdrop-blur-xl"
                        />

                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-4xl bg-[#0f0f0f] border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row"
                        >
                            <button
                                onClick={() => setSelectedItem(null)}
                                className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-white hover:text-black transition-colors"
                            >
                                <X size={20} />
                            </button>

                            {/* Left: Visual */}
                            <div className="w-full md:w-1/2 bg-gradient-to-br from-white/[0.03] to-transparent relative min-h-[300px] flex items-center justify-center p-12">
                                <div className="absolute inset-0 bg-[url('/assets/grid.svg')] opacity-20" />
                                <motion.div
                                    className="relative w-full aspect-square"
                                    initial={{ y: 20, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ delay: 0.2 }}
                                >
                                    <Image
                                        src={selectedItem.imagePath || EQUIPMENT_TYPE_DISPLAY[selectedItem.type].imagePath}
                                        alt={selectedItem.name}
                                        fill
                                        className="object-contain drop-shadow-[0_50px_100px_rgba(0,0,0,0.8)]"
                                    />
                                </motion.div>
                            </div>

                            {/* Right: Info */}
                            <div className="w-full md:w-1/2 p-8 md:p-12 flex flex-col">
                                <div className="mb-auto">
                                    <div className="flex items-center gap-3 mb-4">
                                        <Badge className={cn("px-3 py-1 text-xs", EQUIPMENT_TIER_DISPLAY[selectedItem.tier].bgColor, EQUIPMENT_TIER_DISPLAY[selectedItem.tier].color)}>
                                            TIER {selectedItem.tier}
                                        </Badge>
                                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                                            {EQUIPMENT_TYPE_DISPLAY[selectedItem.type].label}
                                        </span>
                                    </div>

                                    <h2 className="text-4xl font-normal text-white uppercase tracking-tighter mb-4 leading-none">
                                        {selectedItem.name}
                                    </h2>
                                    <p className="text-muted-foreground leading-relaxed mb-8">
                                        {selectedItem.description}. Designed to provide maximum competitive advantage in high-stakes matches.
                                    </p>

                                    <div className="grid grid-cols-2 gap-4 mb-8">
                                        <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                                            <p className="text-[10px] font-normal uppercase text-muted-foreground mb-1">Performance Boost</p>
                                            <p className="text-2xl font-normal text-emerald-400">+{selectedItem.bonus.value} {selectedItem.bonus.stat}</p>
                                        </div>
                                        <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                                            <p className="text-[10px] font-normal uppercase text-muted-foreground mb-1">Weekly Maintenance</p>
                                            <p className="text-2xl font-normal text-red-400">-${selectedItem.weeklyCost}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-8 border-t border-white/10">
                                    <div className="flex items-center justify-between mb-6">
                                        <div>
                                            <p className="text-xs font-bold text-muted-foreground uppercase">Price</p>
                                            <p className="text-3xl font-normal text-white font-sans">${selectedItem.purchaseCost.toLocaleString()}</p>
                                        </div>
                                        {isOwned(selectedItem) ? (
                                            <div className="flex items-center gap-2 text-emerald-400 font-bold uppercase tracking-widest text-sm">
                                                <CheckCircleIcon /> Item Acquired
                                            </div>
                                        ) : (
                                            <div className={cn("text-sm font-bold uppercase tracking-widest", playerTeam.budget >= selectedItem.purchaseCost ? "text-emerald-400" : "text-red-500")}>
                                                {playerTeam.budget >= selectedItem.purchaseCost ? "In Budget" : "Funds Needed"}
                                            </div>
                                        )}
                                    </div>

                                    {!isOwned(selectedItem) && (
                                        <Button
                                            size="lg"
                                            className="w-full h-14 text-lg font-normal uppercase tracking-widest bg-white text-black hover:bg-white/90"
                                            onClick={() => handlePurchase(selectedItem)}
                                            disabled={playerTeam.budget < selectedItem.purchaseCost}
                                        >
                                            Purchase Equipment
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    )
}

function CheckCircleIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
    )
}
