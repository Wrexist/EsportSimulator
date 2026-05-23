"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { debug } from "@/lib/debug-logger"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
    ArrowLeft,
    ArrowRight,
    Check,
    Shield,
    MapPin,
    Palette,
    Trophy,
    PlayCircle,
    Sparkles,
    Star,
    AlertCircle,
    Gamepad2,
    PartyPopper
} from "lucide-react"
import { toast } from "@/lib/toast"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import {
    CustomTeamData,
    GameDifficulty,
    TeamRegion,
    DIFFICULTY_SETTINGS,
    REGION_INFO,
    PRESET_COLORS
} from "@/types/team-creator"
import { fireConfetti } from "@/lib/confetti-lazy"
import { RosterBuilderModal } from "@/components/onboarding/RosterBuilderModal"
import { ImageUploader } from "@/components/ui/ImageUploader"

// Wizard steps
type WizardStep = "name" | "region" | "colors" | "difficulty" | "review"

const STEPS: { id: WizardStep; label: string; icon: React.ElementType }[] = [
    { id: "name", label: "Team Name", icon: Shield },
    { id: "region", label: "Region", icon: MapPin },
    { id: "colors", label: "Colors", icon: Palette },
    { id: "difficulty", label: "Difficulty", icon: Trophy },
    { id: "review", label: "Review", icon: Check },
]

