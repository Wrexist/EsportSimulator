"use client"

import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { debug } from "@/lib/debug-logger"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import Image from "next/image"
import { PlayerPortrait, TeamLogoImage } from "@/components/ui/asset-images"
import {
    PlayCircle,
    Search,
    Shield,
    X,
    User,
    ChevronRight,
    Sparkles,
    ArrowLeft,
    Lock,
    Briefcase
} from "lucide-react"
import { toast } from "@/lib/toast"
import { Switch } from "@/components/ui/switch"
import { ManagerProgression } from "@/engine/manager-progression"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { calculateInitialPrestige } from "@/data/snapshot-loader"
import {
    calculateTeamTier,
    getDisplayPlayerTier,
    getTierStyle,
    TierLevel
} from "@/engine/tier-system"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { resolvePlayerRole } from "@/engine/role-determination"

interface SnapshotTeam {
    id: string
    name: string
    shortName: string
    tier: string
    region: string
    logoPath: string
    rosterIds: string[]
    reputation: number
    fanbase: number
    startingBudget: number
}

interface SnapshotPlayer {
    id: string
    name: string
    nickname: string
    age: number
    nationality: string
    portraitPath: string
    role: string
    tier: string
    skill: number
    awp: number
    rifle: number
    [key: string]: any
}

interface RankedTeam extends SnapshotTeam {
    worldRanking: number
    calculatedTier: TierLevel
}

// Evaluate a snapshot player with computed prestigeScore (matches game initialization)
function evaluateSnapshotPlayer(player: SnapshotPlayer, team?: SnapshotTeam) {
    const prestigeScore = calculateInitialPrestige(
        player.tier, team?.tier, team?.reputation,
        player.matchesPlayed || 0, player.age
    )
    return evaluatePlayer({ ...player, prestigeScore } as any)
}

// Onboarding Steps
type OnboardingStep = "welcome" | "team-select"

