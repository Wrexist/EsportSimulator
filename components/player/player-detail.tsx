"use client"

import { useState, useMemo } from "react"
import dynamic from "next/dynamic"
import { PlayerSaveData } from "@/engine/save-types"
import { PlayerSpiderChart } from "@/components/ui/player-spider-chart"
import { PlayerSignatureMoments } from "@/components/player/PlayerSignatureMoments"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PlayerPortrait } from "@/components/ui/asset-images"
import { HelpTooltip, StatExplanations } from "@/components/ui/stat-tooltip"

// Three.js bundle (~150KB gzipped) is lazy-loaded so non-detail routes never
// pay for it. SSR is disabled because R3F creates a real WebGL context.
const Player3DPortrait = dynamic(
    () => import("@/components/ui/Player3DPortrait").then(m => m.Player3DPortrait),
    { ssr: false, loading: () => null },
)
import { Button } from "@/components/ui/button"
import { RenewContractModal } from "./RenewContractModal"
import { RoleTrainingModal } from "@/components/training/RoleTrainingModal"
import { TransferListingModal } from "./TransferListingModal"
import {
    Crosshair,
    Shield,
    Brain,
    Activity,
    Zap,
    Trophy,
    MousePointer2,
    Keyboard,
    Monitor,
    Award,
    Target,
    Heart,
    DollarSign,
    TrendingUp,
    Star,
    Swords,
    Circle,
    Headphones,
    Armchair,
    Cpu
} from "lucide-react"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { TalentTree } from "../staff/TalentTree"
import { PLAYER_TALENT_TREE } from "@/engine/talent-trees"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { getDisplayPlayerTier, getTierStyle, TierLevel } from "@/engine/tier-system"
import type { EquipmentType } from "@/engine/equipment-manager"
import { cn } from "@/lib/utils"
import { clutchRateFraction, formatRole } from "@/lib/utils-extended"
import { motion } from "framer-motion"
import { resolvePlayerRole } from "@/engine/role-determination"

import { CountryFlag } from "@/components/ui/CountryFlag"
import { getPrestigeLabel } from "@/engine/prestige-system"
import { PlayerMatchHistory } from "./PlayerMatchHistory"
import { WeaponMasteryManager, getMasteryInfo, WEAPON_DISPLAY, WeaponType } from "@/engine/weapon-mastery-system"
import { WeaponTrainingModal } from "@/components/training/WeaponTrainingModal"
import { getFPLTierColor, getFPLTierName } from "@/types/fpl"
import { toast } from "@/lib/toast"
import { NegotiationModal } from "@/components/transfer/NegotiationModal"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface PlayerDetailProps {
    player: PlayerSaveData
}

