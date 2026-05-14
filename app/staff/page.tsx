"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { useCurrentTeam } from "@/hooks/useCurrentTeam"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/lib/toast"
import { User, Briefcase, Zap, DollarSign, Award, Users, TrendingUp, Search, Brain, Clock, RefreshCw, Star, Sparkles, Activity, Shield } from "lucide-react"
import { cn } from "@/lib/utils"
import { StaffDetailsModal } from "@/components/staff/StaffDetailsModal"
import { StaffPortrait } from "@/components/ui/asset-images"
import {
    GlassTableHeader,
    GlassTableHead,
    GlassTableRow,
    GlassTableCell,
    GlassStatCell
} from "@/components/ui/GlassTable"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { StaffNegotiationModal } from "@/components/staff/StaffNegotiationModal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

// Hoisted lookup tables — were being rebuilt as fresh switch closures inside
// the page every render. These never change at runtime.
const ROLE_ICON: Record<string, React.ReactNode> = {
    coach: <Users size={16} className="text-blue-400" />,
    analyst: <TrendingUp size={16} className="text-emerald-400" />,
    psychologist: <Brain size={16} className="text-purple-400" />,
    scout: <Search size={16} className="text-amber-400" />,
}
const ROLE_ICON_FALLBACK = <User size={16} />

const RARITY_COLOR: Record<string, string> = {
    Legendary: "bg-amber-500/20 text-amber-500 border-amber-500/50",
    Epic: "bg-purple-500/20 text-purple-400 border-purple-500/50",
    Rare: "bg-blue-500/20 text-blue-400 border-blue-500/50",
}
const RARITY_COLOR_FALLBACK = "bg-slate-500/20 text-slate-400 border-slate-500/50"

function getRoleIcon(role: string) {
    return ROLE_ICON[role] || ROLE_ICON_FALLBACK
}
function getRarityColor(rarity?: string) {
    return (rarity && RARITY_COLOR[rarity]) || RARITY_COLOR_FALLBACK
}