export default function CreateTeamPage() {
    const router = useRouter()
    const { initializeCustomTeam, teams } = useGameStore(useShallow(state => ({
        initializeCustomTeam: state.initializeCustomTeam,
        teams: state.teams,
    })))
    const getStoreError = () => useGameStore.getState().error

    // Wizard state
    const [currentStep, setCurrentStep] = useState<WizardStep>("name")
    const [isCreating, setIsCreating] = useState(false)
    const [showCelebration, setShowCelebration] = useState(false)
    const [showRosterBuilder, setShowRosterBuilder] = useState(false)

    // Manager name (passed from previous page or stored)
    const [managerName, setManagerName] = useState("")

    // Load manager name from localStorage on mount
    useEffect(() => {
        const storedName = localStorage.getItem("pending_manager_name")
        if (storedName) {
            setManagerName(storedName)
            localStorage.removeItem("pending_manager_name") // Clean up
        }
    }, [])

    // Team data
    const [teamData, setTeamData] = useState<CustomTeamData>({
        name: "",
        shortName: "",
        region: "EU",
        difficulty: "normal",
        logoIndex: 0,
        primaryColor: PRESET_COLORS[0].primary,
        secondaryColor: PRESET_COLORS[0].secondary,
    })

    // Navigation guard - warn about unsaved changes
    const hasUnsavedChanges = teamData.name.trim() !== "" || managerName.trim() !== ""

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasUnsavedChanges && !showCelebration && !showRosterBuilder) {
                e.preventDefault()
                e.returnValue = "" // Required for Chrome
                return ""
            }
        }

        window.addEventListener("beforeunload", handleBeforeUnload)
        return () => window.removeEventListener("beforeunload", handleBeforeUnload)
    }, [hasUnsavedChanges, showCelebration, showRosterBuilder])

    // Validation errors
    const [errors, setErrors] = useState<Record<string, string>>({})

    // Current step index
    const currentStepIndex = STEPS.findIndex(s => s.id === currentStep)

    // Validate current step
    const validateStep = (): boolean => {
        const newErrors: Record<string, string> = {}

        switch (currentStep) {
            case "name":
                if (!managerName.trim()) {
                    newErrors.managerName = "Please enter your manager name"
                } else if (managerName.trim().length < 2) {
                    newErrors.managerName = "Name must be at least 2 characters"
                }
                if (!teamData.name.trim()) {
                    newErrors.teamName = "Please enter a team name"
                } else if (teamData.name.trim().length < 2) {
                    newErrors.teamName = "Team name must be at least 2 characters"
                } else {
                    // Check if team name is already taken (inline to avoid circular deps)
                    const normalizedName = teamData.name.trim().toLowerCase()
                    const nameExists = teams.some(t => t.name?.toLowerCase() === normalizedName)
                    if (nameExists) {
                        newErrors.teamName = "This team name is already taken"
                    }
                }
                if (!teamData.shortName.trim()) {
                    newErrors.shortName = "Please enter a team tag"
                } else if (teamData.shortName.length < 2 || teamData.shortName.length > 5) {
                    newErrors.shortName = "Tag must be 2-5 characters"
                } else {
                    // Check if team tag is unique
                    const tagExists = teams.some(t =>
                        t.shortName?.toUpperCase() === teamData.shortName.toUpperCase()
                    )
                    if (tagExists) {
                        newErrors.shortName = "This team tag is already in use"
                    }
                }
                break
            case "region":
                if (!teamData.region) {
                    newErrors.region = "Please select a region"
                }
                break
            case "difficulty":
                if (!teamData.difficulty) {
                    newErrors.difficulty = "Please select a difficulty"
                }
                break
        }

        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    // Navigate to next step
    const goNext = () => {
        if (!validateStep()) return

        const nextIndex = currentStepIndex + 1
        if (nextIndex < STEPS.length) {
            setCurrentStep(STEPS[nextIndex].id)
        }
    }

    // Navigate to previous step
    const goPrev = () => {
        const prevIndex = currentStepIndex - 1
        if (prevIndex >= 0) {
            setCurrentStep(STEPS[prevIndex].id)
        } else {
            // Going back to new-game page - confirm if there's unsaved data
            if (hasUnsavedChanges) {
                const confirmed = window.confirm(
                    "You have unsaved changes. Are you sure you want to go back? Your team data will be lost."
                )
                if (!confirmed) return
            }
            router.push("/new-game")
        }
    }

    // Get difficulty settings
    const difficultySettings = DIFFICULTY_SETTINGS[teamData.difficulty]

    // Trigger confetti celebration
    const triggerCelebration = () => {
        // Fire confetti from multiple angles
        const duration = 3000
        const animationEnd = Date.now() + duration
        const colors = [teamData.primaryColor, teamData.secondaryColor, '#ffffff']

        const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min

        const interval = setInterval(() => {
            const timeLeft = animationEnd - Date.now()
            if (timeLeft <= 0) {
                clearInterval(interval)
                return
            }

            const particleCount = 50 * (timeLeft / duration)

            // Left side burst
            fireConfetti({
                particleCount: Math.floor(particleCount),
                startVelocity: 30,
                spread: 60,
                origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
                colors,
            })

            // Right side burst
            fireConfetti({
                particleCount: Math.floor(particleCount),
                startVelocity: 30,
                spread: 60,
                origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
                colors,
            })
        }, 250)
    }

    // Handle team creation
    const handleCreateTeam = async () => {
        if (isCreating) return
        setIsCreating(true)

        try {
            // Initialize custom team through game store
            await initializeCustomTeam(managerName.trim(), teamData)

            // Check store error state (initializeCustomTeam sets error instead of throwing)
            const storeError = getStoreError()
            if (storeError) {
                toast.error("Failed to create team", {
                    description: storeError,
                    duration: 8000,
                })
                setIsCreating(false)
                return
            }

            // Show celebration
            setShowCelebration(true)
            triggerCelebration()

            // Show roster builder after celebration
            setTimeout(() => {
                setShowCelebration(false)
                setShowRosterBuilder(true)
            }, 3500)
        } catch (err) {
            // Fallback for unexpected errors
            const msg = err instanceof Error ? err.message : "An unexpected error occurred"
            debug.error("Failed to create team:", err)
            toast.error("Failed to create team", {
                description: msg,
                duration: 8000,
            })
            setIsCreating(false)
        }
    }

    // Handle roster builder completion
    const handleRosterComplete = () => {
        setShowRosterBuilder(false)
        router.push("/desktop")
    }

    // Render step content
    const renderStepContent = () => {
        switch (currentStep) {
            case "name":
                return (
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-6"
                    >
                        <div className="text-center mb-8">
                            <h2 className="text-2xl font-normal text-white mb-2">Create Your Team</h2>
                            <p className="text-muted-foreground">Give your organization a name and identity</p>
                        </div>

                        {/* Manager Name */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                Manager Name
                            </label>
                            <Input
                                type="text"
                                placeholder="Your name..."
                                value={managerName}
                                onChange={(e) => {
                                    setManagerName(e.target.value)
                                    if (errors.managerName) setErrors({ ...errors, managerName: "" })
                                }}
                                className={cn(
                                    "h-12 bg-white/5 border-white/10 rounded-xl",
                                    errors.managerName && "border-red-500/50"
                                )}
                            />
                            {errors.managerName && (
                                <p className="text-red-400 text-xs flex items-center gap-1">
                                    <AlertCircle size={12} />
                                    {errors.managerName}
                                </p>
                            )}
                        </div>

                        {/* Team Name */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                Team Name
                            </label>
                            <Input
                                type="text"
                                placeholder="e.g., Team Phoenix"
                                value={teamData.name}
                                onChange={(e) => {
                                    setTeamData({ ...teamData, name: e.target.value })
                                    if (errors.teamName) setErrors({ ...errors, teamName: "" })
                                }}
                                className={cn(
                                    "h-12 bg-white/5 border-white/10 rounded-xl",
                                    errors.teamName && "border-red-500/50"
                                )}
                            />
                            {errors.teamName && (
                                <p className="text-red-400 text-xs flex items-center gap-1">
                                    <AlertCircle size={12} />
                                    {errors.teamName}
                                </p>
                            )}
                        </div>

                        {/* Team Tag */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                Team Tag (2-5 characters)
                            </label>
                            <Input
                                type="text"
                                placeholder="e.g., PHX"
                                value={teamData.shortName}
                                onChange={(e) => {
                                    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5)
                                    setTeamData({ ...teamData, shortName: value })
                                    if (errors.shortName) setErrors({ ...errors, shortName: "" })
                                }}
                                maxLength={5}
                                className={cn(
                                    "h-12 bg-white/5 border-white/10 rounded-xl uppercase font-mono text-lg tracking-widest",
                                    errors.shortName && "border-red-500/50"
                                )}
                            />
                            {errors.shortName && (
                                <p className="text-red-400 text-xs flex items-center gap-1">
                                    <AlertCircle size={12} />
                                    {errors.shortName}
                                </p>
                            )}
                        </div>

                        {/* Preview */}
                        {teamData.name && teamData.shortName && (
                            <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                                <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Preview</p>
                                <div className="flex items-center gap-3">
                                    <div
                                        className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold"
                                        style={{ backgroundColor: teamData.primaryColor + "30", color: teamData.primaryColor }}
                                    >
                                        {teamData.shortName.slice(0, 2)}
                                    </div>
                                    <div>
                                        <p className="text-white font-bold">{teamData.name}</p>
                                        <p className="text-muted-foreground text-sm">[{teamData.shortName}]</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </motion.div>
                )

            case "region":
                return (
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-6"
                    >
                        <div className="text-center mb-8">
                            <h2 className="text-2xl font-normal text-white mb-2">Select Your Region</h2>
                            <p className="text-muted-foreground">Choose where your team will be based</p>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            {(Object.entries(REGION_INFO) as [TeamRegion, typeof REGION_INFO[TeamRegion]][]).map(([key, info]) => (
                                <button
                                    key={key}
                                    onClick={() => setTeamData({ ...teamData, region: key })}
                                    className={cn(
                                        "p-4 rounded-xl border transition-all text-left",
                                        teamData.region === key
                                            ? "bg-primary/10 border-primary text-white"
                                            : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
                                    )}
                                >
                                    <div className="flex items-center gap-3 mb-2">
                                        <span className="text-2xl">{getRegionEmoji(key)}</span>
                                        <div>
                                            <p className="font-bold text-white">{info.label}</p>
                                            <p className="text-xs text-muted-foreground">{key}</p>
                                        </div>
                                    </div>
                                    <p className="text-xs text-muted-foreground">{info.description}</p>
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )

            case "colors":
                return (
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-6"
                    >
                        <div className="text-center mb-8">
                            <h2 className="text-2xl font-normal text-white mb-2">Team Colors</h2>
                            <p className="text-muted-foreground">Choose your team's brand colors</p>
                        </div>

                        <div className="grid grid-cols-6 gap-3">
                            {PRESET_COLORS.map((colors, index) => (
                                <button
                                    key={index}
                                    onClick={() => setTeamData({
                                        ...teamData,
                                        logoIndex: index,
                                        primaryColor: colors.primary,
                                        secondaryColor: colors.secondary
                                    })}
                                    className={cn(
                                        "aspect-square rounded-xl border-2 transition-all relative overflow-hidden",
                                        teamData.logoIndex === index
                                            ? "border-white scale-110 shadow-lg"
                                            : "border-transparent hover:border-white/30"
                                    )}
                                    style={{
                                        background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)`
                                    }}
                                >
                                    {teamData.logoIndex === index && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                            <Check className="text-white" size={20} />
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* Custom Logo Upload */}
                        <div className="border-t border-white/10 pt-6">
                            <div className="text-center mb-4">
                                <h3 className="text-sm font-bold text-white uppercase tracking-widest mb-1">Custom Logo (Optional)</h3>
                                <p className="text-xs text-muted-foreground">Upload your own team logo</p>
                            </div>
                            <ImageUploader
                                value={teamData.logoData}
                                onChange={(logoData) => setTeamData({ ...teamData, logoData })}
                                maxSize={200}
                            />
                        </div>

                        {/* Preview */}
                        <div className="p-6 bg-white/5 rounded-xl border border-white/10 text-center">
                            {teamData.logoData ? (
                                <img
                                    src={teamData.logoData}
                                    alt="Team logo"
                                    className="w-20 h-20 rounded-2xl mx-auto mb-4 object-contain shadow-lg border-2"
                                    style={{ borderColor: teamData.primaryColor }}
                                />
                            ) : (
                                <div
                                    className="w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center justify-center text-2xl font-bold shadow-lg"
                                    style={{
                                        background: `linear-gradient(135deg, ${teamData.primaryColor} 0%, ${teamData.secondaryColor} 100%)`,
                                        color: "white"
                                    }}
                                >
                                    {teamData.shortName.slice(0, 2) || "??"}
                                </div>
                            )}
                            <p className="text-white font-bold">{teamData.name || "Team Name"}</p>
                            <p className="text-muted-foreground text-sm">[{teamData.shortName || "TAG"}]</p>
                        </div>
                    </motion.div>
                )

            case "difficulty":
                return (
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-6"
                    >
                        <div className="text-center mb-8">
                            <h2 className="text-2xl font-normal text-white mb-2">Select Difficulty</h2>
                            <p className="text-muted-foreground">This affects your starting budget and progression</p>
                        </div>

                        <div className="space-y-3">
                            {(Object.entries(DIFFICULTY_SETTINGS) as [GameDifficulty, typeof DIFFICULTY_SETTINGS[GameDifficulty]][]).map(([key, settings]) => (
                                <button
                                    key={key}
                                    onClick={() => setTeamData({ ...teamData, difficulty: key })}
                                    className={cn(
                                        "w-full p-4 rounded-xl border transition-all text-left",
                                        teamData.difficulty === key
                                            ? "bg-primary/10 border-primary"
                                            : "bg-white/5 border-white/10 hover:bg-white/10"
                                    )}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-3">
                                            <DifficultyIcon difficulty={key} />
                                            <div>
                                                <p className="font-bold text-white">{settings.label}</p>
                                                <p className="text-xs text-muted-foreground">{settings.description}</p>
                                            </div>
                                        </div>
                                        {teamData.difficulty === key && (
                                            <Check className="text-primary" size={20} />
                                        )}
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/5">
                                        <div className="text-center">
                                            <p className="text-lg font-bold text-emerald-400">${(settings.startingBudget / 1000).toFixed(0)}K</p>
                                            <p className="text-[10px] text-muted-foreground uppercase">Budget</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-lg font-bold text-blue-400">{settings.startingReputation}</p>
                                            <p className="text-[10px] text-muted-foreground uppercase">Reputation</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-lg font-bold text-amber-400">{settings.incomeMultiplier}x</p>
                                            <p className="text-[10px] text-muted-foreground uppercase">Income</p>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )

            case "review":
                return (
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-6"
                    >
                        <div className="text-center mb-8">
                            <h2 className="text-2xl font-normal text-white mb-2">Review Your Team</h2>
                            <p className="text-muted-foreground">Confirm your choices before starting</p>
                        </div>

                        {/* Team Preview Card */}
                        <div className="p-6 bg-white/5 rounded-2xl border border-white/10">
                            <div className="flex items-center gap-4 mb-6">
                                {teamData.logoData ? (
                                    <img
                                        src={teamData.logoData}
                                        alt={teamData.name}
                                        className="w-20 h-20 rounded-2xl object-contain shadow-lg border-2"
                                        style={{ borderColor: teamData.primaryColor }}
                                    />
                                ) : (
                                    <div
                                        className="w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-bold shadow-lg"
                                        style={{
                                            background: `linear-gradient(135deg, ${teamData.primaryColor} 0%, ${teamData.secondaryColor} 100%)`,
                                            color: "white"
                                        }}
                                    >
                                        {teamData.shortName.slice(0, 2)}
                                    </div>
                                )}
                                <div>
                                    <h3 className="text-xl font-bold text-white">{teamData.name}</h3>
                                    <div className="flex items-center gap-2 mt-1">
                                        <Badge variant="outline" className="text-xs">
                                            [{teamData.shortName}]
                                        </Badge>
                                        <Badge variant="outline" className="text-xs">
                                            {REGION_INFO[teamData.region].label}
                                        </Badge>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-white/5 rounded-xl">
                                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Manager</p>
                                    <p className="text-white font-bold">{managerName}</p>
                                </div>
                                <div className="p-4 bg-white/5 rounded-xl">
                                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Difficulty</p>
                                    <p className="text-white font-bold">{difficultySettings.label}</p>
                                </div>
                                <div className="p-4 bg-white/5 rounded-xl">
                                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Starting Budget</p>
                                    <p className="text-emerald-400 font-bold">${(difficultySettings.startingBudget / 1000).toFixed(0)}K</p>
                                </div>
                                <div className="p-4 bg-white/5 rounded-xl">
                                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Reputation</p>
                                    <p className="text-blue-400 font-bold">{difficultySettings.startingReputation}</p>
                                </div>
                            </div>
                        </div>

                        {/* Warning */}
                        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex gap-3">
                            <AlertCircle className="text-amber-500 shrink-0 mt-0.5" size={18} />
                            <div className="text-sm">
                                <p className="text-amber-500 font-bold">Starting from scratch</p>
                                <p className="text-muted-foreground">
                                    You'll begin with an empty roster. Visit the Transfers page to sign free agents and build your team.
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )
        }
    }

    return (
        <div className="min-h-screen relative flex flex-col">
            {/* Celebration Overlay */}
            <AnimatePresence>
                {showCelebration && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
                    >
                        <motion.div
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: "spring", stiffness: 300, damping: 20 }}
                            className="text-center"
                        >
                            {/* Team Logo */}
                            <motion.div
                                initial={{ y: -20 }}
                                animate={{ y: 0 }}
                                transition={{ delay: 0.2 }}
                                className="mx-auto mb-6"
                            >
                                {teamData.logoData ? (
                                    <img
                                        src={teamData.logoData}
                                        alt={teamData.name}
                                        className="w-32 h-32 rounded-3xl object-contain shadow-2xl border-4"
                                        style={{
                                            borderColor: teamData.primaryColor,
                                            boxShadow: `0 0 60px ${teamData.primaryColor}50`
                                        }}
                                    />
                                ) : (
                                    <div
                                        className="w-32 h-32 rounded-3xl flex items-center justify-center text-4xl font-bold shadow-2xl"
                                        style={{
                                            background: `linear-gradient(135deg, ${teamData.primaryColor} 0%, ${teamData.secondaryColor} 100%)`,
                                            color: "white",
                                            boxShadow: `0 0 60px ${teamData.primaryColor}50`
                                        }}
                                    >
                                        {teamData.shortName.slice(0, 2)}
                                    </div>
                                )}
                            </motion.div>

                            {/* Celebration Text */}
                            <motion.div
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.4 }}
                            >
                                <div className="flex items-center justify-center gap-3 mb-4">
                                    <PartyPopper className="text-amber-400" size={32} />
                                    <h1 className="text-4xl font-bold text-white">Your Team is Ready!</h1>
                                    <PartyPopper className="text-amber-400 scale-x-[-1]" size={32} />
                                </div>
                                <p className="text-2xl font-bold mb-2" style={{ color: teamData.primaryColor }}>
                                    {teamData.name}
                                </p>
                                <p className="text-muted-foreground">
                                    Welcome to the esports world, {managerName}!
                                </p>
                            </motion.div>

                            {/* Loading indicator */}
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 1.5 }}
                                className="mt-8 text-sm text-muted-foreground flex items-center justify-center gap-2"
                            >
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                                    className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full"
                                />
                                Entering headquarters...
                            </motion.div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Roster Builder Modal */}
            <RosterBuilderModal
                isOpen={showRosterBuilder}
                onComplete={handleRosterComplete}
                teamColors={{
                    primary: teamData.primaryColor,
                    secondary: teamData.secondaryColor
                }}
            />

            {/* Background */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-cyan-500/10 pointer-events-none" />
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[150px] pointer-events-none" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-[150px] pointer-events-none" />

            {/* Progress Bar */}
            <div className="relative z-10 p-6">
                <div className="max-w-2xl mx-auto">
                    <div className="flex items-center justify-between mb-2">
                        {STEPS.map((step, index) => {
                            const Icon = step.icon
                            const isActive = index === currentStepIndex
                            const isComplete = index < currentStepIndex

                            return (
                                <div key={step.id} className="flex items-center">
                                    <div
                                        className={cn(
                                            "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                                            isComplete && "bg-primary text-white",
                                            isActive && "bg-primary/20 border-2 border-primary text-primary",
                                            !isActive && !isComplete && "bg-white/5 border border-white/10 text-muted-foreground"
                                        )}
                                    >
                                        {isComplete ? <Check size={16} /> : <Icon size={16} />}
                                    </div>
                                    {index < STEPS.length - 1 && (
                                        <div
                                            className={cn(
                                                "w-16 h-0.5 mx-2",
                                                index < currentStepIndex ? "bg-primary" : "bg-white/10"
                                            )}
                                        />
                                    )}
                                </div>
                            )
                        })}
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                        {STEPS.map((step, index) => (
                            <span
                                key={step.id}
                                className={cn(
                                    "text-center",
                                    index === 0 && "text-left",
                                    index === STEPS.length - 1 && "text-right"
                                )}
                            >
                                {step.label}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 relative z-10 flex items-center justify-center p-6">
                <div className="w-full max-w-xl">
                    <div className="glass-panel p-8 border-white/10">
                        <AnimatePresence mode="wait">
                            {renderStepContent()}
                        </AnimatePresence>
                    </div>

                    {/* Navigation Buttons */}
                    <div className="flex justify-between mt-6">
                        <Button
                            variant="outline"
                            onClick={goPrev}
                            className="gap-2 border-white/10 hover:bg-white/5"
                        >
                            <ArrowLeft size={16} />
                            {currentStepIndex === 0 ? "Cancel" : "Back"}
                        </Button>

                        {currentStep === "review" ? (
                            <Button
                                onClick={handleCreateTeam}
                                disabled={isCreating}
                                className="gap-2 bg-white text-black hover:bg-white/90"
                            >
                                {isCreating ? (
                                    <>Creating...</>
                                ) : (
                                    <>
                                        <PlayCircle size={16} />
                                        Create Team & Start
                                    </>
                                )}
                            </Button>
                        ) : (
                            <Button
                                onClick={goNext}
                                className="gap-2 bg-white text-black hover:bg-white/90"
                            >
                                Continue
                                <ArrowRight size={16} />
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

// Helper components
function DifficultyIcon({ difficulty }: { difficulty: GameDifficulty }) {
    const icons: Record<GameDifficulty, React.ReactNode> = {
        story: <Sparkles className="text-emerald-400" size={24} />,
        normal: <Gamepad2 className="text-blue-400" size={24} />,
        hard: <Trophy className="text-amber-400" size={24} />,
        impossible: <Star className="text-red-400" size={24} />,
    }
    return <>{icons[difficulty]}</>
}

function getRegionEmoji(region: TeamRegion): string {
    const emojis: Record<TeamRegion, string> = {
        EU: "🇪🇺",
        NA: "🇺🇸",
        SA: "🇧🇷",
        ASIA: "🇨🇳",
        CIS: "🇷🇺",
        OCEANIA: "🇦🇺",
    }
    return emojis[region]
}
