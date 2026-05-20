"use client"

import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Home, Zap, Heart, Users, LineChart, ArrowUp, Hammer, Building2, Info, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { useCurrentTeam } from "@/hooks/useCurrentTeam"
import { toast } from "@/lib/toast"

type FacilityType = "TRAINING" | "RECOVERY" | "TACTICAL" | "FANZONE"

const FACILITIES: {
    id: FacilityType;
    name: string;
    icon: any;
    color: string;
    imagePath: string;
}[] = [
        {
            id: "TRAINING",
            name: "Training Center",
            icon: Zap,
            color: "text-cyan-400",
            imagePath: "/assets/facilities/training-room.png"
        },
        {
            id: "RECOVERY",
            name: "Wellness Center",
            icon: Heart,
            color: "text-rose-400",
            imagePath: "/assets/facilities/recovery-hub.png"
        },
        {
            id: "TACTICAL",
            name: "Command Hub",
            icon: LineChart,
            color: "text-amber-400",
            imagePath: "/assets/facilities/tactical-suite.png"
        },
        {
            id: "FANZONE",
            name: "Fan Plaza",
            icon: Users,
            color: "text-purple-400",
            imagePath: "/assets/facilities/fan-zone.png"
        },
    ]

const FACILITY_LEVELS: Record<FacilityType, Record<number, { desc: string; perks: string[] }>> = {
    TRAINING: {
        1: { desc: "Basic gaming booths for daily practice.", perks: ["+5% XP Gain from Scrims", "Unlock: Basic Scrims"] },
        2: { desc: "Upgraded setup with a dedicated analysts corner.", perks: ["+10% XP Gain", "Unlock: VOD Review (Tactics)"] },
        3: { desc: "Professional academy with private practice rooms.", perks: ["+20% XP Gain", "Unlock: Advanced Drills"] },
        4: { desc: "State-of-the-art lab with bio-metric feedback.", perks: ["+35% XP Gain", "Reduce Fatigue Gain by 10%"] },
        5: { desc: "The Empire Training Center: Apex of esports.", perks: ["+50% XP Gain", "Max Potential Unlock"] }
    },
    RECOVERY: {
        1: { desc: "Basic rest area with snacks and drinks.", perks: ["+5% Stamina Recovery", "Unlock: Short Break"] },
        2: { desc: "Chill zone with gaming chairs and lounges.", perks: ["+10% Stamina Recovery", "Unlock: Mental Reset"] },
        3: { desc: "Health suite with physical therapy equipment.", perks: ["+20% Stamina Recovery", "Reduce Injury Chance"] },
        4: { desc: "Performance kitchen and dedicated sleep pods.", perks: ["+35% Stamina Recovery", "Boost Morale Recovery"] },
        5: { desc: "Empire Wellness Retreat: Infinite stamina.", perks: ["+50% Stamina Recovery", "Near-Zero Injury Risk"] }
    },
    TACTICAL: {
        1: { desc: "Whiteboard and projector setup.", perks: ["Unlock: Match Analysis", "+5% Tactical Read"] },
        2: { desc: "VOD review station with basic software.", perks: ["Unlock: Playstyle Adjustments", "+10% Tactical Read"] },
        3: { desc: "War room with multi-screen data analysis.", perks: ["Unlock: Antistrat Feature", "+20% Tactical Read"] },
        4: { desc: "AI-assisted strategic simulator.", perks: ["Predict Opponent Vetos", "+35% Tactical Read"] },
        5: { desc: "Empire Command Hub: Tactical perfection.", perks: ["Perfect Strategy Counter", "+50% Tactical Read"] }
    },
    FANZONE: {
        1: { desc: "Small local fan club booth.", perks: ["+5% Merchandise Revenue", "+2% Fan Growth"] },
        2: { desc: "Official team store and media studio.", perks: ["+15% Merchandise Revenue", "+5% Fan Growth"] },
        3: { desc: "Interactive museum and fan experience hub.", perks: ["+30% Merchandise Revenue", "+10% Fan Growth"] },
        4: { desc: "Global flagship store and content mansion.", perks: ["+50% Merchandise Revenue", "Unlock: Global Sponsorships"] },
        5: { desc: "Empire Fan Plaza: Global cultural center.", perks: ["+100% Merchandise Revenue", "Legendary Status"] }
    }
}

