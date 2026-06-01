"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { SaveSlotMetadata } from "@/engine"
import { motion, AnimatePresence } from "framer-motion"
import { Plus, Play, Trash2, Calendar, Trophy, TrendingUp, ChevronRight, Gamepad2, Users, Target, Settings, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { PlayerPortrait, TeamLogoImage } from "@/components/ui/asset-images"
import { SettingsModal } from "@/components/settings/SettingsModal"
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
    AlertDialogAction,
} from "@/components/ui/alert-dialog"
import Image from "next/image"
import Link from "next/link"

// Phase 2: Use real metadata
// interface EnhancedSaveSlot removed

export default function MainMenuPage() {
    const router = useRouter()
    const { listSaves, switchSave, deleteSaveInSlot, isLoading } = useGameStore(useShallow(state => ({
        listSaves: state.listSaves,
        switchSave: state.switchSave,
        deleteSaveInSlot: state.deleteSaveInSlot,
        isLoading: state.isLoading,
    })))

    const [saves, setSaves] = useState<SaveSlotMetadata[]>([])
    const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
    const [isLoadingSaves, setIsLoadingSaves] = useState(true)
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)
    const [isSettingsOpen, setIsSettingsOpen] = useState(false)

    // useCallback so the mount effect's dep stays stable. `listSaves` is a
    // module-level import (stable) but exhaustive-deps can't see that —
    // including it keeps the warning quiet.
    const loadSaves = useCallback(async () => {
        setIsLoadingSaves(true)
        const slots = await listSaves()
        setSaves(slots)
        setIsLoadingSaves(false)
    }, [listSaves])

    useEffect(() => {
        loadSaves()
    }, [loadSaves])

    const handleNewGame = () => {
        router.push("/new-game")
    }

    const handleLoadSave = async () => {
        if (!selectedSlot) return
        const slot = saves.find(s => s.saveId === selectedSlot)
        if (!slot) return

        const success = await switchSave(slot.saveId!)
        if (success) {
            router.push("/desktop")
        }
    }

    const handleDeleteSave = async (saveId: string) => {
        if (isDeleting) return
        setIsDeleting(true)
        try {
            await deleteSaveInSlot(saveId)
            if (selectedSlot === saveId) setSelectedSlot(null)
            await loadSaves()
        } finally {
            setIsDeleting(false)
            setDeleteTarget(null)
        }
    }

    const timeAgo = (dateStr: string | null) => {
        if (!dateStr) return "Never"
        const date = new Date(dateStr)
        const now = new Date()
        const diffMs = now.getTime() - date.getTime()
        const diffMins = Math.floor(diffMs / 60000)
        if (diffMins < 60) return `${diffMins}m ago`
        const diffHours = Math.floor(diffMins / 60)
        if (diffHours < 24) return `${diffHours}h ago`
        const diffDays = Math.floor(diffHours / 24)
        return `${diffDays}d ago`
    }

    const getWinRate = (wins: number, losses: number) => {
        const total = wins + losses
        if (total === 0) return 0
        return Math.round((wins / total) * 100)
    }

    return (
        <div className="min-h-screen flex flex-col relative overflow-hidden liquid-app-bg">
            {/* Sophisticated Background */}
            <div className="absolute inset-0 liquid-noise" />
            <div className="absolute inset-x-0 top-0 h-56 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),transparent)]" />
            <div className="absolute left-1/2 top-20 h-px w-[min(80vw,960px)] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/[0.12] to-transparent" />

            {/* Subtle Grid Pattern */}
            <div className="absolute inset-0 opacity-[0.015]" style={{
                backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
                backgroundSize: '60px 60px'
            }} />

            {/* Top Navigation Bar */}
            <motion.header
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="relative z-20 flex items-center justify-between px-8 py-4 border-b liquid-chrome"
            >
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl overflow-hidden">
                        <Image src="/logo.png" alt="Logo" width={40} height={40} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = '/team_placeholder.png' }} />
                    </div>
                    <span className="text-white/60 text-sm font-medium tracking-wide">ESPORT MANAGER</span>
                </div>
                <div className="flex items-center gap-3">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsSettingsOpen(true)}
                        className="text-white/40 hover:text-white/80"
                    >
                        <Settings className="w-4 h-4" />
                    </Button>
                    <span className="text-white/20 text-xs">v{process.env.NEXT_PUBLIC_GAME_VERSION || "1.0.0"}</span>
                </div>
            </motion.header>

            {/* Main Content */}
            <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-8 py-12">
                {/* Hero Title */}
                <motion.div
                    initial={{ opacity: 0, y: -30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    className="text-center mb-16"
                >
                    <motion.div
                        className="flex items-center justify-center gap-2 mb-4"
                        initial={{ scale: 0.9 }}
                        animate={{ scale: 1 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                    >
                    </motion.div>
                    <h1 className="text-5xl font-normal tracking-tighter uppercase mb-4">
                        <span className="bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-transparent">
                            Esport Manager
                        </span>
                    </h1>
                    <p className="text-white/50 text-sm uppercase tracking-[0.4em] font-medium">
                        Build Your Dynasty • Conquer The World
                    </p>
                </motion.div>

                {/* Main Grid */}
                <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-5 gap-6">
                    {/* LEFT: New Campaign (3 cols) */}
                    <motion.div
                        initial={{ opacity: 0, x: -40 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.8, delay: 0.2 }}
                        className="lg:col-span-3 flex flex-col gap-6"
                    >
                        <button
                            onClick={handleNewGame}
                            className="group liquid-panel relative overflow-hidden rounded-xl border-white/[0.1] transition-[transform,border-color,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:border-white/[0.14] hover:shadow-glass-float"
                        >
                            {/* Content */}
                            <div className="relative p-10 flex items-center gap-8">
                                {/* Icon */}
                                <div className="relative shrink-0">
                                    <div className="w-28 h-28 rounded-xl bg-white/[0.06] flex items-center justify-center border border-white/[0.12] shadow-glass-soft ring-1 ring-inset ring-cyan-300/10">
                                        <Plus className="w-14 h-14 text-white" />
                                    </div>
                                </div>

                                {/* Text */}
                                <div className="flex-1 text-left">
                                    <h2 className="text-4xl font-normal text-white uppercase tracking-wide mb-2">
                                        New Career
                                    </h2>
                                    <p className="text-white/60 text-sm max-w-md">
                                        Choose your team and begin your journey to become the greatest esports manager in history. Build your roster, develop talent, and conquer the world.
                                    </p>
                                </div>

                                {/* Arrow */}
                                <div className="w-14 h-14 rounded-lg liquid-button flex items-center justify-center group-hover:bg-white/[0.08] transition-all duration-300">
                                    <ChevronRight className="w-6 h-6 text-white/50 group-hover:text-white transition-colors" />
                                </div>
                            </div>
                        </button>

                        {/* Build Your Own Team */}
                        <motion.button
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.35 }}
                            onClick={() => router.push("/new-game/create-team")}
                            className="group relative overflow-hidden rounded-xl glass-card hover:border-white/[0.14] transition-[border-color,box-shadow] duration-300 text-left w-full"
                        >
                            {/* Content */}
                            <div className="relative p-6 flex items-center gap-6">
                                {/* Icon */}
                                <div className="w-16 h-16 rounded-lg bg-violet-300/10 flex items-center justify-center border border-violet-200/[0.16] shrink-0 transition-all">
                                    <Users className="w-8 h-8 text-purple-300" />
                                </div>

                                {/* Text */}
                                <div className="flex-1">
                                    <h3 className="text-xl font-normal text-white uppercase tracking-wide mb-1">
                                        Build Your Team
                                    </h3>
                                    <p className="text-white/60 text-xs max-w-sm">
                                        Start from scratch. Create your own organization, scout unknown talents, and build a dynasty from the ground up.
                                    </p>
                                </div>

                                {/* Arrow */}
                                <div className="w-10 h-10 rounded-lg liquid-button flex items-center justify-center group-hover:bg-violet-300/[0.12] transition-all duration-300">
                                    <ChevronRight className="w-5 h-5 text-white/30 group-hover:text-purple-300 transition-colors" />
                                </div>
                            </div>
                        </motion.button>

                        {/* Feature Cards */}
                        <div className="grid grid-cols-3 gap-4">
                            {[
                                { icon: Trophy, label: "Tournaments", value: "50+", desc: "Compete globally" },
                                { icon: Users, label: "Players", value: "500+", desc: "Real players" },
                                { icon: Zap, label: "Seasons", value: "∞", desc: "Endless career" }
                            ].map((feature, i) => (
                                <motion.div
                                    key={feature.label}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.4 + i * 0.1 }}
                                    className="glass-card rounded-lg p-5 text-center transition-colors"
                                >
                                    <feature.icon className="w-6 h-6 text-primary/70 mx-auto mb-3" />
                                    <p className="text-white font-normal text-2xl">{feature.value}</p>
                                    <p className="text-white/50 text-[10px] uppercase tracking-wider mt-1">{feature.desc}</p>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>

                    {/* RIGHT: Save Slots (2 cols) */}
                    <motion.div
                        initial={{ opacity: 0, x: 40 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.8, delay: 0.3 }}
                        className="lg:col-span-2 liquid-panel rounded-xl p-6 flex flex-col"
                    >
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                <Play className="w-4 h-4 text-primary" />
                                Continue
                            </h2>
                            <span className="text-white/50 text-xs">{saves.length} saves</span>
                        </div>

                        {/* Custom Scrollbar Styling */}
                        <div className="flex-1 space-y-2 overflow-y-auto max-h-[280px] pr-2 custom-scrollbar">
                            <style jsx>{`
                                .custom-scrollbar::-webkit-scrollbar {
                                    width: 4px;
                                }
                                .custom-scrollbar::-webkit-scrollbar-track {
                                    background: rgba(255, 255, 255, 0.02);
                                    border-radius: 10px;
                                }
                                .custom-scrollbar::-webkit-scrollbar-thumb {
                                    background: rgba(255, 255, 255, 0.1);
                                    border-radius: 10px;
                                }
                                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                                    background: rgba(255, 255, 255, 0.2);
                                }
                            `}</style>

                            {isLoadingSaves ? (
                                <div className="text-center py-12 text-white/40">
                                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                                    <span className="text-xs">Loading...</span>
                                </div>
                            ) : saves.length === 0 ? (
                                <div className="text-center py-12">
                                    <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-3">
                                        <Gamepad2 className="w-6 h-6 text-white/20" />
                                    </div>
                                    <p className="text-white/60 text-xs font-medium">No saves yet</p>
                                    <p className="text-white/40 text-[10px] mt-1">Start a new campaign!</p>
                                </div>
                            ) : (
                                <AnimatePresence>
                                    {saves.map((slot, idx) => {
                                        const wins = slot.stats?.wins ?? 0
                                        const losses = slot.stats?.losses ?? 0
                                        const winRate = getWinRate(wins, losses)
                                        return (
                                            <motion.div
                                                key={slot.saveId || idx}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: 10 }}
                                                transition={{ delay: idx * 0.03 }}
                                                onClick={() => setSelectedSlot(slot.saveId || null)}
                                                className={`
                                                    group relative w-full p-5 rounded-md cursor-pointer transition-[background,border-color,box-shadow] duration-300 border mb-3 backdrop-blur-sm
                                                    ${selectedSlot === slot.saveId
                                                        ? "bg-white/[0.06] border-cyan-300/25 shadow-glass-soft ring-1 ring-inset ring-cyan-300/15"
                                                        : "bg-gradient-to-br from-white/[0.03] via-white/[0.01] to-transparent border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.08]"
                                                    }
                                                `}
                                            >
                                                {/* Card Header: Team & Stats */}
                                                <div className="flex items-center justify-between mb-4">
                                                    <div className="flex items-center gap-4">
                                                        {/* Large Team Logo */}
                                                        <div className={`
                                                            w-14 h-14 rounded-lg flex items-center justify-center shrink-0 border overflow-hidden relative
                                                            ${selectedSlot === slot.saveId ? "bg-black/30 border-primary/20 shadow-lg shadow-primary/5" : "bg-white/[0.03] border-white/[0.06]"}
                                                        `}>
                                                            <TeamLogoImage
                                                                src={slot.teamLogo}
                                                                alt={slot.teamName || "Team"}
                                                                size={42}
                                                            />
                                                            {/* Active Indicator */}
                                                            {selectedSlot === slot.saveId && (
                                                                <motion.div
                                                                    layoutId="active-indicator"
                                                                    className="absolute inset-0 border border-primary/50 rounded-lg"
                                                                    transition={{ duration: 0.3 }}
                                                                />
                                                            )}
                                                        </div>

                                                        {/* Team Info */}
                                                        <div>
                                                            <h3 className="text-lg font-bold text-white/90 tracking-tight mb-1.5">
                                                                {slot.teamName || "Unknown Team"}
                                                            </h3>
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                {/* Year/Date Display */}
                                                                <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                                                                    <Calendar className="w-3 h-3 text-white/30" />
                                                                    <span className="text-[10px] font-medium text-white/50">
                                                                        {(() => {
                                                                            if (!slot.gameStartDate) return `Week ${slot.currentWeek || 1}`
                                                                            try {
                                                                                const baseDate = new Date(slot.gameStartDate)
                                                                                if (isNaN(baseDate.getTime())) return `Week ${slot.currentWeek || 1}`

                                                                                const currentDate = new Date(baseDate.getTime() + ((slot.currentWeek || 1) - 1) * 7 * 24 * 60 * 60 * 1000)
                                                                                return currentDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                                                                            } catch (e) {
                                                                                return `Week ${slot.currentWeek || 1}`
                                                                            }
                                                                        })()}
                                                                    </span>
                                                                </div>
                                                                {/* Win Rate */}
                                                                <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                                                                    <TrendingUp className="w-3 h-3 text-emerald-400/70" />
                                                                    <span className="text-[10px] font-semibold text-emerald-400/80">
                                                                        {winRate}% WR
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* OVR Rating Badge */}
                                                    <div className="text-right">
                                                        <div className="text-2xl font-bold text-white/80 leading-none">
                                                            {slot.teamOvr || "-"}
                                                        </div>
                                                        <div className="text-[8px] font-medium text-white/30 uppercase tracking-widest mt-0.5">
                                                            OVR
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Player Portraits Row - Rich Preview */}
                                                <div className="flex items-center gap-2.5 mt-4 overflow-x-auto pb-1">
                                                    {slot.topPlayerPreviews && slot.topPlayerPreviews.length > 0 ? (
                                                        slot.topPlayerPreviews.map((p) => (
                                                            <div key={p.id} className="flex flex-col items-center gap-1 shrink-0">
                                                                <div className="relative">
                                                                    <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
                                                                        <PlayerPortrait
                                                                            src={p.portraitPath}
                                                                            alt={p.nickname}
                                                                            size={40}
                                                                        />
                                                                    </div>
                                                                    {/* OVR Badge */}
                                                                    <div className="absolute -bottom-1 -right-1 bg-black/90 border border-white/10 rounded-md px-1 py-0 z-20 min-w-[20px] flex items-center justify-center">
                                                                        <span className={`text-[10px] font-normal leading-tight ${p.ovr >= 90 ? "text-amber-400" : p.ovr >= 80 ? "text-emerald-400" : "text-white"}`}>
                                                                            {p.ovr}
                                                                        </span>
                                                                    </div>
                                                                </div>

                                                                {/* Name Label */}
                                                                <div className="flex items-center gap-1 mt-0.5">
                                                                    <span className="text-[8px] font-medium text-white/50">{p.nickname}</span>
                                                                    <CountryFlag country={p.nationality} size={7} className="opacity-60" />
                                                                </div>
                                                            </div>
                                                        ))
                                                    ) : slot.topPlayerPortraits && slot.topPlayerPortraits.length > 0 ? (
                                                        // Fallback for legacy saves - Use PlayerPortrait for fallback
                                                        slot.topPlayerPortraits.map((src, i) => (
                                                            <div key={i} className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden shrink-0">
                                                                <PlayerPortrait src={src} alt="Player" size={40} />
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <div className="text-[10px] text-white/20 italic">No roster data</div>
                                                    )}
                                                </div>

                                                {/* Bottom Row: Trophies & Financials */}
                                                <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.04]">
                                                    {/* Trophies on the left */}
                                                    <div className="flex items-center gap-2.5">
                                                        {/* Majors */}
                                                        <div className="flex items-center gap-1" title="Major Wins">
                                                            <div className="w-4 h-4 rounded-sm bg-amber-500/20 flex items-center justify-center">
                                                                <Trophy className="w-2.5 h-2.5 text-amber-400" />
                                                            </div>
                                                            <span className="text-[10px] font-bold text-amber-400/90">{slot.stats?.majorWins || 0}</span>
                                                        </div>
                                                        {/* All Tournaments */}
                                                        <div className="flex items-center gap-1" title="Tournament Wins">
                                                            <div className="w-4 h-4 rounded-sm bg-cyan-500/20 flex items-center justify-center">
                                                                <Target className="w-2.5 h-2.5 text-cyan-400" />
                                                            </div>
                                                            <span className="text-[10px] font-bold text-cyan-400/90">{slot.stats?.tournamentsWon || 0}</span>
                                                        </div>
                                                        {/* Recent Trophies Mini Preview */}
                                                        {slot.trophies && slot.trophies.length > 0 && (
                                                            <div className="flex items-center gap-0.5 ml-1 opacity-60">
                                                                {slot.trophies.slice(-3).map((t, i) => (
                                                                    <div
                                                                        key={t.tournamentId + i}
                                                                        className="w-3.5 h-3.5 rounded-sm bg-white/10 flex items-center justify-center"
                                                                        title={t.tournamentName}
                                                                    >
                                                                        {t.logoPath ? (
                                                                            <Image src={t.logoPath} alt="" width={10} height={10} className="w-2.5 h-2.5 object-contain" unoptimized />
                                                                        ) : (
                                                                            <Trophy className="w-2 h-2 text-white/40" />
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Budget on the right */}
                                                    {slot.budget !== undefined && (
                                                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-white/[0.02]">
                                                            <span className="text-[9px] font-medium text-white/30">Budget</span>
                                                            <span className="text-[10px] font-semibold text-white/60">
                                                                ${(slot.budget / 1000).toFixed(0)}k
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>


                                                {/* Delete Button (Absolute) */}
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    disabled={isDeleting}
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        setDeleteTarget(slot.saveId!)
                                                    }}
                                                    className="absolute top-3 right-3 h-7 w-7 p-0 rounded-lg hover:bg-red-500/10 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all duration-300 text-white/20"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                            </motion.div>
                                        )
                                    })}
                                </AnimatePresence>
                            )}

                        </div>

                        {/* Load Button */}
                        {saves.length > 0 && (
                            <Button
                                onClick={handleLoadSave}
                                disabled={!selectedSlot || isLoading}
                                className={`
                                    mt-4 w-full h-14 rounded-lg font-normal uppercase tracking-[0.2em] text-sm transition-all shadow-xl
                                    ${selectedSlot
                                        ? "bg-white text-black hover:bg-white/90 shadow-white/10 scale-100"
                                        : "bg-white/5 text-white/20 cursor-not-allowed border border-white/5 scale-95"
                                    }
                                `}
                            >
                                <Play className="w-5 h-5 mr-3 fill-current" />
                                {selectedSlot ? "CONTINUE CAREER" : "SELECT SAVE"}
                            </Button>
                        )}
                    </motion.div>
                </div>
            </div>

            {/* Footer */}
            <motion.footer
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className="relative z-10 text-center py-5 border-t border-white/5"
            >
                <p className="text-white/40 text-[10px] uppercase tracking-[0.3em]">
                    © {new Date().getFullYear()} Esports Manager: FPS • All Rights Reserved
                </p>
            </motion.footer>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-white">Delete Career</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this career? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting} className="border-white/10 text-white hover:bg-white/10">
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            disabled={isDeleting}
                            onClick={() => deleteTarget && handleDeleteSave(deleteTarget)}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            {isDeleting ? "Deleting..." : "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Settings Modal */}
            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
            />
        </div>
    )
}