export default function StaffPage() {
    const {
        staff,
        players,
        playerTeamId,
        hireStaff,
        fireStaff,
        marketStaff,
        refreshStaffMarket,
        currentWeek,
        _hasHydrated,
    } = useGameStore(useShallow(state => ({
        staff: state.staff,
        players: state.players,
        playerTeamId: state.playerTeamId,
        hireStaff: state.hireStaff,
        fireStaff: state.fireStaff,
        marketStaff: state.marketStaff,
        refreshStaffMarket: state.refreshStaffMarket,
        currentWeek: state.currentWeek,
        _hasHydrated: state._hasHydrated,
    })))

    const playerTeam = useCurrentTeam()
    const currentStaff = useMemo(
        () => staff.filter(s => s.teamId === playerTeamId),
        [staff, playerTeamId]
    )

    // Negotiation State
    const [negotiatingStaffId, setNegotiatingStaffId] = useState<string | null>(null)
    const [isRenewal, setIsRenewal] = useState(false)
    const [viewingStaffId, setViewingStaffId] = useState<string | null>(null)

    // Bonuses: previously this re-ran 3 filter() + reduce() passes on every
    // render (every store mutation), which on the 532 kB Staff page added up.
    // One pass over currentStaff, memoized to staff identity.
    const bonuses = useMemo(() => {
        let coachDev = 0
        let psychRecovery = 0
        let analystAnalysis = 0
        for (const s of currentStaff) {
            if (s.role === 'coach') coachDev += s.stats?.development || 50
            else if (s.role === 'psychologist') psychRecovery += s.stats?.mentalRecovery || 50
            else if (s.role === 'analyst') analystAnalysis += s.stats?.analysis || 50
        }
        return {
            xp: coachDev * 0.5,        // 100 stat = 50%
            recovery: psychRecovery / 10, // 100 stat = 10
            tactical: analystAnalysis / 20, // 100 stat = 5
        }
    }, [currentStaff])
    useEffect(() => {
        // Only refresh if hydrated and market is empty
        if (_hasHydrated && marketStaff.length === 0) {
            refreshStaffMarket()
        }
    }, [_hasHydrated]) // Remove marketStaff.length from deps to prevent re-runs


    const handleFire = (staffId: string) => {
        fireStaff(staffId)
        toast.info("Staff member released")
    }

    // Helper for Stats
    const renderStats = (stats?: Record<string, number>) => {
        if (!stats) return null
        return (
            <div className="grid grid-cols-2 gap-2 mt-2">
                {Object.entries(stats).map(([key, val]) => (
                    <div key={key} className="flex justify-between items-center text-[10px] uppercase font-bold bg-white/5 rounded px-2 py-1">
                        <span className="text-white/50">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                        <span className={cn(val >= 90 ? "text-amber-500" : val >= 80 ? "text-emerald-400" : "text-white")}>{val}</span>
                    </div>
                ))}
            </div>
        )
    }

    return (
        <div className="p-8 space-y-12 max-w-7xl mx-auto pb-24">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h1 className="text-5xl font-normal tracking-tighter uppercase liquid-text mb-2">Staff & Operations</h1>
                    <p className="text-muted-foreground font-medium uppercase text-xs tracking-[0.2em] flex items-center gap-2">
                        <Briefcase size={12} /> Management Division
                    </p>
                </div>

                <div className="glass-panel px-6 py-3 border-primary/20 bg-primary/5 flex items-center gap-6">
                    <div>
                        <p className="text-[10px] font-normal uppercase text-muted-foreground">Weekly Payroll</p>
                        <p className="text-lg font-normal text-rose-400">-${currentStaff.reduce((sum, s) => sum + s.salaryPerWeek, 0).toLocaleString()}</p>
                    </div>
                    <div className="h-8 w-[1px] bg-white/10" />
                    <div>
                        <p className="text-[10px] font-normal uppercase text-muted-foreground">Staff Slots</p>
                        <p className="text-lg font-normal text-white">{currentStaff.length} / 5</p>
                    </div>
                </div>
            </div>

            {/* ACTIVE EFFECTS PANEL */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass-panel p-4 flex items-center gap-4 bg-blue-500/5 border-blue-500/10">
                    <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400">
                        <Sparkles size={20} />
                    </div>
                    <div>
                        <p className="text-[10px] font-normal uppercase text-muted-foreground">Training XP Bonus</p>
                        <p className="text-xl font-normal text-white">+{bonuses.xp.toFixed(1)}%</p>
                    </div>
                </div>

                <div className="glass-panel p-4 flex items-center gap-4 bg-purple-500/5 border-purple-500/10">
                    <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400">
                        <Activity size={20} />
                    </div>
                    <div>
                        <p className="text-[10px] font-normal uppercase text-muted-foreground">Recovery Bonus</p>
                        <p className="text-xl font-normal text-white">+{bonuses.recovery.toFixed(1)} <span className="text-[10px] text-white/50">/week</span></p>
                    </div>
                </div>

                <div className="glass-panel p-4 flex items-center gap-4 bg-amber-500/5 border-amber-500/10">
                    <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400">
                        <Shield size={20} />
                    </div>
                    <div>
                        <p className="text-[10px] font-normal uppercase text-muted-foreground">Tactical Power</p>
                        <p className="text-xl font-normal text-white">+{bonuses.tactical.toFixed(1)}</p>
                    </div>
                </div>
            </section>

            {/* CURRENT STAFF SECTION */}
            <section className="space-y-6">
                <h2 className="text-sm font-normal uppercase tracking-widest text-white flex items-center gap-2 border-b border-white/5 pb-2">
                    <Users size={16} className="text-primary" /> Active Roster
                </h2>

                {currentStaff.length === 0 ? (
                    <div className="glass-panel p-8 text-center text-muted-foreground italic">
                        No staff hired. Visit the market below to recruit talent.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        <AnimatePresence>
                            {currentStaff.map((s) => (
                                <motion.div
                                    key={s.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="glass-panel p-0 overflow-hidden group relative"
                                >
                                    <div className="p-4 flex gap-4">
                                        <div className="w-20 h-24 bg-neutral-900 border border-white/10 rounded flex-shrink-0 relative overflow-hidden">
                                            {/* Portrait */}
                                            <StaffPortrait
                                                src={s.portraitPath}
                                                alt={s.name}
                                                size={80}
                                                className="w-full h-full"
                                            />
                                            {/* Level Badge */}
                                            <div className="absolute top-0 right-0 bg-primary text-black text-[8px] font-normal px-1.5 py-0.5">
                                                LVL {s.level}
                                            </div>
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <h3 className="font-bold text-white truncate">{s.name}</h3>
                                                        {s.nationality && <CountryFlag country={s.nationality} size={14} className="opacity-80" />}
                                                    </div>
                                                    <div className="text-[10px] font-normal uppercase text-primary tracking-wider flex items-center gap-1 mt-0.5">
                                                        {getRoleIcon(s.role)} {s.role}
                                                    </div>
                                                </div>
                                                {/* Rarity Badge */}
                                                {s.rarity && (
                                                    <Badge variant="outline" className={cn("text-[8px] h-5 tracking-wider px-1.5", getRarityColor(s.rarity))}>
                                                        {s.rarity}
                                                    </Badge>
                                                )}
                                            </div>

                                            <p className="text-[10px] text-muted-foreground mt-2 line-clamp-2 min-h-[2.5em]">
                                                {s.description || `Specialist in ${s.specialization}`}
                                            </p>

                                            <div className="mt-3 flex items-center gap-1.5">
                                                <Badge variant="outline" className="text-[8px] h-5 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                                                    ${s.salaryPerWeek.toLocaleString()}/wk
                                                </Badge>
                                                {s.contractEndWeek && (
                                                    <Badge variant="outline" className="text-[8px] h-5 bg-blue-500/10 text-blue-400 border-blue-500/20 flex items-center gap-1">
                                                        <Clock size={8} />
                                                        {Math.max(0, s.contractEndWeek - currentWeek)} wks left
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Stats Drawer */}
                                    {s.stats && (
                                        <div className="px-4 pb-4 border-t border-white/5 pt-3">
                                            {renderStats(s.stats)}
                                        </div>
                                    )}

                                    <div className="p-3 bg-white/5 border-t border-white/5 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            className="h-7 text-[10px] uppercase font-bold flex-1"
                                            disabled={(s.contractEndWeek ? s.contractEndWeek - currentWeek : 52) >= 52}
                                            onClick={() => {
                                                setNegotiatingStaffId(s.id)
                                                setIsRenewal(true)
                                            }}
                                        >
                                            Renew
                                        </Button>
                                        <ConfirmDialog
                                            title="Fire Staff Member?"
                                            description={`Are you sure you want to release ${s.name}? This action cannot be undone.`}
                                            onConfirm={() => fireStaff(s.id)}
                                            destructive
                                            confirmText="Fire"
                                            icon="danger"
                                        >
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                className="h-7 text-[10px] uppercase font-bold flex-1"
                                            >
                                                Fire
                                            </Button>
                                        </ConfirmDialog>
                                    </div>

                                    {/* Separate Manage Talents Button */}
                                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            aria-label="View staff talents"
                                            className="h-6 w-6 p-0 rounded-full bg-black/50 border-white/20 text-white hover:text-white"
                                            onClick={() => setViewingStaffId(s.id)}
                                        >
                                            <Star size={12} />
                                        </Button>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </section>

            {/* STAFF MARKET SECTION */}
            <section className="space-y-6">
                <div className="flex justify-between items-end border-b border-white/5 pb-2">
                    <h2 className="text-sm font-normal uppercase tracking-widest text-white flex items-center gap-2">
                        <Briefcase size={16} className="text-amber-400" /> Free Agent Market
                    </h2>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[10px] uppercase font-bold text-muted-foreground hover:text-white flex items-center gap-2"
                        onClick={() => {
                            refreshStaffMarket()
                            toast.info("Market Refreshed")
                        }}
                    >
                        <RefreshCw size={12} /> Refresh Market
                    </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {marketStaff.map((s) => (
                        <motion.div
                            key={s.id}
                            whileHover={{ scale: 1.01 }}
                            className="glass-panel p-0 overflow-hidden border-white/5 hover:border-primary/30 transition-colors"
                        >
                            <div className="p-4 flex gap-4">
                                <div className="w-16 h-16 bg-neutral-900 border border-white/10 rounded flex-shrink-0 relative overflow-hidden">
                                    <StaffPortrait
                                        src={s.portraitPath}
                                        alt={s.name}
                                        size={64}
                                        className="w-full h-full"
                                    />
                                    {/* Flag removed from here */}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-bold text-white text-sm truncate">{s.name}</h3>
                                                {s.nationality && <CountryFlag country={s.nationality} size={14} className="opacity-80" />}
                                            </div>
                                            <div className="text-[10px] font-normal uppercase text-amber-400 tracking-wider flex items-center gap-1">
                                                {getRoleIcon(s.role)} {s.role}
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            <Badge className="bg-white/10 text-white hover:bg-white/20 text-[10px]">
                                                LVL {s.level}
                                            </Badge>
                                            {s.rarity && (
                                                <Badge variant="outline" className={cn("text-[8px] h-4 tracking-wider px-1 flex justify-center", getRarityColor(s.rarity))}>
                                                    {s.rarity}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 mt-2">
                                        <Badge variant="secondary" className="text-[10px] h-5">
                                            {s.specialization}
                                        </Badge>
                                    </div>
                                </div>
                            </div>

                            {/* Market Details */}
                            <div className="bg-white/5 px-4 py-3 flex justify-between items-center border-t border-white/5">
                                <div className="flex flex-col">
                                    <span className="text-[8px] font-bold uppercase text-muted-foreground">Weekly Rate</span>
                                    <span className="text-sm font-normal text-white">${s.salaryPerWeek.toLocaleString()}</span>
                                </div>
                                <Button
                                    size="sm"
                                    className="h-8 bg-white text-black hover:bg-white/90 font-bold uppercase text-[10px]"
                                    onClick={() => {
                                        setNegotiatingStaffId(s.id)
                                        setIsRenewal(false)
                                    }}
                                >
                                    <DollarSign size={12} className="mr-1" />
                                    Make Offer
                                </Button>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* Negotiation Modal */}
            {negotiatingStaffId && (
                <StaffNegotiationModal
                    key={negotiatingStaffId}
                    staffId={negotiatingStaffId}
                    isOpen={!!negotiatingStaffId}
                    onClose={() => setNegotiatingStaffId(null)}
                    isRenewal={isRenewal}
                />
            )}
            {viewingStaffId && (
                <StaffDetailsModal
                    staffId={viewingStaffId}
                    onClose={() => setViewingStaffId(null)}
                />
            )}
        </div>
    )
}