export default function TeamSelectionPage() {
    const router = useRouter()
    const { initializeNewGame } = useGameStore(useShallow(state => ({
        initializeNewGame: state.initializeNewGame,
    })))

    // Onboarding state
    const [currentStep, setCurrentStep] = useState<OnboardingStep>("welcome")
    const [managerName, setManagerName] = useState("")
    const [managerNameError, setManagerNameError] = useState("")

    // Team selection state
    const [teams, setTeams] = useState<SnapshotTeam[]>([])
    const [players, setPlayers] = useState<SnapshotPlayer[]>([])
    const [selectedTeam, setSelectedTeam] = useState<RankedTeam | null>(null)
    const [searchTerm, setSearchTerm] = useState("")
    const [selectedTier, setSelectedTier] = useState<string>("ALL")
    const [isDataLoading, setIsDataLoading] = useState(true)
    const [isStarting, setIsStarting] = useState(false)

    // Career Mode State
    const managerLevel = 1
    const [sandboxMode, setSandboxMode] = useState(false)

    // Load snapshot data
    useEffect(() => {
        async function loadData() {
            setIsDataLoading(true)
            try {
                const [teamsRes, playersRes] = await Promise.all([
                    fetch("/data/snapshot/teams.json"),
                    fetch("/data/snapshot/players.json"),
                ])
                const teamsData = await teamsRes.json()
                const playersData = await playersRes.json()
                setTeams(teamsData)
                setPlayers(playersData)
            } catch (error) {
                debug.error("Failed to load snapshot data:", error)
                toast.error("Failed to load game data", {
                    description: "Please check your connection and try again."
                })
            }
            setIsDataLoading(false)
        }
        loadData()
    }, [])

    // Rank teams and assign tiers dynamically
    const rankedTeams = useMemo(() => {
        return teams
            .sort((a, b) => (b.reputation || 0) - (a.reputation || 0))
            .map((team, index): RankedTeam => ({
                ...team,
                worldRanking: index + 1,
                calculatedTier: calculateTeamTier(index + 1)
            }))
    }, [teams])

    // Filter teams
    const filteredTeams = useMemo(() => {
        const result = rankedTeams
            .filter(t => {
                const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase())
                const matchesTier = selectedTier === "ALL" || t.calculatedTier === selectedTier
                return matchesSearch && matchesTier
            })

        // Sort: Unlocked teams first, then by Ranking
        return result.sort((a, b) => {
            const isLockedA = !sandboxMode && !ManagerProgression.isTeamUnlocked(a.reputation, managerLevel)
            const isLockedB = !sandboxMode && !ManagerProgression.isTeamUnlocked(b.reputation, managerLevel)

            if (isLockedA !== isLockedB) {
                return isLockedA ? 1 : -1 // Locked (true) goes to bottom
            }

            return a.worldRanking - b.worldRanking
        })
    }, [rankedTeams, searchTerm, selectedTier, managerLevel, sandboxMode])

    // Get roster for selected team with evaluations
    const selectedRoster = useMemo(() => {
        if (!selectedTeam) return []
        return players
            .filter(p => selectedTeam.rosterIds.includes(p.id))
            .map(p => {
                const evaluation = evaluateSnapshotPlayer(p, selectedTeam)
                return {
                    ...p,
                    evaluation,
                    playerTier: getDisplayPlayerTier(evaluation.overallRating, selectedTeam?.calculatedTier as TierLevel)
                }
            })
            .sort((a, b) => b.evaluation.overallRating - a.evaluation.overallRating)
    }, [selectedTeam, players])

    // Calculate team value
    const getTeamValue = (team: SnapshotTeam) => {
        const roster = players.filter(p => team.rosterIds.includes(p.id))
        const totalValue = roster.reduce((sum, player) => {
            const evaluation = evaluateSnapshotPlayer(player, team)
            return sum + evaluation.transferValue
        }, 0)
        return totalValue
    }

    // Calculate team overall rating
    const getTeamRating = (team: SnapshotTeam) => {
        const roster = players.filter(p => team.rosterIds.includes(p.id))
        if (roster.length === 0) return 0
        const avgRating = roster.reduce((sum, player) => {
            const evaluation = evaluateSnapshotPlayer(player, team)
            return sum + evaluation.overallRating
        }, 0) / roster.length
        return Math.round(avgRating)
    }

    // Calculate actual starting budget (mirrors game-store initialization logic)
    // Teams with < 5 players get bonus funds to fill roster
    const getCalculatedBudget = (team: RankedTeam | SnapshotTeam) => {
        const ranking = (team as RankedTeam).worldRanking || 50

        // Base budget by reputation tier AND world ranking (reputation is 0-100 scale)
        let calculatedBudget = 250000 // Low Tier default
        if (team.reputation > 80) calculatedBudget = 2000000 // Top Tier (Top 10)
        else if (team.reputation > 50) calculatedBudget = 1000000 // High Tier (Top 30)
        else if (team.reputation > 0) calculatedBudget = 500000 // Mid Tier

        // Check for incomplete roster and inject funds
        if (team.rosterIds.length < 5) {
            const missingCount = 5 - team.rosterIds.length
            const teammates = players.filter(p => team.rosterIds.includes(p.id))

            // Calculate the MINIMUM value player on the team (that's who they'd realistically replace with)
            let targetValue = 150000 // Bare minimum fallback
            if (teammates.length > 0) {
                const values = teammates.map(p => {
                    const evaluation = evaluateSnapshotPlayer(p, team as SnapshotTeam)
                    return evaluation.transferValue
                }).sort((a, b) => a - b)

                // Use the lowest-valued player as the target (you'd buy similar or slightly worse)
                targetValue = values[0]

                // Apply world ranking modifier - lower ranked teams get budget for cheaper players
                // Rank 1-20: 100%, Rank 21-50: 80%, Rank 51-100: 60%, Rank 100+: 40%
                let rankingModifier = 1.0
                if (ranking > 100) rankingModifier = 0.4
                else if (ranking > 50) rankingModifier = 0.6
                else if (ranking > 20) rankingModifier = 0.8

                targetValue = Math.round(targetValue * rankingModifier)
            }

            // Injection: Target Value × Missing Count (no extra buffer - tight budget is more realistic)
            const injection = Math.round(targetValue * missingCount)
            calculatedBudget += injection
        }

        // Return the higher of calculated or static value
        return Math.max(calculatedBudget, team.startingBudget || 0)
    }

    // Handle continue from welcome step
    const handleContinueToTeamSelect = () => {
        if (!managerName.trim()) {
            setManagerNameError("Please enter your manager name")
            return
        }
        if (managerName.trim().length < 2) {
            setManagerNameError("Name must be at least 2 characters")
            return
        }
        setManagerNameError("")
        setCurrentStep("team-select")
    }

    const handleStartGame = async () => {
        if (!selectedTeam || isStarting) return
        setIsStarting(true)
        try {
            // Pass manager name to initializeNewGame (using it as save name for now)
            await initializeNewGame(managerName.trim() || "My Career", selectedTeam.id)
            // Use client-side navigation to preserve store state
            router.push("/desktop")
        } catch (err) {
            debug.error("Failed to start game:", err)
            toast.error("Failed to start game", {
                description: "An error occurred while initializing. Please try again."
            })
            setIsStarting(false)
        }
    }

    // Loading state
    if (isDataLoading) {
        return (
            <div className="min-h-screen liquid-app-bg flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-muted-foreground text-sm font-bold uppercase tracking-widest">Loading Teams...</p>
                </div>
            </div>
        )
    }

    const tierCounts = {
        ELITE: rankedTeams.filter(t => t.calculatedTier === "ELITE").length,
        PRO: rankedTeams.filter(t => t.calculatedTier === "PRO").length,
        SEMI_PRO: rankedTeams.filter(t => t.calculatedTier === "SEMI_PRO").length,
    }

    // ============ STEP 1: WELCOME & MANAGER NAME ============
    if (currentStep === "welcome") {
        return (
            <div className="min-h-screen relative flex items-center justify-center overflow-hidden">
                {/* Background gradient */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-cyan-500/10 pointer-events-none" />
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[150px] pointer-events-none" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-[150px] pointer-events-none" />

                {/* Back to Main Menu Button */}
                <motion.button
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                    onClick={() => router.push("/main-menu")}
                    className="absolute top-6 left-6 flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all text-white/60 hover:text-white group z-20"
                >
                    <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
                    <span className="text-xs font-medium">Back</span>
                </motion.button>

                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    className="w-full max-w-lg mx-auto px-6"
                >
                    <div className="glass-panel p-8 md:p-12 border-white/10 text-center relative overflow-hidden">
                        {/* Decorative elements */}
                        <div className="absolute -top-20 -right-20 w-40 h-40 bg-primary/30 rounded-full blur-[80px] pointer-events-none" />

                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                            className="w-20 h-20 mx-auto mb-6 flex items-center justify-center p-0 overflow-visible"
                        >
                            <Image src="/logo.png" alt="Icon" width={80} height={80} className="object-contain w-full h-full drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]" onError={(e) => { (e.target as HTMLImageElement).src = '/team_placeholder.png' }} />
                        </motion.div>

                        {/* Welcome Text */}
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                        >
                            <h1 className="text-3xl md:text-4xl font-normal text-white mb-2">
                                Welcome, Manager
                            </h1>
                            <p className="text-muted-foreground mb-8">
                                Your journey to esports glory begins here
                            </p>
                        </motion.div>

                        {/* Manager Name Input */}
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 }}
                            className="space-y-4 mb-8"
                        >
                            <div className="text-left">
                                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 block">
                                    What should we call you?
                                </label>
                                <div className="relative">
                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                                    <Input
                                        type="text"
                                        placeholder="Enter your name..."
                                        value={managerName}
                                        maxLength={32}
                                        onChange={(e) => {
                                            setManagerName(e.target.value)
                                            if (managerNameError) setManagerNameError("")
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") handleContinueToTeamSelect()
                                        }}
                                        className={cn(
                                            "pl-12 h-14 text-lg bg-white/5 border-white/10 rounded-xl focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all",
                                            managerNameError && "border-red-500/50 focus:border-red-500/50 focus:ring-red-500/20"
                                        )}
                                        autoFocus
                                    />
                                </div>
                                {managerNameError && (
                                    <motion.p
                                        initial={{ opacity: 0, y: -5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="text-red-400 text-xs mt-2"
                                    >
                                        {managerNameError}
                                    </motion.p>
                                )}
                            </div>
                        </motion.div>

                        {/* Continue Button */}
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.5 }}
                            className="space-y-3"
                        >
                            <Button
                                onClick={handleContinueToTeamSelect}
                                className="w-full h-14 bg-white text-black hover:bg-white/90 font-normal rounded-xl text-lg shadow-[0_10px_40px_rgba(255,255,255,0.2)] hover:shadow-[0_15px_50px_rgba(255,255,255,0.3)] transition-all"
                            >
                                <div className="flex items-center gap-3">
                                    <Shield size={20} />
                                    Choose Existing Team
                                    <ChevronRight size={20} />
                                </div>
                            </Button>

                            <div className="flex items-center gap-3 text-muted-foreground">
                                <div className="flex-1 h-px bg-white/10" />
                                <span className="text-xs uppercase tracking-widest">or</span>
                                <div className="flex-1 h-px bg-white/10" />
                            </div>

                            <Button
                                onClick={() => {
                                    if (!managerName.trim()) {
                                        setManagerNameError("Please enter your manager name")
                                        return
                                    }
                                    if (managerName.trim().length < 2) {
                                        setManagerNameError("Name must be at least 2 characters")
                                        return
                                    }
                                    // Store manager name in localStorage for the create-team page
                                    localStorage.setItem("pending_manager_name", managerName.trim())
                                    router.push("/new-game/create-team")
                                }}
                                variant="outline"
                                className="w-full h-14 border-primary/30 hover:bg-primary/10 hover:border-primary/50 font-normal rounded-xl text-lg transition-all group"
                            >
                                <div className="flex items-center gap-3">
                                    <Sparkles size={20} className="text-primary group-hover:animate-pulse" />
                                    Create Your Own Team
                                    <ChevronRight size={20} />
                                </div>
                            </Button>
                        </motion.div>

                        {/* Features preview */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.7 }}
                            className="mt-8 pt-8 border-t border-white/5"
                        >
                            <div className="flex justify-center gap-8 text-center">
                                <div>
                                    <p className="text-2xl font-normal text-white">{rankedTeams.length}</p>
                                    <p className="text-[10px] text-muted-foreground font-bold uppercase">Teams</p>
                                </div>
                                <div className="h-10 w-px bg-white/10" />
                                <div>
                                    <p className="text-2xl font-normal text-white">{players.length}</p>
                                    <p className="text-[10px] text-muted-foreground font-bold uppercase">Players</p>
                                </div>
                                <div className="h-10 w-px bg-white/10" />
                                <div>
                                    <p className="text-2xl font-normal text-amber-400">{tierCounts.ELITE}</p>
                                    <p className="text-[10px] text-muted-foreground font-bold uppercase">Elite</p>
                                </div>
                            </div>
                        </motion.div>
                    </div>

                    {/* Subtle hint */}
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.5 }}
                        transition={{ delay: 1 }}
                        className="text-center text-xs text-muted-foreground mt-6"
                    >
                        <Sparkles size={12} className="inline mr-1" />
                        Build your legacy in competitive esports
                    </motion.p>
                </motion.div>
            </div>
        )
    }

    // ============ STEP 2: TEAM SELECTION ============

    return (
        <div className="min-h-screen relative selection:bg-cyan-500/30">
            <div className="max-w-7xl mx-auto p-6 relative z-10 w-full">
                {/* Header with Back Button */}
                <div className="mb-6">
                    <div className="flex items-start gap-6 mb-4">
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                onClick={() => setCurrentStep("welcome")}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-muted-foreground hover:text-white group"
                            >
                                <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
                                <span className="text-xs font-bold uppercase tracking-wider">Back</span>
                            </button>
                            <button
                                onClick={() => router.push("/main-menu")}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:bg-red-500/10 hover:border-red-500/20 transition-all text-muted-foreground hover:text-red-400 group"
                            >
                                <X size={16} className="group-hover:rotate-90 transition-transform" />
                                <span className="text-xs font-bold uppercase tracking-wider">Cancel</span>
                            </button>
                        </div>
                        <div>
                            <h1 className="text-3xl font-normal text-white tracking-tight">
                                Choose Your Team, <span className="text-primary">{managerName}</span>
                            </h1>
                            <p className="text-muted-foreground text-sm">
                                <span className="text-amber-400 font-bold uppercase">Manager Mode:</span> You must begin with a <span className="text-white font-bold">Semi-Pro</span> team. Win tournaments to increase your Manager Level and unlock Elite organizations!
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-6">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                    <Input
                        placeholder="Search teams..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-11 h-10 bg-white/5 border-white/10 rounded-lg text-sm"
                    />
                </div>
                <div className="flex gap-2">
                    {(["ALL", "ELITE", "PRO", "SEMI_PRO"] as const).map(tier => {
                        const tierStyle = tier !== "ALL" ? getTierStyle(tier) : null
                        const count = tier !== "ALL" ? tierCounts[tier] : rankedTeams.length

                        // Check if this entire tier is locked
                        // A tier is locked if it's not ALL, and every team in it provides a locked status
                        let isTierLocked = false
                        let requiredLevel = 0

                        if (tier !== "ALL" && !sandboxMode) {
                            const teamsInTier = rankedTeams.filter(t => t.calculatedTier === tier)
                            // If we have teams, check if ALL of them are locked
                            if (teamsInTier.length > 0) {
                                const allLocked = teamsInTier.every(t => !ManagerProgression.isTeamUnlocked(t.reputation, managerLevel))
                                if (allLocked) {
                                    isTierLocked = true
                                    // Estimate required level from the first team (they should share a tier threshold)
                                    requiredLevel = ManagerProgression.getRequiredLevel(teamsInTier[0].reputation)
                                }
                            }
                        }

                        return (
                            <button
                                key={tier}
                                onClick={() => setSelectedTier(tier)}
                                className={cn(
                                    "px-3 py-2 rounded-lg text-[10px] font-normal uppercase tracking-wider border transition-all flex items-center gap-2",
                                    selectedTier === tier
                                        ? "bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]"
                                        : isTierLocked
                                            ? "bg-white/5 border-white/5 text-muted-foreground opacity-70 hover:opacity-100 hover:bg-white/10" // Locked style
                                            : tier !== "ALL"
                                                ? `${tierStyle?.bgColor} ${tierStyle?.borderColor} ${tierStyle?.color}`
                                                : "bg-white/5 border-white/10 text-muted-foreground hover:border-white/20"
                                )}
                            >
                                {isTierLocked && <Lock size={10} className="mr-0.5" />}
                                {tier === "ALL" ? "All" : tierStyle?.label}
                                <span className="opacity-60">({count})</span>
                                {isTierLocked && requiredLevel > 0 && (
                                    <span className="ml-1 px-1.5 py-0.5 rounded bg-black/40 text-[8px] font-bold text-white/50 border border-white/5">
                                        LVL {requiredLevel}
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Sandbox Mode Toggle */}
            <div className="flex justify-end mb-4">
                <div className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-full border border-white/5">
                    <div className="text-right">
                        <p className="text-[10px] uppercase font-normal tracking-widest text-muted-foreground">Sandbox Mode</p>
                        <p className="text-xs font-bold text-white">{sandboxMode ? "Unlocks Active" : "Career Mode"}</p>
                    </div>
                    <Switch
                        checked={sandboxMode}
                        onCheckedChange={setSandboxMode}
                        className="data-[state=checked]:bg-primary"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
                {/* Team Grid - 3 columns */}
                <div className="lg:col-span-3 h-[calc(100vh-220px)] overflow-y-auto pr-2 custom-scrollbar">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {filteredTeams.map((team) => {
                            const tierStyle = getTierStyle(team.calculatedTier)
                            const isLocked = !sandboxMode && !ManagerProgression.isTeamUnlocked(team.reputation, managerLevel)
                            const requiredLevel = ManagerProgression.getRequiredLevel(team.reputation)

                            return (
                                <div
                                    key={team.id}
                                    onClick={() => !isLocked && setSelectedTeam(team)}
                                    className={cn(
                                        "glass-panel p-4 cursor-pointer border-white/5 relative overflow-hidden",
                                        "transition-[border-color,box-shadow,transform] duration-150 ease-out hover:-translate-y-0.5",
                                        selectedTeam?.id === team.id && "border-primary ring-2 ring-primary/30",
                                        isLocked && "opacity-60 grayscale cursor-not-allowed hover:translate-y-0"
                                    )}
                                >
                                    {/* Lock Overlay */}
                                    {isLocked && (
                                        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-[2px]">
                                            <div className="bg-black/80 p-3 rounded-full border border-white/10 mb-2">
                                                <Lock className="text-white/70" size={24} />
                                            </div>
                                            <p className="text-[10px] font-normal text-white uppercase tracking-widest">Locked</p>
                                            <div className="flex items-center gap-1.5 mt-1 bg-white/10 px-2 py-1 rounded text-[9px] font-bold text-primary-foreground">
                                                <Briefcase size={10} />
                                                REQ. LEVEL {requiredLevel}
                                            </div>
                                        </div>
                                    )}
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                                            <TeamLogoImage
                                                src={team.logoPath}
                                                alt={team.name}
                                                size={40}
                                            />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-bold text-white text-sm truncate">{team.name}</h3>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <Badge className={cn("text-[8px] uppercase font-normal px-1.5 py-0", tierStyle.bgColor, tierStyle.borderColor, tierStyle.color)}>
                                                    {tierStyle.shortLabel}
                                                </Badge>
                                                <span className="text-[10px] text-muted-foreground">#{team.worldRanking}</span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xl font-normal text-white">{getTeamRating(team)}</p>
                                            <p className="text-[8px] text-muted-foreground font-bold">OVR</p>
                                        </div>
                                    </div>

                                    {/* Player thumbnails with Names and Badge */}
                                    <div className="flex justify-between gap-1">
                                        {(team.rosterIds || []).slice(0, 5).map((id) => {
                                            const player = players.find(p => p.id === id)
                                            // Calculate simple tier for badge
                                            let badgeColor = "bg-gray-500"
                                            let badgeText = "UNK"
                                            if (player) {
                                                const pTier = getDisplayPlayerTier(evaluateSnapshotPlayer(player, team).overallRating, team.calculatedTier as TierLevel)
                                                if (pTier === "ELITE") { badgeColor = "bg-emerald-500"; badgeText = "E" }
                                                else if (pTier === "PRO") { badgeColor = "bg-blue-500"; badgeText = "P" }
                                                else { badgeColor = "bg-amber-500"; badgeText = "S" }
                                            }

                                            return (
                                                <div key={id} className="flex flex-col items-center gap-1 flex-1 min-w-0">
                                                    <div
                                                        className="w-full aspect-square rounded-lg bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden relative"
                                                        title={player?.nickname}
                                                    >
                                                        <PlayerPortrait
                                                            src={player?.portraitPath}
                                                            alt={player?.nickname || "Unknown"}
                                                            fill
                                                        />
                                                        {/* Tier Badge Overlay */}
                                                        <div className={cn("absolute top-0 right-0 w-3 h-3 flex items-center justify-center text-[6px] font-normal text-white rounded-bl-md", badgeColor)}>
                                                            {badgeText}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1 max-w-full">
                                                        <span className="text-[9px] font-bold text-white/80 truncate">
                                                            {player?.nickname || "Unknown"}
                                                        </span>
                                                        {player && (
                                                            <CountryFlag country={player.nationality} size={8} />
                                                        )}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Selected Team Detail - 2 columns */}
                <div className="lg:col-span-2">
                    <AnimatePresence mode="wait">
                        {selectedTeam ? (
                            <motion.div
                                key={selectedTeam.id}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="glass-panel p-6 border-primary/20"
                            >
                                {/* Team Header */}
                                <div className="flex items-center justify-between mb-6">
                                    <div className="flex items-center gap-4">
                                        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center overflow-hidden">
                                            <TeamLogoImage
                                                src={selectedTeam.logoPath}
                                                alt={selectedTeam.name}
                                                size={56}
                                            />
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-normal text-white">{selectedTeam.name}</h2>
                                            <div className="flex items-center gap-2 mt-1">
                                                <Badge className={cn("text-[10px]", getTierStyle(selectedTeam.calculatedTier).bgColor, getTierStyle(selectedTeam.calculatedTier).borderColor, getTierStyle(selectedTeam.calculatedTier).color)}>
                                                    {getTierStyle(selectedTeam.calculatedTier).label}
                                                </Badge>
                                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                    <CountryFlag country={selectedTeam.region} size={10} /> {selectedTeam.region}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <button onClick={() => setSelectedTeam(null)} className="p-2 hover:bg-white/5 rounded-lg">
                                        <X size={18} className="text-muted-foreground" />
                                    </button>
                                </div>

                                {/* Team Stats */}
                                <div className="grid grid-cols-4 gap-3 mb-6">
                                    <div className="text-center p-3 bg-white/5 rounded-xl">
                                        <p className="text-2xl font-normal text-white">#{selectedTeam.worldRanking}</p>
                                        <p className="text-[8px] text-muted-foreground font-bold uppercase">World Rank</p>
                                    </div>
                                    <div className="text-center p-3 bg-white/5 rounded-xl">
                                        <p className="text-2xl font-normal text-white">{getTeamRating(selectedTeam)}</p>
                                        <p className="text-[8px] text-muted-foreground font-bold uppercase">Overall</p>
                                    </div>
                                    <div className="text-center p-3 bg-white/5 rounded-xl relative">
                                        <p className="text-2xl font-normal text-emerald-400">${(getCalculatedBudget(selectedTeam) / 1000000).toFixed(2)}M</p>
                                        <p className="text-[8px] text-muted-foreground font-bold uppercase">Budget</p>
                                        {selectedTeam.rosterIds.length < 5 && (
                                            <Badge className="absolute -top-2 -right-2 text-[7px] px-1 py-0 bg-amber-500/80 text-black border-none">
                                                +{5 - selectedTeam.rosterIds.length} NEEDED
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="text-center p-3 bg-white/5 rounded-xl">
                                        <p className="text-2xl font-normal text-emerald-400">${(getTeamValue(selectedTeam) / 1000000).toFixed(1)}M</p>
                                        <p className="text-[8px] text-muted-foreground font-bold uppercase">Value</p>
                                    </div>
                                </div>

                                {/* Roster with larger images */}
                                <h3 className="text-xs font-normal text-muted-foreground uppercase tracking-widest mb-3">
                                    Active Roster ({selectedRoster.length})
                                </h3>
                                <div className="space-y-2 mb-6">
                                    {selectedRoster.map(player => {
                                        const playerTierStyle = getTierStyle(player.playerTier)
                                        return (
                                            <div
                                                key={player.id}
                                                className="flex items-center gap-4 p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors"
                                            >
                                                {/* Larger player image */}
                                                <div className="w-14 h-14 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                                                    <PlayerPortrait
                                                        src={player.portraitPath}
                                                        alt={player.nickname}
                                                        size={56}
                                                    />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-bold text-white">{player.nickname}</p>
                                                        <Badge className={cn("text-[8px] px-1.5 py-0", playerTierStyle.bgColor, playerTierStyle.borderColor, playerTierStyle.color)}>
                                                            {playerTierStyle.shortLabel}
                                                        </Badge>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                                                        <span>{resolvePlayerRole(player as any)}</span>
                                                        <span>•</span>
                                                        <span>{player.age} y/o</span>
                                                        <span>•</span>
                                                        <CountryFlag country={player.nationality} showName={true} size={12} className="text-[10px]" />
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-xl font-normal text-white">{player.evaluation.overallRating}</p>
                                                    <p className="text-[8px] text-muted-foreground font-bold">OVR</p>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>

                                {/* Start Button */}
                                <Button
                                    onClick={handleStartGame}
                                    disabled={isStarting}
                                    className="w-full h-14 bg-white text-black hover:bg-white/90 font-normal rounded-xl text-lg shadow-[0_10px_30px_rgba(255,255,255,0.15)]"
                                >
                                    {isStarting ? "INITIALIZING..." : (
                                        <div className="flex items-center gap-3">
                                            <PlayCircle size={22} />
                                            START CAREER
                                        </div>
                                    )}
                                </Button>
                            </motion.div>
                        ) : (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="glass-panel p-12 text-center border-dashed border-white/10 h-full flex flex-col items-center justify-center"
                            >
                                <Shield size={48} className="mx-auto mb-4 text-white/10" />
                                <h3 className="font-normal text-white uppercase mb-2">Select a Team</h3>
                                <p className="text-sm text-muted-foreground">
                                    Click on any team to view their roster
                                </p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Stats Footer */}
            <div className="flex justify-center gap-8 mt-6 text-center">
                <div>
                    <p className="text-2xl font-normal text-white">{rankedTeams.length}</p>
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Teams</p>
                </div>
                <div className="h-10 w-px bg-white/10" />
                <div>
                    <p className="text-2xl font-normal text-white">{players.length}</p>
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Players</p>
                </div>
                <div className="h-10 w-px bg-white/10" />
                <div>
                    <p className="text-2xl font-normal text-amber-400">{tierCounts.ELITE}</p>
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Elite Teams</p>
                </div>
            </div>
        </div>
    )
}
