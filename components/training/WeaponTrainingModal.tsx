"use client"

import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    Crosshair,
    Target,
    Zap,
    Shield,
    Crown,
    DollarSign,
    Eye,
    Circle,
    ChevronRight,
    Sparkles,
    Lock
} from "lucide-react"
import { cn } from "@/lib/utils"
import { PlayerSaveData } from "@/engine/save-types"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { toast } from "sonner"
import {
    WEAPON_TYPES,
    WEAPON_DRILLS,
    WEAPON_DISPLAY,
    getMasteryInfo,
    WeaponType,
    WeaponDrillId,
    WeaponMasteryManager
} from "@/engine/weapon-mastery-system"

interface WeaponTrainingModalProps {
    isOpen: boolean
    onClose: () => void
    player: PlayerSaveData
}

const iconMap: Record<string, any> = {
    Crosshair, Target, Zap, Shield, Crown, DollarSign, Eye, Circle
}

export function WeaponTrainingModal({ isOpen, onClose, player }: WeaponTrainingModalProps) {
    const { teams, playerTeamId, updatePlayer, updateTeamBudget, saveGame, players } = useGameStore(useShallow(state => ({
        teams: state.teams,
        playerTeamId: state.playerTeamId,
        updatePlayer: state.updatePlayer,
        updateTeamBudget: state.updateTeamBudget,
        saveGame: state.saveGame,
        players: state.players,
    })))
    const playerTeam = teams.find((t: any) => t.id === playerTeamId)
    const budget = playerTeam?.budget || 0

    // Get live player data from store
    const livePlayer = players.find((p: any) => p.id === player.id) || player
    const playerEnergy = (livePlayer as any).energy ?? 100

    const [selectedWeapon, setSelectedWeapon] = useState<WeaponType>("RIFLE")
    const [isTraining, setIsTraining] = useState(false)

    const mastery = WeaponMasteryManager.getPlayerMastery(livePlayer as any)

    // Energy cost per drill
    const ENERGY_COST = 25

    const handleStartDrill = async (drillKey: WeaponDrillId) => {
        const drill = WEAPON_DRILLS[drillKey]

        // Check budget
        if (budget < drill.cost) {
            toast.error("Insufficient budget", {
                description: `Need $${drill.cost.toLocaleString()} for this drill`
            })
            return
        }

        // Check energy
        if (playerEnergy < ENERGY_COST) {
            toast.error("Insufficient energy", {
                description: `${livePlayer.nickname} needs at least ${ENERGY_COST} energy to train. Current: ${playerEnergy}`
            })
            return
        }

        setIsTraining(true)
        await new Promise(r => setTimeout(r, 1500))

        const result = WeaponMasteryManager.processTrainingDrill(livePlayer as any, drillKey, budget)

        if (result.success) {
            // Update player with new mastery AND drain energy
            const newEnergy = Math.max(0, playerEnergy - ENERGY_COST)

            updatePlayer(player.id, {
                weaponMastery: result.newMastery,
                energy: newEnergy
            })
            if (playerTeamId) updateTeamBudget(playerTeamId, -result.cost)

            // Save game to persist changes
            try {
                await saveGame()
            } catch (error) {
                toast.error("Save Failed", {
                    description: error instanceof Error ? error.message : "Training progress could not be saved."
                })
                setIsTraining(false)
                return
            }

            toast.success("Training Complete!", {
                description: `${result.message} (-${ENERGY_COST} energy)`
            })
        } else {
            toast.error("Training Failed", {
                description: result.message
            })
        }

        setIsTraining(false)
    }

    const availableDrills = Object.entries(WEAPON_DRILLS)
        .filter(([_, drill]) => drill.weapon === selectedWeapon)
        .map(([key, drill]) => ({ ...drill, drillKey: key as WeaponDrillId }))

    const currentInfo = WEAPON_DISPLAY[selectedWeapon]
    const currentXp = mastery[selectedWeapon]
    const currentMastery = getMasteryInfo(currentXp)
    const CurrentIcon = iconMap[currentInfo.icon] || Circle

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl p-0 overflow-hidden bg-zinc-950 border-zinc-800">
                {/* Header with gradient accent */}
                <div className="relative px-6 pt-6 pb-4">
                    <div className="absolute inset-0 bg-gradient-to-b from-zinc-800/50 to-transparent" />
                    <DialogHeader className="relative">
                        <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
                            <div className="w-8 h-8 rounded bg-zinc-800 flex items-center justify-center">
                                <Crosshair size={16} className="text-zinc-400" />
                            </div>
                            Weapon Training
                            <span className="text-zinc-500 font-normal text-sm ml-2">— {player.nickname}</span>
                        </DialogTitle>
                    </DialogHeader>
                </div>

                <div className="px-6 pb-6 space-y-5 max-h-[70vh] overflow-y-auto custom-scrollbar">
                    {/* Weapon selector - horizontal pills */}
                    <div className="flex gap-2">
                        {(Object.keys(WEAPON_TYPES) as WeaponType[]).map(weapon => {
                            const info = WEAPON_DISPLAY[weapon]
                            const xp = mastery[weapon]
                            const mInfo = getMasteryInfo(xp)
                            const Icon = iconMap[info.icon] || Circle
                            const isActive = selectedWeapon === weapon

                            return (
                                <button
                                    key={weapon}
                                    onClick={() => setSelectedWeapon(weapon)}
                                    className={cn(
                                        "flex-1 py-3 px-2 rounded-lg transition-all relative overflow-hidden",
                                        isActive
                                            ? "bg-zinc-800 ring-1 ring-zinc-600"
                                            : "bg-zinc-900 hover:bg-zinc-800/70"
                                    )}
                                >
                                    <div className="flex flex-col items-center gap-1.5">
                                        <Icon size={18} className={isActive ? info.color : "text-zinc-500"} />
                                        <span className={cn(
                                            "text-[11px] font-semibold uppercase tracking-wide",
                                            isActive ? "text-white" : "text-zinc-500"
                                        )}>
                                            {info.name}
                                        </span>
                                        <span className={cn(
                                            "text-[9px] px-1.5 py-0.5 rounded",
                                            isActive ? "bg-zinc-700 text-zinc-300" : "text-zinc-600"
                                        )}>
                                            {mInfo.name}
                                        </span>
                                    </div>
                                    {mInfo.isMaster && (
                                        <Crown size={10} className="absolute top-1 right-1 text-amber-400" />
                                    )}
                                </button>
                            )
                        })}
                    </div>

                    {/* Current mastery stats */}
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={selectedWeapon}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            transition={{ duration: 0.15 }}
                        >
                            <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className={cn("w-10 h-10 rounded flex items-center justify-center", currentInfo.bgColor)}>
                                            <CurrentIcon size={20} className={currentInfo.color} />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-white">{currentInfo.name}</h3>
                                            <p className="text-xs text-zinc-500">{currentInfo.description}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-lg font-bold text-white">{currentXp}<span className="text-zinc-500 text-sm ml-1">XP</span></div>
                                        <div className={cn("text-[10px] font-medium uppercase", currentInfo.color)}>{currentMastery.name}</div>
                                    </div>
                                </div>

                                {/* Progress bar */}
                                <div className="space-y-1.5">
                                    <div className="flex justify-between text-[10px] text-zinc-500">
                                        <span>Next: {currentMastery.nextLevel || "MAX"}</span>
                                        <span>{currentMastery.nextLevel ? `${currentMastery.xpToNext} XP left` : "Mastered"}</span>
                                    </div>
                                    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                        <motion.div
                                            className={cn("h-full rounded-full", currentInfo.color.replace('text-', 'bg-'))}
                                            initial={{ width: 0 }}
                                            animate={{ width: `${currentMastery.progress}%` }}
                                            transition={{ duration: 0.5 }}
                                        />
                                    </div>
                                </div>

                                {/* Bonuses inline */}
                                <div className="flex gap-4 mt-3 pt-3 border-t border-zinc-800">
                                    <div className="flex items-center gap-1.5 text-xs">
                                        <Target size={12} className="text-emerald-500" />
                                        <span className="text-zinc-400">Accuracy</span>
                                        <span className="text-emerald-500 font-medium">+{currentMastery.accuracyBonus}%</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs">
                                        <Zap size={12} className="text-orange-500" />
                                        <span className="text-zinc-400">Damage</span>
                                        <span className="text-orange-500 font-medium">+{currentMastery.damageBonus}%</span>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </AnimatePresence>

                    {/* Training drills */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Training Drills</h4>
                            <div className="flex items-center gap-1 text-xs text-zinc-600">
                                <DollarSign size={12} />
                                <span>${budget.toLocaleString()}</span>
                            </div>
                        </div>

                        <div className="space-y-2">
                            {availableDrills.map(drill => {
                                const DrillIcon = iconMap[drill.icon] || Target
                                const canAfford = budget >= drill.cost
                                const hasEnergy = playerEnergy >= ENERGY_COST
                                const canTrain = canAfford && hasEnergy
                                const diffColors: Record<string, string> = {
                                    easy: "text-emerald-500 bg-emerald-500/10",
                                    medium: "text-amber-500 bg-amber-500/10",
                                    hard: "text-red-500 bg-red-500/10"
                                }

                                return (
                                    <div
                                        key={drill.drillKey}
                                        className={cn(
                                            "flex items-center justify-between p-3 rounded-lg transition-all",
                                            canTrain
                                                ? "bg-zinc-900 hover:bg-zinc-800 border border-zinc-800"
                                                : "bg-zinc-900/50 border border-zinc-900 opacity-60"
                                        )}
                                    >
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <div className="w-9 h-9 rounded bg-zinc-800 flex items-center justify-center shrink-0">
                                                <DrillIcon size={16} className="text-zinc-400" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-sm text-white truncate">{drill.name}</span>
                                                    <span className={cn("text-[9px] px-1.5 py-0.5 rounded uppercase font-medium", diffColors[drill.difficulty])}>
                                                        {drill.difficulty}
                                                    </span>
                                                </div>
                                                <p className="text-[11px] text-zinc-500 truncate">{drill.description}</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3 shrink-0 ml-3">
                                            <div className="text-right">
                                                <div className="text-sm font-semibold text-emerald-500">+{drill.xpGain} XP</div>
                                                <div className={cn("text-[11px]", !canAfford ? "text-red-500" : !hasEnergy ? "text-orange-500" : "text-zinc-500")}>
                                                    ${drill.cost.toLocaleString()} {!hasEnergy && canAfford && "• Low Energy"}
                                                </div>
                                            </div>
                                            <Button
                                                size="sm"
                                                variant={canTrain ? "default" : "ghost"}
                                                disabled={!canTrain || isTraining}
                                                onClick={() => handleStartDrill(drill.drillKey)}
                                                className="h-8 px-3"
                                            >
                                                {isTraining ? (
                                                    <motion.div
                                                        animate={{ rotate: 360 }}
                                                        transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                                                    >
                                                        <Sparkles size={14} />
                                                    </motion.div>
                                                ) : canTrain ? (
                                                    <>
                                                        <span className="text-xs">Train</span>
                                                        <ChevronRight size={14} />
                                                    </>
                                                ) : (
                                                    <Lock size={14} />
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-zinc-900 border-t border-zinc-800 flex items-center justify-between">
                    <div className="flex gap-6 text-xs text-zinc-500">
                        <div>
                            Budget: <span className="text-emerald-500 font-medium">${budget.toLocaleString()}</span>
                        </div>
                        <div>
                            Energy: <span className={cn(
                                "font-medium",
                                playerEnergy >= ENERGY_COST ? "text-amber-400" : "text-red-500"
                            )}>{playerEnergy}/{livePlayer.maxEnergy ?? 100}</span>
                            <span className="text-zinc-600 ml-1">(-{ENERGY_COST}/drill)</span>
                        </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={onClose}>
                        Close
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
