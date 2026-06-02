"use client"

import React, { useEffect, useRef, useState } from "react"
import { Shield, Sword, X, Save, User, Info, Copy, ClipboardPaste, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { WEAPONS, WeaponType } from "@/engine/economy-manager"
import { WEAPONS as WEAPON_ICONS, EQUIPMENT, GRENADES } from "@/lib/asset-constants"
import { CustomTactics, TacticalStrategy, PlayerLoadout } from "@/types"
import Image from "next/image"
import { PlayerPortrait } from "@/components/ui/asset-images"

interface TacticalLoadoutEditorProps {
    side: "ct" | "t"
    strategyId: keyof CustomTactics
    config: TacticalStrategy
    teamBudget?: number
    playerCash?: number[]  // Per-player available cash from economy
    playerNames?: string[]
    playerImages?: string[]  // Array of image paths for each player
    onSave: (config: TacticalStrategy) => void
    onClose: () => void
}

const ROLE_OPTIONS = ["AWPER", "RIFLER", "SUPPORT", "ENTRY", "IGL"]

export const TacticalLoadoutEditor: React.FC<TacticalLoadoutEditorProps> = ({
    side,
    strategyId,
    config,
    teamBudget,
    playerCash = [],
    playerNames = ["Player 1", "Player 2", "Player 3", "Player 4", "Player 5"],
    playerImages = [],
    onSave,
    onClose
}) => {
    const [loadouts, setLoadouts] = useState<PlayerLoadout[]>(() => {
        if (config.playerLoadouts && config.playerLoadouts.length === 5) {
            return config.playerLoadouts.map(l => ({ ...l }))
        }
        return Array.from({ length: 5 }, (_, i) => ({
            slotIndex: i,
            roleHint: i === 0 ? "AWPER" : (i < 3 ? "RIFLER" : (i === 3 ? "SUPPORT" : "IGL")),
            primaryWeaponId: config.primaryWeaponId || "usp",
            secondaryWeaponId: config.secondaryWeaponId || "usp",
            armorTier: config.armorTier || "NONE",
            hasKit: config.hasKit || false,
            utility: config.utility || []
        }))
    })

    // Custom name state
    const [strategyName, setStrategyName] = useState(config.name || "")

    const [selectedPlayer, setSelectedPlayer] = useState<number | null>(null)
    const [clipboard, setClipboard] = useState<PlayerLoadout | null>(null)
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

    // Standard modal contract — Escape closes. Ref-stabilized so a
    // non-memoized parent onClose doesn't churn the listener.
    const onCloseRef = useRef(onClose)
    useEffect(() => { onCloseRef.current = onClose }, [onClose])
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onCloseRef.current()
            // Arrow keys move between slots when nothing is focused on a
            // form control — slot picker UX without a mouse.
            const tgt = e.target as HTMLElement | null
            const isFormField = tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.tagName === "SELECT" || tgt.isContentEditable)
            if (isFormField) return
            if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault()
                setSelectedPlayer(prev => (prev === null ? 0 : (prev + 1) % 5))
            }
            if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault()
                setSelectedPlayer(prev => (prev === null ? 4 : (prev + 4) % 5))
            }
        }
        window.addEventListener("keydown", handler)
        return () => window.removeEventListener("keydown", handler)
    }, [])

    const equipOptions = [
        { id: "kevlar", name: "Kevlar Vest", price: 650, tier: "LIGHT" as const, image: EQUIPMENT.armorKevlar },
        { id: "helmet", name: "Kevlar + Helmet", price: 1000, tier: "HEAVY" as const, image: EQUIPMENT.armor },
        { id: "kit", name: "Defuse Kit", price: 400, special: "KIT", image: EQUIPMENT.defuse }
    ]

    const EXCLUDED_WEAPONS = new Set(["dualies", "nova", "mag7", "ssg08", "aug"])

    const getWeaponsInCategory = (type: WeaponType | WeaponType[]) => {
        const types = Array.isArray(type) ? type : [type]
        return Object.values(WEAPONS).filter(w => types.includes(w.type) && !EXCLUDED_WEAPONS.has(w.id))
    }

    const updateLoadout = (slotIndex: number, updates: Partial<PlayerLoadout>) => {
        setLoadouts(prev => prev.map(l => l.slotIndex === slotIndex ? { ...l, ...updates } : l))
    }

    const getLoadoutCost = (loadout: PlayerLoadout) => {
        const primary = WEAPONS[loadout.primaryWeaponId.toUpperCase()]?.price || 0
        const armor = loadout.armorTier === "HEAVY" ? 1000 : (loadout.armorTier === "LIGHT" ? 650 : 0)
        const kit = loadout.hasKit ? 400 : 0
        return primary + armor + kit
    }

    const totalCost = loadouts.reduce((sum, l) => sum + getLoadoutCost(l), 0)
    const currentLoadout = selectedPlayer !== null ? loadouts[selectedPlayer] : null

    const handleSelectWeapon = (weaponId: string, isPrimary: boolean) => {
        if (selectedPlayer === null) return

        const currentWeaponId = isPrimary ? currentLoadout?.primaryWeaponId : currentLoadout?.secondaryWeaponId

        // Unselect logic: if clicking same weapon, revert to default pistol
        if (currentWeaponId === weaponId) {
            const defaultPistol = side === "ct" ? "usp" : "glock"
            // Only revert if we aren't already on the default pistol (to avoid redundant updates)
            if (currentWeaponId !== defaultPistol) {
                updateLoadout(selectedPlayer, { [isPrimary ? "primaryWeaponId" : "secondaryWeaponId"]: defaultPistol })
            }
            return
        }

        updateLoadout(selectedPlayer, { [isPrimary ? "primaryWeaponId" : "secondaryWeaponId"]: weaponId })
    }

    const handleSelectArmor = (tier: "NONE" | "LIGHT" | "HEAVY") => {
        if (selectedPlayer === null) return
        updateLoadout(selectedPlayer, { armorTier: currentLoadout?.armorTier === tier ? "NONE" : tier })
    }

    const handleToggleKit = () => {
        if (selectedPlayer === null) return
        updateLoadout(selectedPlayer, { hasKit: !currentLoadout?.hasKit })
    }

    const handleToggleGrenade = (grenadeId: string) => {
        if (selectedPlayer === null || !currentLoadout) return
        const currentUtility = currentLoadout.utility || []
        const exists = currentUtility.includes(grenadeId)

        if (exists) {
            updateLoadout(selectedPlayer, { utility: currentUtility.filter(u => u !== grenadeId) })
        } else {
            if (currentUtility.length < 4) {
                updateLoadout(selectedPlayer, { utility: [...currentUtility, grenadeId] })
            }
        }
    }

    const handleCopy = (idx: number) => {
        const loadoutToCopy = loadouts[idx]
        setClipboard({ ...loadoutToCopy })
        setCopiedIndex(idx)
        setTimeout(() => setCopiedIndex(null), 2000) // Reset success icon after 2s
    }

    const handlePaste = (idx: number) => {
        if (!clipboard) return
        updateLoadout(idx, {
            primaryWeaponId: clipboard.primaryWeaponId,
            secondaryWeaponId: clipboard.secondaryWeaponId,
            armorTier: clipboard.armorTier,
            hasKit: clipboard.hasKit,
            utility: [...(clipboard.utility || [])]
        })
    }

    const handlePasteToAll = () => {
        if (!clipboard) return
        setLoadouts(prev => prev.map(l => ({
            ...l,
            primaryWeaponId: clipboard.primaryWeaponId,
            secondaryWeaponId: clipboard.secondaryWeaponId,
            armorTier: clipboard.armorTier,
            hasKit: clipboard.hasKit,
            utility: [...(clipboard.utility || [])]
        })))
    }

    const handleSave = () => {
        const newConfig: TacticalStrategy = {
            ...config,
            playerLoadouts: loadouts,
            primaryWeaponId: loadouts[1]?.primaryWeaponId || "usp",
            secondaryWeaponId: loadouts[1]?.secondaryWeaponId || "usp",
            armorTier: loadouts[1]?.armorTier || "NONE",
            hasKit: loadouts.some(l => l.hasKit),
            utility: []
        }

        // Save strategy name
        if (strategyName.trim()) {
            newConfig.name = strategyName.trim()
        }

        onSave(newConfig)
    }

    return (
        <div className="flex flex-col h-full max-h-[92vh] w-full max-w-[1400px] bg-[#0a0a0c] text-white rounded-[32px] border border-white/10 overflow-hidden shadow-2xl scale-[1.01] transition-all">
            <style jsx global>{`
                .custom-scrollbar [data-radix-scroll-area-viewport]::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar [data-radix-scroll-area-viewport]::-webkit-scrollbar-track {
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 3px;
                }
                .custom-scrollbar [data-radix-scroll-area-viewport]::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 3px;
                    transition: background 0.2s;
                }
                .custom-scrollbar [data-radix-scroll-area-viewport]::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.2);
                }
                /* Also for standard elements */
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: rgba(0, 0, 0, 0.2);
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 3px;
                }
            `}</style>

            {/* Header */}
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-white/5 to-transparent">
                <div className="flex items-center gap-6">
                    <div className={cn(
                        "p-4 rounded-2xl flex items-center justify-center shadow-lg",
                        side === "ct" ? "bg-blue-500/20 text-blue-400 shadow-blue-500/10" : "bg-orange-500/20 text-orange-400 shadow-orange-500/10"
                    )}>
                        {side === "ct" ? <Shield className="w-8 h-8" /> : <Sword className="w-8 h-8" />}
                    </div>
                    <div className="text-left flex-1">
                        <div className="flex items-center gap-2">
                            <input
                                value={strategyName}
                                onChange={(e) => setStrategyName(e.target.value)}
                                placeholder={`${strategyId} LOADOUT`}
                                className="bg-transparent border-none text-3xl font-normal uppercase tracking-tight leading-none text-white focus:outline-none focus:ring-0 placeholder:text-white/50 w-full"
                            />
                        </div>
                        <p className="text-muted-foreground text-[10px] font-normal uppercase tracking-widest mt-2 flex items-center gap-2">
                            <span>{strategyId} ({side.toUpperCase()})</span>
                            <span className="opacity-30">•</span>
                            <span className={cn(selectedPlayer !== null ? "text-white" : "opacity-50")}>
                                {selectedPlayer !== null ? `Editing ${playerNames[selectedPlayer]}` : "Select a player to configure"}
                            </span>
                            <span className="opacity-30">•</span>
                            <span className="text-blue-400 capitalize flex items-center gap-1">
                                <Info className="w-3 h-3" />
                                Hover player for Copy/Paste
                            </span>
                        </p>
                    </div>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close loadout editor" className="rounded-full hover:bg-white/10 h-10 w-10">
                    <X className="w-6 h-6 text-white/50" />
                </Button>
            </div>

            <div className="flex flex-1 min-h-0">
                {/* Player List (Left Sidebar) */}
                <div className="w-80 border-r border-white/5 p-5 space-y-2.5 overflow-y-auto bg-black/20 custom-scrollbar">
                    {loadouts.map((loadout, idx) => {
                        const cost = getLoadoutCost(loadout)
                        const isSelected = selectedPlayer === idx
                        const weaponName = WEAPONS[loadout.primaryWeaponId.toUpperCase()]?.name || loadout.primaryWeaponId
                        const armorLabel = loadout.armorTier === "HEAVY" ? "Helmet" : (loadout.armorTier === "LIGHT" ? "Kevlar" : "")
                        const kitLabel = loadout.hasKit && side === "ct" ? "Kit" : ""
                        const loadoutParts = [weaponName, armorLabel, kitLabel].filter(Boolean)

                        return (
                            <div
                                key={idx}
                                className={cn(
                                    "w-full p-4 rounded-3xl border transition-[border-color,background-color] duration-100 ease-out text-left group relative select-none touch-manipulation",
                                    isSelected
                                        ? (side === "ct" ? "bg-blue-500/20 border-blue-500/40" : "bg-orange-500/20 border-orange-500/40")
                                        : "bg-white/[0.02] border-white/5 hover:bg-white/5"
                                )}
                            >
                                <button
                                    onClick={() => setSelectedPlayer(idx)}
                                    className="w-full h-full flex items-center gap-4 text-left"
                                >
                                    {/* Player Image or Fallback */}
                                    <div className={cn(
                                        "w-12 h-12 rounded-lg flex items-center justify-center overflow-hidden shadow-lg",
                                        loadout.roleHint === "AWPER" ? "bg-amber-500/20" :
                                            loadout.roleHint === "IGL" ? "bg-purple-500/20" :
                                                "bg-white/10"
                                    )}>
                                        <PlayerPortrait
                                            src={playerImages[idx]}
                                            alt={playerNames[idx]}
                                            size={48}
                                            variant="card"
                                        />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-normal text-sm truncate">{playerNames[idx]}</div>
                                        <div className="text-[10px] text-white/40 truncate mt-0.5 font-medium">
                                            {loadoutParts.join(" • ") || "No Loadout"}
                                        </div>
                                    </div>
                                    {playerCash[idx] != null ? (
                                        <div className={cn("font-bold text-xs px-2 py-1 rounded-lg", playerCash[idx] - cost >= 0 ? "text-emerald-400 bg-emerald-500/10" : "text-red-400 bg-red-500/10")}>
                                            ${(playerCash[idx] - cost).toLocaleString()}
                                        </div>
                                    ) : (
                                        <div className="text-white/40 font-bold text-xs bg-white/5 px-2 py-1 rounded-lg">-${cost}</div>
                                    )}
                                </button>

                                {/* Action Overlay */}
                                <div className="absolute right-2 top-2 hidden group-hover:flex gap-1">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleCopy(idx); }}
                                        className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 transition-colors"
                                        title="Copy Loadout"
                                    >
                                        {copiedIndex === idx ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                    </button>
                                    {clipboard && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handlePaste(idx); }}
                                            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 transition-colors"
                                            title="Paste Loadout"
                                        >
                                            <ClipboardPaste className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        )
                    })}

                    <div className="pt-6 border-t border-white/5 mt-6">
                        {teamBudget != null ? (
                            <>
                                <div className="text-[10px] font-bold text-white/30 uppercase tracking-wider mb-1">Remaining Budget</div>
                                <div className={cn("text-2xl font-normal", teamBudget - totalCost < 0 ? "text-red-400" : "text-emerald-400")}>
                                    ${(teamBudget - totalCost).toLocaleString()}
                                </div>
                                <div className="text-[10px] text-white/30 mt-1">Cost: ${totalCost.toLocaleString()}</div>
                            </>
                        ) : (
                            <>
                                <div className="text-[10px] font-bold text-white/30 uppercase tracking-wider mb-1">Total Team Cost</div>
                                <div className="text-2xl font-normal text-white/50">
                                    ${totalCost.toLocaleString()}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Weapon Grid (Right Content) */}
                <ScrollArea className="flex-1 p-6 custom-scrollbar">
                    {selectedPlayer !== null && currentLoadout ? (
                        <div className="grid grid-cols-5 gap-6">
                            {/* 1. Equipment */}
                            <div className="space-y-4">
                                <h3 className="text-xs font-normal text-white/30 uppercase tracking-[0.2em] px-2 mb-4">1 Equipment</h3>
                                <div className="space-y-3">
                                    {equipOptions.map(opt => {
                                        const isSelected = opt.tier ? currentLoadout.armorTier === opt.tier : (opt.special === "KIT" ? currentLoadout.hasKit : false)
                                        if (side === "t" && opt.special === "KIT") return null

                                        return (
                                            <button
                                                key={opt.id}
                                                onClick={() => opt.tier ? handleSelectArmor(opt.tier) : (opt.special === "KIT" ? handleToggleKit() : null)}
                                                className={cn(
                                                    "w-full p-4 rounded-3xl border transition-[border-color,background-color,box-shadow,transform] duration-100 ease-out text-center relative flex flex-col items-center gap-3 overflow-hidden group select-none touch-manipulation will-change-transform active:scale-[0.98] active:duration-0",
                                                    isSelected
                                                        ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400 shadow-lg shadow-emerald-500/10"
                                                        : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10"
                                                )}
                                            >
                                                <div className="w-16 h-16 relative flex-shrink-0 flex items-center justify-center">
                                                    {opt.image && (
                                                        <Image
                                                            src={opt.image}
                                                            alt={opt.name}
                                                            fill
                                                            className="object-contain drop-shadow-2xl transition-transform duration-300 group-hover:scale-110"
                                                        />
                                                    )}
                                                </div>
                                                <div className="w-full">
                                                    <div className="font-normal text-[10px] leading-tight mb-1 truncate px-1">{opt.name.toUpperCase()}</div>
                                                    <div className="text-[10px] font-bold opacity-60">${opt.price}</div>
                                                </div>
                                                {isSelected && <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]" />}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* 2. Pistols */}
                            <div className="space-y-4">
                                <h3 className="text-xs font-normal text-white/30 uppercase tracking-[0.2em] px-2 mb-4">2 Pistols</h3>
                                <div className="space-y-3">
                                    {getWeaponsInCategory(WeaponType.PISTOL).map(w => {
                                        const isSelected = currentLoadout.secondaryWeaponId === w.id
                                        const icon = WEAPON_ICONS[w.id.toLowerCase() as keyof typeof WEAPON_ICONS]
                                        if (side === "ct" && (w.id === "glock" || w.id === "tec9")) return null
                                        if (side === "t" && (w.id === "usp" || w.id === "fiveseven")) return null

                                        return (
                                            <button
                                                key={w.id}
                                                onClick={() => handleSelectWeapon(w.id, false)}
                                                className={cn(
                                                    "w-full p-4 rounded-3xl border transition-[border-color,background-color,box-shadow,transform] duration-100 ease-out text-center relative flex flex-col items-center gap-2 overflow-hidden group select-none touch-manipulation will-change-transform active:scale-[0.98] active:duration-0",
                                                    isSelected
                                                        ? "bg-blue-500/20 border-blue-500/40 text-blue-400 shadow-lg shadow-blue-500/10"
                                                        : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10"
                                                )}
                                            >
                                                <div className="w-24 h-12 relative flex-shrink-0 flex items-center justify-center my-1">
                                                    {icon ? (
                                                        <Image
                                                            src={icon}
                                                            alt={w.name}
                                                            fill
                                                            className="object-contain drop-shadow-xl transition-transform duration-300 group-hover:scale-110 group-hover:rotate-2"
                                                        />
                                                    ) : (
                                                        <span className="text-[8px] opacity-20 font-normal">IMG</span>
                                                    )}
                                                </div>
                                                <div className="w-full">
                                                    <div className="font-normal text-[10px] leading-tight mb-1 truncate px-1">{w.name.toUpperCase()}</div>
                                                    <div className="text-[10px] font-bold opacity-60">${w.price}</div>
                                                </div>
                                                {isSelected && <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.5)]" />}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* 3. Mid-Tier */}
                            <div className="space-y-4">
                                <h3 className="text-xs font-normal text-white/30 uppercase tracking-[0.2em] px-2 mb-4">3 Mid-Tier</h3>
                                <div className="space-y-3">
                                    {getWeaponsInCategory([WeaponType.SMG, WeaponType.SHOTGUN]).map(w => {
                                        const isSelected = currentLoadout.primaryWeaponId === w.id
                                        const icon = WEAPON_ICONS[w.id.toLowerCase() as keyof typeof WEAPON_ICONS]
                                        if (side === "ct" && w.id === "mac10") return null
                                        if (side === "t" && w.id === "mp9") return null

                                        return (
                                            <button
                                                key={w.id}
                                                onClick={() => handleSelectWeapon(w.id, true)}
                                                className={cn(
                                                    "w-full p-4 rounded-3xl border transition-[border-color,background-color,box-shadow,transform] duration-100 ease-out text-center relative flex flex-col items-center gap-2 overflow-hidden group select-none touch-manipulation will-change-transform active:scale-[0.98] active:duration-0",
                                                    isSelected
                                                        ? (side === "ct" ? "bg-blue-500/20 border-blue-500/40 text-blue-400" : "bg-orange-500/20 border-orange-500/40 text-orange-400")
                                                        : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10"
                                                )}
                                            >
                                                <div className="w-24 h-12 relative flex-shrink-0 flex items-center justify-center my-1">
                                                    {icon ? (
                                                        <Image
                                                            src={icon}
                                                            alt={w.name}
                                                            fill
                                                            className="object-contain drop-shadow-xl transition-transform duration-300 group-hover:scale-110 group-hover:rotate-2"
                                                        />
                                                    ) : (
                                                        <span className="text-[8px] opacity-20 font-normal">IMG</span>
                                                    )}
                                                </div>
                                                <div className="w-full">
                                                    <div className="font-normal text-[10px] leading-tight mb-1 truncate px-1">{w.name.toUpperCase()}</div>
                                                    <div className="text-[10px] font-bold opacity-60">${w.price}</div>
                                                </div>
                                                {isSelected && <div className={cn("absolute top-3 right-3 w-2 h-2 rounded-full", side === "ct" ? "bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.5)]" : "bg-orange-400 shadow-[0_0_10px_rgba(251,146,60,0.5)]")} />}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* 4. Rifles */}
                            <div className="space-y-4">
                                <h3 className="text-xs font-normal text-white/30 uppercase tracking-[0.2em] px-2 mb-4">4 Rifles</h3>
                                <div className="space-y-3">
                                    {getWeaponsInCategory([WeaponType.RIFLE, WeaponType.SNIPER]).map(w => {
                                        const isSelected = currentLoadout.primaryWeaponId === w.id
                                        const icon = WEAPON_ICONS[w.id.toLowerCase() as keyof typeof WEAPON_ICONS]
                                        if (side === "ct" && (w.id === "ak47" || w.id === "galil" || w.id === "sg553")) return null
                                        if (side === "t" && (w.id === "m4a4" || w.id === "m4a1s" || w.id === "famas")) return null

                                        return (
                                            <button
                                                key={w.id}
                                                onClick={() => handleSelectWeapon(w.id, true)}
                                                className={cn(
                                                    "w-full p-4 rounded-3xl border transition-[border-color,background-color,box-shadow,transform] duration-100 ease-out text-center relative flex flex-col items-center gap-2 overflow-hidden group select-none touch-manipulation will-change-transform active:scale-[0.98] active:duration-0",
                                                    isSelected
                                                        ? (side === "ct" ? "bg-blue-500/20 border-blue-500/40 text-blue-400" : "bg-orange-500/20 border-orange-500/40 text-orange-400")
                                                        : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10"
                                                )}
                                            >
                                                <div className="w-24 h-12 relative flex-shrink-0 flex items-center justify-center my-1">
                                                    {icon ? (
                                                        <Image
                                                            src={icon}
                                                            alt={w.name}
                                                            fill
                                                            className="object-contain drop-shadow-xl transition-transform duration-300 group-hover:scale-110 group-hover:rotate-2"
                                                        />
                                                    ) : (
                                                        <span className="text-[8px] opacity-20 font-normal">IMG</span>
                                                    )}
                                                </div>
                                                <div className="w-full">
                                                    <div className="font-normal text-[10px] leading-tight mb-1 truncate px-1">{w.name.toUpperCase()}</div>
                                                    <div className="text-[10px] font-bold opacity-60">${w.price}</div>
                                                </div>
                                                {isSelected && <div className={cn("absolute top-3 right-3 w-2 h-2 rounded-full", side === "ct" ? "bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.5)]" : "bg-orange-400 shadow-[0_0_10px_rgba(251,146,60,0.5)]")} />}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* 5. Grenades */}
                            <div className="space-y-4">
                                <h3 className="text-xs font-normal text-white/30 uppercase tracking-[0.2em] px-2 mb-4">5 Grenades</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    {Object.entries(GRENADES).map(([id, icon]) => {
                                        const isSelected = currentLoadout.utility?.includes(id)
                                        if (side === "ct" && id === "molotov") return null
                                        const price = id === "flash" ? 200 : (id === "smoke" ? 300 : (id === "he" ? 300 : 400))

                                        return (
                                            <button
                                                key={id}
                                                onClick={() => handleToggleGrenade(id)}
                                                className={cn(
                                                    "w-full p-4 rounded-3xl border transition-[border-color,background-color,box-shadow] duration-100 ease-out text-center relative group min-h-[120px] flex flex-col justify-between select-none touch-manipulation will-change-transform active:scale-[0.98] active:duration-0",
                                                    isSelected
                                                        ? "bg-purple-500/20 border-purple-500/40 text-purple-300 shadow-lg shadow-purple-500/10"
                                                        : "bg-white/5 border-white/5 text-white/30 hover:bg-white/10"
                                                )}
                                            >
                                                <div className="w-16 h-16 mx-auto relative flex items-center justify-center mt-2">
                                                    <Image
                                                        src={icon}
                                                        alt={id}
                                                        fill
                                                        className="object-contain drop-shadow-2xl transition-transform duration-300 group-hover:scale-125"
                                                    />
                                                </div>
                                                <div className="w-full mt-2">
                                                    <div className="text-[10px] font-normal uppercase tracking-wider">{id}</div>
                                                    <div className="text-[9px] opacity-60 font-bold">${price}</div>
                                                </div>
                                                {isSelected && <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-purple-400 shadow-[0_0_10px_rgba(192,132,252,0.5)]" />}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-full text-white/30">
                            <div className="text-center">
                                <User className="w-12 h-12 mx-auto mb-4 opacity-30" />
                                <div className="text-sm font-bold">Select a player to configure their loadout</div>
                            </div>
                        </div>
                    )}
                </ScrollArea>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-white/5 bg-black/40 flex items-center justify-between">
                <div>
                    {teamBudget !== undefined && (
                        <div className="text-[10px] font-bold text-white/50">
                            Team Budget: ${teamBudget.toLocaleString()}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-4">
                    {clipboard && (
                        <Button
                            variant="outline"
                            onClick={handlePasteToAll}
                            className="rounded-2xl border-white/10 bg-white/5 hover:bg-white/10 text-white/70 font-normal text-[10px] uppercase h-9 px-4 flex items-center gap-2"
                        >
                            <ClipboardPaste className="w-3.5 h-3.5" />
                            Paste to All
                        </Button>
                    )}
                    <div className="flex gap-3 border-l border-white/10 pl-4">
                        <Button variant="ghost" onClick={onClose} className="rounded-2xl px-8 hover:bg-white/5 font-normal text-xs uppercase h-10">
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSave}
                            className={cn(
                                "rounded-2xl px-10 font-normal text-xs uppercase flex items-center gap-2 h-10",
                                side === "ct" ? "bg-blue-500 hover:bg-blue-600" : "bg-orange-500 hover:bg-orange-600"
                            )}
                        >
                            <Save className="w-4 h-4" />
                            Apply Loadouts
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}
