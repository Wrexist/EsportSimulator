"use client"

import { useEffect, useState } from "react"
import { debug } from "@/lib/debug-logger"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { useCurrentTeam } from "@/hooks/useCurrentTeam"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
    Trophy,
    Briefcase,
    Calendar,
    Star,
    TrendingUp,
    Save,
    Clock,
    User,
    Crown,
    Medal,
    UserPlus,
    Trash2,
    Loader2,
    TrendingUp as TrendingUpIcon,
    ChevronRight,
    Gamepad2,
    Play,
    Target
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { SaveSlotMetadata } from "@/engine/save-types"
import { ManagerProgression } from "@/engine/manager-progression"
import { useRouter } from "next/navigation"
import { toast } from "@/lib/toast"
import Image from "next/image"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { PlayerPortrait, TeamLogoImage } from "@/components/ui/asset-images"


export default function CareerPage() {
    const router = useRouter()
    const {
        playerTeamId,
        currentWeek,
        completedMatches,
        eventsLog,
        hallOfFame,
        saveId: currentSaveId,
        listSaves,
        switchSave,
        deleteSaveInSlot,
        managerDetails,
        financeLedger
    } = useGameStore(useShallow(state => ({
        playerTeamId: state.playerTeamId,
        currentWeek: state.currentWeek,
        completedMatches: state.completedMatches,
        eventsLog: state.eventsLog,
        hallOfFame: state.hallOfFame,
        saveId: state.saveId,
        listSaves: state.listSaves,
        switchSave: state.switchSave,
        deleteSaveInSlot: state.deleteSaveInSlot,
        managerDetails: state.managerDetails,
        financeLedger: state.financeLedger,
    })))

    const [availableSaves, setAvailableSaves] = useState<SaveSlotMetadata[]>([])
    const [isLoadingSaves, setIsLoadingSaves] = useState(true)
    const [isSwitching, setIsSwitching] = useState(false)
    const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

    // Calculate Career Stats (Current Save)
    const playerTeam = useCurrentTeam()

    // Matches managed
    const managedMatches = completedMatches.filter(m =>
        m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId
    )
    const totalMatches = managedMatches.length

    // Wins
    const wins = managedMatches.filter(m => {
        if (!m.result) return false
        const homeWon = m.homeTeamId === playerTeamId && m.result.homeScore > m.result.awayScore
        const awayWon = m.awayTeamId === playerTeamId && m.result.awayScore > m.result.homeScore
        return homeWon || awayWon
    }).length

    const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0

    // Tournaments Won (Approximate via events)
    const tournamentsWon = eventsLog.filter(e => e.type === "TOURNAMENT_WIN").length

    // Upcoming Hall of Fame Logic
    const majorWins = eventsLog.filter(e => e.type === "TOURNAMENT_WIN" && (e.data as any)?.tier === "S_TIER").length
    const totalEarnings = financeLedger
        .filter((e: any) => e.teamId === playerTeamId && e.type === "INCOME")
        .reduce((sum: number, e: any) => sum + (e.amount || 0), 0)
    const hallOfFameProgress = {
        majors: Math.min(100, (majorWins / 3) * 100),
        wins: Math.min(100, (wins / 500) * 100),
        earnings: Math.min(100, (totalEarnings / 10000000) * 100)
    }

    const yearsActive = Math.floor(currentWeek / 52) + 1

    useEffect(() => {
        loadSaves()
    }, [currentSaveId])

    const loadSaves = async () => {
        setIsLoadingSaves(true)
        try {
            const saves = await listSaves()
            setAvailableSaves(saves)
        } catch (error) {
            debug.error("Failed to list saves", error)
        } finally {
            setIsLoadingSaves(false)
        }
    }

    const handleLoadSave = async () => {
        if (!selectedSlot) return
        if (selectedSlot === currentSaveId) return

        setIsSwitching(true)
        try {
            const success = await switchSave(selectedSlot)
            if (success) {
                toast.success("Save loaded successfully")
                router.refresh()
            } else {
                toast.error("Failed to load save")
            }
        } catch (error) {
            toast.error("Failed to load save")
        } finally {
            setIsSwitching(false)
        }
    }

    const handleDeleteSave = async (saveId: string) => {
        if (saveId === currentSaveId) {
            toast.error("Cannot delete currently active save")
            return
        }

        if (confirmDelete !== saveId) {
            setConfirmDelete(saveId)
            return
        }

        try {
            await deleteSaveInSlot(saveId)
            await loadSaves()
            setConfirmDelete(null)
            if (selectedSlot === saveId) setSelectedSlot(null)
            toast.success("Save deleted")
        } catch (error) {
            toast.error("Failed to delete save")
        }
    }

    const handleNewCampaign = () => {
        router.push("/new-game")
    }

    const getWinRate = (wins: number, losses: number) => {
        const total = wins + losses
        if (total === 0) return 0
        return Math.round((wins / total) * 100)
    }

    return (
        <div className="space-y-8 max-w-7xl mx-auto p-4 md:p-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-primary opacity-80 mb-1">
                        <Briefcase className="h-4 w-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">Manager Profile</span>
                    </div>
                    <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
                        Career Overview
                    </h1>
                    <p className="text-muted-foreground max-w-lg">
                        Manage your legacy. Track progress across campaigns and aim for Hall of Fame induction.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <Badge variant="outline" className="h-10 px-4 border-amber-500/20 bg-amber-500/5 text-amber-500 gap-2">
                        <Crown size={16} />
                        <span className="font-bold">Legend Status: {majorWins > 0 ? "Rising Star" : "Rookie"}</span>
                    </Badge>
                </div>
            </div>

            {/* Manager Level & XP Bar */}
            {managerDetails && (
                <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary/10 rounded-xl">
                                    <Star className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-white">Manager Level {managerDetails.level || 1}</p>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                        {(managerDetails.level || 1) >= 10 ? "Elite" : (managerDetails.level || 1) >= 5 ? "Challenger" : "Rookie"} Tier
                                    </p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-bold text-primary">
                                    {managerDetails.xp || 0} / {ManagerProgression.getXPForLevel(managerDetails.level || 1)} XP
                                </p>
                                <p className="text-[10px] text-muted-foreground">Win: +100 XP | Loss: +25 XP</p>
                            </div>
                        </div>
                        <Progress
                            value={((managerDetails.xp || 0) / ManagerProgression.getXPForLevel(managerDetails.level || 1)) * 100}
                            className="h-3"
                        />
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Stats Column */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Key Metrics */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
                            <CardContent className="p-6">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-amber-500/10 rounded-xl">
                                        <Trophy className="h-6 w-6 text-amber-500" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground uppercase font-bold">Trophies</p>
                                        <p className="text-2xl font-normal">{tournamentsWon}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
                            <CardContent className="p-6">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-emerald-500/10 rounded-xl">
                                        <TrendingUp className="h-6 w-6 text-emerald-500" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground uppercase font-bold">Win Rate</p>
                                        <p className="text-2xl font-normal">{winRate}%</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
                            <CardContent className="p-6">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-blue-500/10 rounded-xl">
                                        <Calendar className="h-6 w-6 text-blue-500" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground uppercase font-bold">Years Active</p>
                                        <p className="text-2xl font-normal">{yearsActive}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Hall of Fame Progress */}
                    <Card className="bg-gradient-to-br from-white/5 to-transparent border-white/10 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-32 bg-amber-500/5 blur-3xl rounded-full translate-x-12 -translate-y-12" />
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Crown className="h-5 w-5 text-amber-500" />
                                Hall of Fame Induction
                            </CardTitle>
                            <CardDescription>Requirements to be inducted into the Esports Hall of Fame.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6 relative z-10">
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="flex items-center gap-2">
                                        <Trophy size={14} className="text-amber-500" /> Major Wins ({majorWins}/3)
                                    </span>
                                    <span className="font-bold text-amber-500">{Math.round(hallOfFameProgress.majors)}%</span>
                                </div>
                                <Progress
                                    value={hallOfFameProgress.majors}
                                    className="h-2 bg-black/40"
                                    indicatorClassName="bg-amber-500"
                                />
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="flex items-center gap-2">
                                        <Medal size={14} className="text-white/70" /> Career Wins ({wins}/500)
                                    </span>
                                    <span className="font-bold text-muted-foreground">{Math.round(hallOfFameProgress.wins)}%</span>
                                </div>
                                <Progress value={hallOfFameProgress.wins} className="h-2 bg-black/40" />
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="flex items-center gap-2">
                                        <Star size={14} className="text-white/70" /> Total Earnings (${totalEarnings.toLocaleString()} / $10M)
                                    </span>
                                    <span className="font-bold text-muted-foreground">{Math.round(hallOfFameProgress.earnings)}%</span>
                                </div>
                                <Progress value={hallOfFameProgress.earnings} className="h-2 bg-black/40" />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Recent Events Log (Instead of Mock Achievements) */}
                    <Card className="bg-white/[0.02] border-white/10 h-[400px] flex flex-col">
                        <CardHeader>
                            <CardTitle>Career Log</CardTitle>
                            <CardDescription>Significant events from your career.</CardDescription>
                        </CardHeader>
                        <CardContent className="overflow-y-auto flex-1 pr-2 custom-scrollbar">
                            <div className="space-y-3">
                                {eventsLog.length > 0 ? eventsLog.slice(0, 20).map(event => (
                                    <div key={event.id} className="flex items-start gap-4 p-3 bg-white/5 rounded-xl border border-white/5 text-sm">
                                        <div className="mt-1">
                                            {event.type.includes("WIN") ? <Trophy size={16} className="text-amber-400" /> :
                                                event.type.includes("LOSS") ? <TrendingUp size={16} className="text-red-400 rotate-180" /> :
                                                    <Star size={16} className="text-blue-400" />}
                                        </div>
                                        <div>
                                            <p className="font-medium text-white/90">
                                                {/* Rough translation of event type to readable text if data doesn't have message */}
                                                {(event.data as any)?.message || event.type.replace(/_/g, " ")}
                                            </p>
                                            <p className="text-xs text-white/40 mt-1">Week {event.week}</p>
                                        </div>
                                    </div>
                                )) : (
                                    <p className="text-muted-foreground text-center py-8">No significant events recorded yet.</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Save Slots Column (PORTED FROM MAIN MENU) */}
                <div className="lg:col-span-1 backdrop-blur-xl bg-white/[0.02] border border-white/10 rounded-3xl p-6 flex flex-col h-fit">
                    <div className="flex items-center justify-between mb-5">
                        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                            <Save className="w-4 h-4 text-primary" />
                            Campaign Slots
                        </h2>
                        <span className="text-white/30 text-xs">{availableSaves.length} saves</span>
                    </div>

                    {/* Custom Scrollbar Styling */}
                    <div className="flex-1 space-y-2 overflow-y-auto max-h-[600px] pr-2 custom-scrollbar">
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

                        {/* New Save Slot */}
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleNewCampaign}
                            className="w-full h-16 flex items-center justify-center border border-dashed border-white/20 rounded-2xl hover:bg-white/5 transition-colors group mb-4"
                        >
                            <div className="flex flex-col items-center gap-1 text-muted-foreground group-hover:text-white transition-colors">
                                <UserPlus size={16} />
                                <span className="text-[10px] font-bold uppercase tracking-widest">New Career</span>
                            </div>
                        </motion.button>

                        {isLoadingSaves ? (
                            <div className="text-center py-12 text-white/40">
                                <Loader2 size={20} className="animate-spin mx-auto mb-3" />
                                <span className="text-xs">Loading...</span>
                            </div>
                        ) : availableSaves.length === 0 ? (
                            <div className="text-center py-12">
                                <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-3">
                                    <Gamepad2 className="w-6 h-6 text-white/20" />
                                </div>
                                <p className="text-white/40 text-xs font-medium">No saves found</p>
                            </div>
                        ) : (
                            <AnimatePresence>
                                {availableSaves.map((slot, idx) => {
                                    const slotWins = slot.stats?.wins ?? 0
                                    const slotLosses = slot.stats?.losses ?? 0
                                    const slotWinRate = getWinRate(slotWins, slotLosses)
                                    const isActive = slot.saveId === currentSaveId;

                                    return (
                                        <motion.div
                                            key={slot.saveId || idx}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 10 }}
                                            transition={{ delay: idx * 0.03 }}
                                            onClick={() => !isActive && setSelectedSlot(slot.saveId || null)}
                                            className={`
                                                group relative w-full p-5 rounded-3xl cursor-pointer transition-all duration-300 border mb-3 backdrop-blur-sm
                                                ${isActive
                                                    ? "bg-primary/5 border-primary/30 shadow-[0_0_20px_rgba(59,130,246,0.1)] cursor-default"
                                                    : selectedSlot === slot.saveId
                                                        ? "bg-gradient-to-br from-white/[0.08] to-transparent border-white/20 shadow-[0_8px_30px_rgba(0,0,0,0.2)]"
                                                        : "bg-gradient-to-br from-white/[0.03] to-transparent border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.08]"
                                                }
                                            `}
                                        >
                                            {/* Card Header: Team & Stats */}
                                            <div className="flex items-center justify-between mb-4">
                                                <div className="flex items-center gap-4">
                                                    {/* Large Team Logo */}
                                                    <div className={`
                                                        w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border overflow-hidden relative
                                                        ${isActive ? "bg-black/40 border-primary/30" : selectedSlot === slot.saveId ? "bg-black/30 border-white/20" : "bg-white/[0.03] border-white/[0.06]"}
                                                    `}>
                                                        {slot.teamLogo ? (
                                                            <TeamLogoImage
                                                                src={slot.teamLogo}
                                                                alt={slot.teamName || "Team"}
                                                                size={42}
                                                            />
                                                        ) : (
                                                            <span className="text-lg font-bold text-white/40">{slot.teamName?.[0]}</span>
                                                        )}

                                                        {/* Active Indicator */}
                                                        {selectedSlot === slot.saveId && !isActive && (
                                                            <motion.div
                                                                layoutId="active-indicator"
                                                                className="absolute inset-0 border border-white/40 rounded-2xl"
                                                                transition={{ duration: 0.3 }}
                                                            />
                                                        )}

                                                        {isActive && (
                                                            <div className="absolute inset-0 border-2 border-primary rounded-2xl" />
                                                        )}
                                                    </div>

                                                    {/* Team Info */}
                                                    <div>
                                                        <h3 className="text-lg font-bold text-white/90 tracking-tight mb-1.5 flex items-center gap-2">
                                                            {slot.teamName || "Unknown Team"}
                                                            {isActive && <Badge variant="default" className="text-[9px] px-1.5 py-0 h-4">ACTIVE</Badge>}
                                                        </h3>
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            {/* Year/Date Display */}
                                                            <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                                                                <Calendar className="w-3 h-3 text-white/30" />
                                                                <span className="text-[10px] font-medium text-white/50">
                                                                    Week {slot.currentWeek || 1}
                                                                </span>
                                                            </div>
                                                            {/* Win Rate */}
                                                            <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                                                                <TrendingUp className="w-3 h-3 text-emerald-400/70" />
                                                                <span className="text-[10px] font-semibold text-emerald-400/80">
                                                                    {slotWinRate}% WR
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
                                            <div className="flex items-center gap-2.5 mt-4 overflow-x-auto pb-1 scrollbar-hide">
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
                                            {!isActive && (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    aria-label="Delete save"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        handleDeleteSave(slot.saveId!)
                                                    }}
                                                    className={`absolute top-3 right-3 h-7 w-7 p-0 rounded-lg hover:bg-red-500/10 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all duration-300 ${confirmDelete === slot.saveId ? "bg-red-500/10 text-red-400 opacity-100" : "text-white/20"}`}
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                            )}
                                        </motion.div>
                                    )
                                })}
                            </AnimatePresence>
                        )}

                    </div>

                    {/* Load Button */}
                    <Button
                        onClick={handleLoadSave}
                        disabled={!selectedSlot || isLoadingSaves}
                        className={`
                            mt-4 w-full h-14 rounded-2xl font-normal uppercase tracking-[0.2em] text-sm transition-all shadow-xl
                            ${selectedSlot
                                ? "bg-white text-black hover:bg-white/90 shadow-white/10 scale-100"
                                : "bg-white/5 text-white/20 cursor-not-allowed border border-white/5 scale-95"
                            }
                        `}
                    >
                        {isLoadingSaves || isSwitching ? (
                            <>
                                <Loader2 className="w-5 h-5 mr-3 animate-spin" /> Loading...
                            </>
                        ) : (
                            <>
                                <Play className="w-5 h-5 mr-3 fill-current" />
                                SWITCH TO SAVE
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    )
}
