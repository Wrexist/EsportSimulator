"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useGameStore } from "@/store/game-store"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
    Terminal,
    Coins,
    Flame,
    FastForward,
    Heart,
    Zap,
    Play,
    Trophy,
    Bell,
    Star,
    Medal,
    Briefcase,
    Users,
    Shield,
    Sparkles,
    Crown,
    Skull,
    Swords,
    TrendingUp,
    Gift,
    SkipForward,
    RefreshCcw,
    Settings2,
    X,
    Download,
    Trash2,
    Clock,
    Globe,
    Target,
    ChevronRight,
} from "lucide-react"
import { isDevToolsEnabled } from "@/lib/runtime-flags"

export function DevTools() {
    const devToolsEnabled = isDevToolsEnabled()
    const [isOpen, setIsOpen] = useState(false)
    const [activeTab, setActiveTab] = useState("economy")
    const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
    const [customAmount, setCustomAmount] = useState("")
    const [customAge, setCustomAge] = useState("37")
    const [nukeConfirm, setNukeConfirm] = useState(false)
    const router = useRouter()
    const store = useGameStore()

    // Toggle with F9
    useEffect(() => {
        if (!devToolsEnabled) return

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "F9") {
                setIsOpen(prev => !prev)
            }
        }
        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [devToolsEnabled])

    const handleQuickStart = useCallback(async () => {
        await store.initializeNewGame("Quick Test Save", "team_navi")
        router.push("/squad")
        setIsOpen(false)
    }, [store, router])

    const exportState = useCallback(() => {
        const state = useGameStore.getState()
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `devtools-state-w${state.currentWeek}.json`
        a.click()
        URL.revokeObjectURL(url)
        store.addToast({ message: "State exported to JSON", type: "info" })
    }, [store])

    const gameLoaded = store.isInitialized

    const myTeam = gameLoaded ? store.teams.find(t => t.id === store.playerTeamId) : null
    const rosterPlayers = (myTeam?.rosterIds || [])
        .map(id => store.players.find(p => p.id === id))
        .filter(Boolean) as any[]
    const injuredCount = rosterPlayers.filter(p => p?.injury).length
    const weeksToYearEnd = store.currentWeek > 0 ? 52 - (store.currentWeek % 52) : 52

    // Auto-select first player if none selected
    const targetPlayerId = selectedPlayerId || rosterPlayers[0]?.id
    const targetPlayer = store.players.find(p => p.id === targetPlayerId)

    if (!devToolsEnabled) return null

    return (
        <>
            {/* Trigger Button — positioned left of BugReportButton */}
            <motion.button
                onClick={() => setIsOpen(!isOpen)}
                className="fixed bottom-6 right-20 z-devtools group"
                title="Dev Tools (F9)"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.5 }}
            >
                <div className={`relative flex items-center justify-center w-12 h-12 rounded-full backdrop-blur-md border shadow-lg transition-all duration-200 ${isOpen
                    ? "bg-red-500/30 border-red-500/50 shadow-red-500/20"
                    : "bg-white/10 border-white/20 hover:bg-red-500/20 hover:border-red-500/30"
                    }`}>
                    <Terminal className={`w-5 h-5 transition-colors ${isOpen ? "text-red-400" : "text-white/60 group-hover:text-red-400"}`} />
                    {/* Active indicator dot */}
                    <span className={`absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-black ${isOpen ? "bg-red-500 animate-pulse" : "bg-emerald-500"}`} />
                </div>
                {/* Tooltip */}
                <div className="absolute bottom-full right-0 mb-2 px-3 py-1.5 rounded-lg bg-black/90 text-white text-xs font-mono whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-white/10">
                    Dev Tools (F9)
                </div>
            </motion.button>

            {/* Panel */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 50, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 50, scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className="fixed bottom-20 right-6 z-devtools w-[480px] max-h-[75vh] bg-black/95 border border-red-500/20 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden backdrop-blur-xl flex flex-col"
                    >
                        {/* Header */}
                        <div className="px-4 py-3 bg-gradient-to-r from-red-950/50 to-black border-b border-red-500/20 flex justify-between items-center shrink-0">
                            <h3 className="font-mono font-bold text-red-400 flex items-center gap-2 text-sm">
                                <Terminal size={14} /> DEV TOOLS
                            </h3>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-muted-foreground font-mono bg-white/5 px-2 py-0.5 rounded">
                                    {gameLoaded ? `W${store.currentWeek}` : "No Game"}
                                </span>
                                <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="h-7 w-7 text-muted-foreground hover:text-white">
                                    <X size={14} />
                                </Button>
                            </div>
                        </div>

                        {/* Content */}
                        {!gameLoaded ? (
                            <div className="p-6 text-center space-y-4">
                                <p className="text-sm text-muted-foreground font-mono">No game loaded</p>
                                <Button size="sm" variant="destructive" onClick={handleQuickStart} className="font-mono text-xs">
                                    <Play size={12} className="mr-2" /> Quick Start (Navi)
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => { router.push("/new-game"); setIsOpen(false) }} className="font-mono text-xs ml-2">
                                    <RefreshCcw size={12} className="mr-2" /> New Game
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => { router.push("/load-game"); setIsOpen(false) }} className="font-mono text-xs ml-2">
                                    Load Game
                                </Button>
                            </div>
                        ) : (
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                            <TabsList className="shrink-0 mx-3 mt-3 w-auto bg-white/5 h-8">
                                <TabsTrigger value="economy" className="text-[11px] gap-1 px-2 data-[state=active]:text-emerald-400">
                                    <Coins size={11} /> Economy
                                </TabsTrigger>
                                <TabsTrigger value="players" className="text-[11px] gap-1 px-2 data-[state=active]:text-violet-400">
                                    <Flame size={11} /> Players
                                </TabsTrigger>
                                <TabsTrigger value="time" className="text-[11px] gap-1 px-2 data-[state=active]:text-amber-400">
                                    <Clock size={11} /> Time
                                </TabsTrigger>
                                <TabsTrigger value="events" className="text-[11px] gap-1 px-2 data-[state=active]:text-pink-400">
                                    <Trophy size={11} /> Events
                                </TabsTrigger>
                                <TabsTrigger value="team" className="text-[11px] gap-1 px-2 data-[state=active]:text-blue-400">
                                    <Users size={11} /> Team
                                </TabsTrigger>
                                <TabsTrigger value="system" className="text-[11px] gap-1 px-2 data-[state=active]:text-slate-400">
                                    <Settings2 size={11} /> System
                                </TabsTrigger>
                            </TabsList>

                            <ScrollArea className="flex-1 min-h-0">
                                <div className="p-3">
                                    {/* ═══════════ ECONOMY TAB ═══════════ */}
                                    <TabsContent value="economy" className="space-y-3 mt-0">
                                        <p className="text-[10px] uppercase font-bold text-emerald-400/80 tracking-widest">Add Funds</p>
                                        <div className="grid grid-cols-3 gap-2">
                                            <Button size="sm" variant="outline" onClick={() => { store.debugAddFunds(10000); store.addToast({ message: "+$10K", type: "info" }) }} className="font-mono text-[11px] border-white/10 hover:bg-emerald-500/20 h-8">
                                                +$10K
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => { store.debugAddFunds(50000); store.addToast({ message: "+$50K", type: "info" }) }} className="font-mono text-[11px] border-white/10 hover:bg-emerald-500/20 h-8">
                                                +$50K
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => { store.debugAddFunds(100000); store.addToast({ message: "+$100K", type: "info" }) }} className="font-mono text-[11px] border-white/10 hover:bg-emerald-500/20 h-8">
                                                +$100K
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => { store.debugAddFunds(500000); store.addToast({ message: "+$500K", type: "info" }) }} className="font-mono text-[11px] border-white/10 hover:bg-emerald-500/20 h-8">
                                                +$500K
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => { store.debugAddFunds(1000000); store.addToast({ message: "+$1M", type: "info" }) }} className="font-mono text-[11px] border-white/10 hover:bg-emerald-500/20 h-8">
                                                +$1M
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => { store.debugAddFunds(10000000); store.addToast({ message: "+$10M", type: "info" }) }} className="font-mono text-[11px] border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-400 h-8">
                                                <Gift size={11} className="mr-1" /> +$10M
                                            </Button>
                                        </div>

                                        <p className="text-[10px] uppercase font-bold text-emerald-400/80 tracking-widest mt-3">Custom Amount</p>
                                        <div className="flex gap-2">
                                            <input
                                                type="number"
                                                value={customAmount}
                                                onChange={e => setCustomAmount(e.target.value)}
                                                placeholder="Enter amount..."
                                                className="flex-1 h-8 px-3 rounded-lg bg-white/5 border border-white/10 text-xs font-mono text-white placeholder:text-muted-foreground focus:outline-none focus:border-emerald-500/50"
                                            />
                                            <Button
                                                size="sm"
                                                onClick={() => {
                                                    const amount = parseInt(customAmount)
                                                    if (amount > 0) {
                                                        store.debugAddFunds(amount)
                                                        store.addToast({ message: `+$${amount.toLocaleString()}`, type: "info" })
                                                        setCustomAmount("")
                                                    }
                                                }}
                                                className="h-8 px-4 font-mono text-[11px] bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30"
                                            >
                                                Add
                                            </Button>
                                        </div>

                                        <div className="p-2.5 bg-white/5 rounded-lg border border-white/5 mt-2">
                                            <p className="text-[10px] text-muted-foreground font-mono">
                                                Current budget: <span className="text-emerald-400 font-bold">${(myTeam?.budget || 0).toLocaleString()}</span>
                                            </p>
                                        </div>
                                    </TabsContent>

                                    {/* ═══════════ PLAYERS TAB ═══════════ */}
                                    <TabsContent value="players" className="space-y-3 mt-0">
                                        {/* Player Selector */}
                                        <p className="text-[10px] uppercase font-bold text-violet-400/80 tracking-widest">Target Player</p>
                                        <select
                                            value={targetPlayerId || ""}
                                            onChange={e => setSelectedPlayerId(e.target.value)}
                                            className="w-full h-8 px-3 rounded-lg bg-white/5 border border-white/10 text-xs font-mono text-white focus:outline-none focus:border-violet-500/50 appearance-none cursor-pointer"
                                        >
                                            {rosterPlayers.map((p: any) => (
                                                <option key={p.id} value={p.id} className="bg-black text-white">
                                                    {p.nickname || `${p.firstName} ${p.lastName}`} — Skill {p.skill} / Lvl {p.level} / Age {p.age}
                                                </option>
                                            ))}
                                        </select>

                                        {targetPlayer && (
                                            <div className="p-2.5 bg-violet-500/5 rounded-lg border border-violet-500/10 text-[10px] font-mono text-muted-foreground">
                                                <span className="text-violet-400 font-bold">{targetPlayer.nickname}</span>
                                                {" — "}Skill: {targetPlayer.skill} | XP: {targetPlayer.xp} | Level: {targetPlayer.level} | Age: {targetPlayer.age}
                                                {targetPlayer.injury && <span className="text-red-400 ml-1">[INJURED]</span>}
                                            </div>
                                        )}

                                        <p className="text-[10px] uppercase font-bold text-violet-400/80 tracking-widest">Boost Skill</p>
                                        <div className="grid grid-cols-4 gap-2">
                                            <Button size="sm" variant="outline" onClick={() => { store.debugBoostPlayerSkill(targetPlayerId, 5); store.addToast({ message: "+5 Skill", type: "info" }) }} className="font-mono text-[11px] border-violet-500/20 hover:bg-violet-500/20 text-violet-400 h-8">
                                                <TrendingUp size={11} className="mr-1" /> +5
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => { store.debugBoostPlayerSkill(targetPlayerId, 10); store.addToast({ message: "+10 Skill", type: "info" }) }} className="font-mono text-[11px] border-violet-500/20 hover:bg-violet-500/20 text-violet-400 h-8">
                                                +10
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => { store.debugBoostPlayerSkill(targetPlayerId, 20); store.addToast({ message: "+20 Skill", type: "info" }) }} className="font-mono text-[11px] border-violet-500/20 hover:bg-violet-500/20 text-violet-400 h-8">
                                                +20
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => { store.debugMaxAllSkills(); store.addToast({ message: "All skills → 99", type: "info" }) }} className="font-mono text-[11px] border-violet-500/30 hover:bg-violet-500/20 text-violet-400 h-8">
                                                <Sparkles size={11} className="mr-1" /> 99
                                            </Button>
                                        </div>

                                        <p className="text-[10px] uppercase font-bold text-violet-400/80 tracking-widest">Add XP</p>
                                        <div className="grid grid-cols-4 gap-2">
                                            <Button size="sm" variant="outline" onClick={() => { store.debugAddXP(targetPlayerId, 100); store.addToast({ message: "+100 XP", type: "xp_gain" }) }} className="font-mono text-[11px] border-amber-500/20 hover:bg-amber-500/20 text-amber-400 h-8">
                                                +100
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => { store.debugAddXP(targetPlayerId, 500); store.addToast({ message: "+500 XP", type: "xp_gain" }) }} className="font-mono text-[11px] border-amber-500/20 hover:bg-amber-500/20 text-amber-400 h-8">
                                                +500
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => { store.debugAddXP(targetPlayerId, 2000); store.addToast({ message: "+2000 XP", type: "xp_gain" }) }} className="font-mono text-[11px] border-amber-500/20 hover:bg-amber-500/20 text-amber-400 h-8">
                                                +2K
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => { store.debugAddXP(targetPlayerId, 10000); store.addToast({ message: "+10000 XP", type: "xp_gain" }) }} className="font-mono text-[11px] border-amber-500/30 hover:bg-amber-500/20 text-amber-400 h-8">
                                                +10K
                                            </Button>
                                        </div>

                                        <p className="text-[10px] uppercase font-bold text-violet-400/80 tracking-widest">Set Age</p>
                                        <div className="flex gap-2">
                                            <input
                                                type="number"
                                                value={customAge}
                                                onChange={e => setCustomAge(e.target.value)}
                                                min={16}
                                                max={50}
                                                className="w-20 h-8 px-3 rounded-lg bg-white/5 border border-white/10 text-xs font-mono text-white focus:outline-none focus:border-violet-500/50"
                                            />
                                            <Button
                                                size="sm"
                                                onClick={() => {
                                                    const age = parseInt(customAge)
                                                    if (age >= 16 && age <= 50) {
                                                        store.debugSetPlayerAge(targetPlayerId, age)
                                                        store.addToast({ message: `Age → ${age}`, type: "info" })
                                                    }
                                                }}
                                                className="h-8 px-3 font-mono text-[11px] bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/30"
                                            >
                                                Set Age
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => { store.debugTriggerInjury(targetPlayerId); store.addToast({ message: "Player injured", type: "info" }) }}
                                                className="h-8 px-3 font-mono text-[11px] border-red-500/20 hover:bg-red-500/20 text-red-400"
                                            >
                                                <Skull size={11} className="mr-1" /> Injure
                                            </Button>
                                        </div>

                                        <p className="text-[10px] uppercase font-bold text-violet-400/80 tracking-widest">Team-Wide</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            <Button size="sm" variant="outline" onClick={() => { store.debugHealAll(); store.addToast({ message: "All healed + energy restored", type: "info" }) }} className="font-mono text-[11px] border-white/10 hover:bg-rose-500/20 justify-start h-8">
                                                <Heart size={11} className="mr-1.5 text-rose-400" /> Heal All
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => { store.debugMaxMorale(); store.addToast({ message: "Max morale + chemistry", type: "info" }) }} className="font-mono text-[11px] border-white/10 hover:bg-purple-500/20 justify-start h-8">
                                                <Zap size={11} className="mr-1.5 text-purple-400" /> Max Morale
                                            </Button>
                                        </div>
                                    </TabsContent>

                                    {/* ═══════════ TIME TAB ═══════════ */}
                                    <TabsContent value="time" className="space-y-3 mt-0">
                                        <p className="text-[10px] uppercase font-bold text-amber-400/80 tracking-widest">Advance Weeks</p>
                                        <div className="grid grid-cols-3 gap-2">
                                            <Button size="sm" variant="outline" onClick={() => { store.debugFastForward(1); store.addToast({ message: "+1 Week", type: "info" }) }} className="font-mono text-[11px] border-white/10 hover:bg-amber-500/20 h-8">
                                                +1W
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => { store.debugFastForward(4); store.addToast({ message: "+4 Weeks", type: "info" }) }} className="font-mono text-[11px] border-white/10 hover:bg-amber-500/20 h-8">
                                                +4W
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => { store.debugFastForward(12); store.addToast({ message: "+12 Weeks", type: "info" }) }} className="font-mono text-[11px] border-white/10 hover:bg-amber-500/20 h-8">
                                                +12W
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => { store.debugFastForward(26); store.addToast({ message: "+26 Weeks", type: "info" }) }} className="font-mono text-[11px] border-white/10 hover:bg-amber-500/20 h-8">
                                                +26W
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => { store.debugFastForward(52); store.addToast({ message: "+52 Weeks (1 Year)", type: "info" }) }} className="font-mono text-[11px] border-amber-500/30 hover:bg-amber-500/20 text-amber-400 h-8">
                                                +1Y
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => { store.debugFastForward(weeksToYearEnd); store.addToast({ message: `+${weeksToYearEnd}W (Year End)`, type: "info" }) }} className="font-mono text-[11px] border-amber-500/30 hover:bg-amber-500/20 text-amber-400 h-8">
                                                <FastForward size={11} className="mr-1" /> YE ({weeksToYearEnd}W)
                                            </Button>
                                        </div>

                                        <p className="text-[10px] uppercase font-bold text-amber-400/80 tracking-widest mt-3">Game Speed</p>
                                        <div className="grid grid-cols-3 gap-2">
                                            {(["normal", "fast", "very-fast"] as const).map(speed => (
                                                <Button
                                                    key={speed}
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => { store.setGameSpeed(speed); store.addToast({ message: `Speed: ${speed}`, type: "info" }) }}
                                                    className={`font-mono text-[11px] h-8 ${store.gameSpeed === speed
                                                        ? "border-amber-500/50 bg-amber-500/20 text-amber-400"
                                                        : "border-white/10 hover:bg-amber-500/10"
                                                        }`}
                                                >
                                                    {speed === "normal" ? "Normal" : speed === "fast" ? "Fast" : "V.Fast"}
                                                </Button>
                                            ))}
                                        </div>

                                        <p className="text-[10px] uppercase font-bold text-amber-400/80 tracking-widest mt-3">Time Mode</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            {(["WEEKLY", "HYBRID_DAILY"] as const).map(mode => (
                                                <Button
                                                    key={mode}
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => { store.setTimeMode(mode); store.addToast({ message: `Mode: ${mode}`, type: "info" }) }}
                                                    className={`font-mono text-[11px] h-8 ${store.timeMode === mode
                                                        ? "border-amber-500/50 bg-amber-500/20 text-amber-400"
                                                        : "border-white/10 hover:bg-amber-500/10"
                                                        }`}
                                                >
                                                    {mode === "WEEKLY" ? "Weekly" : "Daily (Hybrid)"}
                                                </Button>
                                            ))}
                                        </div>

                                        <div className="p-2.5 bg-white/5 rounded-lg border border-white/5 mt-2">
                                            <p className="text-[10px] text-muted-foreground font-mono">
                                                Week <span className="text-amber-400 font-bold">{store.currentWeek}</span>
                                                {" · "}Day <span className="text-white font-bold">{store.currentDay || 1}</span>
                                                {" · "}<span className="text-white">{store.gameSpeed}</span>
                                                {" · "}<span className="text-white">{store.timeMode}</span>
                                            </p>
                                        </div>
                                    </TabsContent>

                                    {/* ═══════════ EVENTS TAB ═══════════ */}
                                    <TabsContent value="events" className="space-y-3 mt-0">
                                        <p className="text-[10px] uppercase font-bold text-pink-400/80 tracking-widest">Trigger Events</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            <Button size="sm" variant="outline" onClick={() => { store.debugTriggerCelebration(); store.addToast({ message: "Celebration triggered", type: "info" }) }} className="font-mono text-[11px] border-amber-500/20 hover:bg-amber-500/20 justify-start text-amber-400 h-8">
                                                <Trophy size={11} className="mr-1.5" /> Celebration
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => { store.debugTriggerLegendPick(); store.addToast({ message: "Legend pick triggered", type: "info" }) }} className="font-mono text-[11px] border-amber-500/20 hover:bg-amber-500/20 justify-start text-amber-400 h-8">
                                                <Crown size={11} className="mr-1.5" /> Legend Pick
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => { store.debugTriggerSeasonRecap(); store.addToast({ message: "Season recap triggered", type: "info" }) }} className="font-mono text-[11px] border-blue-500/20 hover:bg-blue-500/20 justify-start text-blue-400 h-8">
                                                <Star size={11} className="mr-1.5" /> Season Recap
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => { store.debugTriggerTransferOffer(); store.addToast({ message: "Transfer offer triggered", type: "info" }) }} className="font-mono text-[11px] border-green-500/20 hover:bg-green-500/20 justify-start text-green-400 h-8">
                                                <Swords size={11} className="mr-1.5" /> Transfer Offer
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => { store.debugTriggerJobOffer(); store.addToast({ message: "Job offer generated", type: "info" }) }} className="font-mono text-[11px] border-indigo-500/20 hover:bg-indigo-500/20 justify-start text-indigo-400 h-8">
                                                <Briefcase size={11} className="mr-1.5" /> Job Offer
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => { store.debugTriggerRetirement(); store.addToast({ message: "Retirement forced", type: "info" }) }} className="font-mono text-[11px] border-red-500/20 hover:bg-red-500/20 justify-start text-red-400 h-8">
                                                <Skull size={11} className="mr-1.5" /> Retirement
                                            </Button>
                                        </div>

                                        <p className="text-[10px] uppercase font-bold text-pink-400/80 tracking-widest mt-3">Toast Testers</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            <Button size="sm" variant="outline" onClick={() => store.addToast({ message: "Player leveled up! +1 Skill Point", type: "level_up" })} className="font-mono text-[11px] border-emerald-500/20 hover:bg-emerald-500/20 justify-start text-emerald-400 h-8">
                                                <TrendingUp size={11} className="mr-1.5" /> Level Up
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => store.addToast({ message: "+500 XP earned from training", type: "xp_gain" })} className="font-mono text-[11px] border-amber-500/20 hover:bg-amber-500/20 justify-start text-amber-400 h-8">
                                                <Star size={11} className="mr-1.5" /> XP Gain
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => store.addToast({ message: "Achievement Unlocked: First Win!", type: "achievement" })} className="font-mono text-[11px] border-purple-500/20 hover:bg-purple-500/20 justify-start text-purple-400 h-8">
                                                <Medal size={11} className="mr-1.5" /> Achievement
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => store.addToast({ message: "System notification test", type: "info" })} className="font-mono text-[11px] border-cyan-500/20 hover:bg-cyan-500/20 justify-start text-cyan-400 h-8">
                                                <Bell size={11} className="mr-1.5" /> Info
                                            </Button>
                                        </div>

                                        <p className="text-[10px] uppercase font-bold text-pink-400/80 tracking-widest mt-3">Misc</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            <Button size="sm" variant="outline" onClick={() => { store.triggerTutorial(); store.addToast({ message: "Tutorial triggered", type: "info" }) }} className="font-mono text-[11px] border-pink-500/20 hover:bg-pink-500/20 justify-start text-pink-400 h-8">
                                                <Sparkles size={11} className="mr-1.5" /> Start Tutorial
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => {
                                                    try {
                                                        const { steamService } = require("@/engine/steam-service")
                                                        steamService.unlockAchievement("FIRST_WIN")
                                                        store.addToast({ message: "Steam achievement unlocked", type: "achievement" })
                                                    } catch {
                                                        store.addToast({ message: "Steam not available", type: "info" })
                                                    }
                                                }}
                                                className="font-mono text-[11px] border-amber-500/20 hover:bg-amber-500/20 justify-start text-amber-400 h-8"
                                            >
                                                <Trophy size={11} className="mr-1.5" /> Steam Achv.
                                            </Button>
                                        </div>
                                    </TabsContent>

                                    {/* ═══════════ TEAM TAB ═══════════ */}
                                    <TabsContent value="team" className="space-y-3 mt-0">
                                        <p className="text-[10px] uppercase font-bold text-blue-400/80 tracking-widest">Switch Team</p>
                                        <div className="flex gap-2">
                                            <select
                                                value={store.playerTeamId || ""}
                                                onChange={e => {
                                                    if (e.target.value) {
                                                        store.switchTeam(e.target.value)
                                                        const team = store.teams.find(t => t.id === e.target.value)
                                                        store.addToast({ message: `Switched to ${team?.name || e.target.value}`, type: "info" })
                                                    }
                                                }}
                                                className="flex-1 h-8 px-3 rounded-lg bg-white/5 border border-white/10 text-xs font-mono text-white focus:outline-none focus:border-blue-500/50 appearance-none cursor-pointer"
                                            >
                                                {[...store.teams]
                                                    .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
                                                    .map(t => (
                                                        <option key={t.id} value={t.id} className="bg-black text-white">
                                                            {t.name} ({t.tier}) — ELO {t.elo}
                                                        </option>
                                                    ))
                                                }
                                            </select>
                                        </div>

                                        <p className="text-[10px] uppercase font-bold text-blue-400/80 tracking-widest mt-3">Qualify for Tournament</p>
                                        <div className="flex gap-2">
                                            <select
                                                id="tournament-select"
                                                className="flex-1 h-8 px-3 rounded-lg bg-white/5 border border-white/10 text-xs font-mono text-white focus:outline-none focus:border-blue-500/50 appearance-none cursor-pointer"
                                            >
                                                {(store.tournaments || [])
                                                    .filter(t => !t.isCompleted)
                                                    .slice(0, 20)
                                                    .map(t => (
                                                        <option key={t.id} value={t.id} className="bg-black text-white">
                                                            {t.name} (W{t.startWeek})
                                                        </option>
                                                    ))
                                                }
                                            </select>
                                            <Button
                                                size="sm"
                                                onClick={() => {
                                                    const select = document.getElementById("tournament-select") as HTMLSelectElement
                                                    if (select?.value) {
                                                        store.qualifyForTournament(select.value, "debug")
                                                        store.addToast({ message: "Qualified for tournament", type: "info" })
                                                    }
                                                }}
                                                className="h-8 px-3 font-mono text-[11px] bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30"
                                            >
                                                Qualify
                                            </Button>
                                        </div>

                                        <p className="text-[10px] uppercase font-bold text-blue-400/80 tracking-widest mt-3">Quick Actions</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            <Button size="sm" variant="destructive" onClick={handleQuickStart} className="font-mono text-[11px] justify-start bg-red-500/20 hover:bg-red-500/40 text-red-200 h-8">
                                                <Play size={11} className="mr-1.5" /> Restart (Navi)
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => { store.refreshStaffMarket(); store.addToast({ message: "Staff market refreshed", type: "info" }) }} className="font-mono text-[11px] border-white/10 hover:bg-blue-500/20 justify-start h-8">
                                                <RefreshCcw size={11} className="mr-1.5" /> Refresh Staff
                                            </Button>
                                        </div>

                                        <p className="text-[10px] uppercase font-bold text-blue-400/80 tracking-widest mt-3">Navigate</p>
                                        <div className="grid grid-cols-3 gap-2">
                                            {[
                                                { label: "Squad", path: "/squad", icon: <Shield size={11} /> },
                                                { label: "Desktop", path: "/desktop", icon: <Bell size={11} /> },
                                                { label: "Finances", path: "/finances", icon: <Coins size={11} /> },
                                                { label: "Training", path: "/training", icon: <Target size={11} /> },
                                                { label: "Scouting", path: "/scouting", icon: <Globe size={11} /> },
                                                { label: "New Game", path: "/new-game", icon: <RefreshCcw size={11} /> },
                                            ].map(nav => (
                                                <Button
                                                    key={nav.path}
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => { router.push(nav.path); setIsOpen(false) }}
                                                    className="font-mono text-[11px] border-white/10 hover:bg-white/5 justify-start h-8"
                                                >
                                                    <span className="mr-1">{nav.icon}</span> {nav.label}
                                                </Button>
                                            ))}
                                        </div>
                                    </TabsContent>

                                    {/* ═══════════ SYSTEM TAB ═══════════ */}
                                    <TabsContent value="system" className="space-y-3 mt-0">
                                        <p className="text-[10px] uppercase font-bold text-slate-400/80 tracking-widest">Difficulty</p>
                                        <div className="grid grid-cols-4 gap-2">
                                            {(["easy", "normal", "hard", "legendary"] as const).map(diff => (
                                                <Button
                                                    key={diff}
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => { store.setDifficulty(diff); store.addToast({ message: `Difficulty: ${diff}`, type: "info" }) }}
                                                    className={`font-mono text-[11px] h-8 capitalize ${store.difficulty === diff
                                                        ? "border-cyan-500/50 bg-cyan-500/20 text-cyan-400"
                                                        : "border-white/10 hover:bg-white/5"
                                                        }`}
                                                >
                                                    {diff}
                                                </Button>
                                            ))}
                                        </div>

                                        <p className="text-[10px] uppercase font-bold text-slate-400/80 tracking-widest mt-3">Tools</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            <Button size="sm" variant="outline" onClick={exportState} className="font-mono text-[11px] border-white/10 hover:bg-white/5 justify-start h-8">
                                                <Download size={11} className="mr-1.5" /> Export JSON
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => { router.push("/dev"); setIsOpen(false) }} className="font-mono text-[11px] border-white/10 hover:bg-white/5 justify-start h-8">
                                                <Terminal size={11} className="mr-1.5" /> Dev Page
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => { router.push("/animations"); setIsOpen(false) }} className="font-mono text-[11px] border-cyan-500/20 hover:bg-cyan-500/20 justify-start text-cyan-400 h-8">
                                                <Zap size={11} className="mr-1.5" /> Animation Lab
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => store.markAllEventsAsRead()}
                                                className="font-mono text-[11px] border-white/10 hover:bg-white/5 justify-start h-8"
                                            >
                                                <ChevronRight size={11} className="mr-1.5" /> Read All Events
                                            </Button>
                                        </div>

                                        <p className="text-[10px] uppercase font-bold text-red-400/80 tracking-widest mt-3">Danger Zone</p>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                                if (nukeConfirm) {
                                                    store.deleteAllSaves()
                                                    store.addToast({ message: "All saves nuked!", type: "info" })
                                                    setNukeConfirm(false)
                                                } else {
                                                    setNukeConfirm(true)
                                                    setTimeout(() => setNukeConfirm(false), 3000)
                                                }
                                            }}
                                            className={`font-mono text-[11px] w-full justify-start h-8 ${nukeConfirm
                                                ? "border-red-500/50 bg-red-500/30 text-red-300 animate-pulse"
                                                : "border-red-500/20 hover:bg-red-500/20 text-red-400"
                                                }`}
                                        >
                                            <Trash2 size={11} className="mr-1.5" />
                                            {nukeConfirm ? "Click again to confirm NUKE ALL SAVES" : "Nuke All Saves"}
                                        </Button>
                                    </TabsContent>
                                </div>
                            </ScrollArea>
                        </Tabs>
                        )}

                        {/* State Footer */}
                        {gameLoaded && (
                        <div className="px-4 py-2.5 bg-white/5 border-t border-white/5 shrink-0">
                            <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-[10px] font-mono">
                                <span className="text-muted-foreground">
                                    Week: <span className="text-white font-bold">{store.currentWeek}</span>
                                </span>
                                <span className="text-muted-foreground">
                                    Team: <span className="text-white font-bold truncate">{myTeam?.name || "N/A"}</span>
                                </span>
                                <span className="text-muted-foreground">
                                    Budget: <span className="text-emerald-400 font-bold">${(myTeam?.budget || 0).toLocaleString()}</span>
                                </span>
                                <span className="text-muted-foreground">
                                    Legends: <span className="text-amber-400 font-bold">{(store.signedLegendIds || []).length}/18</span>
                                </span>
                                <span className="text-muted-foreground">
                                    Events: <span className="text-white font-bold">{store.eventsLog?.length || 0}</span>
                                </span>
                                <span className="text-muted-foreground">
                                    Injuries: <span className={`font-bold ${injuredCount > 0 ? "text-red-400" : "text-white"}`}>{injuredCount}</span>
                                </span>
                            </div>
                        </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    )
}
