import React, { useMemo, memo } from "react"
import { PlayerRole } from "@/types"
import { PlayerSaveData } from "@/engine/save-types"
import { cn } from "@/lib/utils"
import { Crosshair, Shield, Users, Brain, Zap, Trophy, Medal } from "lucide-react"
import { motion } from "framer-motion"

interface SystemBonusesProps {
    players: PlayerSaveData[]
    className?: string
}

const SystemBonusesInner: React.FC<SystemBonusesProps> = ({ players, className }) => {
    // 1. Calculate Role Counts
    const roles = useMemo(() => {
        const counts: Record<string, number> = {
            [PlayerRole.IGL]: 0,
            [PlayerRole.AWPER]: 0,
            [PlayerRole.SUPPORT]: 0,
            [PlayerRole.RIFLER]: 0,
            [PlayerRole.ENTRY_FRAGGER]: 0,
        }
        players.forEach(p => {
            if (counts[p.role] !== undefined) counts[p.role]++
            if (p.secondaryRole && p.secondaryRole !== p.role && counts[p.secondaryRole] !== undefined) {
                counts[p.secondaryRole]++
            }
        })
        return counts
    }, [players])

    // 2. Identify Active Bonuses
    const bonuses = useMemo(() => {
        const list = []

        // Role coverage: each unique role adds +4% team strength (engine: 0.8 + roles/5 * 0.2)
        // IGL - Commander
        if (roles[PlayerRole.IGL] >= 1) {
            list.push({ name: "Tactical Command", desc: "IGL present on roster", gain: "+4% Team Strength", active: true, icon: Brain, color: "text-amber-400", bg: "bg-amber-500" })
        } else {
            list.push({ name: "Tactical Command", desc: "Missing IGL", gain: "offline", active: false, icon: Brain, color: "text-white/20", bg: "bg-white/5" })
        }

        // AWP - Sniper
        if (roles[PlayerRole.AWPER] >= 1) {
            list.push({ name: "Sniper Coverage", desc: "Dedicated AWPer", gain: "+4% Team Strength", active: true, icon: Crosshair, color: "text-red-400", bg: "bg-red-500" })
        } else {
            list.push({ name: "Sniper Coverage", desc: "Missing AWPer", gain: "offline", active: false, icon: Crosshair, color: "text-white/20", bg: "bg-white/5" })
        }

        // Support - Utility
        if (roles[PlayerRole.SUPPORT] >= 1) {
            list.push({ name: "Utility Network", desc: "Support Player", gain: "+4% Team Strength", active: true, icon: Shield, color: "text-blue-400", bg: "bg-blue-500" })
        } else {
            list.push({ name: "Utility Network", desc: "Missing Support", gain: "offline", active: false, icon: Shield, color: "text-white/20", bg: "bg-white/5" })
        }

        // Entry/Riflers - 2+ Riflers
        const totalRiflers = roles[PlayerRole.RIFLER] + roles[PlayerRole.ENTRY_FRAGGER]

        if (totalRiflers >= 2) {
            list.push({ name: "Rifle Squad", desc: "2+ Riflers/Entries", gain: "+4% Team Strength", active: true, icon: Zap, color: "text-orange-400", bg: "bg-orange-500" })
        } else {
            list.push({ name: "Rifle Squad", desc: "Need 2+ Riflers", gain: "offline", active: false, icon: Zap, color: "text-white/20", bg: "bg-white/5" })
        }

        // Perfect Comp — all 5 unique roles give max role coverage (1.0) + chemistry boost
        const isPerfect = roles[PlayerRole.IGL] >= 1 && roles[PlayerRole.AWPER] >= 1 && roles[PlayerRole.SUPPORT] >= 1 && totalRiflers >= 2
        if (isPerfect) {
            list.push({ name: "Full Synergy", desc: "Balanced Composition", gain: "+20% Role Coverage", active: true, icon: Users, color: "text-emerald-400", bg: "bg-emerald-500" })
        } else {
            list.push({ name: "Full Synergy", desc: "Unbalanced Comp", gain: "offline", active: false, icon: Users, color: "text-white/20", bg: "bg-white/5" })
        }

        return list
    }, [roles])

    const activeCount = bonuses.filter(b => b.active).length

    return (
        <div className={cn("space-y-4", className)}>
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-normal uppercase tracking-widest text-white flex items-center gap-2">
                    <Medal size={16} className="text-primary" /> System Bonuses
                </h3>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                        Activation Status
                    </span>
                    <div className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] font-mono font-normal text-white/80">
                        {activeCount}/{bonuses.length}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {bonuses.map((bonus, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className={cn(
                            "relative overflow-hidden p-4 rounded-xl border transition-all duration-300 group min-h-[100px] flex flex-col justify-between",
                            bonus.active
                                ? "bg-white/[0.03] border-white/10 hover:border-white/20 hover:bg-white/[0.06]"
                                : "bg-black/20 border-white/5 opacity-60 grayscale hover:opacity-80 hover:grayscale-0"
                        )}
                    >
                        {/* Background Glow */}
                        {bonus.active && (
                            <div className={cn("absolute -right-10 -top-10 w-32 h-32 rounded-full blur-3xl opacity-10", bonus.bg)} />
                        )}

                        <div className="flex justify-between items-start mb-2">
                            <div className={cn("p-2 rounded-lg bg-black/40 border border-white/5", bonus.color)}>
                                <bonus.icon size={20} />
                            </div>
                            {bonus.active ? (
                                <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-[9px] font-normal text-emerald-500 uppercase tracking-wider">Active</span>
                                </div>
                            ) : (
                                <div className="px-2 py-1 rounded-full bg-white/5 border border-white/5">
                                    <span className="text-[9px] font-normal text-white/20 uppercase tracking-wider">Offline</span>
                                </div>
                            )}
                        </div>

                        <div>
                            <h4 className={cn("text-sm font-normal uppercase tracking-wide mb-1", bonus.active ? "text-white" : "text-white/50")}>
                                {bonus.name}
                            </h4>
                            <p className="text-[10px] font-medium text-muted-foreground mb-3">
                                {bonus.desc}
                            </p>
                            <div className={cn("text-xs font-normal font-mono", bonus.active ? "text-emerald-400" : "text-white/10")}>
                                {bonus.gain}
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    )
}

export const SystemBonuses = memo(SystemBonusesInner)
