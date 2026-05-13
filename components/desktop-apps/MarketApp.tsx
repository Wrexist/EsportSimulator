"use client"

import React, { useState, useMemo, memo } from "react"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { GameEventSaveData } from "@/engine"
import {
    LayoutGrid,
    Users,
    TrendingUp,
    Search,
    Filter,
    ArrowRight,
    DollarSign,
    UserPlus,
    Activity,
    Clock,
    CheckCircle,
    XCircle,
    ShoppingBag,
    Briefcase,
    AlertCircle,
    X,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
// Engine & Components
import { evaluatePlayer, isPlayerForSale, calculateMarketValue } from "@/engine/player-evaluation"
import { resolvePlayerRole } from "@/engine/role-determination"
import { NegotiationModal } from "@/components/transfer/NegotiationModal"
import { PlayerPortrait, TeamLogoImage } from "@/components/ui/asset-images"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { PlayerSpiderChart } from "@/components/ui/player-spider-chart"

interface MarketAppProps {
    events: GameEventSaveData[]
    onEventClick: (event: GameEventSaveData) => void
}

// Helper to calculate tactical stats derived from base attributes
function calculateTacticalStats(p: any) {
    const rifle = p.rifle || 50
    const awp = p.awp || 50
    const pistol = p.pistol || 50
    const reaction = p.reaction || 50
    const tactic = p.tactic || 50
    const teamwork = p.teamwork || 50
    const grenades = p.grenades || 50
    const clutch = p.clutch || 50
    const eyesight = p.eyesight || 50

    return {
        firepower: Math.round(rifle * 0.4 + awp * 0.3 + pistol * 0.1 + reaction * 0.2),
        entrying: Math.round(reaction * 0.4 + rifle * 0.3 + eyesight * 0.3),
        trading: Math.round(teamwork * 0.5 + tactic * 0.3 + rifle * 0.2),
        opening: Math.round(reaction * 0.5 + awp * 0.3 + rifle * 0.2),
        clutching: clutch,
        sniping: awp,
        utility: grenades,
    }
}

function MarketAppComponent({ events, onEventClick }: MarketAppProps) {
    // Game Store Data (batched with useShallow to minimize re-renders)
    const { players, teams, playerTeamId, contracts, transferPlayer, currentWeek, startScoutingMission, activeScoutingMission, isPlayerScouted, transferHistory, staff } = useGameStore(useShallow(state => ({
        players: state.players,
        teams: state.teams,
        playerTeamId: state.playerTeamId,
        contracts: state.contracts,
        transferPlayer: state.transferPlayer,
        currentWeek: state.currentWeek,
        startScoutingMission: state.startScoutingMission,
        activeScoutingMission: state.activeScoutingMission,
        isPlayerScouted: state.isPlayerScouted,
        transferHistory: state.transferHistory,
        staff: state.staff,
    })))
    // Scout Requirement Check
    const hasScout = staff.some(s => s.role === "scout" && s.teamId === playerTeamId)

    const playerTeam = teams.find(t => t.id === playerTeamId)
    const budget = playerTeam?.budget || 0

    // State
    const [activeTab, setActiveTab] = useState<"market" | "history" | "watchlist">("market")
    const [searchQuery, setSearchQuery] = useState("")
    const [filterRole, setFilterRole] = useState("ALL")
    const [filterStatus, setFilterStatus] = useState<"ALL" | "FA" | "LISTED">("ALL")

    // Evaluation Cache
    const marketPlayers = useMemo(() => {
        const rosterMap = new Map<string, string>() // playerId -> teamId
        teams.forEach(t => t.rosterIds.forEach(pid => rosterMap.set(pid, t.id)))

        return players
            .filter(p => !p.isRetired)
            .map(p => {
                const teamId = rosterMap.get(p.id)
                const team = teamId ? teams.find(t => t.id === teamId) : null
                const evaluation = evaluatePlayer(p as any)
                const teamRank = team ? (team.worldRanking || 50) : 50
                const forSale = team ? isPlayerForSale(p as any, evaluation, teamRank) : true
                const derivedStats = calculateTacticalStats(p)

                return {
                    ...p,
                    team,
                    evaluation,
                    forSale,
                    isFreeAgent: !team,
                    ...derivedStats
                }
            })
            .sort((a, b) => b.evaluation.overallRating - a.evaluation.overallRating)
    }, [players, teams])

    // Filtered List
    const filteredPlayers = useMemo(() => {
        return marketPlayers.filter(p => {
            const searchMatch = !searchQuery ||
                p.nickname?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.team?.name.toLowerCase().includes(searchQuery.toLowerCase())

            const roleMatch = (() => {
                if (filterRole === "ALL") return true
                // 1. Explicit Check
                if (resolvePlayerRole(p as any).toUpperCase().includes(filterRole)) return true
                // 2. Stat Check (Smart Filters for capabilities)
                const s = p as any
                switch (filterRole) {
                    case "AWPER": return (s.sniping || s.awp || 0) >= 70
                    case "IGL": return (s.leader || 0) >= 60
                    case "ENTRY": return (s.entrying || 0) >= 70
                    case "SUPPORT": return (s.utility || s.grenades || 0) >= 70
                    case "RIFLER": return (s.firepower || s.rifle || 0) >= 70
                    default: return false
                }
            })()

            const statusMatch = filterStatus === "ALL" ||
                (filterStatus === "FA" && p.isFreeAgent) ||
                (filterStatus === "LISTED" && p.forSale && !p.isFreeAgent)

            const notMine = p.team?.id !== playerTeamId

            return searchMatch && roleMatch && statusMatch && notMine && (p.forSale || p.isFreeAgent)
        }).slice(0, 100)
    }, [marketPlayers, searchQuery, filterRole, filterStatus, playerTeamId])

    // Render Overlay if No Scout
    const renderNoScoutOverlay = () => {
        if (activeTab !== "market") return null
        if (hasScout) return null

        return (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md text-center p-6">
                <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mb-4">
                    <Search size={32} className="text-rose-400" />
                </div>
                <h3 className="text-xl font-bold text-white uppercase tracking-tight mb-2">Scout Required</h3>
                <p className="text-white/60 max-w-xs mb-6 text-sm">
                    You need to hire a Scout to access the Transfer Market and make offers to players.
                </p>
            </div>
        )
    }

    // Signing / Negotiation State
    const [selectedPlayer, setSelectedPlayer] = useState<typeof marketPlayers[0] | null>(null)
    const [isSigningFA, setIsSigningFA] = useState(false)
    const [negotiatingId, setNegotiatingId] = useState<string | null>(null)

    // FA Signing Logic
    const [faOfferSalary, setFaOfferSalary] = useState(500)
    const [faOfferDuration, setFaOfferDuration] = useState(52)
    const [signError, setSignError] = useState<string | null>(null)

    const handleSignFA = () => {
        if (!selectedPlayer || !playerTeam) return
        const signingBonus = faOfferSalary * 4
        if (budget < signingBonus) {
            setSignError("Insufficient budget")
            return
        }
        transferPlayer(selectedPlayer.id, "FA", playerTeam.id, signingBonus, {
            salaryPerWeek: faOfferSalary, startWeek: currentWeek, endWeek: currentWeek + faOfferDuration, buyout: 0
        })
        setSelectedPlayer(null)
        setIsSigningFA(false)
    }

    const formatMoney = (val: number) => {
        if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`
        return `$${(val / 1000).toFixed(0)}k`
    }

    // Scrollbar styles
    const scrollbarClass = "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/20"

    return (
        <div className="h-full flex flex-col bg-slate-950 text-white overflow-hidden relative select-none">
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-black/20 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center border border-white/10 shadow-lg shadow-emerald-900/10">
                        <ShoppingBag size={20} className="text-emerald-400" />
                    </div>
                    <div>
                        <h2 className="text-lg font-normal uppercase tracking-tight">Transfer Market</h2>
                        <p className="text-[10px] text-emerald-400 font-bold tracking-widest uppercase">
                            Budget: ${budget.toLocaleString()}
                        </p>
                    </div>
                </div>

                <div className="flex bg-white/5 rounded-lg p-0.5">
                    {[
                        { id: "market", label: "Market", icon: Users },
                        { id: "history", label: "History", icon: Activity },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all",
                                activeTab === tab.id ? "bg-white/10 text-white shadow-sm ring-1 ring-white/5" : "text-white/40 hover:text-white hover:bg-white/5"
                            )}
                        >
                            <tab.icon size={12} />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Market Reset Notification Banner */}
            {activeTab === "market" && (
                <div className="mx-4 mt-3 px-4 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-amber-500/20 flex items-center justify-center">
                            <Clock size={14} className="text-amber-400" />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-amber-200">
                                Market Refreshes in {Math.max(1, 4 - (currentWeek % 4))} Week{Math.max(1, 4 - (currentWeek % 4)) !== 1 ? 's' : ''}
                            </p>
                            <p className="text-[9px] text-amber-400/60">
                                New players become available • Some may be signed by AI teams
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1 text-amber-400/40">
                        <AlertCircle size={12} />
                    </div>
                </div>
            )}

            {/* Content Container - Flex row layout to prevent detail overlay */}
            <div className="flex-1 flex min-h-0 relative overflow-hidden">
                {renderNoScoutOverlay()}
                {activeTab === "market" && (
                    <div className="flex-1 flex flex-col min-h-0 min-w-0 transition-all duration-300">
                        {/* Filters */}
                        <div className="p-3 space-y-3 bg-white/5 border-b border-white/5 shrink-0">
                            <div className="relative group">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-emerald-400 transition-colors" size={14} />
                                <input
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder="Search players, teams..."
                                    className="w-full bg-black/20 border border-white/10 rounded-xl py-2 pl-9 text-xs focus:ring-1 focus:ring-emerald-500/50 outline-none transition-all focus:bg-black/30 placeholder:text-white/20"
                                />
                            </div>
                            <div className={cn("flex items-center gap-2 overflow-x-auto pb-1 min-h-[26px]", scrollbarClass)}>
                                {["ALL", "FA", "LISTED"].map(s => (
                                    <button
                                        key={s}
                                        onClick={() => setFilterStatus(s as any)}
                                        className={cn("px-3 py-1 rounded-full text-[9px] font-bold uppercase border whitespace-nowrap transition-all", filterStatus === s ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400" : "bg-white/5 border-transparent text-white/50 hover:bg-white/10 hover:text-white")}
                                    >
                                        {s === "FA" ? "Free Agents" : s === "LISTED" ? "Transfer Listed" : "All"}
                                    </button>
                                ))}
                                <div className="w-px h-4 bg-white/10 mx-1 shrink-0" />
                                {["ALL", "AWPER", "IGL", "RIFLER", "ENTRY", "SUPPORT"].map(r => (
                                    <button
                                        key={r}
                                        onClick={() => setFilterRole(r)}
                                        className={cn("px-3 py-1 rounded-full text-[9px] font-bold uppercase border transition-all", filterRole === r ? "bg-blue-500/20 border-blue-500/30 text-blue-400" : "bg-white/5 border-transparent text-white/50 hover:bg-white/10 hover:text-white")}
                                    >
                                        {r}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Player List */}
                        <div className={cn("flex-1 overflow-y-auto p-2 space-y-1", scrollbarClass)}>
                            {filteredPlayers.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-48 opacity-30 text-xs font-bold uppercase gap-2">
                                    <Search size={24} />
                                    <span>No players found</span>
                                </div>
                            ) : (
                                filteredPlayers.map(p => (
                                    <div
                                        key={p.id}
                                        onClick={() => {
                                            setSelectedPlayer(p)
                                            setIsSigningFA(false)
                                            setSignError(null)
                                        }}
                                        className={cn(
                                            "flex items-center gap-3 p-2 rounded-xl transition-all border border-transparent cursor-pointer group",
                                            selectedPlayer?.id === p.id
                                                ? "bg-gradient-to-r from-emerald-500/10 to-transparent border-emerald-500/20 shadow-lg"
                                                : "hover:bg-white/5 hover:border-white/5"
                                        )}
                                    >
                                        <div className="w-10 h-10 rounded-lg bg-black/20 overflow-hidden flex items-center justify-center shrink-0 border border-white/5 shadow-inner">
                                            <PlayerPortrait src={p.portraitPath} alt={p.nickname} size={40} variant="card" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h4 className={cn("font-bold text-xs truncate transition-colors", selectedPlayer?.id === p.id ? "text-emerald-400" : "text-white group-hover:text-emerald-400")}>{p.nickname}</h4>
                                                <CountryFlag country={p.nationality} className="w-3 opacity-70" />
                                                {!isPlayerScouted(p.id) && <span className="text-[9px] text-white/30 ml-auto uppercase tracking-widest font-bold">Unscouted</span>}
                                            </div>
                                            <div className="flex items-center gap-1.5 text-[10px] text-white/40">
                                                {p.team ? (
                                                    <>
                                                        <span className="max-w-[80px] truncate">{p.team.name}</span>
                                                    </>
                                                ) : <span className="text-emerald-400 font-bold">Free Agent</span>}
                                                <span className="opacity-30">•</span>
                                                <span>{p.age}y</span>
                                                <span className="opacity-30">•</span>
                                                <span className="text-white/60">{resolvePlayerRole(p as any).split(',')[0]}</span>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <div className="font-normal text-sm text-white group-hover:text-blue-400 transition-colors">
                                                {isPlayerScouted(p.id) ? p.evaluation.overallRating : "??"}
                                            </div>
                                            <div className="text-[9px] font-bold text-white/30 uppercase">OVR</div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <div className="font-normal text-sm text-white group-hover:text-emerald-400 transition-colors">
                                                {formatMoney(p.evaluation.transferValue)}
                                            </div>
                                            <div className="text-[9px] font-bold text-white/30 uppercase">Value</div>
                                        </div>
                                        <div className="w-6 shrink-0 flex justify-end text-white/20 group-hover:text-white transition-colors">
                                            <ArrowRight size={14} />
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {/* Selected Player Pane - Side by Side (Not Absolute) */}
                {activeTab === "market" && selectedPlayer && (
                    <div className="w-[320px] shrink-0 border-l border-white/10 flex flex-col bg-[#050505]/95 backdrop-blur-xl shadow-2xl z-20">
                        <div className="p-4 border-b border-white/10 flex items-start justify-between bg-gradient-to-br from-white/5 to-transparent">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-black/40 overflow-hidden border border-white/10 shadow-lg">
                                    <PlayerPortrait src={selectedPlayer.portraitPath} alt={selectedPlayer.nickname} size={48} variant="card" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-normal text-white leading-none mb-1">{selectedPlayer.nickname}</h2>
                                    <p className="text-xs text-white/50 font-medium">{selectedPlayer.name}</p>
                                </div>
                            </div>
                            <button onClick={() => setSelectedPlayer(null)} className="text-white/30 hover:text-white hover:bg-white/10 p-1 rounded-lg transition-all"><X size={16} /></button>
                        </div>

                        <div className={cn("flex-1 overflow-y-auto p-4 space-y-6", scrollbarClass)}>
                            {/* Key Stats */}
                            <div className="grid grid-cols-3 gap-2">
                                <div className="bg-white/5 rounded-xl p-3 text-center border border-white/5">
                                    <div className="text-2xl font-normal text-emerald-400 leading-none mb-1">
                                        {isPlayerScouted(selectedPlayer.id) ? selectedPlayer.evaluation.overallRating : "??"}
                                    </div>
                                    <div className="text-[8px] uppercase tracking-wider text-white/40 font-bold">OVR</div>
                                </div>
                                <div className="bg-white/5 rounded-xl p-3 text-center border border-white/5">
                                    <div className="text-2xl font-normal text-blue-400 leading-none mb-1">
                                        {isPlayerScouted(selectedPlayer.id) ? selectedPlayer.evaluation.roleFit : "??"}
                                    </div>
                                    <div className="text-[8px] uppercase tracking-wider text-white/40 font-bold">FIT</div>
                                </div>
                                <div className="bg-white/5 rounded-xl p-3 text-center border border-white/5">
                                    <div className="text-2xl font-normal text-purple-400 leading-none mb-1">
                                        {isPlayerScouted(selectedPlayer.id) ? selectedPlayer.evaluation.futureValue : "??"}
                                    </div>
                                    <div className="text-[8px] uppercase tracking-wider text-white/40 font-bold">POT</div>
                                </div>
                            </div>

                            {/* Spider Chart - Stats are spread from derivedStats */}
                            <div className="bg-white/5 rounded-2xl p-2 border border-white/5 relative">
                                {!isPlayerScouted(selectedPlayer.id) && (
                                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-[2px] flex items-center justify-center z-10 rounded-2xl">
                                        <span className="text-white/20 font-bold uppercase tracking-widest text-[10px]">Stats Hidden</span>
                                    </div>
                                )}
                                <PlayerSpiderChart stats={selectedPlayer as any} size="sm" />
                            </div>

                            <div className="space-y-2 text-xs bg-white/5 rounded-xl p-3 border border-white/5">
                                <div className="flex justify-between items-center py-1 border-b border-white/5">
                                    <span className="text-white/40 font-bold uppercase text-[10px]">Role</span>
                                    <span className="font-bold bg-white/10 px-2 py-0.5 rounded text-[10px]">{resolvePlayerRole(selectedPlayer as any)}</span>
                                </div>
                                <div className="flex justify-between items-center py-1 border-b border-white/5">
                                    <span className="text-white/40 font-bold uppercase text-[10px]">Nationality</span>
                                    <span className="font-bold flex items-center gap-1.5"><CountryFlag country={selectedPlayer.nationality} className="w-3" /> {selectedPlayer.nationality}</span>
                                </div>
                                <div className="flex justify-between items-center py-1">
                                    <span className="text-white/40 font-bold uppercase text-[10px]">Team</span>
                                    <span className={cn("font-bold flex items-center gap-1.5", !selectedPlayer.team && "text-emerald-400")}>
                                        {selectedPlayer.team?.name || "Free Agent"}
                                    </span>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="pt-2">
                                {selectedPlayer.isFreeAgent ? (
                                    isSigningFA ? (
                                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 space-y-4 animation-slide-up shadow-lg">
                                            <h4 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                                                <Briefcase size={12} /> Contract Offer
                                            </h4>

                                            <div className="space-y-2">
                                                <div className="flex justify-between text-[10px]">
                                                    <span className="text-white/60 font-bold">Weekly Salary</span>
                                                    <span className="text-white font-normal text-xs">${faOfferSalary.toLocaleString()}</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="100"
                                                    max="20000"
                                                    step="100"
                                                    value={faOfferSalary}
                                                    onChange={e => setFaOfferSalary(+e.target.value)}
                                                    className="w-full h-1.5 bg-black/40 rounded-full appearance-none cursor-pointer accent-emerald-500"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <div className="flex justify-between text-[10px]">
                                                    <span className="text-white/60 font-bold">Duration</span>
                                                    <span className="text-white font-normal text-xs">{faOfferDuration} Weeks</span>
                                                </div>
                                                <div className="flex gap-1">
                                                    {[26, 52, 104, 156].map(w => (
                                                        <button
                                                            key={w}
                                                            onClick={() => setFaOfferDuration(w)}
                                                            className={cn(
                                                                "flex-1 py-1.5 rounded-lg text-[9px] font-bold border transition-all",
                                                                faOfferDuration === w ? "bg-emerald-500 text-white border-transparent shadow shadow-emerald-500/20" : "bg-white/5 border-white/10 hover:bg-white/10"
                                                            )}
                                                        >
                                                            {(w / 52).toFixed(1)}y
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="text-[10px] bg-black/20 p-2 rounded-lg flex justify-between items-center text-white/50">
                                                <span>Signing Bonus:</span>
                                                <span className="font-bold text-white">${(faOfferSalary * 4).toLocaleString()}</span>
                                            </div>

                                            {signError && (
                                                <div className="flex items-center gap-1.5 text-red-400 bg-red-500/10 p-2 rounded-lg">
                                                    <AlertCircle size={12} />
                                                    <p className="text-[9px] font-bold">{signError}</p>
                                                </div>
                                            )}

                                            <div className="flex gap-2 pt-2">
                                                <Button size="sm" variant="ghost" className="flex-1 h-8 text-[10px] font-bold hover:bg-white/5" onClick={() => setIsSigningFA(false)}>Cancel</Button>
                                                <Button size="sm" className="flex-1 h-8 text-[10px] bg-emerald-500 hover:bg-emerald-400 text-white font-bold shadow-lg shadow-emerald-500/20" onClick={handleSignFA}>
                                                    Sign Deal
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <Button className="w-full h-10 bg-emerald-500 hover:bg-emerald-400 text-white font-normal rounded-xl shadow-lg shadow-emerald-500/20 transition-all hover:scale-[1.02]" onClick={() => setIsSigningFA(true)}>
                                            <UserPlus size={16} className="mr-2" /> Sign Free Agent
                                        </Button>
                                    )
                                ) : (
                                    <Button className="w-full h-10 bg-blue-500 hover:bg-blue-400 text-white font-normal rounded-xl shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02]" onClick={() => setNegotiatingId(selectedPlayer.id)}>
                                        <DollarSign size={16} className="mr-2" /> Make Transfer Offer
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* History Tab */}
                {activeTab === "history" && (
                    <div className={cn("p-4 space-y-2 overflow-y-auto flex-1", scrollbarClass)}>
                        {transferHistory && transferHistory.length > 0 ? (
                            [...transferHistory].sort((a, b) => b.week - a.week).map(t => {
                                const player = players.find(p => p.id === t.playerId)
                                const toTeam = teams.find(team => team.id === t.toTeamId)

                                return (
                                    <div key={t.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition-colors group">
                                        <div className="flex items-center gap-3">
                                            {/* Player Image */}
                                            <div className="w-10 h-10 rounded-lg bg-black/20 overflow-hidden flex items-center justify-center border border-white/5 shrink-0">
                                                {player ? (
                                                    <PlayerPortrait src={player.portraitPath} alt={t.playerName} size={40} />
                                                ) : <Users size={20} className="text-white/20" />}
                                            </div>

                                            <div>
                                                <div className="flex items-center gap-1.5">
                                                    <p className="text-xs font-bold text-white mb-0.5">{t.playerName}</p>
                                                    {player && <CountryFlag country={player.nationality} className="w-3 opacity-70" />}
                                                </div>
                                                <div className="flex items-center gap-1.5 text-[10px] text-white/50 uppercase font-bold">
                                                    <span>{t.fromTeamName || "Free Agent"}</span>
                                                    <ArrowRight size={8} />
                                                    <div className="flex items-center gap-1 text-white">
                                                        {toTeam && <div className="w-3 h-3 overflow-hidden rounded-full bg-black/40 flex items-center justify-center"><TeamLogoImage src={toTeam.logoPath} alt={toTeam.name} size={12} /></div>}
                                                        <span>{t.toTeamName}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs font-bold text-emerald-400 group-hover:scale-110 transition-transform origin-right">{t.fee > 0 ? `$${t.fee.toLocaleString()}` : "Free"}</p>
                                            <p className="text-[9px] text-white/30 font-bold uppercase">Week {t.week}</p>
                                        </div>
                                    </div>
                                )
                            })
                        ) : <div className="text-center text-white/30 py-8 text-xs font-bold uppercase">No transfer history</div>}
                    </div>
                )}
            </div>

            {/* Modals */}
            {negotiatingId && (
                <NegotiationModal
                    playerId={negotiatingId}
                    isOpen={!!negotiatingId}
                    onClose={() => setNegotiatingId(null)}
                    className="absolute z-modal"
                />
            )}
        </div>
    )
}

export const MarketApp = memo(MarketAppComponent)
