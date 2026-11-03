"use client"
import { Trans } from "@/lib/trans"
import { t } from "@/lib/i18n"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { PlayerSaveData } from "@/engine/save-types"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { toast } from "@/lib/toast"
import {
    WEAPON_TYPES,
    WEAPON_DRILLS,
    getMasteryInfo,
    WeaponType,
    WeaponDrillId,
    WeaponMasteryManager
} from "@/engine/weapon-mastery-system"

import { formatCurrency } from "@/lib/utils-extended"
interface WeaponTrainingModalProps {
    isOpen: boolean
    onClose: () => void
    player: PlayerSaveData
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
    const playerTeam = teams.find(t => t.id === playerTeamId)
    const budget = playerTeam?.budget || 0

    // Get live player data from store. PlayerSaveData has `energy` as a
    // required number so the cast is unnecessary — fall back here only
    // covers the case where the player prop predates the live store
    // (legacy `Player` shape from a tournament fixture).
    const livePlayer = players.find(p => p.id === player.id) || player
    const playerEnergy = "energy" in livePlayer ? livePlayer.energy : 100

    const [selectedWeapon, setSelectedWeapon] = useState<WeaponType>("RIFLE")
    const [isTraining, setIsTraining] = useState(false)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mastery = WeaponMasteryManager.getPlayerMastery(livePlayer as any)

    // Energy cost per drill
    const ENERGY_COST = 25

    const handleStartDrill = async (drillKey: WeaponDrillId) => {
        const drill = WEAPON_DRILLS[drillKey]

        // Check budget
        if (budget < drill.cost) {
            toast.error(t("tr.w.noBudget"), {
                description: t("tr.w.noBudgetBody", { cost: formatCurrency(drill.cost, "$", false) })
            })
            return
        }

        // Check energy
        if (playerEnergy < ENERGY_COST) {
            toast.error(t("tr.w.noEnergy"), {
                description: t("tr.w.noEnergyBody", { name: livePlayer.nickname, need: ENERGY_COST, n: playerEnergy })
            })
            return
        }

        setIsTraining(true)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
                toast.error(t("tr.w.saveFailed"), {
                    description: error instanceof Error ? error.message : t("tr.w.saveFailedBody")
                })
                setIsTraining(false)
                return
            }