export function FacilitiesApp() {
    const { upgradeFacility } = useGameStore(useShallow(state => ({
        upgradeFacility: state.upgradeFacility,
    })))
    const team = useCurrentTeam()
    const [upgradingId, setUpgradingId] = useState<string | null>(null)
    const [expandedId, setExpandedId] = useState<string | null>(null)

    if (!team) return <div className="p-4 text-white">Team not found</div>

    const getFacility = (type: FacilityType) => {
        return team.facilities?.find(f => f.type === type)
    }

    const getUpgradeCost = (type: FacilityType) => {
        const facility = getFacility(type)
        if (!facility) return 10000
        return facility.level * 25000
    }

    const handleUpgrade = (type: FacilityType, e: React.MouseEvent) => {
        e.stopPropagation()
        setUpgradingId(type)
        const result = upgradeFacility(team.id, type)
        setTimeout(() => setUpgradingId(null), 800)
        if (result.success) {
            toast.success("Facility Updated", { description: result.message })
        } else {
            toast.error("Cannot Upgrade Facility", { description: result.message })
        }
    }

    const getTotalUpkeep = () => {
        if (!team.facilities) return 0
        return team.facilities.reduce((acc, f) => acc + (f.monthlyCost || 0), 0)
    }

    return (
        <div className="flex flex-col h-full bg-[#09090b] text-white font-sans selection:bg-cyan-500/30">
            {/* Header */}
            <div className="p-6 border-b border-white/5 bg-gradient-to-r from-cyan-950/30 to-blue-950/30 backdrop-blur-md relative overflow-hidden">
                <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:20px_20px]" />
                <div className="flex justify-between items-start relative z-10">
                    <div>
                        <h1 className="text-3xl font-normal mb-2 flex items-center gap-3 tracking-tight">
                            <div className="p-2 bg-cyan-500/10 rounded-xl border border-cyan-500/20">
                                <Building2 className="text-cyan-400" size={24} />
                            </div>
                            Headquarters
                        </h1>
                        <p className="text-sm text-white/50 font-medium">Manage and upgrade your team's operational base.</p>
                    </div>
                    <div className="text-right bg-black/20 p-3 rounded-xl border border-white/5 backdrop-blur-sm">
                        <div className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-1">Weekly Maintenance</div>
                        <div className="text-xl font-normal font-mono text-red-400 flex items-center justify-end gap-1">
                            <ArrowUp size={14} className="rotate-45" />
                            ${Math.round(getTotalUpkeep() / 4).toLocaleString()}
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                <div className="grid grid-cols-1 gap-4 max-w-4xl mx-auto">
                    {FACILITIES.map(fac => {
                        const facility = getFacility(fac.id)
                        const level = facility?.level || 0
                        const cost = getUpgradeCost(fac.id)
                        const canAfford = team.budget >= cost
                        const isMaxed = level >= 5
                        const Icon = fac.icon
                        const isExpanded = expandedId === fac.id

                        const currentLevelInfo = level > 0 ? FACILITY_LEVELS[fac.id][level] : null
                        const nextLevelInfo = !isMaxed ? FACILITY_LEVELS[fac.id][level + 1] : null

                        return (
                            <motion.div
                                key={fac.id}
                                layout
                                onClick={() => setExpandedId(isExpanded ? null : fac.id)}
                                className={cn(
                                    "relative overflow-hidden rounded-3xl border transition-all cursor-pointer group select-none",
                                    isExpanded
                                        ? "ring-1 ring-cyan-500/50 border-cyan-500/50 shadow-[0_0_50px_-10px_rgba(6,182,212,0.15)] bg-[#0d0d10]"
                                        : "border-white/5 hover:border-white/10 bg-[#0d0d10]"
                                )}
                            >
                                {/* Collapsed / Header View */}
                                <div className="relative p-6">
                                    <div className="flex items-center gap-5">
                                        {/* Facility Icon Box */}
                                        <div className={cn(
                                            "w-16 h-16 rounded-2xl flex items-center justify-center shadow-2xl relative overflow-hidden group-hover:scale-105 transition-transform duration-500",
                                            "bg-gradient-to-br from-white/5 to-transparent border border-white/10"
                                        )}>
                                            <div className={cn("absolute inset-0 opacity-20 bg-current", fac.color)} />
                                            <Icon size={32} className={cn("relative z-10", fac.color)} />
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 mb-1">
                                                <h3 className="text-xl font-bold text-white tracking-tight">{fac.name}</h3>
                                                {level > 0 ? (
                                                    <Badge className={cn("bg-cyan-500/10 text-cyan-400 border-cyan-500/20 h-5 px-1.5 text-[10px] font-normal tracking-wider")}>
                                                        LVL {level}
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-white/30 border-white/10 h-5 px-1.5 text-[10px] tracking-wider">
                                                        NOT BUILT
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-sm text-white/50 truncate">
                                                {currentLevelInfo?.desc || nextLevelInfo?.desc}
                                            </p>
                                        </div>

                                        {/* Quick Action (Collapsed) */}
                                        {!isExpanded && !isMaxed && (
                                            <Button
                                                disabled={!canAfford}
                                                className={cn(
                                                    "h-10 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all",
                                                    canAfford
                                                        ? "bg-white text-black hover:bg-cyan-400 hover:scale-105"
                                                        : "bg-white/5 text-white/20"
                                                )}
                                            >
                                                Build ${cost.toLocaleString()}
                                            </Button>
                                        )}
                                        <div className={cn("transition-transform duration-300 text-white/20", isExpanded && "rotate-180")}>
                                            <ArrowUp size={20} />
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded Content */}
                                <AnimatePresence>
                                    {isExpanded && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: "auto" }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="border-t border-white/5 bg-black/20"
                                        >
                                            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                                                {/* Current Status Column */}
                                                <div className="space-y-4">
                                                    <div className="flex items-center gap-2 text-xs font-bold text-white/40 uppercase tracking-widest">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
                                                        Current Status
                                                    </div>

                                                    {level === 0 ? (
                                                        <div className="p-6 rounded-2xl bg-white/5 border border-dashed border-white/10 text-center">
                                                            <p className="text-white/30 text-sm font-medium">Facility not yet constructed</p>
                                                        </div>
                                                    ) : (
                                                        <div className="relative group/card">
                                                            <div className="absolute -inset-0.5 bg-gradient-to-br from-cyan-500/20 to-blue-500/0 rounded-2xl blur opacity-0 group-hover/card:opacity-100 transition-opacity" />
                                                            <div className="relative p-5 rounded-2xl bg-[#121217] border border-white/10">
                                                                <div className="text-lg font-bold text-white mb-1">Level {level}</div>
                                                                <p className="text-sm text-white/60 mb-4 leading-relaxed">{currentLevelInfo?.desc}</p>

                                                                <div className="space-y-2">
                                                                    {currentLevelInfo?.perks.map((perk, i) => (
                                                                        <div key={i} className="flex items-center gap-3 text-xs font-medium text-cyan-100/80 bg-cyan-500/5 p-2 rounded-lg border border-cyan-500/10">
                                                                            <CheckCircle2 size={14} className="text-cyan-400 shrink-0" />
                                                                            {perk}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Next Upgrade Column */}
                                                <div className="space-y-4">
                                                    <div className="flex items-center gap-2 text-xs font-bold text-white/40 uppercase tracking-widest">
                                                        <div className={cn("w-1.5 h-1.5 rounded-full", isMaxed ? "bg-emerald-500" : "bg-cyan-500")} />
                                                        {isMaxed ? "Status" : "Next Upgrade"}
                                                    </div>

                                                    {isMaxed ? (
                                                        <div className="h-full flex flex-col items-center justify-center p-6 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 text-center">
                                                            <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 mb-3">
                                                                <CheckCircle2 size={24} />
                                                            </div>
                                                            <h4 className="text-emerald-400 font-bold mb-1">Max Level Reached</h4>
                                                            <p className="text-emerald-500/60 text-xs">This facility is fully upgraded.</p>
                                                        </div>
                                                    ) : (
                                                        <div className="relative p-5 rounded-2xl bg-[#121217] border border-white/10 ring-1 ring-white/5">
                                                            <div className="flex justify-between items-start mb-4">
                                                                <div>
                                                                    <div className="text-lg font-bold text-white mb-1 text-cyan-400">Level {level + 1}</div>
                                                                    <p className="text-xs text-white/50">Next Tier Unlocked</p>
                                                                </div>
                                                                <div className="px-3 py-1 rounded-lg bg-white/5 border border-white/10">
                                                                    <span className={cn("font-mono font-bold", canAfford ? "text-white" : "text-red-400")}>
                                                                        ${cost.toLocaleString()}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            <p className="text-sm text-white/60 mb-4 leading-relaxed">{nextLevelInfo?.desc}</p>

                                                            <div className="space-y-2 mb-6">
                                                                {nextLevelInfo?.perks.map((perk, i) => (
                                                                    <div key={i} className="flex items-center gap-3 text-xs font-medium text-white/80 bg-white/5 p-2 rounded-lg border border-white/5">
                                                                        <ArrowUp size={14} className="text-white/40 shrink-0" />
                                                                        {perk}
                                                                    </div>
                                                                ))}
                                                            </div>

                                                            <Button
                                                                onClick={(e) => handleUpgrade(fac.id, e)}
                                                                disabled={!canAfford || upgradingId === fac.id}
                                                                className={cn(
                                                                    "w-full h-12 rounded-xl font-bold uppercase tracking-wider text-xs transition-all",
                                                                    canAfford
                                                                        ? "bg-cyan-500 hover:bg-cyan-400 text-black shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_30px_rgba(6,182,212,0.5)]"
                                                                        : "bg-white/5 text-white/20 border border-white/5"
                                                                )}
                                                            >
                                                                {upgradingId === fac.id ? (
                                                                    <span className="flex items-center gap-2">
                                                                        <Hammer className="animate-spin" size={16} /> Construction in Progress...
                                                                    </span>
                                                                ) : (
                                                                    canAfford ? "Purchase Upgrade" : "Insufficient Funds"
                                                                )}
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