export function PlayerDetail({ player }: PlayerDetailProps) {
    const { contracts, listPlayerForTransfer, unlistPlayerForTransfer, getPlayerTeam, startRoleTraining, cancelRoleTraining, teams, playerTeamId, currentWeek, unlockPlayerTalent, fplData } = useGameStore(useShallow(state => ({
        contracts: state.contracts,
        listPlayerForTransfer: state.listPlayerForTransfer,
        unlistPlayerForTransfer: state.unlistPlayerForTransfer,
        getPlayerTeam: state.getPlayerTeam,
        startRoleTraining: state.startRoleTraining,
        cancelRoleTraining: state.cancelRoleTraining,
        teams: state.teams,
        playerTeamId: state.playerTeamId,
        currentWeek: state.currentWeek,
        unlockPlayerTalent: state.unlockPlayerTalent,
        fplData: state.fplData,
    })))
    const [trainingModalOpen, setTrainingModalOpen] = useState(false)
    const [transferModalOpen, setTransferModalOpen] = useState(false)
    const [weaponModalOpen, setWeaponModalOpen] = useState(false)
    const [selectedWeaponForModal, setSelectedWeaponForModal] = useState<WeaponType>("RIFLE")
    const [activeTab, setActiveTab] = useState("technical")
    const [negotiationOpen, setNegotiationOpen] = useState(false)

    // FPL Stats
    const fplStats = fplData?.playerStats?.[player.id]
    const fplStanding = fplData?.fplStandings?.find(s => s.playerId === player.id)
        || fplData?.fplCStandings?.find(s => s.playerId === player.id)
    const fplChampionships = fplData?.seasonHistory?.filter(s => s.champion === player.id).length || 0

    const playerTeam = getPlayerTeam()
    const activeRoleTraining = playerTeam?.activeRoleTraining?.find(
        (t: any) => t.playerId === player.id
    )
    // Check if player is in user's roster (active or bench) OR academy (if academy exists in types, usually just rosterIds)
    const isOwnPlayer = playerTeam?.rosterIds?.includes(player.id) || false

    // Get player evaluation and tier
    const evaluation = evaluatePlayer(player)
    const viewedPlayerTeam = teams.find(t => t.rosterIds?.includes(player.id))
    const isFreeAgent = !viewedPlayerTeam && !isOwnPlayer
    const playerTier = getDisplayPlayerTier(evaluation.overallRating, viewedPlayerTeam?.tier as TierLevel)
    const tierStyle = getTierStyle(playerTier)

    // Contract Status
    const contract = contracts.find(c => c.playerId === player.id)
    const weeksRemaining = contract ? Math.max(0, contract.endWeek - currentWeek) : 0
    const canRenew = weeksRemaining < 52

    // Stats for new spider chart. Memoized so the child PlayerSpiderChart
    // receives a stable prop reference; otherwise every tab toggle / parent
    // re-render rebuilt the object and busted child memoization downstream.
    // firepower/entrying/trading/opening aren't on PlayerSaveData — they're
    // pure derivations from base stats, so always compute them.
    const spiderStats = useMemo(() => ({
        firepower: Math.round((player.skill + player.rifle) / 2),
        entrying: Math.round((player.skill + player.reaction) / 2),
        trading: Math.round((player.teamwork + player.tactic) / 2),
        opening: Math.round((player.skill + player.creativity) / 2),
        clutching: player.clutch ?? 50,
        sniping: player.awp ?? 50,
        utility: player.grenades ?? 50,
    }), [player])

    const getRoleBadgeColor = (role: string) => {
        switch (role?.toUpperCase()) {
            case "AWPER": return "bg-red-500/20 text-red-400 border-red-500/30"
            case "RIFLER": return "bg-blue-500/20 text-blue-400 border-blue-500/30"
            case "IGL": return "bg-amber-500/20 text-amber-400 border-amber-500/30"
            case "SUPPORT": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
            case "ENTRY": return "bg-orange-500/20 text-orange-400 border-orange-500/30"
            default: return "bg-gray-500/20 text-gray-400 border-gray-500/30"
        }
    }

    const getRoleIcon = (role: string) => {
        switch (role?.toUpperCase()) {
            case "AWPER": return <Target size={14} />
            case "IGL": return <Brain size={14} />
            case "SUPPORT": return <Heart size={14} />
            case "ENTRY": return <Zap size={14} />
            default: return <Crosshair size={14} />
        }
    }

    return (
        <div className="space-y-6">
            {/* Header Profile Card - Redesigned & Compact */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-panel p-6 border-white/5 relative overflow-hidden"
            >
                {/* Subtle Background Accent */}
                <div className={cn("absolute -top-12 -right-12 w-48 h-48 blur-[100px] opacity-20 pointer-events-none", tierStyle.color.replace('text-', 'bg-'))} />

                <div className="flex flex-col md:flex-row gap-6 items-start relative z-10">
                    {/* Portrait Section — use real portrait when available; 3D portrait
                        is only shown for players without a team-specific portrait image. */}
                    <div className="flex-shrink-0 group">
                        <div className="w-28 h-28 rounded-xl overflow-hidden bg-white/5 relative shadow-2xl">
                            {player.portraitPath && player.portraitPath !== '/player_placeholder.webp' ? (
                                <div className="absolute inset-0">
                                    <PlayerPortrait
                                        src={player.portraitPath}
                                        alt={player.nickname}
                                        size={112}
                                        variant="hero"
                                    />
                                </div>
                            ) : (
                                <div className="absolute inset-0">
                                    <Player3DPortrait
                                        seed={player.id}
                                        size={112}
                                    />
                                </div>
                            )}

                            {/* Nationality Flag Over Portrait corner */}
                            <div className="absolute bottom-1 right-1 z-10">
                                <CountryFlag country={player.nationality} className="scale-75 origin-bottom-right drop-shadow-md" />
                            </div>
                        </div>
                    </div>

                    {/* Main Info Column */}
                    <div className="flex-1 min-w-0 w-full">
                        {/* Status Row */}
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                            <Badge variant="outline" className="text-[10px] border-primary/20 text-primary uppercase tracking-widest px-2 py-0.5 bg-primary/5 font-normal">
                                <Trophy size={10} className="mr-1.5" />
                                {getPrestigeLabel(player.prestigeScore || 0)}
                            </Badge>
                            <Badge className={cn("text-[10px] uppercase font-normal px-2 py-0.5 shadow-sm", tierStyle.bgColor, tierStyle.borderColor, tierStyle.color)}>
                                {tierStyle.label}
                            </Badge>

                            {/* Signature Weapon Badge */}
                            {player.weaponMastery && Object.values(player.weaponMastery).some(w => {
                                const xp = typeof w === 'number' ? w : w?.xp || 0
                                return getMasteryInfo(xp).isMaster
                            }) && (
                                    <Badge variant="outline" className="text-[10px] border-yellow-500/30 text-yellow-400 uppercase tracking-widest px-2 py-0.5 bg-yellow-500/5 font-normal flex items-center gap-1">
                                        <Star size={8} className="fill-current" />
                                        WEAPON MASTER
                                    </Badge>
                                )}
                        </div>

                        {/* Name & Rating Area */}
                        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                            <div>
                                <h2 className="text-4xl font-normal text-white tracking-tighter leading-none mb-1">
                                    {player.nickname}
                                </h2>
                                <div className="flex items-center gap-2 text-sm text-neutral-400 font-medium">
                                    <span className="text-neutral-300">
                                        {player.name}
                                    </span>
                                    <span>•</span>
                                    <span>{player.age} yrs</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-4 py-2 hover:bg-white/[0.08] transition-colors relative">
                                <div className="text-right pr-4 border-r border-white/10">
                                    <div className="text-sm font-normal text-white/40 uppercase tracking-widest leading-none mb-1">LVL</div>
                                    <div className="text-2xl font-normal text-white leading-none">{player.level || 1}</div>
                                </div>
                                <div className="text-right">
                                    <div className={cn(
                                        "text-4xl font-normal leading-none",
                                        evaluation.overallRating >= 80 ? "text-emerald-400" :
                                            evaluation.overallRating >= 70 ? "text-blue-400" :
                                                evaluation.overallRating >= 60 ? "text-amber-400" : "text-white/50"
                                    )}>
                                        {evaluation.overallRating}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-normal mt-1">Overall</div>
                                </div>
                            </div>
                        </div>

                        {/* XP + Role Training Bars */}
                        <div className={cn("mt-4 flex gap-4", activeRoleTraining ? "max-w-2xl" : "max-w-sm")}>
                            {/* XP Bar */}
                            <div className="flex-1 space-y-1.5">
                                <div className="flex justify-between text-[9px] text-white/40 uppercase font-bold tracking-wider">
                                    <span>XP Progress</span>
                                    <span className="text-white/60">{Math.floor(player.xp || 0)} <span className="text-white/20">/</span> {player.xpToNextLevel || 1000}</span>
                                </div>
                                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${Math.min(100, ((player.xp || 0) / (player.xpToNextLevel || 1000)) * 100)}%` }}
                                        className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 shadow-[0_0_8px_rgba(168,85,247,0.4)]"
                                    />
                                </div>
                            </div>

                            {/* Role Training Progress */}
                            {activeRoleTraining && (
                                <TooltipProvider>
                                    <Tooltip delayDuration={0}>
                                        <TooltipTrigger asChild>
                                            <div className="flex-1 space-y-1.5 cursor-help">
                                                <div className="flex justify-between text-[9px] text-purple-400/70 uppercase font-bold tracking-wider">
                                                    <span>Role Training: {activeRoleTraining.targetRole}</span>
                                                    <span className="text-purple-300/60">{activeRoleTraining.weeksCompleted} <span className="text-white/20">/</span> {activeRoleTraining.totalWeeks} wks</span>
                                                </div>
                                                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden border border-purple-500/10">
                                                    <motion.div
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${(activeRoleTraining.weeksCompleted / activeRoleTraining.totalWeeks) * 100}%` }}
                                                        className="h-full bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500 shadow-[0_0_8px_rgba(168,85,247,0.4)]"
                                                    />
                                                </div>
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom" className="bg-black/95 border-purple-500/20 backdrop-blur-xl text-xs space-y-1 p-3">
                                            <p className="font-bold text-purple-400">Training: {activeRoleTraining.targetRole}</p>
                                            <p className="text-white/60">{activeRoleTraining.totalWeeks - activeRoleTraining.weeksCompleted} weeks remaining</p>
                                            <p className="text-white/60">Cost: $5,000/week</p>
                                            <p className="text-white/60">Energy drain: -10/week</p>
                                            <p className="text-white/40 text-[10px]">Completes week {activeRoleTraining.startWeek + activeRoleTraining.totalWeeks}</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            )}
                        </div>

                        {/* Role Badges */}
                        <div className="flex flex-wrap gap-2 mt-5">
                            {(() => {
                                const role = resolvePlayerRole(player)
                                return (
                                    <Badge variant="outline" className={cn("text-[10px] font-normal px-2.5 py-1 border-white/10 bg-white/5", getRoleBadgeColor(role))}>
                                        {getRoleIcon(role)}
                                        <span className="ml-2 uppercase tracking-wider">{role}</span>
                                    </Badge>
                                )
                            })()}
                            {player.secondaryRole && (
                                <Badge variant="outline" className={cn("text-[10px] font-normal px-2.5 py-1 border-white/10 bg-white/5", getRoleBadgeColor(player.secondaryRole))}>
                                    {getRoleIcon(player.secondaryRole)}
                                    <span className="ml-2 uppercase tracking-wider">{formatRole(player.secondaryRole)}</span>
                                </Badge>
                            )}

                            {/* Personality Traits */}
                            {player.traits && player.traits.length > 0 && player.traits.map((trait: string) => {
                                const styles: Record<string, { label: string, color: string }> = {
                                    AGGRESSIVE: { label: "Aggressive", color: "text-red-400 bg-red-500/10 border-red-500/20" },
                                    PASSIVE: { label: "Passive", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
                                    CLUTCHER: { label: "Clutcher", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
                                    TRADE_FRAGGER: { label: "Trade Fragger", color: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
                                    PRODIGY: { label: "Prodigy", color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
                                    GRINDER: { label: "Grinder", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
                                    NATURAL: { label: "Natural", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20" },
                                    CLUTCH_GENE: { label: "Clutch Gene", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
                                    TEAM_PLAYER: { label: "Team Player", color: "text-green-400 bg-green-500/10 border-green-500/20" },
                                    LONE_WOLF: { label: "Lone Wolf", color: "text-rose-400 bg-rose-500/10 border-rose-500/20" },
                                }
                                const s = styles[trait] || { label: trait, color: "text-white/40 bg-white/5 border-white/10" }
                                return (
                                    <Badge key={trait} className={cn("text-[9px] border font-normal", s.color)}>
                                        {s.label}
                                    </Badge>
                                )
                            })}

                            {/* Weapon Mastery Badges */}
                            {(() => {
                                const mastery = WeaponMasteryManager.getPlayerMastery(player)
                                const badges = (Object.keys(mastery) as WeaponType[])
                                    .map(weapon => {
                                        const xp = mastery[weapon]
                                        const info = getMasteryInfo(xp)
                                        const display = WEAPON_DISPLAY[weapon]
                                        return { weapon, info, display }
                                    })
                                    .filter(b => b.info.level !== "NOVICE") // Only show if at least Competent
                                    .sort((a, b) => b.info.xp - a.info.xp) // Sort by XP

                                return badges.map(b => (
                                    <Badge
                                        key={b.weapon}
                                        variant="outline"
                                        className={cn(
                                            "text-[10px] font-normal px-2.5 py-1 border-white/10 bg-white/5",
                                            b.display.color
                                        )}
                                    >
                                        {b.display.icon === "Target" && <Target size={14} />}
                                        {b.display.icon === "Crosshair" && <Crosshair size={14} />}
                                        {b.display.icon === "Zap" && <Zap size={14} />}
                                        {b.display.icon === "Circle" && <Circle size={14} />}
                                        <span className="ml-2 uppercase tracking-wider">{b.display.name} {b.info.name}</span>
                                    </Badge>
                                ))
                            })()}
                        </div>
                    </div>
                </div>

                <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="p-3 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/[0.04] transition-colors">
                        <div className="flex items-center gap-2 text-muted-foreground text-[10px] uppercase font-normal tracking-widest mb-1.5 opacity-60">
                            <TrendingUp size={10} /> Potential <HelpTooltip content={StatExplanations.potential} size={11} />
                        </div>
                        <div className="text-xl font-normal text-white">{player.potential || evaluation.futureValue}</div>
                    </div>
                    <div className="p-3 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/[0.04] transition-colors">
                        <div className="flex items-center gap-2 text-muted-foreground text-[10px] uppercase font-normal tracking-widest mb-1.5 opacity-60">
                            <DollarSign size={10} /> Value
                        </div>
                        <div className="text-xl font-normal text-emerald-400">
                            ${(evaluation.transferValue / 1000).toFixed(0)}k
                        </div>
                    </div>
                    <div className="p-3 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/[0.04] transition-colors">
                        <div className="flex items-center gap-2 text-muted-foreground text-[10px] uppercase font-normal tracking-widest mb-1.5 opacity-60">
                            <Activity size={10} /> Form <HelpTooltip content={StatExplanations.form} size={11} />
                        </div>
                        <div className={cn(
                            "text-xl font-normal",
                            player.form > 80 ? "text-emerald-400" : player.form > 50 ? "text-amber-400" : "text-red-400"
                        )}>
                            {Math.round(player.form)}%
                        </div>
                    </div>
                    <div className="p-3 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/[0.04] transition-colors relative">
                        <div className="flex items-center gap-2 text-muted-foreground text-[10px] uppercase font-normal tracking-widest mb-1.5 opacity-60">
                            <Zap size={10} /> Energy <HelpTooltip content={StatExplanations.energy} size={11} />
                        </div>
                        <div className={cn(
                            "text-xl font-normal",
                            (player.energy ?? 100) > 60 ? "text-cyan-400" : (player.energy ?? 100) > 30 ? "text-amber-400" : "text-red-400"
                        )}>
                            {Math.round(player.energy ?? 100)}%
                        </div>
                        {(player.energy ?? 100) < 20 && (
                            <Badge className="absolute -top-1 -right-1 text-[8px] bg-red-500/80 border-0 px-1.5">
                                EXHAUSTED
                            </Badge>
                        )}
                    </div>
                    <div className="p-3 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/[0.04] transition-colors">
                        <div className="flex items-center gap-2 text-muted-foreground text-[10px] uppercase font-normal tracking-widest mb-1.5 opacity-60">
                            <Heart size={10} /> Morale
                        </div>
                        <div className={cn(
                            "text-xl font-normal",
                            player.morale > 80 ? "text-emerald-400" : player.morale > 50 ? "text-amber-400" : "text-red-400"
                        )}>
                            {Math.round(player.morale)}%
                        </div>
                    </div>
                </div>

                {/* Contract Bar */}
                <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-primary/5 rounded-2xl border border-primary/10">
                    <div className="flex items-center gap-6">
                        <div className="flex flex-col">
                            <span className="text-[9px] text-primary/60 font-normal uppercase tracking-widest mb-0.5">Salary</span>
                            <span className="text-lg font-normal text-white leading-none">
                                ${contract?.salaryPerWeek.toLocaleString() ?? "0"}<span className="text-[10px] text-muted-foreground font-medium">/wk</span>
                            </span>
                        </div>
                        <div className="w-px h-6 bg-primary/10" />
                        <div className="flex flex-col">
                            <span className="text-[9px] text-primary/60 font-normal uppercase tracking-widest mb-0.5">Expiry</span>
                            <span className="text-lg font-normal text-white leading-none">
                                {contract
                                    ? Math.max(0, (contract.endWeek - currentWeek)) + " Weeks"
                                    : "N/A"
                                }
                            </span>
                        </div>
                    </div>

                    <div className="flex gap-2 w-full sm:w-auto">
                        {isOwnPlayer && (
                            activeRoleTraining ? (
                                <Button
                                    variant="outline"
                                    className="h-9 px-4 text-xs font-normal uppercase tracking-wider border-red-500/30 text-red-400 hover:bg-red-500/20 hover:border-red-500/50 flex-1 sm:flex-none"
                                    onClick={() => {
                                        cancelRoleTraining(player.id)
                                        toast.success("Role training cancelled")
                                    }}
                                >
                                    <Swords size={14} className="mr-2" />
                                    Cancel Training
                                </Button>
                            ) : (
                                <Button
                                    variant="outline"
                                    className="h-9 px-4 text-xs font-normal uppercase tracking-wider border-white/10 hover:bg-purple-500/20 hover:text-purple-400 hover:border-purple-500/50 flex-1 sm:flex-none"
                                    onClick={() => setTrainingModalOpen(true)}
                                >
                                    <Target size={14} className="mr-2" />
                                    Train
                                </Button>
                            )
                        )}
                        {isOwnPlayer && (
                            <RenewContractModal
                                player={player}
                                currentSalary={contract?.salaryPerWeek ?? 0}
                                currentEndWeek={contract?.endWeek ?? 0}
                                currentWeek={currentWeek}
                                onConfirm={() => useGameStore.getState().renewContract(player.id)}
                                trigger={
                                    <Button
                                        disabled={!canRenew}
                                        variant="outline"
                                        className={cn(
                                            "h-9 px-4 text-xs font-normal uppercase tracking-wider flex-1 sm:flex-none",
                                            canRenew
                                                ? "border-blue-500/50 text-blue-400 hover:bg-blue-500 hover:text-white"
                                                : "opacity-50 border-white/10 text-white/40"
                                        )}
                                    >
                                        Renew
                                    </Button>
                                }
                            />
                        )}

                        {isOwnPlayer && (
                            <Button
                                variant={player.forSale ? "destructive" : "outline"}
                                className={cn(
                                    "h-9 px-4 text-xs font-normal uppercase tracking-wider flex-1 sm:flex-none",
                                    player.forSale
                                        ? "bg-red-500 hover:bg-red-600 text-white border-transparent"
                                        : "bg-transparent text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                                )}
                                onClick={() => setTransferModalOpen(true)}
                            >
                                {player.forSale ? "Unlist" : "Sell"}
                            </Button>
                        )}

                        {isFreeAgent && (
                            <Button
                                variant="outline"
                                className="h-9 px-4 text-xs font-normal uppercase tracking-wider flex-1 sm:flex-none border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                                onClick={() => setNegotiationOpen(true)}
                            >
                                Offer Contract
                            </Button>
                        )}

                    </div>
                </div>
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Spider Chart */}
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                    className="glass-panel p-6 border-white/5"
                >
                    <h3 className="text-sm font-normal uppercase tracking-widest text-white flex items-center gap-2 mb-4">
                        <Target size={16} className="text-primary" /> Skill Breakdown
                    </h3>
                    <PlayerSpiderChart
                        stats={spiderStats}
                        size="md"
                        showLabels={true}
                        animated={true}
                    />
                </motion.div>

                {/* Center & Right Columns: Detailed Stats */}
                <div className="lg:col-span-2 space-y-6">
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsList className="grid w-full grid-cols-4 bg-white/5 p-1 rounded-xl">
                            <TabsTrigger value="technical" className="rounded-lg text-xs font-bold cursor-pointer">Technical</TabsTrigger>
                            <TabsTrigger value="mental" className="rounded-lg text-xs font-bold cursor-pointer">Mental</TabsTrigger>
                            <TabsTrigger value="progression" className="rounded-lg text-xs font-bold cursor-pointer">Skills</TabsTrigger>
                            <TabsTrigger value="career" className="rounded-lg text-xs font-bold cursor-pointer">Career</TabsTrigger>
                        </TabsList>

                        <TabsContent value="technical" className="space-y-4 mt-4">
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="glass-panel p-6 border-white/5"
                            >
                                <div className="grid grid-cols-3 gap-6">
                                    {[
                                        { label: "Aim", value: player.skill, icon: <Crosshair size={16} /> },
                                        { label: "AWP", value: player.awp, icon: <Target size={16} /> },
                                        { label: "Rifle", value: player.rifle, icon: <Crosshair size={16} /> },
                                        { label: "Pistol", value: player.pistol, icon: <Crosshair size={16} /> },
                                        { label: "Grenades", value: player.grenades, icon: <Zap size={16} /> },
                                        { label: "Creativity", value: player.creativity, icon: <Brain size={16} /> },
                                    ].map(stat => (
                                        <div key={stat.label} className="text-center p-4 bg-white/5 rounded-xl">
                                            <div className="flex items-center justify-center gap-2 text-muted-foreground text-xs mb-2">
                                                {stat.icon} {stat.label}
                                            </div>
                                            <div className={cn(
                                                "text-3xl font-normal",
                                                stat.value >= 80 ? "text-emerald-400" :
                                                    stat.value >= 60 ? "text-blue-400" :
                                                        stat.value >= 40 ? "text-amber-400" : "text-red-400"
                                            )}>
                                                {stat.value}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>

                            {/* Equipment Section */}
                            <div className="glass-panel p-6 border-white/5">
                                <h4 className="text-xs font-normal uppercase tracking-widest text-muted-foreground mb-4">Equipment</h4>
                                {playerTeam?.equipment && playerTeam?.equipment?.length > 0 ? (
                                    <div className="grid grid-cols-3 gap-4">
                                        {playerTeam?.equipment?.map((item: any) => {
                                            const iconMap: Record<string, React.ReactNode> = {
                                                MOUSE: <MousePointer2 size={20} />,
                                                KEYBOARD: <Keyboard size={20} />,
                                                MONITOR: <Monitor size={20} />,
                                                HEADSET: <Headphones size={20} />,
                                                CHAIR: <Armchair size={20} />,
                                                PC: <Cpu size={20} />,
                                            }
                                            return (
                                                <div key={item.id} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                                                    <div className="text-primary">{iconMap[item.type as EquipmentType] ?? <Cpu size={20} />}</div>
                                                    <div>
                                                        <div className="font-bold text-sm text-white">{item.name}</div>
                                                        <div className="text-xs text-emerald-400">+{item.bonus.value} {item.bonus.stat}</div>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground">No equipment purchased yet. Visit the Pro Shop to upgrade your setup.</p>
                                )}
                            </div>
                        </TabsContent>

                        <TabsContent value="mental" className="space-y-4 mt-4">
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="glass-panel p-6 border-white/5"
                            >
                                <div className="grid grid-cols-3 gap-6">
                                    {[
                                        { label: "Tactics", value: player.tactic, icon: <Brain size={16} /> },
                                        { label: "Leadership", value: player.leader, icon: <Trophy size={16} /> },
                                        { label: "Teamwork", value: player.teamwork, icon: <Shield size={16} /> },
                                        { label: "Clutch", value: player.clutch, icon: <Zap size={16} /> },
                                        { label: "Stress Res.", value: player.stressResistance, icon: <Activity size={16} /> },
                                        { label: "Loyalty", value: player.loyalty, icon: <Heart size={16} /> },
                                    ].map(stat => (
                                        <div key={stat.label} className="text-center p-4 bg-white/5 rounded-xl">
                                            <div className="flex items-center justify-center gap-2 text-muted-foreground text-xs mb-2">
                                                {stat.icon} {stat.label}
                                            </div>
                                            <div className={cn(
                                                "text-3xl font-normal",
                                                stat.value >= 80 ? "text-emerald-400" :
                                                    stat.value >= 60 ? "text-blue-400" :
                                                        stat.value >= 40 ? "text-amber-400" : "text-red-400"
                                            )}>
                                                {stat.value}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>

                            {/* Physical Stats */}
                            <div className="glass-panel p-6 border-white/5">
                                <h4 className="text-xs font-normal uppercase tracking-widest text-muted-foreground mb-4">Physical</h4>
                                <div className="grid grid-cols-3 gap-4">
                                    {[
                                        { label: "Reaction", value: player.reaction },
                                        { label: "Health", value: player.health },
                                        { label: "Vision", value: player.eyesight },
                                    ].map(stat => (
                                        <div key={stat.label} className="p-3 bg-white/5 rounded-xl">
                                            <div className="text-xs text-muted-foreground mb-1">{stat.label}</div>
                                            <div className="text-xl font-normal text-white">{stat.value}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="progression" className="mt-4">
                            <div className="glass-panel p-6 border-white/5 flex flex-col gap-6">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-normal text-white flex items-center gap-2">
                                        <Crosshair size={18} className="text-primary" />
                                        Weapon Mastery
                                    </h3>
                                    <Badge variant="outline" className="bg-primary/10 border-primary/20 text-primary">
                                        NEW SYSTEM
                                    </Badge>
                                </div>

                                {player.weaponMastery && Object.keys(player.weaponMastery).length > 0 ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {Object.entries(player.weaponMastery).map(([weapon, data]) => {
                                            // Handle both simple number and complex object formats
                                            const xp = typeof data === 'number' ? data : data?.xp || 0
                                            const masteryInfo = getMasteryInfo(xp)
                                            const isMaster = masteryInfo.isMaster
                                            const levelNum = ["NOVICE", "COMPETENT", "SKILLED", "EXPERT", "MASTER"].indexOf(masteryInfo.level) + 1

                                            return (
                                                <div
                                                    key={weapon}
                                                    className="bg-black/20 p-4 rounded-xl border border-white/5 relative overflow-hidden group cursor-pointer hover:bg-white/5 transition-colors"
                                                    onClick={() => {
                                                        setSelectedWeaponForModal(weapon as WeaponType)
                                                        setWeaponModalOpen(true)
                                                    }}
                                                >
                                                    {/* Signature Glow */}
                                                    {isMaster && (
                                                        <div className="absolute top-0 right-0 p-2">
                                                            <Star size={14} className="text-yellow-400 fill-yellow-400 animate-pulse" />
                                                        </div>
                                                    )}

                                                    <div className="flex justify-between items-center mb-2 z-10 relative">
                                                        <div className="font-bold text-white flex items-center gap-2">
                                                            {weapon}
                                                            {isMaster && <span className="text-[10px] text-yellow-400 font-normal uppercase tracking-widest bg-yellow-400/10 px-2 py-0.5 rounded">Signature</span>}
                                                        </div>
                                                        <div className="text-xs font-mono text-muted-foreground">{masteryInfo.name}</div>
                                                    </div>

                                                    <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden mb-2">
                                                        <div
                                                            className={cn("h-full transition-all duration-500", isMaster ? "bg-gradient-to-r from-yellow-500 to-amber-300" : "bg-primary")}
                                                            style={{ width: `${masteryInfo.progress}%` }}
                                                        />
                                                    </div>

                                                    <div className="flex justify-between text-[10px] text-muted-foreground">
                                                        <span>{xp} XP</span>
                                                        <span>{masteryInfo.nextLevel ? `Next: ${masteryInfo.xpToNext} XP` : "MAXED"}</span>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                ) : (
                                    <div className="text-center py-8 text-muted-foreground bg-black/20 rounded-xl border border-dashed border-white/10">
                                        <Crosshair size={32} className="mx-auto mb-2 opacity-20" />
                                        <p>No weapon data tracked yet.</p>
                                        <p className="text-xs mt-1">Play matches to earn Weapon XP.</p>
                                    </div>
                                )}
                            </div>

                            <div className="glass-panel p-6 border-white/5 space-y-6">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <h3 className="text-xl font-normal text-white flex items-center gap-2">
                                            <Brain className="text-purple-400" /> Player Talents
                                        </h3>
                                        <p className="text-xs text-white/40 uppercase tracking-widest font-bold mt-1">Customize {player.nickname}'s playstyle</p>
                                    </div>
                                    <div className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-full border border-white/10">
                                        <Star className="text-amber-400 fill-amber-400" size={16} />
                                        <span className="font-bold text-white">{player.talentPoints || 0} Points Available</span>
                                    </div>
                                </div>

                                <div className="bg-black/40 border border-white/5 rounded-2xl overflow-hidden min-h-[400px] relative">
                                    <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10 pointer-events-none" />
                                    <TalentTree
                                        nodes={PLAYER_TALENT_TREE}
                                        unlockedIds={(player as any).unlockedTalentIds || []}
                                        availablePoints={(player as any).talentPoints || 0}
                                        onUnlock={(talentId) => unlockPlayerTalent(player.id, talentId)}
                                    />
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="career" className="space-y-4 mt-4">
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="glass-panel p-6 border-white/5"
                            >
                                <h4 className="text-sm font-normal uppercase tracking-widest text-white mb-6">Career Statistics</h4>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                    <div className="text-center p-4 bg-white/5 rounded-xl">
                                        <div className="text-xs text-muted-foreground mb-1">Matches</div>
                                        <div className="text-3xl font-normal text-white">{player.matchesPlayed || 0}</div>
                                    </div>
                                    <div className="text-center p-4 bg-white/5 rounded-xl">
                                        <div className="text-xs text-muted-foreground mb-1">Rounds</div>
                                        <div className="text-3xl font-normal text-white">{player.roundsPlayed || 0}</div>
                                    </div>
                                    <div className="text-center p-4 bg-white/5 rounded-xl">
                                        <div className="text-xs text-muted-foreground mb-1">Avg Rating</div>
                                        <div className="text-3xl font-normal text-primary">{player.avgRating?.toFixed(2) || "0.00"}</div>
                                    </div>
                                    <div className="text-center p-4 bg-white/5 rounded-xl">
                                        <div className="text-xs text-muted-foreground mb-1">Clutch Rate</div>
                                        <div className="text-3xl font-normal text-amber-400">
                                            {(clutchRateFraction(player.clutchSuccessRate) * 100).toFixed(1)}%
                                        </div>
                                    </div>
                                </div>
                            </motion.div>

                            {/* FPL Rankings */}
                            {fplStats && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.1 }}
                                    className="glass-panel p-6 border-white/5"
                                >
                                    <div className="flex items-center justify-between mb-6">
                                        <h4 className="text-sm font-normal uppercase tracking-widest text-white flex items-center gap-2">
                                            <Trophy size={16} className="text-amber-400" /> FPL Rankings
                                        </h4>
                                        <Badge className={cn("text-xs font-normal px-3 py-1", getFPLTierColor(fplStats.fplTier))}>
                                            {getFPLTierName(fplStats.fplTier)}
                                        </Badge>
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                        <div className="text-center p-4 bg-gradient-to-b from-amber-500/10 to-transparent rounded-xl border border-amber-500/20">
                                            <div className="text-xs text-amber-400/80 mb-1">Global Rank</div>
                                            <div className="text-3xl font-normal text-amber-400">#{fplStats.fplRank || '-'}</div>
                                        </div>
                                        <div className="text-center p-4 bg-white/5 rounded-xl">
                                            <div className="text-xs text-muted-foreground mb-1">ELO</div>
                                            <div className="text-2xl font-normal text-white">{Math.round(fplStats.fplElo)}</div>
                                        </div>
                                        <div className="text-center p-4 bg-white/5 rounded-xl">
                                            <div className="text-xs text-muted-foreground mb-1">W / L</div>
                                            <div className="text-2xl font-normal">
                                                <span className="text-emerald-400">{fplStats.wins}</span>
                                                <span className="text-white/30 mx-1">/</span>
                                                <span className="text-red-400">{fplStats.losses}</span>
                                            </div>
                                        </div>
                                        <div className="text-center p-4 bg-white/5 rounded-xl">
                                            <div className="text-xs text-muted-foreground mb-1">FPL Rating</div>
                                            <div className="text-2xl font-normal text-primary">{fplStats.avgRating?.toFixed(2) || "1.00"}</div>
                                        </div>
                                        <div className="text-center p-4 bg-white/5 rounded-xl relative">
                                            <div className="text-xs text-muted-foreground mb-1">MVPs</div>
                                            <div className="text-2xl font-normal text-purple-400">{fplStats.mvpCount}</div>
                                        </div>
                                    </div>

                                    {/* FPL Championships */}
                                    {fplChampionships > 0 && (
                                        <div className="mt-4 p-4 bg-gradient-to-r from-amber-500/10 via-yellow-500/10 to-amber-500/10 rounded-xl border border-amber-500/30 flex items-center gap-4">
                                            <div className="flex items-center gap-2">
                                                <Trophy size={24} className="text-amber-400 fill-amber-400/20" />
                                                <div>
                                                    <div className="text-lg font-normal text-amber-400">
                                                        {fplChampionships}x FPL Champion
                                                    </div>
                                                    <div className="text-xs text-amber-400/60">
                                                        Season winner{fplChampionships > 1 ? 's' : ''}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* League Standing */}
                                    {fplStanding && (
                                        <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
                                            <span>League Position: <span className="text-white font-normal">#{fplStanding.rank}</span></span>
                                            <span>•</span>
                                            <span>Season Points: <span className="text-white font-normal">{fplStanding.points}</span></span>
                                            {fplStanding.isInPromotionZone && (
                                                <>
                                                    <span>•</span>
                                                    <Badge className="text-[10px] bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                                                        PROMOTION ZONE
                                                    </Badge>
                                                </>
                                            )}
                                            {fplStanding.isInRelegationZone && (
                                                <>
                                                    <span>•</span>
                                                    <Badge className="text-[10px] bg-red-500/20 text-red-400 border-red-500/30">
                                                        RELEGATION ZONE
                                                    </Badge>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </motion.div>
                            )}

                            {/* Match History */}
                            <div className="glass-panel p-6 border-white/5">
                                <h4 className="text-sm font-normal uppercase tracking-widest text-white mb-4 flex items-center gap-2">
                                    <Swords size={16} className="text-primary" /> Match History
                                </h4>
                                <PlayerMatchHistory playerId={player.id} limit={10} />
                            </div>

                            {/* Career Signature Moments — derives narrative beats
                                (major wins, MVP count, peak rating, clutch
                                specialty, veteran status) from existing save
                                fields, then appends any explicit stored
                                achievements from event-processor. */}
                            <div className="glass-panel p-6 border-white/5">
                                <h4 className="text-xs font-normal uppercase tracking-widest text-muted-foreground mb-4">Signature Moments</h4>
                                <PlayerSignatureMoments player={player} />
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>

            {/* Role Training Modal */}
            {
                trainingModalOpen && (
                    <RoleTrainingModal
                        player={player}
                        isOpen={trainingModalOpen}
                        onClose={() => setTrainingModalOpen(false)}
                        onStartTraining={(role) => {
                            const result = startRoleTraining(player.id, role)
                            if (result.success) {
                                setTrainingModalOpen(false)
                                toast.success(`Started ${role} training for ${player.nickname}`)
                            } else {
                                toast.error(result.message)
                            }
                        }}
                        currentBudget={teams.find(t => t.id === playerTeamId)?.budget || 0}
                        trainingSlotsUsed={(teams.find(t => t.id === playerTeamId) as any)?.trainingSlotsUsed || 0}
                        maxTrainingSlots={(teams.find(t => t.id === playerTeamId) as any)?.maxTrainingSlots || 10}
                    />
                )
            }

            <TransferListingModal
                isOpen={transferModalOpen}
                onClose={() => setTransferModalOpen(false)}
                player={player}
                estimatedValue={evaluation.transferValue}
                isListed={!!(player as any).forSale}
                onConfirm={(price) => {
                    if ((player as any).forSale) {
                        unlistPlayerForTransfer(player.id)
                    } else {
                        listPlayerForTransfer(player.id, price)
                    }
                }}
            />

            <WeaponTrainingModal
                isOpen={weaponModalOpen}
                onClose={() => setWeaponModalOpen(false)}
                player={player}
            />

            <NegotiationModal
                playerId={player.id}
                isOpen={negotiationOpen}
                onClose={() => setNegotiationOpen(false)}
            />
        </div >
    )
}