            toast.success(t("tr.w.complete"), {
                description: t("tr.w.completeBody", { name: livePlayer.nickname, drill: t(`tr.w.drill.${drillKey}`), xp: result.xpGained, weapon: t(`weapon.${drill.weapon}`), energy: ENERGY_COST })
            })
        } else {
            toast.error(t("tr.w.failed"), {
                description: result.message
            })
        }

        setIsTraining(false)
    }

    const availableDrills = Object.entries(WEAPON_DRILLS)
        .filter(([, drill]) => drill.weapon === selectedWeapon)
        .map(([key, drill]) => ({ ...drill, drillKey: key as WeaponDrillId }))

    const currentXp = mastery[selectedWeapon]
    const currentMastery = getMasteryInfo(currentXp)

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl p-0">
                <DialogHeader className="border-b border-line px-6 pb-4 pt-6">
                    <DialogTitle>{t("tr.w.title")}</DialogTitle>
                    <p className="text-sm text-ink-3">{t("tr.w.sub", { name: player.nickname })}</p>
                </DialogHeader>

                <div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5">
                    <div role="tablist" aria-label={t("tr.w.class")} className="grid grid-cols-4 gap-2">
                        {(Object.keys(WEAPON_TYPES) as WeaponType[]).map(weapon => {
                            const mInfo = getMasteryInfo(mastery[weapon])
                            const isActive = selectedWeapon === weapon
                            return (
                                <button
                                    key={weapon}
                                    role="tab"
                                    aria-selected={isActive}
                                    onClick={() => setSelectedWeapon(weapon)}
                                    className={cn(
                                        "rounded-md border px-2 py-2.5 text-center transition-colors duration-150",
                                        isActive ? "border-gold bg-hover" : "border-line bg-raised hover:border-line-strong",
                                    )}
                                >
                                    <span className={cn("block text-sm font-semibold", isActive ? "text-ink-1" : "text-ink-2")}>{t(`weapon.${weapon}`)}</span>
                                    <span className={cn("mt-0.5 block text-xs", mInfo.isMaster ? "text-gold" : "text-ink-3")}>{t(`mastery.${mInfo.level}`)}</span>
                                </button>
                            )
                        })}
                    </div>

                    <div className="rounded-lg border border-line bg-raised p-4">
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-ink-1">{t(`weapon.${selectedWeapon}`)}</p>
                                <p className="text-xs text-ink-3">{t(`tr.w.class.${selectedWeapon}`)}</p>
                            </div>
                            <div className="shrink-0 text-right">
                                <p className="font-display text-2xl font-bold tabular-nums text-ink-1">{currentXp}<span className="ml-1 font-sans text-xs font-normal text-ink-3">XP</span></p>
                                <p className={cn("text-xs", currentMastery.isMaster ? "text-gold" : "text-ink-2")}>{t(`mastery.${currentMastery.level}`)}</p>
                            </div>
                        </div>
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-hover">
                            <div className="h-full rounded-full bg-ink-2" style={{ width: `${currentMastery.progress}%` }} />
                        </div>
                        <div className="mt-2 flex justify-between text-xs text-ink-3">
                            <span>{currentMastery.nextLevel ? t("tr.w.next", { level: t(`mastery.${currentMastery.nextLevel.toUpperCase()}`) }) : t("tr.w.mastered")}</span>
                            <span className="tabular-nums">{currentMastery.nextLevel ? t("tr.w.toGo", { n: currentMastery.xpToNext }) : ""}</span>
                        </div>
                        <p className="mt-3 border-t border-line pt-3 text-xs text-ink-3">
                            <Trans k="tr.w.edge" params={{ acc: currentMastery.accuracyBonus, dmg: currentMastery.damageBonus }} tags={{ b: x => <span className="font-semibold text-ink-1">{x}</span> }} />
                        </p>
                    </div>

                    <ul className="divide-y divide-line rounded-lg border border-line">
                        {availableDrills.map(drill => {
                            const canAfford = budget >= drill.cost
                            const hasEnergy = playerEnergy >= ENERGY_COST
                            const canTrain = canAfford && hasEnergy
                            return (
                                <li key={drill.drillKey} className="flex items-center gap-4 px-4 py-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold text-ink-1">
                                            {t(`tr.w.drill.${drill.drillKey}`)} <span className="ml-1 text-xs font-normal text-ink-3">{t(`tr.w.diff.${drill.difficulty}`)}</span>
                                        </p>
                                        <p className="truncate text-xs text-ink-3">{t(`tr.w.drill.${drill.drillKey}.desc`)}</p>
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <p className="text-sm font-semibold tabular-nums text-ink-1">+{drill.xpGain} XP</p>
                                        <p className={cn("text-xs tabular-nums", canAfford ? "text-ink-3" : "text-negative")}>{formatCurrency(drill.cost, "$", false)}</p>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={!canTrain || isTraining}
                                        onClick={() => handleStartDrill(drill.drillKey)}
                                        className="h-8 w-20 shrink-0 px-3 text-xs"
                                        title={!canAfford ? t("tr.rt.noBudget") : !hasEnergy ? t("tr.w.needsEnergy", { n: ENERGY_COST }) : undefined}
                                    >
                                        {isTraining ? "…" : t("tr.w.train")}
                                    </Button>
                                </li>
                            )
                        })}
                    </ul>
                </div>

                <div className="flex items-center justify-between border-t border-line px-6 py-4">
                    <div className="flex gap-6 text-xs text-ink-3">
                        <span><Trans k="tr.w.budget" params={{ amount: formatCurrency(budget, "$", false) }} tags={{ b: x => <span className="font-semibold tabular-nums text-ink-1">{x}</span> }} /></span>
                        <span>
                            {t("tr.w.energy")} <span className={cn("font-semibold tabular-nums", playerEnergy >= ENERGY_COST ? "text-ink-1" : "text-caution")}>{playerEnergy}/{livePlayer.maxEnergy ?? 100}</span>
                            <span className="ml-1">{t("tr.w.perDrill", { n: ENERGY_COST })}</span>
                        </span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={onClose}>{t("tr.close")}</Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
