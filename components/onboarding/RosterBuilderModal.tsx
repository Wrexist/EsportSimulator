"use client"

import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useGameStore } from "@/store/game-store"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { CountryFlag } from "@/components/ui/CountryFlag"
import Image from "next/image"
import {
    Users,
    UserPlus,
    Check,
    ChevronRight,
    Sparkles,
    DollarSign,
    Target,
    Shield,
    Crosshair,
    Zap,
    Building2,
    Search,
    X
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PlayerSaveData } from "@/engine/save-types"
import { SynergyCalculator } from "@/engine/synergy-calculator"
import { toast } from "sonner"
import { GameDifficulty } from "@/types/team-creator"
import { PlayerRole } from "@/types/enums"

// Weekly salary caps based on difficulty (increased for realistic salaries)
const WEEKLY_SALARY_CAPS: Record<GameDifficulty, number> = {
    story: 25000,     // Can afford elite players
    normal: 15000,    // Can afford good players
    hard: 8000,       // Must choose carefully
    impossible: 5000  // Very tight budget
}

interface RosterBuilderModalProps {
    isOpen: boolean
    onComplete: () => void
    teamColors: {
        primary: string
        secondary: string
    }
}

// Role icons mapping
const ROLE_ICONS: Record<string, React.ElementType> = {
    Entry: Zap,
    ENTRY_FRAGGER: Zap,
    AWP: Target,
    AWPER: Target,
    Rifler: Crosshair,
    RIFLER: Crosshair,
    Support: Shield,
    SUPPORT: Shield,
    IGL: Users
}

// Format role enum to display string
const formatRole = (role: string) => {
    if (!role) return "Rifler"
    const upper = role.toUpperCase()
    if (upper === "ENTRY_FRAGGER") return "Entry"
    if (upper === "AWPER") return "AWPer"
    if (upper === "IGL") return "IGL"
    return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase()
}

// Helper type for players with team info
interface PlayerWithTeamInfo extends PlayerSaveData {
    currentTeamId: string | null
    currentTeamName: string | null
    existingContract: { salaryPerWeek: number; buyout: number } | null
    isFreeAgent: boolean
}

