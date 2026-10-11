"use client"

import React, { useState, useEffect, useCallback, type ReactNode } from "react"
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
    RefreshCcw,
    Settings2,
    X,
    Download,
    Trash2,
    Clock,
    Globe,
    Target,
    ChevronRight
} from "lucide-react"
import { isDevToolsEnabled } from "@/lib/runtime-flags"
import { cn } from "@/lib/utils"

import { formatCurrency, formatSignedCurrency } from "@/lib/utils-extended"

/** Section overline inside a tab (v2: 11px, quiet, no per-tab colour). */
function Section({ label, tone, children }: { label: string; tone?: "danger"; children: ReactNode }) {
    return (
        <section className="space-y-2">
            <p className={cn("text-[11px] font-semibold uppercase tracking-[0.08em]", tone === "danger" ? "text-negative" : "text-ink-3")}>{label}</p>
            {children}
        </section>
    )
}

/** One tool action. `selected` marks the current choice in a set (gold = selection). */
function Tool({ onClick, children, title, selected, tone, className }: {
    onClick: () => void
    children: ReactNode
    title?: string
    selected?: boolean
    tone?: "danger"
    className?: string
}) {
    return (
        <Button
            size="sm"
            variant="outline"
            onClick={onClick}
            title={title}
            aria-pressed={selected}
            className={cn(
                "h-8 justify-start px-2.5 text-xs font-semibold tabular-nums [&_svg]:text-ink-3",
                // `!`: premium-ui.css skins every outline button's border and fill.
                selected && "border-gold! bg-gold/10! text-gold [&_svg]:text-gold",
                tone === "danger" && "text-negative hover:border-negative/50! [&_svg]:text-negative",
                className,
            )}
        >
            {children}
        </Button>
    )
}

const FIELD = "h-8 rounded border border-line bg-raised px-3 text-xs tabular-nums text-ink-1 placeholder:text-ink-3 outline-hidden focus-visible:border-gold"

/**
 * Mounts the dev panel only when dev tools are enabled. The panel subscribes
 * to the whole store, so in production it must not mount at all (it used to
 * subscribe and re-render on every store change, then return null).
 */
export function DevTools() {
    return isDevToolsEnabled() ? <DevToolsPanel /> : null
}

