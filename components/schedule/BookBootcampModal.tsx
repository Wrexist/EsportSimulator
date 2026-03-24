"use client"

import React, { useState } from "react"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { motion } from "framer-motion"
import { X, Plane, Dumbbell, Brain, Sparkles, Coins, CalendarClock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"

interface BookBootcampModalProps {
    isOpen: boolean
    onClose: () => void
    week: number
}

type BootcampType = "LOCAL" | "INTERNATIONAL" | "RETREAT"

const BOOTCAMP_OPTIONS = {
    LOCAL: {
        name: "Local Bootcamp",
        description: "Intensive training at a specialized local facility.",
        costPerWeek: 5000,
        icon: Dumbbell,
        color: "text-blue-400",
        bg: "bg-blue-500/10",
        border: "border-blue-500/20",
        stats: { training: "++", morale: "-", fatigue: "+", chemistry: "" }
    },
    INTERNATIONAL: {
        name: "International Bootcamp",
        description: "Travel abroad to practice against the world's best.",
        costPerWeek: 15000,
        icon: Plane,
        color: "text-orange-400",
        bg: "bg-orange-500/10",
        border: "border-orange-500/20",
        stats: { training: "+++", morale: "+", fatigue: "++", chemistry: "+" }
    },
    RETREAT: {
        name: "Team Building Retreat",
        description: "Focus on mental health, chemistry, and recovery. Builds team bonds.",
        costPerWeek: 8000,
        icon: Sparkles,
        color: "text-purple-400",
        bg: "bg-purple-500/10",
        border: "border-purple-500/20",
        stats: { training: "-", morale: "+++", fatigue: "---", chemistry: "++" }
    }
}

export function BookBootcampModal({ isOpen, onClose, week }: BookBootcampModalProps) {
    const { scheduleActivity, teams, playerTeamId } = useGameStore(useShallow(state => ({
        scheduleActivity: state.scheduleActivity,
        teams: state.teams,
        playerTeamId: state.playerTeamId,
    })))
    const [selectedType, setSelectedType] = useState<BootcampType>("LOCAL")
    const [duration, setDuration] = useState(1)
    const [error, setError] = useState<string | null>(null)

    const playerTeam = teams.find(t => t.id === playerTeamId)
    const budget = playerTeam?.budget || 0

    const selectedOption = BOOTCAMP_OPTIONS[selectedType]
    const totalCost = selectedOption.costPerWeek * duration

    const handleConfirm = () => {
        if (budget < totalCost) return

        const result = scheduleActivity({
            id: `bootcamp_${week}_${selectedType}_${duration}`,
            type: selectedType === "RETREAT" ? "REST" : selectedType === "INTERNATIONAL" ? "TRAVEL" : "BOOTCAMP",
            week: week,
            duration: duration,
            cost: totalCost,
            name: selectedOption.name,
            description: selectedOption.description,
            fatigue: selectedType === "RETREAT" ? -30 : 10,
            effect: {
                trainingBonus: selectedType === "INTERNATIONAL" ? 30 : selectedType === "LOCAL" ? 15 : 0,
                morale: selectedType === "RETREAT" ? 20 : selectedType === "INTERNATIONAL" ? 5 : -5,
            }
        }) as unknown as { success: boolean, message: string }

        if (result.success) {
            toast.success(`${selectedOption.name} booked for ${duration} week${duration > 1 ? "s" : ""}`)
            onClose()
        } else {
            setError(result.message)
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 top-16 z-modal flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title-book-bootcamp"
                className="glass-panel w-full max-w-4xl flex flex-col max-h-[90vh] shadow-2xl border-white/10"
            >
                {/* Header */}
                <div className="p-6 border-b border-white/5 flex items-center justify-between">
                    <div>
                        <h2 id="modal-title-book-bootcamp" className="text-2xl font-normal uppercase tracking-tight flex items-center gap-2">
                            <Plane className="text-primary" />
                            Schedule Bootcamp
                        </h2>
                        <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">
                            Starting Week {week}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors" aria-label="Close dialog">
                        <X size={20} className="text-white/50 hover:text-white" />
                    </button>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    {/* Left: Options */}
                    <div className="w-1/2 p-6 border-r border-white/5 space-y-4 overflow-y-auto custom-scrollbar">
                        {(Object.entries(BOOTCAMP_OPTIONS) as [BootcampType, typeof BOOTCAMP_OPTIONS[BootcampType]][]).map(([key, option]) => (
                            <div
                                key={key}
                                onClick={() => setSelectedType(key)}
                                className={`
                                    p-4 rounded-xl border cursor-pointer transition-all group relative overflow-hidden
                                    ${selectedType === key
                                        ? `bg-white/10 border-white/20 shadow-[0_0_15px_rgba(255,255,255,0.1)]`
                                        : "bg-black/40 border-white/5 hover:bg-white/5"
                                    }
                                `}
                            >
                                <div className="flex items-start gap-4 relative z-10">
                                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${option.bg} ${option.color}`}>
                                        <option.icon size={24} />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className={`font-bold text-sm uppercase tracking-wide ${selectedType === key ? "text-white" : "text-muted-foreground group-hover:text-white"}`}>
                                            {option.name}
                                        </h3>
                                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                                            {option.description}
                                        </p>
                                        <div className="flex gap-2 mt-3">
                                            {option.stats.training !== "-" && <Badge variant="outline" className="text-[9px] border-blue-500/30 text-blue-400">Training {option.stats.training}</Badge>}
                                            {option.stats.morale !== "-" && <Badge variant="outline" className="text-[9px] border-purple-500/30 text-purple-400">Morale {option.stats.morale}</Badge>}
                                            {option.stats.fatigue.includes("-") && <Badge variant="outline" className="text-[9px] border-green-500/30 text-green-400">Fatigue {option.stats.fatigue}</Badge>}
                                            {option.stats.chemistry && <Badge variant="outline" className="text-[9px] border-yellow-500/30 text-yellow-400">Chemistry {option.stats.chemistry}</Badge>}
                                        </div>
                                    </div>
                                </div>
                                {selectedType === key && <div className={`absolute left-0 top-0 bottom-0 w-1 ${option.bg.replace('/10', '')}`} />}
                            </div>
                        ))}
                    </div>

                    {/* Right: Configuration */}
                    <div className="w-1/2 p-8 flex flex-col bg-white/5">
                        <div className="flex-1 space-y-8">
                            {/* Duration Slider */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                        <CalendarClock size={16} /> Duration
                                    </label>
                                    <span className="text-2xl font-normal text-white">{duration} <span className="text-sm font-normal text-muted-foreground">Weeks</span></span>
                                </div>
                                <Slider
                                    value={[duration]}
                                    onValueChange={(v) => setDuration(v[0])}
                                    min={1}
                                    max={4}
                                    step={1}
                                    className="py-4"
                                />
                                <div className="flex justify-between text-[10px] text-muted-foreground uppercase tracking-widest font-bold px-1">
                                    <span>1 Wk</span>
                                    <span>4 Wks</span>
                                </div>
                            </div>

                            {/* Summary Card */}
                            <div className="p-6 rounded-xl bg-black/40 border border-white/10 space-y-4">
                                <h4 className="text-xs font-normal uppercase tracking-widest text-muted-foreground mb-4">Summary</h4>

                                <div className="flex justify-between items-center py-2 border-b border-white/5">
                                    <span className="text-sm text-gray-400">Weekly Cost</span>
                                    <span className="font-mono text-white">${selectedOption.costPerWeek.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-white/5">
                                    <span className="text-sm text-gray-400">Duration</span>
                                    <span className="font-mono text-white">x {duration}</span>
                                </div>
                                <div className="flex justify-between items-center pt-2">
                                    <span className="text-sm font-bold text-white uppercase tracking-wider">Total</span>
                                    <span className={`font-mono font-bold text-lg ${budget >= totalCost ? "text-emerald-400" : "text-red-500"}`}>
                                        ${totalCost.toLocaleString()}
                                    </span>
                                </div>
                            </div>

                            {budget < totalCost && (
                                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3">
                                    <Coins className="text-red-500" size={16} />
                                    <p className="text-xs text-red-200">Insufficient funds. Need ${(totalCost - budget).toLocaleString()} more.</p>
                                </div>
                            )}

                            {error && (
                                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3">
                                    <X className="text-red-500" size={16} />
                                    <p className="text-xs text-red-200">{error}</p>
                                </div>
                            )}
                        </div>

                        <Button
                            onClick={handleConfirm}
                            disabled={budget < totalCost}
                            className="w-full h-14 text-lg font-normal uppercase tracking-widest mt-8"
                        >
                            Confirm Booking
                        </Button>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