// Compact synergy preview for roster builder
function SynergyPreview({ players }: { players: PlayerSaveData[] }) {
    const synergyMatrix = useMemo(() => SynergyCalculator.calculateTeamMatrix(players), [players])

    const avgSynergy = useMemo(() => {
        const values = Object.values(synergyMatrix)
        if (values.length === 0) return 0
        return Math.round(values.reduce((a, b) => a + b, 0) / values.length)
    }, [synergyMatrix])

    // Role-based system bonuses
    const bonuses = useMemo(() => {
        const roles: Record<string, number> = {}
        players.forEach(p => {
            const r = p.role || "RIFLER"
            roles[r] = (roles[r] || 0) + 1
            if (p.secondaryRole && p.secondaryRole !== r) {
                roles[p.secondaryRole] = (roles[p.secondaryRole] || 0) + 1
            }
        })
        const hasIGL = (roles[PlayerRole.IGL] || 0) >= 1
        const hasAWP = (roles[PlayerRole.AWPER] || 0) >= 1
        const hasSupport = (roles[PlayerRole.SUPPORT] || 0) >= 1
        const totalRiflers = (roles[PlayerRole.RIFLER] || 0) + (roles[PlayerRole.ENTRY_FRAGGER] || 0)
        const hasRifles = totalRiflers >= 2
        const fullSynergy = hasIGL && hasAWP && hasSupport && hasRifles

        return [
            { name: "Tactical Command", active: hasIGL, desc: "IGL", icon: Users, color: "text-amber-400" },
            { name: "Sniper Coverage", active: hasAWP, desc: "AWPer", icon: Target, color: "text-red-400" },
            { name: "Utility Network", active: hasSupport, desc: "Support", icon: Shield, color: "text-blue-400" },
            { name: "Rifle Squad", active: hasRifles, desc: "2+ Riflers", icon: Zap, color: "text-orange-400" },
            { name: "Full Synergy", active: fullSynergy, desc: "All roles", icon: Sparkles, color: "text-emerald-400" },
        ]
    }, [players])

    const activeCount = bonuses.filter(b => b.active).length

    const synergyColor = avgSynergy >= 70 ? "text-emerald-400" : avgSynergy >= 50 ? "text-blue-400" : "text-amber-400"

    return (
        <div className="p-3 bg-white/5 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white flex items-center gap-2">
                    <Sparkles size={14} className="text-primary" />
                    Synergy Analysis
                </span>
                <div className="flex items-center gap-2">
                    <span className={cn("text-sm font-bold", synergyColor)}>
                        {avgSynergy}%
                    </span>
                    <span className="text-[10px] text-muted-foreground uppercase">Chemistry</span>
                </div>
            </div>

            {/* Synergy pairs (compact) */}
            {players.length >= 2 && (
                <div className="flex flex-wrap gap-1.5">
                    {players.map((p1, i) =>
                        players.slice(i + 1).map(p2 => {
                            const key = [p1.id, p2.id].sort().join("_")
                            const value = synergyMatrix[key] || 50
                            const pairColor = value >= 70 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                : value >= 50 ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                                : "bg-red-500/20 text-red-400 border-red-500/30"
                            return (
                                <div key={key} className={cn("text-[9px] px-1.5 py-0.5 rounded border font-medium", pairColor)}>
                                    {p1.nickname?.slice(0, 6)}+{p2.nickname?.slice(0, 6)} {value}%
                                </div>
                            )
                        })
                    )}
                </div>
            )}

            {/* System Bonuses (compact row) */}
            <div>
                <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">System Bonuses</span>
                    <span className="text-[10px] font-mono text-white/60">{activeCount}/{bonuses.length}</span>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                    {bonuses.map((b) => (
                        <div
                            key={b.name}
                            className={cn(
                                "text-center p-1.5 rounded-lg border transition-all",
                                b.active
                                    ? "bg-white/5 border-white/10"
                                    : "bg-black/20 border-white/5 opacity-40"
                            )}
                        >
                            <b.icon size={14} className={cn("mx-auto mb-0.5", b.active ? b.color : "text-white/20")} />
                            <p className={cn("text-[8px] font-medium truncate", b.active ? "text-white" : "text-white/30")}>
                                {b.desc}
                            </p>
                            {b.active && (
                                <div className="w-1 h-1 rounded-full bg-emerald-500 mx-auto mt-0.5 animate-pulse" />
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

export function RosterBuilderModal({ isOpen, onComplete, teamColors }: RosterBuilderModalProps) {
    const {
        players,
        teams,
        contracts,
        getPlayerTeam,
        transferPlayer,
        currentWeek
    } = useGameStore()

    const playerTeam = getPlayerTeam()
    const [signedPlayers, setSignedPlayers] = useState<string[]>([])
    const [isSkipping, setIsSkipping] = useState(false)
    const [roleFilter, setRoleFilter] = useState<string>('ALL')
    const [sortBy, setSortBy] = useState<'skill' | 'potential' | 'salary' | 'age'>('skill')
    const [searchTerm, setSearchTerm] = useState('')

    // Get players with their team info from contracts
    const playersWithTeamInfo = useMemo((): PlayerWithTeamInfo[] => {
        return players.map(player => {
            const contract = contracts.find(c => c.playerId === player.id)
            const team = contract ? teams.find(t => t.id === contract.teamId) : null

            return {
                ...player,
                currentTeamId: contract?.teamId || null,
                currentTeamName: team?.name || null,
                existingContract: contract ? {
                    salaryPerWeek: contract.salaryPerWeek,
                    buyout: contract.buyout || 0
                } : null,
                isFreeAgent: !contract || !contract.teamId
            }
        })
    }, [players, contracts, teams])

    // Get available players — real free agents only, with filtering and sorting
    const availablePlayers = useMemo(() => {
        if (!playerTeam) return []

        // Filter: exclude signed, own team, fake FPL/prospect players
        let pool = playersWithTeamInfo
            .filter(p => !signedPlayers.includes(p.id))
            .filter(p => p.currentTeamId !== playerTeam.id)
            .filter(p => !p.id.startsWith('fpl_nonpro_') && !p.id.startsWith('prospect_'))
            .filter(p => p.isFreeAgent)
            .filter(p => !p.isRetired && !p.isLegendary)

        // Role filter
        if (roleFilter !== 'ALL') {
            pool = pool.filter(p => {
                const r = (p.role || 'RIFLER').toUpperCase()
                if (roleFilter === 'AWPer') return r === 'AWPER'
                if (roleFilter === 'Entry') return r === 'ENTRY_FRAGGER'
                return r === roleFilter.toUpperCase()
            })
        }

        // Search filter
        if (searchTerm) {
            const term = searchTerm.toLowerCase()
            pool = pool.filter(p =>
                p.nickname?.toLowerCase().includes(term) ||
                p.name?.toLowerCase().includes(term) ||
                p.nationality?.toLowerCase().includes(term)
            )
        }

        // Sort
        pool.sort((a, b) => {
            switch (sortBy) {
                case 'potential': return (b.potential || 0) - (a.potential || 0)
                case 'age': return (a.age || 25) - (b.age || 25)
                case 'salary': return (a.skill || 0) - (b.skill || 0)
                default: return (b.skill || 0) - (a.skill || 0)
            }
        })

        return pool.slice(0, 50)
    }, [playersWithTeamInfo, playerTeam, signedPlayers, roleFilter, sortBy, searchTerm])

    // Calculate progress
    const signedCount = signedPlayers.length
    const targetCount = 5
    const progressPercent = Math.min((signedCount / targetCount) * 100, 100)

    // Get difficulty and salary cap
    const difficulty = (playerTeam?.customTeamData?.difficulty as GameDifficulty) || "normal"
    const salaryCap = WEEKLY_SALARY_CAPS[difficulty]

    // Generate realistic contract for a player based on skill level
    const getAutoContract = (player: PlayerWithTeamInfo) => {
        const skill = player.skill || 50
        const potential = player.potential || 60

        // Realistic salary formula - elite players cost a LOT more
        // Skill 50 = ~$500/week (amateur)
        // Skill 70 = ~$2,000/week (semi-pro)
        // Skill 80 = ~$5,000/week (pro)
        // Skill 90 = ~$12,000/week (elite)
        // Skill 95+ = ~$20,000+/week (superstar)
        let baseSalary: number
        if (skill >= 95) {
            baseSalary = 18000 + (skill - 95) * 2000 // $18k-$28k for superstars
        } else if (skill >= 90) {
            baseSalary = 10000 + (skill - 90) * 1600 // $10k-$18k for elite
        } else if (skill >= 80) {
            baseSalary = 4000 + (skill - 80) * 600 // $4k-$10k for pro
        } else if (skill >= 70) {
            baseSalary = 1500 + (skill - 70) * 250 // $1.5k-$4k for semi-pro
        } else if (skill >= 60) {
            baseSalary = 700 + (skill - 60) * 80 // $700-$1.5k for rising
        } else {
            baseSalary = 300 + skill * 8 // $300-$700 for amateur
        }

        // Potential bonus (young high-potential players cost more)
        const potentialBonus = potential > 80 ? (potential - 80) * 100 : 0

        // Age discount for older players, premium for young talents
        const age = player.age || 25
        const ageModifier = age < 22 ? 1.15 : age > 28 ? 0.85 : 1.0

        const salaryPerWeek = Math.round((baseSalary + potentialBonus) * ageModifier)

        // Buyout: If player has existing contract, use their buyout. Otherwise calculate based on salary
        const buyout = player.existingContract?.buyout ||
            (player.isFreeAgent ? 0 : salaryPerWeek * 52 * 1.5)

        return {
            salaryPerWeek,
            startWeek: currentWeek,
            endWeek: currentWeek + 52, // 1 year contract
            buyout,
            transferFee: player.isFreeAgent ? 0 : buyout
        }
    }

    // Calculate current weekly salary commitment
    const weeklyCommitment = useMemo(() => {
        return signedPlayers.reduce((total, playerId) => {
            const player = playersWithTeamInfo.find(p => p.id === playerId)
            if (player) {
                const contract = getAutoContract(player)
                return total + contract.salaryPerWeek
            }
            return total
        }, 0)
    }, [signedPlayers, playersWithTeamInfo])

    // Calculate total transfer fees spent
    const transferFeesSpent = useMemo(() => {
        return signedPlayers.reduce((total, playerId) => {
            const player = playersWithTeamInfo.find(p => p.id === playerId)
            if (player && !player.isFreeAgent) {
                const contract = getAutoContract(player)
                return total + contract.transferFee
            }
            return total
        }, 0)
    }, [signedPlayers, playersWithTeamInfo])

    // Get full details for signed players (for roster display)
    const signedPlayerDetails = useMemo(() => {
        return signedPlayers
            .map(id => playersWithTeamInfo.find(p => p.id === id))
            .filter((p): p is PlayerWithTeamInfo => !!p)
    }, [signedPlayers, playersWithTeamInfo])

    // Check if we can afford a player (salary + transfer fee if contracted)
    const canAffordPlayer = (player: PlayerWithTeamInfo) => {
        const contract = getAutoContract(player)
        const salaryFits = weeklyCommitment + contract.salaryPerWeek <= salaryCap
        const budgetFits = playerTeam ? (transferFeesSpent + contract.transferFee <= playerTeam.budget) : false
        return salaryFits && budgetFits
    }

    // Sign a player
    const handleSign = (player: PlayerWithTeamInfo) => {
        if (!playerTeam) return

        const contract = getAutoContract(player)

        // Check salary budget first
        if (weeklyCommitment + contract.salaryPerWeek > salaryCap) {
            toast.error("Salary budget exceeded!", {
                description: "This player's salary would put you over your weekly budget limit."
            })
            return
        }

        // Check transfer budget for contracted players
        if (!player.isFreeAgent && transferFeesSpent + contract.transferFee > playerTeam.budget) {
            toast.error("Transfer budget exceeded!", {
                description: `You need $${contract.transferFee.toLocaleString()} to buy out this player's contract.`
            })
            return
        }

        const fromTeamId = player.isFreeAgent ? "FA" : (player.currentTeamId || "FA")

        const result = transferPlayer(
            player.id,
            fromTeamId,
            playerTeam.id,
            contract.transferFee,
            {
                salaryPerWeek: contract.salaryPerWeek,
                startWeek: contract.startWeek,
                endWeek: contract.endWeek,
                buyout: contract.salaryPerWeek * 52 // New buyout based on annual salary
            }
        )

        if (result.success) {
            setSignedPlayers(prev => [...prev, player.id])
            const feeText = contract.transferFee > 0
                ? ` (Buyout: $${contract.transferFee.toLocaleString()})`
                : " (Free Agent)"
            toast.success(`Signed ${player.nickname}!${feeText}`, {
                description: `$${contract.salaryPerWeek.toLocaleString()}/week for 1 year`
            })
        } else {
            toast.error("Failed to sign player", {
                description: result.message || "Unknown error"
            })
        }
    }

    // Unsign/release a player back to free agency
    const handleUnsign = (playerId: string) => {
        if (!playerTeam) return
        const player = players.find(p => p.id === playerId)
        if (!player) return

        const result = transferPlayer(playerId, playerTeam.id, "FA", 0)
        if (result.success) {
            setSignedPlayers(prev => prev.filter(id => id !== playerId))
            toast.success(`Released ${player.nickname}`)
        }
    }

    // Handle skip/complete
    const handleSkip = () => {
        setIsSkipping(true)
        setTimeout(() => {
            onComplete()
        }, 300)
    }

    const handleComplete = () => {
        onComplete()
    }

    if (!isOpen || !playerTeam) return null

    const canComplete = signedCount >= targetCount

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    className="w-full max-w-4xl max-h-[90vh] bg-gradient-to-b from-zinc-900 to-black rounded-2xl border border-white/10 overflow-hidden flex flex-col"
                >
                    {/* Scrollable Content Area */}
                    <div className="flex-1 overflow-y-auto">
                    {/* Header */}
                    <div className="p-6 border-b border-white/10">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div
                                    className="w-14 h-14 rounded-xl flex items-center justify-center"
                                    style={{
                                        background: `linear-gradient(135deg, ${teamColors.primary} 0%, ${teamColors.secondary} 100%)`
                                    }}
                                >
                                    <Users className="text-white" size={28} />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-white">Build Your Roster</h2>
                                    <p className="text-muted-foreground">Sign free agents to compete in tournaments</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-sm text-muted-foreground">Transfer Budget</p>
                                <p className={cn(
                                    "text-xl font-bold",
                                    transferFeesSpent > 0 ? "text-amber-400" : "text-emerald-400"
                                )}>
                                    ${(playerTeam.budget - transferFeesSpent).toLocaleString()}
                                </p>
                                {transferFeesSpent > 0 && (
                                    <p className="text-xs text-muted-foreground">
                                        (${transferFeesSpent.toLocaleString()} spent on buyouts)
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Weekly Salary Budget */}
                        <div className="mt-4 p-3 bg-white/5 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-white flex items-center gap-2">
                                    <DollarSign size={14} className="text-amber-400" />
                                    Weekly Salary Budget
                                </span>
                                <span className={cn(
                                    "text-sm font-bold",
                                    weeklyCommitment > salaryCap * 0.8 && weeklyCommitment < salaryCap && "text-amber-400",
                                    weeklyCommitment >= salaryCap && "text-red-400",
                                    weeklyCommitment <= salaryCap * 0.8 && "text-emerald-400"
                                )}>
                                    ${weeklyCommitment.toLocaleString()} / ${salaryCap.toLocaleString()}
                                </span>
                            </div>
                            <Progress
                                value={Math.min((weeklyCommitment / salaryCap) * 100, 100)}
                                className={cn(
                                    "h-1.5",
                                    weeklyCommitment > salaryCap * 0.8 && "[&>div]:bg-amber-500",
                                    weeklyCommitment >= salaryCap && "[&>div]:bg-red-500"
                                )}
                            />
                            <p className="text-[10px] text-muted-foreground mt-1">
                                {weeklyCommitment >= salaryCap
                                    ? "Budget maxed! Release players or choose cheaper options."
                                    : `$${(salaryCap - weeklyCommitment).toLocaleString()} remaining per week`
                                }
                            </p>
                        </div>

                        {/* Progress Bar */}
                        <div className="mt-6">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-white">
                                    Roster Progress
                                </span>
                                <span className={cn(
                                    "text-sm font-bold",
                                    canComplete ? "text-emerald-400" : "text-amber-400"
                                )}>
                                    {signedCount}/{targetCount} players
                                </span>
                            </div>
                            <Progress
                                value={progressPercent}
                                className="h-2"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                {canComplete
                                    ? "You have enough players to compete!"
                                    : `Sign ${targetCount - signedCount} more player${targetCount - signedCount > 1 ? 's' : ''} to enter tournaments`
                                }
                            </p>

                            {/* Signed Player Slots */}
                            <div className="grid grid-cols-5 gap-2 mt-3">
                                {Array.from({ length: targetCount }).map((_, i) => {
                                    const player = signedPlayerDetails[i]
                                    const RoleIcon = player ? (ROLE_ICONS[player.role || "Rifler"] || Crosshair) : null

                                    return player ? (
                                        <motion.div
                                            key={player.id}
                                            initial={{ opacity: 0, scale: 0.8, y: 10 }}
                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                            transition={{ type: "spring", stiffness: 300, damping: 25 }}
                                            className="bg-white/5 rounded-lg border border-white/10 p-2 flex flex-col items-center gap-1 relative group"
                                        >
                                            <button
                                                onClick={() => handleUnsign(player.id)}
                                                className="absolute -top-1.5 -right-1.5 z-10 w-5 h-5 rounded-full bg-red-500/80 hover:bg-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                title="Remove player"
                                            >
                                                <X size={10} className="text-white" />
                                            </button>
                                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-zinc-700 to-zinc-900 border border-white/10 overflow-hidden relative">
                                                {player.portraitPath ? (
                                                    <Image
                                                        src={player.portraitPath}
                                                        alt={player.nickname || "Player"}
                                                        fill
                                                        className="object-cover"
                                                        onError={(e) => { e.currentTarget.style.display = 'none' }}
                                                    />
                                                ) : null}
                                                <span className="absolute inset-0 flex items-center justify-center text-white font-bold text-sm">
                                                    {!player.portraitPath && (player.nickname?.charAt(0) || "?")}
                                                </span>
                                            </div>
                                            <p className="text-[10px] font-bold text-white truncate w-full text-center">{player.nickname}</p>
                                            <div className="flex items-center gap-1">
                                                <CountryFlag country={player.nationality} size={10} />
                                                {RoleIcon && <RoleIcon size={10} className="text-muted-foreground" />}
                                            </div>
                                            <div className={cn(
                                                "text-xs font-bold px-1.5 py-0.5 rounded",
                                                (player.skill || 0) >= 90 ? "text-amber-400 bg-amber-500/10" :
                                                (player.skill || 0) >= 80 ? "text-primary bg-primary/10" :
                                                "text-white bg-white/10"
                                            )}>
                                                {player.skill || 50}
                                            </div>
                                        </motion.div>
                                    ) : (
                                        <div
                                            key={`empty-${i}`}
                                            className="rounded-lg border border-dashed border-white/10 p-2 flex flex-col items-center justify-center gap-1 min-h-[100px]"
                                        >
                                            <div className="w-10 h-10 rounded-lg border border-dashed border-white/10 flex items-center justify-center">
                                                <UserPlus size={14} className="text-white/20" />
                                            </div>
                                            <p className="text-[10px] text-white/20">Empty</p>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Synergy Analysis */}
                        {signedPlayerDetails.length >= 2 && (
                            <div className="mt-4">
                                <SynergyPreview players={signedPlayerDetails} />
                            </div>
                        )}
                    </div>

                    {/* Filter & Sort Bar */}
                    <div className="px-6 py-3 border-b border-white/10 sticky top-0 z-10 bg-zinc-900/95 backdrop-blur-sm">
                        <div className="flex items-center gap-3 flex-wrap">
                            {/* Search */}
                            <div className="relative flex-1 min-w-[180px]">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    placeholder="Search players..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-9 h-8 bg-white/5 border-white/10 text-sm"
                                />
                            </div>

                            {/* Role Filters */}
                            <div className="flex gap-1">
                                {['ALL', 'AWPer', 'IGL', 'Entry', 'Support', 'Rifler'].map(role => (
                                    <Button
                                        key={role}
                                        variant={roleFilter === role ? "default" : "ghost"}
                                        size="sm"
                                        onClick={() => setRoleFilter(role)}
                                        className={cn(
                                            "h-7 text-xs px-2",
                                            roleFilter === role && "bg-white/10"
                                        )}
                                    >
                                        {role}
                                    </Button>
                                ))}
                            </div>

                            {/* Sort */}
                            <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                                <SelectTrigger className="h-8 w-[140px] bg-white/5 border-white/10 text-xs text-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="skill">Sort: Skill</SelectItem>
                                    <SelectItem value="potential">Sort: Potential</SelectItem>
                                    <SelectItem value="salary">Sort: Salary (Low)</SelectItem>
                                    <SelectItem value="age">Sort: Age (Young)</SelectItem>
                                </SelectContent>
                            </Select>

                            {/* Count */}
                            <Badge variant="outline" className="text-xs shrink-0">
                                {availablePlayers.length} available
                            </Badge>
                        </div>
                    </div>

                    {/* Player Grid */}
                    <div className="p-6 min-h-[400px]">
                        {availablePlayers.length === 0 ? (
                            <div className="text-center py-12">
                                <Sparkles className="mx-auto text-muted-foreground mb-4" size={48} />
                                <p className="text-white font-bold">No more available players!</p>
                                <p className="text-muted-foreground text-sm">
                                    Visit the Transfers page for more options
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                {availablePlayers.map((player) => {
                                    const contract = getAutoContract(player)
                                    const RoleIcon = ROLE_ICONS[player.role || "Rifler"] || Crosshair
                                    const affordable = canAffordPlayer(player)

                                    return (
                                        <motion.div
                                            key={player.id}
                                            layout
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.9 }}
                                            className={cn(
                                                "bg-white/5 rounded-xl border p-3 transition-colors",
                                                affordable ? "border-white/10 hover:bg-white/10" : "border-red-500/20 opacity-75"
                                            )}
                                        >
                                            {/* Team Badge */}
                                            <div className="flex items-center justify-between mb-2">
                                                {player.isFreeAgent ? (
                                                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
                                                        <UserPlus size={10} className="mr-1" />
                                                        Free Agent
                                                    </Badge>
                                                ) : (
                                                    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">
                                                        <Building2 size={10} className="mr-1" />
                                                        {player.currentTeamName || "Contracted"}
                                                    </Badge>
                                                )}
                                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                                    <RoleIcon size={10} className="mr-1" />
                                                    {formatRole(player.role || "Rifler")}
                                                </Badge>
                                            </div>

                                            {/* Player Header with Image */}
                                            <div className="flex items-start gap-3 mb-3">
                                                <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-zinc-700 to-zinc-900 flex items-center justify-center text-white font-bold text-lg border border-white/10 overflow-hidden relative">
                                                    {player.portraitPath ? (
                                                        <Image
                                                            src={player.portraitPath}
                                                            alt={player.nickname || "Player"}
                                                            fill
                                                            className="object-cover"
                                                            onError={(e) => {
                                                                // Fallback to initial if image fails
                                                                e.currentTarget.style.display = 'none'
                                                            }}
                                                        />
                                                    ) : null}
                                                    <span className="absolute inset-0 flex items-center justify-center">
                                                        {!player.portraitPath && (player.nickname?.charAt(0) || "?")}
                                                    </span>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-white font-bold truncate">{player.nickname}</p>
                                                    <p className="text-xs text-muted-foreground truncate">{player.name}</p>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <CountryFlag country={player.nationality} size={14} />
                                                        <span className="text-xs text-muted-foreground">Age {player.age || 20}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Stats */}
                                            <div className="flex items-center gap-2 mb-3">
                                                <div className="flex-1 text-center p-2 bg-white/5 rounded-lg">
                                                    <p className={cn(
                                                        "text-lg font-bold",
                                                        (player.skill || 0) >= 90 ? "text-amber-400" :
                                                        (player.skill || 0) >= 80 ? "text-primary" :
                                                        "text-white"
                                                    )}>{player.skill || 50}</p>
                                                    <p className="text-[10px] text-muted-foreground uppercase">Skill</p>
                                                </div>
                                                <div className="flex-1 text-center p-2 bg-white/5 rounded-lg">
                                                    <p className={cn(
                                                        "text-lg font-bold",
                                                        (player.potential || 0) >= 90 ? "text-emerald-400" : "text-amber-400"
                                                    )}>{player.potential || 60}</p>
                                                    <p className="text-[10px] text-muted-foreground uppercase">Potential</p>
                                                </div>
                                            </div>

                                            {/* Contract Preview */}
                                            <div className={cn(
                                                "text-xs mb-3 p-2 rounded-lg space-y-1",
                                                affordable
                                                    ? "bg-black/30 text-muted-foreground"
                                                    : "bg-red-500/10 text-red-400 border border-red-500/20"
                                            )}>
                                                <div className="flex items-center justify-between">
                                                    <span className="flex items-center gap-1">
                                                        <DollarSign size={12} />
                                                        Salary:
                                                    </span>
                                                    <span className="font-bold">${contract.salaryPerWeek.toLocaleString()}/week</span>
                                                </div>
                                                {!player.isFreeAgent && contract.transferFee > 0 && (
                                                    <div className="flex items-center justify-between text-amber-400">
                                                        <span>Buyout:</span>
                                                        <span className="font-bold">${contract.transferFee.toLocaleString()}</span>
                                                    </div>
                                                )}
                                                {!affordable && (
                                                    <p className="text-red-400 text-center font-medium mt-1">
                                                        {weeklyCommitment + contract.salaryPerWeek > salaryCap
                                                            ? "Exceeds salary cap!"
                                                            : "Exceeds transfer budget!"}
                                                    </p>
                                                )}
                                            </div>

                                            {/* Sign Button */}
                                            <Button
                                                onClick={() => handleSign(player)}
                                                disabled={!affordable}
                                                className={cn(
                                                    "w-full gap-2",
                                                    !affordable && "opacity-50 cursor-not-allowed"
                                                )}
                                                style={{
                                                    background: affordable
                                                        ? `linear-gradient(135deg, ${teamColors.primary} 0%, ${teamColors.secondary} 100%)`
                                                        : undefined
                                                }}
                                            >
                                                <UserPlus size={16} />
                                                {affordable
                                                    ? (player.isFreeAgent ? "Sign Free Agent" : "Pay Buyout & Sign")
                                                    : "Cannot Afford"}
                                            </Button>
                                        </motion.div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                    </div>{/* End Scrollable Content Area */}

                    {/* Footer */}
                    <div className="p-6 border-t border-white/10 shrink-0">
                        <div className="flex items-center justify-between">
                            <Button
                                variant="ghost"
                                onClick={handleSkip}
                                className="text-muted-foreground hover:text-white"
                            >
                                Skip for now
                                <ChevronRight size={16} className="ml-1" />
                            </Button>

                            <Button
                                onClick={handleComplete}
                                disabled={!canComplete}
                                className={cn(
                                    "gap-2",
                                    canComplete
                                        ? "bg-emerald-600 hover:bg-emerald-500"
                                        : "opacity-50"
                                )}
                            >
                                {canComplete ? (
                                    <>
                                        <Check size={16} />
                                        Enter Headquarters
                                    </>
                                ) : (
                                    <>
                                        Sign {targetCount - signedCount} more player{targetCount - signedCount > 1 ? 's' : ''}
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}
