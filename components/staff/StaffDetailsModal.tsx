import React from 'react'
import Image from 'next/image'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Briefcase, Zap, Star, Brain, Target, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useGameStore } from '@/store/game-store'
import { TalentTree } from './TalentTree'
import { STAFF_TALENT_TREES } from '@/engine/talent-trees'
import { cn } from '@/lib/utils'

interface StaffDetailsModalProps {
    staffId: string | null
    onClose: () => void
}

export function StaffDetailsModal({ staffId, onClose }: StaffDetailsModalProps) {
    const staff = useGameStore(state => state.staff.find(s => s.id === staffId))
    const unlockStaffTalent = useGameStore(state => state.unlockStaffTalent)
    const currentWeek = useGameStore(state => state.currentWeek)

    if (!staff) return null

    const treeNodes = STAFF_TALENT_TREES[staff.role] || []

    // Rarity Color Map
    const rarityColors = {
        "Common": "text-gray-400 border-gray-400/50 bg-gray-400/10",
        "Rare": "text-blue-400 border-blue-400/50 bg-blue-400/10",
        "Epic": "text-purple-400 border-purple-400/50 bg-purple-400/10",
        "Legendary": "text-amber-400 border-amber-400/50 bg-amber-400/10",
    }
    const rarityColor = rarityColors[staff.rarity || "Common"] || rarityColors["Common"]

    // Helper to format stat keys
    const formatStatKey = (key: string) => {
        return key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')
    }

    // Stats Display
    const renderStats = () => {
        if (!staff.stats) return null
        return (
            <div className="grid grid-cols-2 gap-3 mt-4">
                {Object.entries(staff.stats).map(([key, val]) => (
                    <div key={key} className="group bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 transition-all p-3 rounded-xl flex flex-col gap-1">
                        <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider group-hover:text-white/60 transition-colors">{formatStatKey(key)}</span>
                        <div className="flex items-end justify-between">
                            <span className="text-xl font-bold text-white tabular-nums">{val}</span>
                            {/* Mini bar for visual flair */}
                            <div className="h-1 w-12 bg-white/10 rounded-full overflow-hidden">
                                <div className="h-full bg-primary" style={{ width: `${Math.min(100, val)}%` }} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        )
    }

    // Calculate level progress safely
    const xpPercentage = staff.xpToNextLevel && staff.xpToNextLevel > 0
        ? Math.min(100, (staff.xp / staff.xpToNextLevel) * 100)
        : 0

    if (typeof window === "undefined") return null

    return createPortal(
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 20 }}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="modal-title-staff-details"
                    className="w-full max-w-5xl bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] ring-1 ring-white/10"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header with Glass Gradient */}
                    <div className="relative p-8 border-b border-white/10 flex items-start justify-between overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 opacity-50" />

                        <div className="relative z-10 flex items-center gap-8">
                            {/* Portrait with fluid ring */}
                            <div className="relative">
                                <div className={`w-28 h-28 rounded-2xl border flex items-center justify-center bg-black/50 overflow-hidden shadow-2xl ${staff.rarity === "Legendary" ? "border-amber-400 shadow-[0_0_30px_rgba(251,191,36,0.2)]" : "border-white/[0.08]"}`}>
                                    {staff.portraitPath ? (
                                        <Image src={staff.portraitPath} alt={staff.name} width={112} height={112} className="w-full h-full object-cover" unoptimized />
                                    ) : (
                                        <Image src="/staff_placeholder.webp" alt={staff.name} width={112} height={112} className="w-full h-full object-cover opacity-80" unoptimized />
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                                </div>
                                {/* Level Badge */}
                                <div className="absolute -bottom-3 -right-3 bg-[#0a0a0a] border border-white/10 p-1 rounded-lg shadow-lg">
                                    <div className="bg-white/10 px-2 py-0.5 rounded text-xs font-bold text-white flex items-center gap-1">
                                        <Zap size={10} className="text-yellow-400 fill-yellow-400" /> {staff.level || 1}
                                    </div>
                                </div>
                            </div>

                            {/* Info */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-4">
                                    <h2 id="modal-title-staff-details" className="text-4xl font-normal text-white tracking-tight">{staff.name}</h2>
                                    <Badge variant="outline" className={`px-3 py-1 text-xs border ${rarityColor} bg-white/5 backdrop-blur-md shadow-lg`}>
                                        {staff.rarity || "Common"}
                                    </Badge>
                                </div>
                                <div className="flex items-center gap-6 text-white/60 text-sm font-medium">
                                    <span className="flex items-center gap-2"><Briefcase size={14} className="text-primary" /> {staff.role.toUpperCase()}</span>
                                    {staff.nationality && <span className="text-white/40 border-l border-white/10 pl-4">{staff.nationality}</span>}
                                </div>

                                {/* XP Bar Liquid */}
                                <div className="mt-5 w-72 space-y-1.5">
                                    <div className="flex justify-between text-[10px] text-white/40 uppercase font-bold tracking-wider">
                                        <span>XP Progress</span>
                                        <span>{Math.floor(staff.xp || 0)} <span className="text-white/20">/</span> {staff.xpToNextLevel || 1000}</span>
                                    </div>
                                    <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${xpPercentage}%` }}
                                            className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-white/10 text-white/50 hover:text-white z-10" aria-label="Close dialog">
                            <X className="w-6 h-6" />
                        </Button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-auto p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 bg-gradient-to-b from-black/20 to-black/80">
                        {/* Left Column: Stats & Bio */}
                        <div className="lg:col-span-4 space-y-6">
                            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6 shadow-xl relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
                                    <Target size={100} />
                                </div>
                                <h3 className="text-xs font-normal text-white/40 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                                    <Target size={14} /> Attributes
                                </h3>
                                {renderStats()}

                                <div className="mt-8 pt-6 border-t border-white/5">
                                    <h4 className="text-xs font-normal text-white/40 uppercase tracking-[0.2em] mb-3">Specialization</h4>
                                    <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 p-4 rounded-xl text-sm font-semibold text-primary/90 flex items-center gap-3">
                                        <Brain size={16} />
                                        {staff.specialization}
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6 shadow-xl">
                                <h3 className="text-xs font-normal text-white/40 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                                    <Shield size={14} /> Contract
                                </h3>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center bg-black/20 p-3 rounded-lg border border-white/5">
                                        <span className="text-white/50 text-xs font-bold uppercase">Weekly Salary</span>
                                        <span className="text-white font-mono font-bold text-lg">${staff.salaryPerWeek?.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center bg-black/20 p-3 rounded-lg border border-white/5">
                                        <span className="text-white/50 text-xs font-bold uppercase">Expires In</span>
                                        <span className={cn(
                                            "font-mono font-bold text-lg",
                                            staff.contractEndWeek && staff.contractEndWeek - currentWeek < 5 ? "text-red-400" : "text-white"
                                        )}>
                                            {staff.contractEndWeek ? `${staff.contractEndWeek - currentWeek} Weeks` : "N/A"}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right Column: Talent Tree */}
                        <div className="lg:col-span-8 flex flex-col h-full min-h-[500px]">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-2xl font-normal text-white tracking-tight flex items-center gap-3">
                                    <Brain className="text-purple-400" />
                                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-white to-white/50">Talent Tree</span>
                                </h3>
                                <div className="flex items-center gap-4 bg-white/5 backdrop-blur-md px-5 py-2.5 rounded-full border border-white/10 shadow-lg">
                                    <div className="flex items-center gap-2">
                                        <div className="bg-amber-400/20 p-1.5 rounded-full">
                                            <Star className="text-amber-400 fill-amber-400" size={14} />
                                        </div>
                                        <span className="font-bold text-white text-lg">{staff.talentPoints || 0}</span>
                                    </div>
                                    <span className="text-xs font-bold text-white/30 uppercase tracking-wider border-l border-white/10 pl-4">Available Points</span>
                                </div>
                            </div>

                            <div className="flex-1 bg-[#030303] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white/5 to-transparent border border-white/10 rounded-2xl overflow-hidden shadow-inner relative">
                                <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20" />
                                <TalentTree
                                    nodes={treeNodes}
                                    unlockedIds={staff.unlockedTalentIds || []}
                                    availablePoints={staff.talentPoints || 0}
                                    onUnlock={(talentId) => unlockStaffTalent(staff.id, talentId)}
                                />
                            </div>
                        </div>
                    </div>

                </motion.div>
            </motion.div>
        </AnimatePresence>,
        document.body
    )
}
