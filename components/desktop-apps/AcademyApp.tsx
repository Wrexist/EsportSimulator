"use client"

import React,{ useState, useMemo } from "react"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import {
    GraduationCap,
    Search,
    Trophy,
    CheckCircle2,
    Users,
    Target,
    Zap,
    Brain,
    Heart,
    Scale,
    Star,
    Clock,
    Gamepad2,
    Plus,
    X,
    Shield,
    Crosshair,
    Dumbbell,
    GripVertical,
    BarChart3,
    Activity,
    AlertTriangle,
    Timer,
    MapPin
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { useCurrentTeam } from "@/hooks/useCurrentTeam"
import { toast } from "@/lib/toast"
import { ACADEMY_LEVELS, ACADEMY_DRILLS, ACADEMY_WEEKLY_COSTS, PENDING_POOL_MAX_SIZE } from "@/engine/academy-constants"
import { AcademyTrainingFocus, AcademyRole } from "@/types/academy"
import type { PlayerSaveData } from "@/engine/save-types"

// ===== TYPES & CONSTANTS =====

type TabId = "ROSTER" | "TRAINING" | "MATCHES" | "SCOUTING" | "GRADUATES" | "REPORTS"

const TABS: { id: TabId; name: string; icon: any }[] = [
    { id: "ROSTER", name: "Roster", icon: Users },
    { id: "TRAINING", name: "Training", icon: Dumbbell },
    { id: "MATCHES", name: "Matches", icon: Trophy },
    { id: "SCOUTING", name: "Scouting", icon: Search },
    { id: "GRADUATES", name: "Graduates", icon: GraduationCap },
    { id: "REPORTS", name: "Reports", icon: BarChart3 }
]

const TRAINING_FOCUS_CONFIG: { id: AcademyTrainingFocus; name: string; icon: any; color: string; desc: string }[] = [
    { id: "MECHANICAL", name: "Mechanical", icon: Target, color: "text-red-400", desc: "Aim, rifles, AWP" },
    { id: "TACTICAL", name: "Tactical", icon: Brain, color: "text-amber-400", desc: "Strats, grenades" },
    { id: "MENTAL", name: "Mental", icon: Heart, color: "text-pink-400", desc: "Leadership, clutch" },
    { id: "PHYSICAL", name: "Physical", icon: Zap, color: "text-cyan-400", desc: "Reaction, endurance" },
    { id: "BALANCED", name: "Balanced", icon: Scale, color: "text-emerald-400", desc: "All-around" }
]

const ACADEMY_ROLES = ["IGL", "Entry", "AWPer", "Support", "Rifler"] as const

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

// ===== MAIN COMPONENT =====

export function AcademyApp() {
    const {
        playerTeamId, academyPlayers, academyMatchHistory, players,
        buildAcademy, upgradeAcademy, scoutProspect, enrollProspect,
        setProspectTraining, releaseProspect, promoteProspect, scheduleDevMatch,
        academyRoster, updateAcademyRoster, academyTrainingSchedule, updateAcademySchedule,
        academyWeeklyReports, academyScoutingMissions, staff,
        academyPendingProspects, discardPendingProspect, enrollPendingProspect
    } = useGameStore(useShallow(state => ({
        playerTeamId: state.playerTeamId,
        academyPlayers: state.academyPlayers,
        academyMatchHistory: state.academyMatchHistory,
        players: state.players,
        buildAcademy: state.buildAcademy,
        upgradeAcademy: state.upgradeAcademy,
        scoutProspect: state.scoutProspect,
        enrollProspect: state.enrollProspect,
        setProspectTraining: state.setProspectTraining,
        releaseProspect: state.releaseProspect,
        promoteProspect: state.promoteProspect,
        scheduleDevMatch: state.scheduleDevMatch,
        academyRoster: state.academyRoster,
        updateAcademyRoster: state.updateAcademyRoster,
        academyTrainingSchedule: state.academyTrainingSchedule,
        updateAcademySchedule: state.updateAcademySchedule,
        academyWeeklyReports: state.academyWeeklyReports,
        academyScoutingMissions: state.academyScoutingMissions,
        staff: state.staff,
        academyPendingProspects: state.academyPendingProspects,
        discardPendingProspect: state.discardPendingProspect,
        enrollPendingProspect: state.enrollPendingProspect,
    })))

    const team = useCurrentTeam()
    const [activeTab, setActiveTab] = useState<TabId>("ROSTER")
    const [lastScoutResult, setLastScoutResult] = useState<{ success: boolean; message: string } | null>(null)


    // Drag State
    const [draggedProspect, setDraggedProspect] = useState<string | null>(null)
    const [draggedDrill, setDraggedDrill] = useState<string | null>(null)
    const [dragOverRole, setDragOverRole] = useState<AcademyRole | null>(null)
    const [dragOverDay, setDragOverDay] = useState<number | null>(null)

    // Match State
    const [showMatchFlow, setShowMatchFlow] = useState(false)
    const [matchResult, setMatchResult] = useState<any>(null)

    // Release Confirmation State
    const [confirmingReleaseId, setConfirmingReleaseId] = useState<string | null>(null)
    const RELEASE_FEE = 1000

    const prospectsWithData = useMemo(() =>
        academyPlayers.map(ap => ({
            prospect: ap,
            player: players.find(p => p.id === ap.playerId)
        })).filter(p => p.player),
        [academyPlayers, players]
    )

    if (!team) return <div className="p-4 text-white">Team not found</div>

    const academyLevel = team.academyFacility?.level || 0
    const levelInfo = academyLevel > 0 ? ACADEMY_LEVELS[academyLevel as keyof typeof ACADEMY_LEVELS] : null
    const nextLevelInfo = academyLevel < 5 ? ACADEMY_LEVELS[(academyLevel + 1) as keyof typeof ACADEMY_LEVELS] : null
    const upgradeCost = nextLevelInfo?.buildCost || 0
    const canAffordUpgrade = team.budget >= upgradeCost
    const isMaxLevel = academyLevel >= 5

    const activeLineupCount = Object.values(academyRoster).filter(Boolean).length
    const canPlayMatch = activeLineupCount >= 5

    // ===== HANDLERS =====

    const handleBuild = () => {
        const result = buildAcademy(team.id)
        if (result.success) {
            toast.success("Academy Established", { description: result.message })
        } else {
            toast.error("Cannot Build Academy", { description: result.message })
        }
    }

    const handleUpgrade = () => {
        const result = upgradeAcademy(team.id)
        if (result.success) {
            toast.success("Academy Upgraded", { description: result.message })
        } else {
            toast.error("Cannot Upgrade Academy", { description: result.message })
        }
    }

    const handleScout = (tier: "LOCAL" | "REGIONAL" | "INTERNATIONAL") => {
        const result = scoutProspect(tier)
        setLastScoutResult(result)
        if (result.success && result.player) {
            enrollProspect(result.player.id)
        } else if (!result.success) {
            toast.error("Scouting Failed", { description: result.message })
        }
    }

    // Drag & Drop for Roster
    const handleProspectDragStart = (prospectId: string) => {
        setDraggedProspect(prospectId)
    }

    const handleProspectDragEnd = () => {
        setDraggedProspect(null)
        setDragOverRole(null)
    }

    const handleRoleDragOver = (e: React.DragEvent, role: AcademyRole) => {
        e.preventDefault()
        setDragOverRole(role)
    }

    const handleRoleDrop = (role: AcademyRole) => {
        if (draggedProspect) {
            // Remove from other roles first in the store
            Object.entries(academyRoster).forEach(([r, id]) => {
                if (id === draggedProspect) {
                    updateAcademyRoster(r, null)
                }
            })
            updateAcademyRoster(role, draggedProspect)
        }
        setDraggedProspect(null)
        setDragOverRole(null)
    }

    const handleRemoveFromRole = (role: AcademyRole) => {
        updateAcademyRoster(role, null)
    }

    // Drag & Drop for Training
    const handleDrillDragStart = (drillId: string) => {
        setDraggedDrill(drillId)
    }

    const handleDrillDragEnd = () => {
        setDraggedDrill(null)
        setDragOverDay(null)
    }

    const handleDayDragOver = (e: React.DragEvent, day: number) => {
        e.preventDefault()
        setDragOverDay(day)
    }

    const handleDayDrop = (day: number) => {
        if (draggedDrill) {
            updateAcademySchedule(day, draggedDrill)
        }
        setDraggedDrill(null)
        setDragOverDay(null)
    }

    const handleRemoveFromDay = (day: number) => {
        updateAcademySchedule(day, null)
    }

    const handlePlayMatch = () => {
        if (!canPlayMatch) return
        setShowMatchFlow(true)
        setMatchResult(null) // Reset result first

        // Artificial delay for "Match in Progress..." animation
        setTimeout(() => {
            const result = scheduleDevMatch()
            if (result.success) {
                const scoreMatch = result.message.match(/(\d+)-(\d+)/)
                setMatchResult({
                    won: result.message.includes("Victory"),
                    scoreHome: scoreMatch ? parseInt(scoreMatch[1]) : 0,
                    scoreAway: scoreMatch ? parseInt(scoreMatch[2]) : 0,
                    message: result.message
                })
            }

            // Auto close after showing result
            setTimeout(() => {
                setShowMatchFlow(false)
                setMatchResult(null)
            }, 3000)
        }, 1500)
    }

    const getWeeklyUpkeep = () => {
        if (!levelInfo) return 0
        const perPlayer = (ACADEMY_WEEKLY_COSTS as any).prospectStipend + (ACADEMY_WEEKLY_COSTS as any).trainingMaterials
        return levelInfo.weeklyCost + academyPlayers.length * perPlayer
    }

    // ===== RENDER =====

    return (
        <div className="flex flex-col h-full bg-[#09090b] text-white font-sans selection:bg-emerald-500/30">
            {/* Header */}
            <div className="p-5 border-b border-white/5 bg-gradient-to-r from-emerald-950/30 to-cyan-950/30 backdrop-blur-md relative overflow-hidden">
                <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:20px_20px]" />
                <div className="flex justify-between items-start relative z-10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                            <GraduationCap className="text-emerald-400" size={22} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-normal flex items-center gap-2">
                                Youth Academy
                                {academyLevel > 0 && (
                                    <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 h-5 px-1.5 text-[10px]">
                                        LVL {academyLevel}
                                    </Badge>
                                )}
                            </h1>
                            <p className="text-xs text-white/50">{levelInfo?.description || "Build your academy"}</p>
                        </div>
                    </div>

                    {academyLevel > 0 && (
                        <div className="flex gap-2">
                            <div className="bg-black/20 px-3 py-2 rounded-lg border border-white/5 text-center">
                                <div className="text-[9px] text-white/40 uppercase">Prospects</div>
                                <div className="text-base font-normal text-emerald-400">{academyPlayers.length}/{levelInfo?.maxProspects}</div>
                            </div>
                            <div className="bg-black/20 px-3 py-2 rounded-lg border border-white/5 text-center">
                                <div className="text-[9px] text-white/40 uppercase">Weekly</div>
                                <div className="text-base font-normal text-red-400">${getWeeklyUpkeep().toLocaleString()}</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
                {academyLevel === 0 ? (
                    <BuildAcademyPanel budget={team.budget} onBuild={handleBuild} />
                ) : (
                    <div className="max-w-5xl mx-auto space-y-5">
                        {/* Upgrade Banner */}
                        {!isMaxLevel && (
                            <div className="flex items-center justify-between p-3 rounded-xl bg-[#0d0d10] border border-white/5">
                                <div className="flex items-center gap-3">
                                    <GraduationCap size={18} className="text-emerald-400" />
                                    <span className="text-sm font-medium">{levelInfo?.name}</span>
                                    <div className="flex gap-1">
                                        {levelInfo?.perks.slice(0, 2).map((p, i) => (
                                            <Badge key={i} variant="outline" className="text-[9px] h-4 px-1 text-emerald-400/70 border-emerald-500/20">
                                                {p}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                                <Button
                                    onClick={handleUpgrade}
                                    disabled={!canAffordUpgrade}
                                    size="sm"
                                    className={cn("h-7 px-3 text-[10px] font-bold active:scale-95 transition-transform", canAffordUpgrade ? "bg-white text-black hover:bg-emerald-400" : "bg-white/5 text-white/40")}
                                >
                                    Upgrade ${upgradeCost.toLocaleString()}
                                </Button>
                            </div>
                        )}

                        {/* Tabs */}
                        <div className="flex gap-1 p-1 rounded-lg bg-white/5 border border-white/5">
                            {TABS.map(tab => {
                                const Icon = tab.icon
                                const isActive = activeTab === tab.id
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={cn(
                                            "flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-medium transition-colors duration-75 ease-out active:scale-[0.97] active:duration-0",
                                            isActive ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "text-white/50 hover:text-white/80"
                                        )}
                                    >
                                        <Icon size={14} />
                                        {tab.name}
                                    </button>
                                )
                            })}
                        </div>

                        {/* Tab Content */}
                        <AnimatePresence mode="wait">
                            {activeTab === "ROSTER" && (
                                <RosterTab
                                    prospects={prospectsWithData}
                                    academyRoster={academyRoster}
                                    draggedProspect={draggedProspect}
                                    dragOverRole={dragOverRole}
                                    onProspectDragStart={handleProspectDragStart}
                                    onProspectDragEnd={handleProspectDragEnd}
                                    onRoleDragOver={handleRoleDragOver}
                                    onRoleDrop={handleRoleDrop}
                                    onRemoveFromRole={handleRemoveFromRole}
                                    onSetTraining={(id: string, focus: AcademyTrainingFocus) => setProspectTraining(id, focus)}
                                    onPromote={(id: string) => {
                                        const result = promoteProspect(id, { salaryPerWeek: 2000, lengthWeeks: 104 })
                                        if (result.success) {
                                            toast.success("Prospect Promoted", { description: result.message })
                                        } else {
                                            toast.error("Cannot Promote", { description: result.message })
                                        }
                                    }}
                                    onRelease={(id: string) => setConfirmingReleaseId(id)}
                                />
                            )}

                            {activeTab === "TRAINING" && (
                                <TrainingTab
                                    academyLevel={academyLevel}
                                    trainingSchedule={academyTrainingSchedule}
                                    draggedDrill={draggedDrill}
                                    dragOverDay={dragOverDay}
                                    onDrillDragStart={handleDrillDragStart}
                                    onDrillDragEnd={handleDrillDragEnd}
                                    onDayDragOver={handleDayDragOver}
                                    onDayDrop={handleDayDrop}
                                    onRemoveFromDay={handleRemoveFromDay}
                                />
                            )}

                            {activeTab === "MATCHES" && (
                                <MatchesTab
                                    academyLevel={academyLevel}
                                    canPlayMatch={canPlayMatch}
                                    matchHistory={academyMatchHistory}
                                    budget={team.budget}
                                    showMatchFlow={showMatchFlow}
                                    matchResult={matchResult}
                                    onPlayMatch={handlePlayMatch}
                                    onGoToRoster={() => setActiveTab("ROSTER")}
                                    academyRoster={academyRoster}
                                    academyPlayers={academyPlayers}
                                    players={players}
                                />
                            )}

                            {activeTab === "SCOUTING" && (
                                <ScoutingTab
                                    academyLevel={academyLevel}
                                    budget={team.budget}
                                    currentProspects={academyPlayers.length}
                                    maxProspects={levelInfo?.maxProspects || 3}
                                    lastResult={lastScoutResult}
                                    onScout={handleScout}
                                    missions={academyScoutingMissions}
                                    staff={staff}
                                    pendingProspects={academyPendingProspects}
                                    onEnrollPending={enrollPendingProspect}
                                    onDiscardPending={discardPendingProspect}
                                    players={players}
                                />
                            )}

                            {activeTab === "GRADUATES" && (
                                <GraduatesTab players={players} />
                            )}

                            {activeTab === "REPORTS" && (
                                <ReportsTab reports={academyWeeklyReports} players={players} />
                            )}
                        </AnimatePresence>
                    </div>
                )}
            </div>

            {/* Release Confirmation Modal */}
            <AnimatePresence>
                {confirmingReleaseId && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 top-16 bg-black/85 backdrop-blur-md z-modal flex items-center justify-center p-4">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-[#0d0d10] border border-red-500/20 rounded-2xl p-6 max-w-sm w-full shadow-2xl relative overflow-hidden"
                        >
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500/0 via-red-500/50 to-red-500/0" />

                            <div className="w-14 h-14 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
                                <X size={28} className="text-red-400" />
                            </div>

                            <h3 className="text-lg font-bold text-center mb-2">Release Prospect?</h3>
                            <p className="text-xs text-white/50 text-center mb-6 leading-relaxed">
                                Are you sure you want to release this talent?
                                A termination fee of <span className="text-red-400 font-bold">${RELEASE_FEE.toLocaleString()}</span> will be deducted from your budget.
                            </p>

                            <div className="flex gap-3">
                                <Button
                                    variant="ghost"
                                    className="flex-1 text-white/50 hover:text-white hover:bg-white/5 border border-white/5"
                                    onClick={() => setConfirmingReleaseId(null)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold shadow-lg shadow-red-500/20"
                                    onClick={() => {
                                        const result = releaseProspect(confirmingReleaseId)
                                        setConfirmingReleaseId(null)
                                        if (result.success) {
                                            toast.success("Prospect Released", { description: result.message })
                                        } else {
                                            toast.error("Cannot Release", { description: result.message })
                                        }
                                    }}
                                >
                                    Confirm Release
                                </Button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

// ===== BUILD ACADEMY PANEL =====

function BuildAcademyPanel({ budget, onBuild }: { budget: number; onBuild: () => void }) {
    const cost = 25000
    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-lg mx-auto text-center p-8 rounded-2xl bg-gradient-to-br from-emerald-950/20 to-cyan-950/20 border border-emerald-500/20">
            <GraduationCap size={48} className="mx-auto mb-4 text-emerald-400" />
            <h2 className="text-xl font-bold mb-2">Build Your Youth Academy</h2>
            <p className="text-sm text-white/50 mb-6">Scout, train, and develop the next generation of talent.</p>
            <div className="p-3 rounded-lg bg-black/30 border border-white/10 mb-4">
                <div className="flex justify-between text-sm">
                    <span className="text-white/60">Construction Cost</span>
                    <span className={budget >= cost ? "text-white" : "text-red-400"}>${cost.toLocaleString()}</span>
                </div>
            </div>
            <Button onClick={onBuild} disabled={budget < cost} className={cn("h-12 px-6 font-bold active:scale-95 transition-transform", budget >= cost ? "bg-emerald-500 hover:bg-emerald-400 text-black" : "bg-white/5 text-white/40")}>
                Establish Academy
            </Button>
        </motion.div>
    )
}

// ===== ROSTER TAB =====

function RosterTab({ prospects, academyRoster, draggedProspect, dragOverRole, onProspectDragStart, onProspectDragEnd, onRoleDragOver, onRoleDrop, onRemoveFromRole, onSetTraining, onPromote, onRelease }: any) {
    const roleIcons: Record<AcademyRole, any> = { IGL: Brain, Entry: Crosshair, AWPer: Target, Support: Shield, Rifler: Zap }

    // Filter State
    const [sortBy, setSortBy] = useState<"ovr" | "potential">("ovr")
    const [filterRole, setFilterRole] = useState<string>("ALL")

    // Apply filters
    const filteredProspects = useMemo(() => {
        let result = [...prospects]

        // Filter by role
        if (filterRole !== "ALL") {
            result = result.filter((p: any) => {
                const role = p.player.role?.toUpperCase().replace("_", " ") || "RIFLER"
                return role.includes(filterRole.toUpperCase())
            })
        }

        // Sort
        result.sort((a: any, b: any) => {
            if (sortBy === "ovr") {
                const ratingA = Math.round((a.player.skill + a.player.rifle + a.player.tactic + a.player.teamwork) / 4)
                const ratingB = Math.round((b.player.skill + b.player.rifle + b.player.tactic + b.player.teamwork) / 4)
                return ratingB - ratingA
            } else {
                return (b.player.potential || 0) - (a.player.potential || 0)
            }
        })

        return result
    }, [prospects, sortBy, filterRole])

    return (
        <motion.div key="roster" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
            {/* Active Lineup - Drop Zones */}
            <div className="p-4 rounded-xl bg-[#0d0d10] border border-white/10">
                <div className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">Active Lineup — Drag prospects here</div>
                <div className="grid grid-cols-5 gap-3">
                    {ACADEMY_ROLES.map(role => {
                        const playerId = academyRoster[role]
                        const prospectData = playerId ? prospects.find((p: any) => p.prospect.id === playerId) : null
                        const Icon = roleIcons[role]
                        const isOver = dragOverRole === role

                        return (
                            <div
                                key={role}
                                onDragOver={(e) => onRoleDragOver(e, role)}
                                onDragLeave={() => { }}
                                onDrop={() => onRoleDrop(role)}
                                className={cn(
                                    "relative aspect-[3/4] rounded-xl border-2 border-dashed transition-[border-color,background-color,transform] duration-100 ease-out flex flex-col items-center justify-center p-2",
                                    prospectData ? "border-emerald-500/40 bg-emerald-500/5" : "border-white/10 hover:border-white/20",
                                    isOver && !prospectData && "border-emerald-400 bg-emerald-500/10 scale-105",
                                    draggedProspect && !prospectData && "animate-pulse"
                                )}
                            >
                                {prospectData ? (
                                    <>
                                        <button onClick={() => onRemoveFromRole(role)} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 hover:bg-red-500/50 active:bg-red-500 active:scale-90 flex items-center justify-center transition-all">
                                            <X size={10} />
                                        </button>
                                        <Image src={prospectData.player.portraitPath || "/player_placeholder.webp"} alt={prospectData.player.nickname} width={40} height={40} className="w-10 h-10 rounded-lg object-cover mb-1" unoptimized />
                                        <div className="text-[10px] font-bold truncate w-full text-center">{prospectData.player.nickname}</div>
                                        <Badge className="text-[8px] h-4 px-1 bg-emerald-500/20 text-emerald-400 border-emerald-500/30 mt-1">{role}</Badge>
                                    </>
                                ) : (
                                    <>
                                        <Icon size={20} className={cn("mb-1", isOver ? "text-emerald-400" : "text-white/20")} />
                                        <div className="text-[9px] text-white/40 uppercase font-bold">{role}</div>
                                        <Plus size={12} className="text-white/20 mt-1" />
                                    </>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Filter Controls */}
            <div className="flex items-center gap-3 flex-wrap">
                <div className="text-xs font-bold text-white/40 uppercase tracking-wider">Filter:</div>

                {/* Sort Toggle */}
                <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
                    <button
                        onClick={() => setSortBy("ovr")}
                        className={cn("px-2 py-1 rounded text-[10px] font-bold transition-colors duration-75 ease-out active:scale-95 active:duration-0", sortBy === "ovr" ? "bg-cyan-500/20 text-cyan-400" : "text-white/40 hover:text-white/60")}
                    >
                        OVR ↓
                    </button>
                    <button
                        onClick={() => setSortBy("potential")}
                        className={cn("px-2 py-1 rounded text-[10px] font-bold transition-colors duration-75 ease-out active:scale-95 active:duration-0", sortBy === "potential" ? "bg-amber-500/20 text-amber-400" : "text-white/40 hover:text-white/60")}
                    >
                        Potential ↓
                    </button>
                </div>

                {/* Role Filter */}
                <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
                    {["ALL", "AWP", "ENTRY", "IGL", "SUPPORT", "RIFLER"].map(role => (
                        <button
                            key={role}
                            onClick={() => setFilterRole(role)}
                            className={cn("px-2 py-1 rounded text-[10px] font-bold transition-colors duration-75 ease-out active:scale-95 active:duration-0", filterRole === role ? "bg-emerald-500/20 text-emerald-400" : "text-white/40 hover:text-white/60")}
                        >
                            {role}
                        </button>
                    ))}
                </div>
            </div>

            {/* All Prospects - Draggable */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <div className="text-xs font-bold text-white/40 uppercase tracking-wider">All Prospects — Drag to assign</div>
                    <div className="text-[10px] text-white/30">{filteredProspects.length} prospect{filteredProspects.length !== 1 ? "s" : ""}</div>
                </div>
                {filteredProspects.length === 0 ? (
                    <div className="p-8 rounded-xl bg-white/5 border border-dashed border-white/10 text-center">
                        <Users className="mx-auto mb-2 text-white/20" size={32} />
                        <p className="text-sm text-white/40">{prospects.length === 0 ? "No prospects yet. Scout some talent!" : "No prospects match filters"}</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {filteredProspects.map(({ prospect, player }: any) => {
                            const isAssigned = Object.values(academyRoster).includes(prospect.id)
                            const isDragging = draggedProspect === prospect.id
                            const rating = Math.round((player.skill + player.rifle + player.tactic + player.teamwork) / 4)
                            const potentialRating = player.potential || 80
                            const potentialStars = Math.ceil(potentialRating / 20)

                            return (
                                <div
                                    key={prospect.id}
                                    draggable
                                    onDragStart={() => onProspectDragStart(prospect.id)}
                                    onDragEnd={onProspectDragEnd}
                                    className={cn(
                                        "relative p-3 rounded-xl border cursor-grab active:cursor-grabbing transition-[border-color,background-color,opacity,transform] duration-100 ease-out group",
                                        isAssigned ? "bg-emerald-500/5 border-emerald-500/20" : "bg-[#0d0d10] border-white/10 hover:border-white/20",
                                        isDragging && "opacity-50 scale-95"
                                    )}
                                >
                                    {/* Release button - shows on hover */}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onRelease(prospect.id) }}
                                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500/80 hover:bg-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                        title="Release from academy"
                                    >
                                        <X size={12} className="text-white" />
                                    </button>

                                    <div className="flex items-center gap-3">
                                        <GripVertical size={14} className="text-white/20 shrink-0" />
                                        <Image src={player.portraitPath || "/player_placeholder.webp"} alt={player.nickname} width={40} height={40} className="w-10 h-10 rounded-lg object-cover shrink-0" unoptimized />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5 mb-0.5">
                                                <span className="font-bold text-sm truncate">{player.nickname}</span>
                                                {isAssigned && <CheckCircle2 size={10} className="text-emerald-400 shrink-0" />}
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <Badge variant="outline" className="text-[8px] h-4 px-1 text-cyan-400 border-cyan-500/30">
                                                    {player.role?.replace("_", " ") || "Rifler"}
                                                </Badge>
                                                <span className="text-[10px] text-white/40">{player.age}y</span>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <div className="text-lg font-normal text-white/70">{rating}</div>
                                            <div className="text-[8px] text-white/30 uppercase">OVR</div>
                                        </div>
                                    </div>
                                    {/* Potential & Progress Row */}
                                    <div className="mt-2 flex flex-col gap-1.5">
                                        <div className="flex items-center gap-2">
                                            <div className="flex items-center gap-0.5 shrink-0">
                                                {[...Array(5)].map((_, i) => (
                                                    <Star key={i} size={8} className={i < potentialStars ? "text-amber-400 fill-amber-400" : "text-white/10"} />
                                                ))}
                                                <span className="text-[9px] text-amber-400/70 ml-1">{potentialRating}</span>
                                            </div>
                                            <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                                                <div className={cn("h-full rounded-full", prospect.readyForPromotion ? "bg-emerald-500" : "bg-cyan-500")} style={{ width: `${prospect.developmentProgress}%` }} />
                                            </div>
                                            <span className="text-[9px] text-white/40">{Math.round(prospect.developmentProgress)}%</span>
                                        </div>

                                        {/* Energy Bar */}
                                        <div className="flex items-center gap-2">
                                            <Activity size={10} className={cn((prospect.energy ?? 100) < 15 ? "text-rose-500 animate-pulse" : "text-emerald-400/50")} />
                                            <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden ring-1 ring-white/5">
                                                <div
                                                    className={cn(
                                                        "h-full rounded-full transition-all duration-500",
                                                        (prospect.energy ?? 100) < 15 ? "bg-rose-500" : (prospect.energy ?? 100) < 40 ? "bg-amber-500" : "bg-emerald-500"
                                                    )}
                                                    style={{ width: `${prospect.energy ?? 100}%` }}
                                                />
                                            </div>
                                            <span className={cn("text-[9px] font-bold", (prospect.energy ?? 100) < 15 ? "text-rose-500" : "text-white/40")}>
                                                {Math.round(prospect.energy ?? 100)}%
                                            </span>
                                        </div>

                                        {(prospect.energy ?? 100) < 15 && (
                                            <div className="text-[8px] font-bold text-rose-500/80 uppercase tracking-tighter flex items-center gap-1">
                                                <Zap size={8} /> Fatigued (-20% XP)
                                            </div>
                                        )}
                                    </div>

                                    {/* Promotion Button - Only shows when ready */}
                                    {prospect.readyForPromotion && (
                                        <motion.button
                                            initial={{ opacity: 0, y: 5 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            onClick={(e) => { e.stopPropagation(); onPromote(prospect.id) }}
                                            className="mt-2 w-full py-1.5 rounded-lg bg-emerald-500 text-black text-[10px] font-normal uppercase tracking-wider hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/20"
                                        >
                                            Promote to Main Roster
                                        </motion.button>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </motion.div>
    )
}

// ===== GRADUATES TAB =====

function GraduatesTab({ players }: { players: PlayerSaveData[] }) {
    // Memoize — the parent (AcademyApp) re-renders on any of its many
    // useGameStore subscriptions, and players is the global ~1000-entry
    // list. Filtering by isAcademyGraduate every render is unnecessary.
    const graduates = useMemo(
        () => players.filter(p => p.isAcademyGraduate),
        [players],
    )

    return (
        <motion.div key="graduates" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-white/40 uppercase tracking-wider">Academy Alumni — Tracking your successes</div>
                <div className="text-[10px] text-white/30">{graduates.length} Graduate{graduates.length !== 1 ? "s" : ""}</div>
            </div>

            {graduates.length === 0 ? (
                <div className="p-12 rounded-2xl bg-white/[0.02] border border-dashed border-white/10 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                        <GraduationCap size={32} className="text-white/10" />
                    </div>
                    <h3 className="text-sm font-bold text-white/40 mb-1">No graduates yet</h3>
                    <p className="text-xs text-white/55">Develop and promote prospects to see them here.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {graduates.map(player => {
                        const rating = Math.round((player.skill + player.rifle + player.tactic + player.teamwork) / 4)
                        return (
                            <div key={player.id} className="p-4 rounded-2xl bg-[#0d0d10] border border-white/10 flex items-center gap-4 group hover:border-emerald-500/30 transition-colors duration-100 ease-out">
                                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shrink-0 overflow-hidden">
                                    <Image src={player.portraitPath || "/player_placeholder.webp"} alt={player.nickname} width={48} height={48} className="w-full h-full object-cover" unoptimized />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className="font-bold text-base text-white">{player.nickname}</span>
                                        <Badge className="bg-emerald-500/20 text-emerald-400 border-none text-[8px] h-4 px-1">GRADUATE</Badge>
                                    </div>
                                    <div className="text-[10px] text-white/40 uppercase tracking-wider font-bold">
                                        {player.role?.replace("_", " ") || "Rifler"} • {player.age}y
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <div className="text-2xl font-normal text-emerald-400 leading-none">{rating}</div>
                                    <div className="text-[8px] text-white/30 uppercase mt-1">CUR OVR</div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </motion.div>
    )
}

// ===== TRAINING TAB =====

function TrainingTab({ academyLevel, trainingSchedule, draggedDrill, dragOverDay, onDrillDragStart, onDrillDragEnd, onDayDragOver, onDayDrop, onRemoveFromDay }: any) {
    return (
        <motion.div key="training" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
            {/* Weekly Schedule - Drop Zones */}
            <div className="p-4 rounded-xl bg-[#0d0d10] border border-white/10">
                <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-bold text-white/40 uppercase tracking-wider">Weekly Schedule — Drag drills here</div>
                    <div className="flex items-center gap-2">
                        {(() => {
                            const weeklyDrain = Object.values(trainingSchedule).reduce((acc: number, drillId: any) => {
                                const drill = ACADEMY_DRILLS.find(d => d.id === drillId)
                                return acc + (drill?.energyCost || 0)
                            }, 0)

                            const isDrain = weeklyDrain > 0
                            return (
                                <div className={cn("text-xs font-normal px-2 py-1 rounded bg-black/40 border", isDrain ? "text-rose-400 border-rose-500/30" : "text-emerald-400 border-emerald-500/30")}>
                                    {isDrain ? "Active Drain:" : "Net Recovery:"} {Math.abs(weeklyDrain)} NRG
                                </div>
                            )
                        })()}
                    </div>
                </div>
                <div className="flex items-center gap-2 text-[9px] text-white/30 mb-4 bg-white/5 p-1.5 rounded border border-white/5">
                    <AlertTriangle size={10} className="text-amber-500/50" />
                    <span><b className="text-white/50 uppercase">Bench Efficiency:</b> Non-starters gain only <span className="text-emerald-400/80">25% XP</span> from scheduled drills. Assign players to the lineup for full gains.</span>
                </div>
                <div className="grid grid-cols-7 gap-2">
                    {DAYS.map((day, i) => {
                        const drillId = trainingSchedule[i]
                        const drill = drillId ? ACADEMY_DRILLS.find(d => d.id === drillId) : null
                        const isOver = dragOverDay === i
                        const Icon = drill?.icon || Dumbbell

                        return (
                            <div
                                key={day}
                                onDragOver={(e) => onDayDragOver(e, i)}
                                onDrop={() => onDayDrop(i)}
                                className="text-center"
                            >
                                <div className="text-[9px] text-white/40 uppercase font-bold mb-1.5">{day}</div>
                                <div
                                    className={cn(
                                        "aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center transition-[border-color,background-color,transform] duration-100 ease-out relative",
                                        drill ? `${drill.bgColor} border-transparent` : "border-white/10",
                                        isOver && !drill && "border-cyan-400 bg-cyan-500/10 scale-105",
                                        draggedDrill && !drill && "animate-pulse"
                                    )}
                                >
                                    {drill ? (
                                        <>
                                            <button onClick={() => onRemoveFromDay(i)} className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-black/70 hover:bg-red-500/70 active:bg-red-500 active:scale-90 flex items-center justify-center text-white transition-all">
                                                <X size={8} />
                                            </button>
                                            <Icon size={16} className={drill.color} />
                                            <div className="text-[8px] text-white/60 mt-1">{drill.name}</div>
                                        </>
                                    ) : (
                                        <Plus size={14} className={isOver ? "text-cyan-400" : "text-white/20"} />
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Training Drills - Draggable */}
            <div>
                <div className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">Training Drills — Drag to schedule</div>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {ACADEMY_DRILLS.map(drill => {
                        const Icon = (drill as any).icon || Activity
                        const isDragging = draggedDrill === drill.id
                        const isLocked = academyLevel < drill.minLevel

                        return (
                            <div
                                key={drill.id}
                                draggable={!isLocked}
                                onDragStart={() => !isLocked && onDrillDragStart(drill.id)}
                                onDragEnd={onDrillDragEnd}
                                className={cn(
                                    "p-3 rounded-xl border transition-[border-color,background-color,opacity,transform] duration-100 ease-out text-center relative overflow-hidden active:scale-[0.97] active:duration-0",
                                    isLocked ? "bg-white/5 border-white/5 opacity-50 gray-scale" : "bg-[#0d0d10] border-white/10 hover:border-white/20 cursor-grab active:cursor-grabbing",
                                    isDragging && "opacity-50 scale-95"
                                )}
                            >
                                {isLocked && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
                                        <Badge className="bg-white/10 text-white/40 border-white/10 text-[8px]">LVL {drill.minLevel}</Badge>
                                    </div>
                                )}
                                <div className="text-[10px] font-bold mb-1 truncate">{drill.name}</div>
                                <div className="flex flex-col gap-1">
                                    <div className="text-[8px] font-normal text-emerald-400">+{drill.xpGain} XP</div>
                                    <div className={cn("text-[8px] font-normal", drill.energyCost > 0 ? "text-amber-400" : "text-cyan-400")}>
                                        {drill.energyCost > 0 ? `-${drill.energyCost}` : `+${Math.abs(drill.energyCost)}`} NRG
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </motion.div>
    )
}

// ===== MATCHES TAB =====

function MatchesTab({ academyLevel, canPlayMatch, matchHistory, budget, showMatchFlow, matchResult, onPlayMatch, onGoToRoster, academyRoster, academyPlayers, players }: any) {
    const minLevel = 2, matchCost = 2500
    const starterIds = Object.values(academyRoster).filter(Boolean) as string[]
    const activeStarters = academyPlayers.filter((p: any) => starterIds.includes(p.id))
    const exhaustedStarters = activeStarters.filter((p: any) => p.energy < 5)

    const canSchedule = academyLevel >= minLevel && activeStarters.length === 5 && budget >= matchCost && exhaustedStarters.length === 0

    return (
        <motion.div key="matches" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
            {/* ... overlay remains same ... */}
            <AnimatePresence>
                {showMatchFlow && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 top-16 bg-black/85 z-modal flex items-center justify-center">
                        <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="text-center">
                            {!matchResult ? (
                                <><Gamepad2 size={56} className="mx-auto mb-3 text-cyan-400 animate-pulse" /><div className="text-xl font-bold">Match in Progress...</div></>
                            ) : (
                                <><div className={cn("text-5xl font-normal", matchResult.won ? "text-emerald-400" : "text-red-400")}>{matchResult.won ? "VICTORY!" : "DEFEAT"}</div><div className="text-3xl font-mono font-bold text-white/80 mt-2">{matchResult.scoreHome} - {matchResult.scoreAway}</div></>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Starter Energy Summary */}
            <div className="grid grid-cols-5 gap-2">
                {["IGL", "Entry", "AWPer", "Support", "Rifler"].map(role => {
                    const prospectId = academyRoster[role]
                    const prospect = academyPlayers.find((p: any) => p.id === prospectId)
                    const player = prospect ? players.find((p: any) => p.id === prospect.playerId) : null

                    return (
                        <div key={role} className="p-2 rounded-lg bg-white/5 border border-white/10 text-center">
                            <div className="text-[8px] font-normal text-white/30 uppercase mb-1">{role}</div>
                            {player ? (
                                <div className="space-y-1">
                                    <div className="text-[10px] font-bold truncate">{player.nickname}</div>
                                    <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                                        <div className={cn("h-full rounded-full", (prospect.energy ?? 100) < 15 ? "bg-red-500" : "bg-emerald-500")} style={{ width: `${prospect.energy ?? 100}%` }} />
                                    </div>
                                    <div className={cn("text-[8px] font-bold", (prospect.energy ?? 100) < 15 ? "text-red-400" : "text-white/40")}>{Math.round(prospect.energy ?? 100)}% NRG</div>
                                </div>
                            ) : (
                                <div className="text-[10px] text-white/10 italic py-2">Empty</div>
                            )}
                        </div>
                    )
                })}
            </div>

            <div className="p-4 rounded-xl bg-[#0d0d10] border border-white/10">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                        <Gamepad2 size={20} className="text-cyan-400" />
                        <div>
                            <div className="font-bold text-sm">Development Match</div>
                            <div className="text-[10px] text-white/40">Compete vs other academies</div>
                        </div>
                    </div>
                    <div className="text-right">
                        <Button onClick={onPlayMatch} disabled={!canSchedule} className={cn("h-9 px-4 font-bold text-[10px]", canSchedule ? "bg-cyan-500 hover:bg-cyan-400 text-black" : "bg-white/5 text-white/40")}>
                            Play ${matchCost.toLocaleString()}
                        </Button>
                        {!canSchedule && (
                            <div className="text-[8px] text-red-400 font-bold mt-1 uppercase tracking-tighter">
                                {activeStarters.length < 5 ? "Need 5 Starters" : exhaustedStarters.length > 0 ? "Starters Exhausted" : academyLevel < 2 ? "Level 2 Required" : "Insufficient Budget"}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div>
                <div className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">Match History</div>
                {matchHistory.length === 0 ? (
                    <div className="p-6 rounded-xl bg-white/5 border border-dashed border-white/10 text-center"><Clock size={24} className="mx-auto mb-2 text-white/20" /><p className="text-xs text-white/40">No matches yet</p></div>
                ) : (
                    <div className="space-y-2">
                        {matchHistory.slice(-5).reverse().map((m: any) => (
                            <div key={m.id} className={cn("p-2.5 rounded-lg border flex items-center justify-between", m.won ? "bg-emerald-500/5 border-emerald-500/10" : "bg-red-500/5 border-red-500/10")}>
                                <div className="flex items-center gap-2">
                                    <div className={cn("w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold", m.won ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400")}>{m.won ? "W" : "L"}</div>
                                    <div><div className="text-xs font-medium">vs {m.opponentName}</div><div className="text-[9px] text-white/40">Week {m.week}</div></div>
                                </div>
                                <div className="text-base font-mono font-bold text-white/70">{m.scoreHome}-{m.scoreAway}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </motion.div >
    )
}

// ===== REPORTS TAB =====

function ReportsTab({ reports, players }: { reports: any[], players: any[] }) {
    if (!reports || reports.length === 0) {
        return (
            <div className="p-16 text-center bg-white/5 rounded-3xl border border-dashed border-white/10 mt-4">
                <BarChart3 className="mx-auto mb-4 text-white/10" size={48} />
                <h3 className="text-xl font-bold text-white/60 mb-1">No Academic Reports</h3>
                <p className="text-sm text-white/30 max-w-[200px] mx-auto leading-relaxed">Play through weeks to see detailed breakdowns of your prospects' progress.</p>
            </div>
        )
    }

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5 py-2">
            {[...reports].reverse().slice(0, 5).map((report: any, idx: number) => (
                <div key={idx} className="bg-[#0b0b0d] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                    <div className="px-4 py-3 border-b border-white/5 bg-white/[0.03] flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <Activity className="text-emerald-400" size={14} />
                            <span className="text-xs font-normal tracking-widest uppercase text-white/80">Week {report.week} Report</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/20 font-normal">+{Math.round(report.overallXp || 0)} XP</Badge>
                        </div>
                    </div>
                    <div className="divide-y divide-white/5">
                        {report.prospectReports.map((pr: any, pIdx: number) => (
                            <div key={pIdx} className="p-4 flex items-center justify-between hover:bg-white/[0.01] transition-colors group">
                                <div className="flex items-center gap-4 min-w-0 flex-1">
                                    <div className={cn("w-1 h-8 rounded-full", pr.isStarter ? "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.4)]" : "bg-white/10")} />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-bold text-sm truncate text-white/90">{pr.nickname}</span>
                                            {pr.isStarter && <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/20 text-[7px] h-3.5 px-1.5">STARTER</Badge>}
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {Object.entries(pr.statImprovements).map(([stat, val]: [string, any]) => (
                                                <div key={stat} className="flex items-center gap-1 bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
                                                    <span className="text-[8px] font-bold text-white/30 uppercase">{stat}</span>
                                                    <span className="text-[8px] font-normal text-emerald-400">+{val.toFixed(2)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right pl-4 shrink-0">
                                    <div className="text-sm font-normal text-emerald-400">+{pr.xpGained} XP</div>
                                    <div className={cn("text-[9px] font-normal tracking-tighter mt-1", pr.energyChange > 0 ? "text-cyan-400" : "text-rose-500")}>
                                        {pr.energyChange > 0 ? "+" : ""}{Math.round(pr.energyChange)}% NRG
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </motion.div>
    )
}

// ===== SCOUTING TAB =====

function ScoutingTab({
    academyLevel, budget, currentProspects, maxProspects, lastResult, onScout, missions, staff,
    pendingProspects = [], onEnrollPending, onDiscardPending, players
}: any) {
    const tiers = [
        { id: "LOCAL" as const, name: "Local", cost: 5000, minLevel: 1, duration: 1 },
        { id: "REGIONAL" as const, name: "Regional", cost: 15000, minLevel: 2, duration: 2 },
        { id: "INTERNATIONAL" as const, name: "Global", cost: 35000, minLevel: 4, duration: 4 }
    ]
    const isFull = currentProspects >= maxProspects
    const hasScout = staff.some((s: any) => s.teamId && s.role === "scout")

    // Get actual player data for pending prospects. Indexed lookup so the
    // 5×N players.find scan becomes a single Map build (memoized) + 5
    // O(1) lookups.
    const playersById = useMemo(
        () => new Map<string, any>((players as any[]).map((p: any) => [p.id, p])),
        [players],
    )
    const pendingPlayers = useMemo(
        () => (pendingProspects as string[])
            .map((id: string) => playersById.get(id))
            .filter(Boolean),
        [pendingProspects, playersById],
    )

    return (
        <motion.div key="scouting" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4 pb-20">
            {!hasScout && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3">
                    <AlertTriangle className="text-red-400" size={20} />
                    <div>
                        <div className="text-sm font-bold text-red-400">No Scout Hired</div>
                        <div className="text-[10px] text-red-400/70">You must hire a Scout from the Staff Market to initiate scouting missions.</div>
                    </div>
                </div>
            )}

            {isFull && <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center text-xs text-amber-400 font-bold">Academy capacity reached ({currentProspects}/{maxProspects})</div>}

            {/* Scouting Tiers */}
            <div className="grid grid-cols-3 gap-3">
                {tiers.map(tier => {
                    const unlocked = academyLevel >= tier.minLevel
                    const canAfford = budget >= tier.cost
                    const isActive = Array.isArray(missions) && missions.some((m: any) => m.tier === tier.id)
                    const canScout = unlocked && canAfford && !isFull && hasScout && !isActive

                    return (
                        <div key={tier.id} className={cn("p-4 rounded-xl border relative overflow-hidden transition-colors duration-100 ease-out", unlocked ? "bg-[#0d0d10] border-white/10" : "bg-white/5 border-white/5 opacity-50")}>
                            {isActive && <div className="absolute inset-0 bg-cyan-500/5 animate-pulse" />}
                            <div className="flex items-center gap-2 mb-2 relative z-10">
                                <Search size={16} className={unlocked ? "text-emerald-400" : "text-white/30"} />
                                <span className="font-bold text-sm tracking-tight">{tier.name}</span>
                            </div>

                            <div className="flex flex-col gap-1 mb-3 relative z-10">
                                <div className="flex items-center gap-2 text-[10px] text-white/40">
                                    <Clock size={10} /> {tier.duration} week{tier.duration > 1 ? "s" : ""}
                                </div>
                                {!unlocked && <div className="text-[9px] text-amber-400 font-bold uppercase tracking-wider">Lvl {tier.minLevel} Required</div>}
                            </div>

                            {isActive ? (
                                <div className="space-y-2 relative z-10">
                                    <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ x: "-100%" }}
                                            animate={{ x: "100%" }}
                                            transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                                            className="h-full w-1/2 bg-gradient-to-r from-transparent via-cyan-500 to-transparent"
                                        />
                                    </div>
                                    <div className="text-[8px] text-cyan-400 font-normal text-center uppercase tracking-widest">In Transit</div>
                                </div>
                            ) : (
                                <Button
                                    onClick={() => onScout(tier.id)}
                                    disabled={!canScout}
                                    className={cn("w-full h-8 text-[10px] font-normal uppercase tracking-wider", canScout ? "bg-emerald-500 hover:bg-emerald-400 text-black border-none shadow-[0_0_15px_-5px_rgba(16,185,129,0.4)]" : "bg-white/5 text-white/20 border-white/5")}
                                >
                                    ${tier.cost.toLocaleString()}
                                </Button>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Pending Results (Review Talent) */}
            {pendingPlayers.length === 0 && (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.01] p-6 text-center">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-1.5">
                        No Prospects In Review
                    </div>
                    <p className="text-[11px] text-white/40 max-w-sm mx-auto">
                        Run a scouting mission above to unearth new talent. Completed missions deliver prospects here for you to enroll, train, and promote.
                    </p>
                </div>
            )}
            {pendingPlayers.length > 0 && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-2">
                            <div className="h-px w-8 bg-gradient-to-r from-transparent to-cyan-500/30" />
                            <span className="text-[10px] font-normal uppercase tracking-widest text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20">Review New Talent</span>
                        </div>
                        <div className="text-[10px] font-normal text-white/30 uppercase tracking-tighter">
                            Pool Capacity: <span className={cn("transition-colors", (pendingPlayers.length >= PENDING_POOL_MAX_SIZE) ? "text-red-400" : "text-cyan-400/70")}>{pendingPlayers.length}/{PENDING_POOL_MAX_SIZE}</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                        {pendingPlayers.map((player: any) => (
                            <motion.div
                                key={player.id}
                                layout
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="p-4 rounded-xl bg-[#0d0d10] border border-white/10 flex items-center justify-between group hover:border-cyan-500/30 transition-colors duration-100 ease-out relative overflow-hidden"
                            >
                                <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500/50 opacity-0 group-hover:opacity-100 transition-opacity" />

                                <div className="flex items-center gap-4 relative z-10">
                                    <div className="relative w-12 h-12 rounded-lg bg-white/5 border border-white/10 overflow-hidden flex items-center justify-center">
                                        <Image src={player.portraitPath || "/player_placeholder.webp"} alt={player.nickname} width={48} height={48} className="w-full h-full object-cover" unoptimized />
                                        <div className="absolute bottom-0 right-0 p-0.5 bg-black/60 backdrop-blur-sm rounded-tl-md">
                                            <div className={cn("w-2.5 h-1.5 rounded-sm", player.nationality === "Sweden" ? "bg-blue-600" : "bg-zinc-600")} />
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className="text-sm font-normal tracking-tight">{player.nickname}</h4>
                                            <span className="text-[10px] text-white/30">{player.age}y • {player.role}</span>
                                        </div>
                                        <div className="flex gap-2 mt-1">
                                            <div className="px-1.5 py-0.5 rounded bg-white/5 border border-white/5 flex items-center gap-1">
                                                <div className="w-1 h-1 rounded-full bg-emerald-400" />
                                                <span className="text-[9px] font-bold text-white/50">{player.skill} OVR</span>
                                            </div>
                                            <div className="px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 flex items-center gap-1">
                                                <span className="text-[9px] font-normal text-cyan-400">? POTENTIAL</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-2 relative z-10">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 text-[10px] font-bold border-red-500/20 text-red-400 hover:bg-red-500/10 hover:border-red-500/40"
                                        onClick={() => onDiscardPending(player.id)}
                                    >
                                        Discard
                                    </Button>
                                    <Button
                                        size="sm"
                                        disabled={isFull}
                                        className="h-8 text-[10px] font-normal tracking-tighter bg-cyan-500 hover:bg-cyan-400 text-black border-none"
                                        onClick={() => onEnrollPending(player.id)}
                                    >
                                        Enroll to Academy
                                    </Button>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            )}

            {/* Active Missions */}
            {missions?.length > 0 && (
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                    <div className="flex items-center justify-between mb-3">
                        <div className="text-[10px] font-normal text-white/40 uppercase tracking-widest">Active Operations</div>
                        <div className="px-2 py-0.5 rounded bg-cyan-500/10 text-[9px] font-normal text-cyan-400 border border-cyan-500/20">{missions.length}</div>
                    </div>
                    <div className="space-y-2">
                        {missions.map((m: any) => (
                            <div key={m.id} className="flex items-center justify-between p-3 bg-black/40 rounded-lg border border-white/5 group hover:border-white/10 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors">
                                        <Timer size={18} className="text-cyan-400" />
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-normal uppercase tracking-tight text-white/80">{m.tier} EXPEDITION</div>
                                        <div className="text-[9px] text-white/30 flex items-center gap-1 mt-0.5">
                                            <MapPin size={8} /> Active in region
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm font-normal font-mono text-cyan-400 leading-none">{m.weeksRemaining}w</div>
                                    <div className="text-[8px] text-white/55 uppercase font-normal tracking-tighter mt-1">Remaining</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {lastResult && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={cn("p-3 rounded-xl border text-center text-xs font-bold", lastResult.success ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border-red-500/20 text-red-400")}>{lastResult.message}</motion.div>}
        </motion.div>
    )
}

export default AcademyApp