function DevToolsPanel() {
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
        await store.initializeNewGame("Quick Test Save", "team_default")
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
            {/* Trigger — left of the bug-report button, same square as the other corner tools */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "fixed bottom-6 right-20 z-devtools flex h-10 w-10 items-center justify-center rounded border bg-raised transition-colors",
                    isOpen ? "border-gold text-gold" : "border-line-strong text-ink-2 hover:bg-hover hover:text-ink-1",
                )}
                title="Dev tools (F9)"
                aria-label="Dev tools (F9)"
                aria-expanded={isOpen}
            >
                <Terminal className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>

            {/* Panel */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
                        role="dialog"
                        aria-label="Dev tools"
                        className="fixed bottom-20 right-6 z-devtools flex max-h-[75vh] w-[480px] flex-col overflow-hidden rounded-[10px] border border-line-strong bg-panel shadow-elev-3"
                    >
                        {/* Header */}
                        <div className="flex min-h-11 shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-2">
                            <div className="min-w-0">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gold">Developer · F9</p>
                                <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-1">
                                    <Terminal size={14} aria-hidden="true" className="text-ink-3" /> Dev tools
                                </h3>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="rounded-sm border border-line px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-ink-2">
                                    {gameLoaded ? `Week ${store.currentWeek}` : "No game"}
                                </span>
                                <Button variant="ghost" size="icon-sm" onClick={() => setIsOpen(false)} aria-label="Close dev tools" title="Close">
                                    <X size={15} aria-hidden="true" />
                                </Button>
                            </div>
                        </div>

                        {/* Content */}
                        {!gameLoaded ? (
                            <div className="space-y-4 p-6 text-center">
                                <p className="text-sm text-ink-2">No game loaded. Start or load a career to use the tools.</p>
                                <div className="flex flex-wrap justify-center gap-2">
                                    <Button size="sm" onClick={handleQuickStart}>
                                        <Play size={13} aria-hidden="true" /> Quick start (default team)
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => { router.push("/new-game"); setIsOpen(false) }}>
                                        <RefreshCcw size={13} aria-hidden="true" /> New game
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => { router.push("/load-game"); setIsOpen(false) }}>
                                        Load game
                                    </Button>
                                </div>
                            </div>
                        ) : (
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col gap-0">
                            <TabsList className="mx-3 mt-2 grid w-auto shrink-0 grid-cols-6">
                                <TabsTrigger value="economy" className="gap-1 px-1.5! text-xs!"><Coins size={13} aria-hidden="true" /> Economy</TabsTrigger>
                                <TabsTrigger value="players" className="gap-1 px-1.5! text-xs!"><Flame size={13} aria-hidden="true" /> Players</TabsTrigger>
                                <TabsTrigger value="time" className="gap-1 px-1.5! text-xs!"><Clock size={13} aria-hidden="true" /> Time</TabsTrigger>
                                <TabsTrigger value="events" className="gap-1 px-1.5! text-xs!"><Trophy size={13} aria-hidden="true" /> Events</TabsTrigger>
                                <TabsTrigger value="team" className="gap-1 px-1.5! text-xs!"><Users size={13} aria-hidden="true" /> Team</TabsTrigger>
                                <TabsTrigger value="system" className="gap-1 px-1.5! text-xs!"><Settings2 size={13} aria-hidden="true" /> System</TabsTrigger>
                            </TabsList>

                            <ScrollArea className="min-h-0 flex-1">
                                <div className="p-3">
                                    {/* ═══════════ ECONOMY TAB ═══════════ */}
                                    <TabsContent value="economy" className="mt-0 space-y-4">
                                        <Section label="Add funds">
                                            <div className="grid grid-cols-3 gap-2">
                                                <Tool onClick={() => { store.debugAddFunds(10000); store.addToast({ message: "+$10K", type: "info" }) }}>+$10K</Tool>
                                                <Tool onClick={() => { store.debugAddFunds(50000); store.addToast({ message: "+$50K", type: "info" }) }}>+$50K</Tool>
                                                <Tool onClick={() => { store.debugAddFunds(100000); store.addToast({ message: "+$100K", type: "info" }) }}>+$100K</Tool>
                                                <Tool onClick={() => { store.debugAddFunds(500000); store.addToast({ message: "+$500K", type: "info" }) }}>+$500K</Tool>
                                                <Tool onClick={() => { store.debugAddFunds(1000000); store.addToast({ message: "+$1M", type: "info" }) }}>+$1M</Tool>
                                                <Tool onClick={() => { store.debugAddFunds(10000000); store.addToast({ message: "+$10M", type: "info" }) }}>
                                                    <Gift size={13} aria-hidden="true" /> +$10M
                                                </Tool>
                                            </div>
                                        </Section>

                                        <Section label="Custom amount">
                                            <div className="flex gap-2">
                                                <input
                                                    type="number"
                                                    value={customAmount}
                                                    onChange={e => setCustomAmount(e.target.value)}
                                                    placeholder="Enter amount"
                                                    aria-label="Custom amount"
                                                    className={cn(FIELD, "flex-1")}
                                                />
                                                <Tool
                                                    onClick={() => {
                                                        const amount = parseInt(customAmount)
                                                        if (amount > 0) {
                                                            store.debugAddFunds(amount)
                                                            store.addToast({ message: formatSignedCurrency(amount, "$", false), type: "info" })
                                                            setCustomAmount("")
                                                        }
                                                    }}
                                                    className="justify-center px-4"
                                                >
                                                    Add
                                                </Tool>
                                            </div>
                                        </Section>

                                        <p className="rounded-md border border-line bg-shell px-3 py-2 text-xs text-ink-2">
                                            Current budget: <span className="font-semibold tabular-nums text-ink-1">{formatCurrency((myTeam?.budget || 0), "$", false)}</span>
                                        </p>
                                    </TabsContent>

                                    {/* ═══════════ PLAYERS TAB ═══════════ */}
                                    <TabsContent value="players" className="mt-0 space-y-4">
                                        <Section label="Target player">
                                            <select
                                                value={targetPlayerId || ""}
                                                onChange={e => setSelectedPlayerId(e.target.value)}
                                                aria-label="Target player"
                                                className={cn(FIELD, "w-full cursor-pointer")}
                                            >
                                                {rosterPlayers.map((p: any) => (
                                                    <option key={p.id} value={p.id} className="bg-panel text-ink-1">
                                                        {p.nickname || `${p.firstName} ${p.lastName}`} — Skill {p.skill} / Lvl {p.level} / Age {p.age}
                                                    </option>
                                                ))}
                                            </select>
                                            {targetPlayer && (
                                                <p className="rounded-md border border-line bg-shell px-3 py-2 text-xs tabular-nums text-ink-2">
                                                    <span className="font-semibold text-ink-1">{targetPlayer.nickname}</span>
                                                    {" — "}Skill {targetPlayer.skill} · XP {targetPlayer.xp} · Level {targetPlayer.level} · Age {targetPlayer.age}
                                                    {targetPlayer.injury && <span className="ml-1 font-semibold text-negative">Injured</span>}
                                                </p>
                                            )}
                                        </Section>

                                        <Section label="Boost skill">
                                            <div className="grid grid-cols-4 gap-2">
                                                <Tool onClick={() => { store.debugBoostPlayerSkill(targetPlayerId, 5); store.addToast({ message: "+5 Skill", type: "info" }) }}>
                                                    <TrendingUp size={13} aria-hidden="true" /> +5
                                                </Tool>
                                                <Tool onClick={() => { store.debugBoostPlayerSkill(targetPlayerId, 10); store.addToast({ message: "+10 Skill", type: "info" }) }}>+10</Tool>
                                                <Tool onClick={() => { store.debugBoostPlayerSkill(targetPlayerId, 20); store.addToast({ message: "+20 Skill", type: "info" }) }}>+20</Tool>
                                                <Tool onClick={() => { store.debugMaxAllSkills(); store.addToast({ message: "All skills → 99", type: "info" }) }}>
                                                    <Sparkles size={13} aria-hidden="true" /> 99
                                                </Tool>
                                            </div>
                                        </Section>

                                        <Section label="Add XP">
                                            <div className="grid grid-cols-4 gap-2">
                                                <Tool onClick={() => { store.debugAddXP(targetPlayerId, 100); store.addToast({ message: "+100 XP", type: "xp_gain" }) }}>+100</Tool>
                                                <Tool onClick={() => { store.debugAddXP(targetPlayerId, 500); store.addToast({ message: "+500 XP", type: "xp_gain" }) }}>+500</Tool>
                                                <Tool onClick={() => { store.debugAddXP(targetPlayerId, 2000); store.addToast({ message: "+2000 XP", type: "xp_gain" }) }}>+2K</Tool>
                                                <Tool onClick={() => { store.debugAddXP(targetPlayerId, 10000); store.addToast({ message: "+10000 XP", type: "xp_gain" }) }}>+10K</Tool>
                                            </div>
                                        </Section>

                                        <Section label="Set age">
                                            <div className="flex gap-2">
                                                <input
                                                    type="number"
                                                    value={customAge}
                                                    onChange={e => setCustomAge(e.target.value)}
                                                    min={16}
                                                    max={50}
                                                    aria-label="Age"
                                                    className={cn(FIELD, "w-20")}
                                                />
                                                <Tool
                                                    onClick={() => {
                                                        const age = parseInt(customAge)
                                                        if (age >= 16 && age <= 50) {
                                                            store.debugSetPlayerAge(targetPlayerId, age)
                                                            store.addToast({ message: `Age → ${age}`, type: "info" })
                                                        }
                                                    }}
                                                >
                                                    Set age
                                                </Tool>
                                                <Tool tone="danger" onClick={() => { store.debugTriggerInjury(targetPlayerId); store.addToast({ message: "Player injured", type: "info" }) }}>
                                                    <Skull size={13} aria-hidden="true" /> Injure
                                                </Tool>
                                            </div>
                                        </Section>

                                        <Section label="Team-wide">
                                            <div className="grid grid-cols-2 gap-2">
                                                <Tool onClick={() => { store.debugHealAll(); store.addToast({ message: "All healed + energy restored", type: "info" }) }}>
                                                    <Heart size={13} aria-hidden="true" /> Heal all
                                                </Tool>
                                                <Tool onClick={() => { store.debugMaxMorale(); store.addToast({ message: "Max morale + chemistry", type: "info" }) }}>
                                                    <Zap size={13} aria-hidden="true" /> Max morale
                                                </Tool>
                                            </div>
                                        </Section>
                                    </TabsContent>

                                    {/* ═══════════ TIME TAB ═══════════ */}
                                    <TabsContent value="time" className="mt-0 space-y-4">
                                        <Section label="Advance weeks">
                                            <div className="grid grid-cols-3 gap-2">
                                                <Tool onClick={() => { store.debugFastForward(1); store.addToast({ message: "+1 Week", type: "info" }) }}>+1 week</Tool>
                                                <Tool onClick={() => { store.debugFastForward(4); store.addToast({ message: "+4 Weeks", type: "info" }) }}>+4 weeks</Tool>
                                                <Tool onClick={() => { store.debugFastForward(12); store.addToast({ message: "+12 Weeks", type: "info" }) }}>+12 weeks</Tool>
                                                <Tool onClick={() => { store.debugFastForward(26); store.addToast({ message: "+26 Weeks", type: "info" }) }}>+26 weeks</Tool>
                                                <Tool onClick={() => { store.debugFastForward(52); store.addToast({ message: "+52 Weeks (1 Year)", type: "info" }) }}>+1 year</Tool>
                                                <Tool onClick={() => { store.debugFastForward(weeksToYearEnd); store.addToast({ message: `+${weeksToYearEnd}W (Year End)`, type: "info" }) }}>
                                                    <FastForward size={13} aria-hidden="true" /> Year end ({weeksToYearEnd}w)
                                                </Tool>
                                            </div>
                                        </Section>

                                        <Section label="Game speed">
                                            <div className="grid grid-cols-3 gap-2">
                                                {(["normal", "fast", "very-fast"] as const).map(speed => (
                                                    <Tool
                                                        key={speed}
                                                        selected={store.gameSpeed === speed}
                                                        onClick={() => { store.setGameSpeed(speed); store.addToast({ message: `Speed: ${speed}`, type: "info" }) }}
                                                        className="justify-center"
                                                    >
                                                        {speed === "normal" ? "Normal" : speed === "fast" ? "Fast" : "Very fast"}
                                                    </Tool>
                                                ))}
                                            </div>
                                        </Section>

                                        <Section label="Time mode">
                                            <div className="grid grid-cols-2 gap-2">
                                                {(["WEEKLY", "HYBRID_DAILY"] as const).map(mode => (
                                                    <Tool
                                                        key={mode}
                                                        selected={store.timeMode === mode}
                                                        onClick={() => { store.setTimeMode(mode); store.addToast({ message: `Mode: ${mode}`, type: "info" }) }}
                                                        className="justify-center"
                                                    >
                                                        {mode === "WEEKLY" ? "Weekly" : "Daily (hybrid)"}
                                                    </Tool>
                                                ))}
                                            </div>
                                        </Section>

                                        <p className="rounded-md border border-line bg-shell px-3 py-2 text-xs tabular-nums text-ink-2">
                                            Week <span className="font-semibold text-ink-1">{store.currentWeek}</span>
                                            {" · "}Day <span className="font-semibold text-ink-1">{store.currentDay || 1}</span>
                                            {" · "}<span className="text-ink-1">{store.gameSpeed}</span>
                                            {" · "}<span className="text-ink-1">{store.timeMode}</span>
                                        </p>
                                    </TabsContent>

                                    {/* ═══════════ EVENTS TAB ═══════════ */}
                                    <TabsContent value="events" className="mt-0 space-y-4">
                                        <Section label="Trigger events">
                                            <div className="grid grid-cols-2 gap-2">
                                                <Tool onClick={() => { store.debugTriggerCelebration(); store.addToast({ message: "Celebration triggered", type: "info" }) }}>
                                                    <Trophy size={13} aria-hidden="true" /> Celebration
                                                </Tool>
                                                <Tool onClick={() => { store.debugTriggerLegendPick(); store.addToast({ message: "Legend pick triggered", type: "info" }) }}>
                                                    <Crown size={13} aria-hidden="true" /> Legend pick
                                                </Tool>
                                                <Tool onClick={() => store.debugTriggerMoment("season-review")} title="The last closed season of this save (or the season so far), from its real records">
                                                    <Star size={13} aria-hidden="true" /> Season review
                                                </Tool>
                                                <Tool onClick={() => { store.debugTriggerTransferOffer(); store.addToast({ message: "Transfer offer triggered", type: "info" }) }}>
                                                    <Swords size={13} aria-hidden="true" /> Transfer offer
                                                </Tool>
                                                <Tool onClick={() => { store.debugTriggerJobOffer(); store.addToast({ message: "Job offer generated", type: "info" }) }}>
                                                    <Briefcase size={13} aria-hidden="true" /> Job offer
                                                </Tool>
                                                <Tool tone="danger" onClick={() => { store.debugTriggerRetirement(); store.addToast({ message: "Retirement forced", type: "info" }) }}>
                                                    <Skull size={13} aria-hidden="true" /> Retirement
                                                </Tool>
                                            </div>
                                        </Section>

                                        <Section label="Moments (demo data)">
                                            <div className="grid grid-cols-2 gap-2">
                                                {([
                                                    ["Title: major", () => store.debugTriggerMoment("title", { major: true })],
                                                    ["Title: minor", () => store.debugTriggerMoment("title", { major: false })],
                                                    ["League title", () => store.debugTriggerMoment("league-title")],
                                                    ["Promotion", () => store.debugTriggerMoment("promotion")],
                                                    ["Relegation", () => store.debugTriggerMoment("relegation")],
                                                    ["Signing", () => store.debugTriggerMoment("signing")],
                                                    ["Welcome", () => store.debugTriggerMoment("welcome")],
                                                ] as const).map(([label, run]) => (
                                                    <Tool key={label} onClick={run}>
                                                        <Trophy size={13} aria-hidden="true" /> {label}
                                                    </Tool>
                                                ))}
                                            </div>
                                        </Section>

                                        <Section label="Toast testers">
                                            <div className="grid grid-cols-2 gap-2">
                                                <Tool onClick={() => store.addToast({ message: "Player leveled up! +1 Skill Point", type: "level_up" })}>
                                                    <TrendingUp size={13} aria-hidden="true" /> Level up
                                                </Tool>
                                                <Tool onClick={() => store.addToast({ message: "+500 XP earned from training", type: "xp_gain" })}>
                                                    <Star size={13} aria-hidden="true" /> XP gain
                                                </Tool>
                                                <Tool onClick={() => store.addToast({ message: "Achievement Unlocked: First Win!", type: "achievement" })}>
                                                    <Medal size={13} aria-hidden="true" /> Achievement
                                                </Tool>
                                                <Tool onClick={() => store.addToast({ message: "System notification test", type: "info" })}>
                                                    <Bell size={13} aria-hidden="true" /> Info
                                                </Tool>
                                            </div>
                                        </Section>

                                        <Section label="Misc">
                                            <div className="grid grid-cols-2 gap-2">
                                                <Tool onClick={() => { store.triggerTutorial(); store.addToast({ message: "Tutorial triggered", type: "info" }) }}>
                                                    <Sparkles size={13} aria-hidden="true" /> Start tutorial
                                                </Tool>
                                                <Tool
                                                    onClick={() => {
                                                        try {
                                                            const { steamService } = require("@/engine/steam-service")
                                                            steamService.unlockAchievement("FIRST_WIN")
                                                            store.addToast({ message: "Steam achievement unlocked", type: "achievement" })
                                                        } catch {
                                                            store.addToast({ message: "Steam not available", type: "info" })
                                                        }
                                                    }}
                                                >
                                                    <Trophy size={13} aria-hidden="true" /> Steam achievement
                                                </Tool>
                                            </div>
                                        </Section>
                                    </TabsContent>

                                    {/* ═══════════ TEAM TAB ═══════════ */}
                                    <TabsContent value="team" className="mt-0 space-y-4">
                                        <Section label="Switch team">
                                            <select
                                                value={store.playerTeamId || ""}
                                                onChange={e => {
                                                    if (e.target.value) {
                                                        store.switchTeam(e.target.value)
                                                        const team = store.teams.find(t => t.id === e.target.value)
                                                        store.addToast({ message: `Switched to ${team?.name || e.target.value}`, type: "info" })
                                                    }
                                                }}
                                                aria-label="Switch team"
                                                className={cn(FIELD, "w-full cursor-pointer")}
                                            >
                                                {[...store.teams]
                                                    .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
                                                    .map(t => (
                                                        <option key={t.id} value={t.id} className="bg-panel text-ink-1">
                                                            {t.name} ({t.tier}) — ELO {t.elo}
                                                        </option>
                                                    ))
                                                }
                                            </select>
                                        </Section>

                                        <Section label="Qualify for tournament">
                                            <div className="flex gap-2">
                                                <select
                                                    id="tournament-select"
                                                    aria-label="Tournament"
                                                    className={cn(FIELD, "min-w-0 flex-1 cursor-pointer")}
                                                >
                                                    {(store.tournaments || [])
                                                        .filter(t => !t.isCompleted)
                                                        .slice(0, 20)
                                                        .map(t => (
                                                            <option key={t.id} value={t.id} className="bg-panel text-ink-1">
                                                                {t.name} (W{t.startWeek})
                                                            </option>
                                                        ))
                                                    }
                                                </select>
                                                <Tool
                                                    onClick={() => {
                                                        const select = document.getElementById("tournament-select") as HTMLSelectElement
                                                        if (select?.value) {
                                                            store.qualifyForTournament(select.value, "debug")
                                                            store.addToast({ message: "Qualified for tournament", type: "info" })
                                                        }
                                                    }}
                                                >
                                                    Qualify
                                                </Tool>
                                            </div>
                                        </Section>

                                        <Section label="Quick actions">
                                            <div className="grid grid-cols-2 gap-2">
                                                <Tool tone="danger" onClick={handleQuickStart}>
                                                    <Play size={13} aria-hidden="true" /> Restart (default team)
                                                </Tool>
                                                <Tool onClick={() => { store.refreshStaffMarket(); store.addToast({ message: "Staff market refreshed", type: "info" }) }}>
                                                    <RefreshCcw size={13} aria-hidden="true" /> Refresh staff
                                                </Tool>
                                            </div>
                                        </Section>

                                        <Section label="Navigate">
                                            <div className="grid grid-cols-3 gap-2">
                                                {[
                                                    { label: "Squad", path: "/squad", icon: <Shield size={13} aria-hidden="true" /> },
                                                    { label: "Inbox", path: "?inbox=all", icon: <Bell size={13} aria-hidden="true" /> },
                                                    { label: "Finances", path: "/finances", icon: <Coins size={13} aria-hidden="true" /> },
                                                    { label: "Training", path: "/training", icon: <Target size={13} aria-hidden="true" /> },
                                                    { label: "Scouting", path: "/scouting", icon: <Globe size={13} aria-hidden="true" /> },
                                                    { label: "New game", path: "/new-game", icon: <RefreshCcw size={13} aria-hidden="true" /> },
                                                ].map(nav => (
                                                    <Tool key={nav.path} onClick={() => { router.push(nav.path); setIsOpen(false) }}>
                                                        {nav.icon} {nav.label}
                                                    </Tool>
                                                ))}
                                            </div>
                                        </Section>
                                    </TabsContent>

                                    {/* ═══════════ SYSTEM TAB ═══════════ */}
                                    <TabsContent value="system" className="mt-0 space-y-4">
                                        <Section label="Difficulty">
                                            <div className="grid grid-cols-4 gap-2">
                                                {(["easy", "normal", "hard", "legendary"] as const).map(diff => (
                                                    <Tool
                                                        key={diff}
                                                        selected={store.difficulty === diff}
                                                        onClick={() => { store.setDifficulty(diff); store.addToast({ message: `Difficulty: ${diff}`, type: "info" }) }}
                                                        className="justify-center capitalize"
                                                    >
                                                        {diff}
                                                    </Tool>
                                                ))}
                                            </div>
                                        </Section>

                                        <Section label="Tools">
                                            <div className="grid grid-cols-2 gap-2">
                                                <Tool onClick={exportState}>
                                                    <Download size={13} aria-hidden="true" /> Export JSON
                                                </Tool>
                                                <Tool onClick={() => { router.push("/dev"); setIsOpen(false) }}>
                                                    <Terminal size={13} aria-hidden="true" /> Dev page
                                                </Tool>
                                                <Tool onClick={() => { router.push("/animations"); setIsOpen(false) }}>
                                                    <Zap size={13} aria-hidden="true" /> Animation lab
                                                </Tool>
                                                <Tool onClick={() => store.markAllEventsAsRead()}>
                                                    <ChevronRight size={13} aria-hidden="true" /> Read all events
                                                </Tool>
                                            </div>
                                        </Section>

                                        <Section label="Danger zone" tone="danger">
                                            <Tool
                                                tone="danger"
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
                                                className={cn("w-full", nukeConfirm && "border-negative! bg-negative/15!")}
                                            >
                                                <Trash2 size={13} aria-hidden="true" />
                                                {nukeConfirm ? "Click again to delete every save" : "Delete all saves"}
                                            </Tool>
                                        </Section>
                                    </TabsContent>
                                </div>
                            </ScrollArea>
                        </Tabs>
                        )}

                        {/* State footer */}
                        {gameLoaded && (
                        <dl className="grid shrink-0 grid-cols-3 gap-x-4 gap-y-1 border-t border-line bg-shell px-4 py-2.5 text-xs tabular-nums">
                            <div className="flex min-w-0 gap-1"><dt className="text-ink-3">Week</dt><dd className="font-semibold text-ink-1">{store.currentWeek}</dd></div>
                            <div className="flex min-w-0 gap-1"><dt className="text-ink-3">Team</dt><dd className="truncate font-semibold text-ink-1">{myTeam?.name || "N/A"}</dd></div>
                            <div className="flex min-w-0 gap-1"><dt className="text-ink-3">Budget</dt><dd className="font-semibold text-ink-1">{formatCurrency((myTeam?.budget || 0), "$", false)}</dd></div>
                            <div className="flex min-w-0 gap-1"><dt className="text-ink-3">Legends</dt><dd className="font-semibold text-ink-1">{(store.signedLegendIds || []).length}/18</dd></div>
                            <div className="flex min-w-0 gap-1"><dt className="text-ink-3">Events</dt><dd className="font-semibold text-ink-1">{store.eventsLog?.length || 0}</dd></div>
                            <div className="flex min-w-0 gap-1"><dt className="text-ink-3">Injuries</dt><dd className={cn("font-semibold", injuredCount > 0 ? "text-negative" : "text-ink-1")}>{injuredCount}</dd></div>
                        </dl>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    )
}
