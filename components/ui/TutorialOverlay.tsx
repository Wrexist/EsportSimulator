"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useShallow } from "zustand/react/shallow"
import { motion, AnimatePresence } from "framer-motion"
import { useGameStore } from "@/store/game-store"
import {
    Sparkles,
    Mail,
    Users,
    Gamepad2,
    DollarSign,
    Target,
    ArrowRightLeft,
    Calendar,
    ChevronRight,
    ChevronLeft,
    X,
    Trophy,
    Zap,
    Shield,
    TrendingUp,
    GraduationCap,
    Lightbulb,
    CheckCircle2
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "./button"

interface TutorialStep {
    id: string
    title: string
    subtitle: string
    content: string
    icon: React.ReactNode
    color: string
    tips?: string[]
}

const TUTORIAL_STEPS: TutorialStep[] = [
    {
        id: "welcome",
        title: "Welcome, Manager",
        subtitle: "Your Journey Begins",
        content: "You've just been hired as the head coach of a professional esports organization. Your mission: lead your team from humble beginnings to global glory. Build your roster, develop talent, and compete in the most prestigious tournaments in the world.",
        icon: <Sparkles size={32} />,
        color: "from-amber-500 to-orange-500",
        tips: [
            "Take your time to explore the desktop environment",
            "Check your Mail app regularly for important updates",
            "Your decisions will shape the future of your organization"
        ]
    },
    {
        id: "desktop",
        title: "Your Command Center",
        subtitle: "The Desktop Environment",
        content: "This is your desktop — the nerve center of operations. Click the app icons on the left or taskbar to open different tools. The Mail app shows events, offers, and news. The Calendar tracks your schedule. Everything you need is just a click away.",
        icon: <Mail size={32} />,
        color: "from-cyan-500 to-blue-500",
        tips: [
            "Mail app opens automatically with important notifications",
            "Windows can be moved, minimized, and resized",
            "Keep an eye on the taskbar notification badges"
        ]
    },
    {
        id: "squad",
        title: "Squad Management",
        subtitle: "Build Your Roster",
        content: "Your team needs 5 active players, each with a specific role: AWPer, Entry Fragger, IGL, Support, and Lurker. Each player has unique stats that affect match performance. Monitor their morale, energy, and form to keep them performing at their best.",
        icon: <Users size={32} />,
        color: "from-emerald-500 to-teal-500",
        tips: [
            "Player roles affect how they perform in matches",
            "High morale = better performance",
            "Rest tired players or they may get injured"
        ]
    },
    {
        id: "matches",
        title: "Match Day",
        subtitle: "Watch Your Tactics Unfold",
        content: "When match day arrives, you'll experience an immersive simulation. Choose your buy strategies (Eco, Force, Full Buy) based on your team's economy. Watch round-by-round action and see how your tactical decisions play out in real-time.",
        icon: <Gamepad2 size={32} />,
        color: "from-rose-500 to-pink-500",
        tips: [
            "Eco rounds save money for future full buys",
            "Force buying is risky but can turn momentum",
            "Map veto is crucial — know your team's strengths"
        ]
    },
    {
        id: "finances",
        title: "Financial Empire",
        subtitle: "Money Makes Champions",
        content: "Managing your budget is critical. You earn money through tournament prizes, sponsor deals, and merchandise sales. Pay your players competitive salaries or they might leave. Upgrade facilities to boost training and recovery efficiency.",
        icon: <DollarSign size={32} />,
        color: "from-green-500 to-emerald-500",
        tips: [
            "Don't overspend on salaries early on",
            "Sponsors provide steady weekly income",
            "Winning tournaments is the best way to earn big"
        ]
    },
    {
        id: "training",
        title: "Player Development",
        subtitle: "Champions Are Made",
        content: "Training is how players improve their skills. Assign individual training to boost specific stats, or run team drills to improve chemistry and tactical understanding. Balance training with rest to avoid burnout — exhausted players perform poorly.",
        icon: <Target size={32} />,
        color: "from-blue-500 to-indigo-500",
        tips: [
            "Young players have higher growth potential",
            "Chemistry between players affects teamwork",
            "Schedule bootcamps before big tournaments"
        ]
    },
    {
        id: "transfers",
        title: "Transfer Market",
        subtitle: "Build Your Dream Team",
        content: "Need more firepower? The transfer market has free agents ready to sign, or you can make offers for players on other teams. Negotiate contracts carefully — star players demand high salaries. You can also sell players you no longer need.",
        icon: <ArrowRightLeft size={32} />,
        color: "from-purple-500 to-violet-500",
        tips: [
            "Scout players before signing to reveal hidden stats",
            "Check contract expiration for cheap bargains",
            "Youth Academy can produce future stars"
        ]
    },
    {
        id: "weekly",
        title: "Advance The Week",
        subtitle: "Time Moves Forward",
        content: "When you're ready, click 'Advance Week' in the top navigation bar. This progresses time, processes training, simulates scheduled matches, and triggers events. Your career unfolds week by week — each decision compounds over time.",
        icon: <Calendar size={32} />,
        color: "from-orange-500 to-red-500",
        tips: [
            "Always check your schedule before advancing",
            "Random events can create opportunities or challenges",
            "Save your game regularly using the menu"
        ]
    },
    {
        id: "ready",
        title: "You're Ready!",
        subtitle: "Go Build Your Legacy",
        content: "That's everything you need to get started! Explore at your own pace, experiment with strategies, and learn from your experiences. The path to becoming a legendary esports manager starts now. Good luck, Coach!",
        icon: <Trophy size={32} />,
        color: "from-amber-400 to-yellow-500",
        tips: [
            "Check your first mail for team-specific tips",
            "Start by reviewing your current roster",
            "Your ultimate goal: Win a Major Championship!"
        ]
    }
]



export function TutorialOverlay() {
    const { completeTutorial, tutorialCompleted, showTutorialOnNewGame, manualTutorialTrigger } = useGameStore(useShallow(state => ({
        completeTutorial: state.completeTutorial,
        tutorialCompleted: state.tutorialCompleted,
        showTutorialOnNewGame: state.showTutorialOnNewGame,
        manualTutorialTrigger: state.manualTutorialTrigger
    })))
    const [currentStepIdx, setCurrentStepIdx] = useState(0)
    // Local visibility state - acts as "isOpen"
    const [isVisible, setIsVisible] = useState(false)
    const [isExiting, setIsExiting] = useState(false)
    const [hasMounted, setHasMounted] = useState(false)

    // Mount check to avoid hydration mismatch
    useEffect(() => {
        setHasMounted(true)
    }, [])

    // Handle visibility triggers
    useEffect(() => {
        if (manualTutorialTrigger > 0) {
            setIsVisible(true)
            setCurrentStepIdx(0)
        } else if (showTutorialOnNewGame && !tutorialCompleted) {
            // Small delay to let the game load
            const timer = setTimeout(() => {
                setIsVisible(true)
                setCurrentStepIdx(0)
            }, 1000)
            return () => clearTimeout(timer)
        }
    }, [manualTutorialTrigger, showTutorialOnNewGame, tutorialCompleted])

    const onClose = useCallback(() => {
        setIsVisible(false)
    }, [])

    const currentStep = TUTORIAL_STEPS[currentStepIdx]
    const isFirstStep = currentStepIdx === 0
    const isLastStep = currentStepIdx === TUTORIAL_STEPS.length - 1
    const progress = ((currentStepIdx + 1) / TUTORIAL_STEPS.length) * 100

    const handleComplete = useCallback(() => {
        setIsExiting(true)
        setTimeout(() => {
            setIsExiting(false)
            onClose()
            completeTutorial() // Marks as dismissed for this session
        }, 500)
    }, [onClose, completeTutorial])

    const handleSkip = useCallback(() => {
        setIsExiting(true)
        setTimeout(() => {
            setIsExiting(false)
            onClose()
            completeTutorial() // Marks as dismissed for this session
        }, 300)
    }, [onClose, completeTutorial])

    const handleNext = useCallback(() => {
        if (isLastStep) {
            handleComplete()
        } else {
            setCurrentStepIdx(prev => prev + 1)
        }
    }, [isLastStep, handleComplete])

    const handlePrev = useCallback(() => {
        if (!isFirstStep) {
            setCurrentStepIdx(prev => prev - 1)
        }
    }, [isFirstStep])

    // Don't render if not visible (and not exiting)
    if (!hasMounted) return null
    if (!isVisible && !isExiting) return null

    return (
        <AnimatePresence>
            {(isVisible || isExiting) && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: isExiting ? 0 : 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4 }}
                    className={cn(
                        "fixed inset-0 z-[200] flex items-center justify-center",
                        isExiting && "pointer-events-none"
                    )}
                >
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

                    {/* Tutorial Card */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 30 }}
                        animate={{ opacity: isExiting ? 0 : 1, scale: isExiting ? 0.9 : 1, y: isExiting ? 30 : 0 }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                        className="relative w-full max-w-2xl mx-4"
                    >
                        {/* Glow Effect */}
                        <div className={cn(
                            "absolute -inset-1 rounded-3xl blur-xl opacity-30 bg-gradient-to-r transition-colors duration-500",
                            currentStep.color
                        )} />

                        {/* Card */}
                        <div className="relative bg-neutral-900/95 backdrop-blur-2xl rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
                            {/* Header */}
                            <div className={cn(
                                "relative px-8 pt-8 pb-6 bg-gradient-to-r transition-colors duration-500",
                                currentStep.color
                            )}>
                                {/* Skip Button */}
                                <button
                                    onClick={handleSkip}
                                    className="absolute top-4 right-4 p-2 rounded-xl bg-black/20 hover:bg-black/40 text-white/70 hover:text-white transition-all"
                                >
                                    <X size={18} />
                                </button>

                                {/* Step Indicator */}
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="px-3 py-1 rounded-full bg-black/20 text-[10px] font-bold text-white uppercase tracking-widest">
                                        Step {currentStepIdx + 1} of {TUTORIAL_STEPS.length}
                                    </div>
                                </div>

                                {/* Icon & Title */}
                                <div className="flex items-start gap-5">
                                    <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center text-white shrink-0">
                                        {currentStep.icon}
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold text-white tracking-tight">
                                            {currentStep.title}
                                        </h2>
                                        <p className="text-white/70 text-sm font-medium mt-0.5">
                                            {currentStep.subtitle}
                                        </p>
                                    </div>
                                </div>

                                {/* Progress Bar */}
                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
                                    <motion.div
                                        className="h-full bg-white/50"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${progress}%` }}
                                        transition={{ duration: 0.4 }}
                                    />
                                </div>
                            </div>

                            {/* Content */}
                            <div className="p-8">
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={currentStep.id}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.3 }}
                                    >
                                        <p className="text-white/80 text-base leading-relaxed mb-6">
                                            {currentStep.content}
                                        </p>

                                        {/* Tips */}
                                        {currentStep.tips && (
                                            <div className="space-y-2.5">
                                                <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                                                    <Lightbulb size={12} />
                                                    Pro Tips
                                                </div>
                                                {currentStep.tips.map((tip, idx) => (
                                                    <motion.div
                                                        key={idx}
                                                        initial={{ opacity: 0, x: -10 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        transition={{ delay: idx * 0.1 }}
                                                        className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/5"
                                                    >
                                                        <CheckCircle2 size={16} className={cn(
                                                            "shrink-0 mt-0.5 transition-colors duration-500",
                                                            currentStep.color.includes("amber") || currentStep.color.includes("yellow")
                                                                ? "text-amber-400"
                                                                : currentStep.color.includes("cyan") || currentStep.color.includes("blue")
                                                                    ? "text-cyan-400"
                                                                    : currentStep.color.includes("emerald") || currentStep.color.includes("green")
                                                                        ? "text-emerald-400"
                                                                        : currentStep.color.includes("rose") || currentStep.color.includes("pink")
                                                                            ? "text-rose-400"
                                                                            : currentStep.color.includes("purple") || currentStep.color.includes("violet")
                                                                                ? "text-purple-400"
                                                                                : currentStep.color.includes("orange") || currentStep.color.includes("red")
                                                                                    ? "text-orange-400"
                                                                                    : "text-blue-400"
                                                        )} />
                                                        <span className="text-sm text-white/70">{tip}</span>
                                                    </motion.div>
                                                ))}
                                            </div>
                                        )}
                                    </motion.div>
                                </AnimatePresence>
                            </div>

                            {/* Footer */}
                            <div className="px-8 pb-8 flex items-center justify-between gap-4">
                                {/* Step Dots */}
                                <div className="flex gap-1.5">
                                    {TUTORIAL_STEPS.map((_, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => setCurrentStepIdx(idx)}
                                            className={cn(
                                                "w-2 h-2 rounded-full transition-all duration-300",
                                                idx === currentStepIdx
                                                    ? "w-6 bg-white"
                                                    : idx < currentStepIdx
                                                        ? "bg-white/50"
                                                        : "bg-white/20"
                                            )}
                                        />
                                    ))}
                                </div>

                                {/* Navigation Buttons */}
                                <div className="flex gap-3">
                                    <Button
                                        variant="ghost"
                                        onClick={handlePrev}
                                        disabled={isFirstStep}
                                        className="h-11 px-5 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30"
                                    >
                                        <ChevronLeft size={18} className="mr-1" />
                                        Back
                                    </Button>
                                    <Button
                                        onClick={handleNext}
                                        className={cn(
                                            "h-11 px-6 text-white font-bold tracking-wide rounded-xl shadow-lg transition-all",
                                            "bg-gradient-to-r",
                                            currentStep.color,
                                            "hover:opacity-90 hover:scale-[1.02]"
                                        )}
                                    >
                                        {isLastStep ? (
                                            <>
                                                Start Playing
                                                <Zap size={16} className="ml-2" />
                                            </>
                                        ) : (
                                            <>
                                                Continue
                                                <ChevronRight size={18} className="ml-1" />
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
