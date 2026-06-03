"use client"

import React, { useState, useEffect } from "react"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { useRouter } from "next/navigation"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { getDisplayPlayerTier, getTierStyle, TierLevel } from "@/engine/tier-system"
import { SeededRNG } from "@/engine/rng"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider" // Assuming we have or will treat as standard input
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { PlayerPortrait } from "@/components/ui/asset-images"
import {
    DollarSign,
    CheckCircle2,
    XCircle,
    Handshake,
    Clock,
    AlertCircle
} from "lucide-react"
import { cn } from "@/lib/utils"

interface NegotiationModalProps {
    playerId: string
    isOpen: boolean
    onClose: () => void
    className?: string
}

type NegotiationStage = "BUYOUT" | "CONTRACT" | "SUCCESS" | "FAILED"

const MAX_NEGOTIATION_SALARY = 10_000_000

const deterministicSeed = (...parts: Array<string | number | undefined | null>): number => {
    const payload = parts
        .filter((part): part is string | number => part !== undefined && part !== null)
        .map(String)
        .join("|")

    let hash = 2166136261
    for (let i = 0; i < payload.length; i++) {
        hash ^= payload.charCodeAt(i)
        hash = Math.imul(hash, 16777619)
    }

    return (hash >>> 0) || 1
}

export function NegotiationModal({ playerId, isOpen, onClose, className }: NegotiationModalProps) {
    const router = useRouter()
    const { players, teams, contracts, playerTeamId, transferPlayer, currentWeek, saveId } = useGameStore(useShallow(state => ({
        players: state.players,
        teams: state.teams,
        contracts: state.contracts,
        playerTeamId: state.playerTeamId,
        transferPlayer: state.transferPlayer,
        currentWeek: state.currentWeek,
        saveId: state.saveId,
    })))

    // Derived Data
    const playerSave = players.find(p => p.id === playerId)
    const activeContract = contracts.find(c => c.playerId === playerId)
    const currentTeam = teams.find(t => t.id === activeContract?.teamId)
    const myTeam = teams.find(t => t.id === playerTeamId)

    // Local State
    const [stage, setStage] = useState<NegotiationStage>("BUYOUT")
    const [buyoutOffer, setBuyoutOffer] = useState<number>(0)
    const [salaryOffer, setSalaryOffer] = useState<number>(0)
    const [durationOffer, setDurationOffer] = useState<number>(52) // 1 year
    const [negotiationLog, setNegotiationLog] = useState<string[]>([])
    const [aiMood, setAiMood] = useState<"HAPPY" | "NEUTRAL" | "ANGRY">("NEUTRAL")
    const [hasInitialized, setHasInitialized] = useState(false)

    // Initialization
    useEffect(() => {
        if (isOpen && !hasInitialized && playerSave) {
            // Determine starting stage
            // We need to define currentTeam here loosely or assume the derived one is correct for initial load
            const initialTeam = teams.find(t => t.id === contracts.find(c => c.playerId === playerId)?.teamId)

            if (!initialTeam) {
                setStage("CONTRACT")
            } else {
                setStage("BUYOUT")
                // Start suggestion (use safely)
                const contract = contracts.find(c => c.playerId === playerId)
                if (contract) setBuyoutOffer(contract.buyout * 0.8)
            }

            // Default salary suggestion
            const ev = evaluatePlayer(playerSave)
            const suggestedSalary = Math.round(ev.transferValue / 100)
            setSalaryOffer(suggestedSalary)

            setHasInitialized(true)
        } else if (!isOpen) {
            setHasInitialized(false)
            setNegotiationLog([])
        }
    }, [isOpen, hasInitialized, playerSave, playerId, teams, contracts])

    if (!isOpen || !playerSave) return null

    const evaluation = evaluatePlayer(playerSave)
    const playerTier = getDisplayPlayerTier(evaluation.overallRating, currentTeam?.tier as TierLevel)
    const tierStyle = getTierStyle(playerTier)
    const getNegotiationRng = (phase: string) => new SeededRNG(
        deterministicSeed(
            saveId || "local",
            currentWeek,
            playerId,
            currentTeam?.id || "FA",
            myTeam?.id || "NO_TEAM",
            phase
        )
    )

    // Duration preference calculation
    const calculateDurationPreference = () => {
        // Base ideal duration by age
        let idealWeeks: number
        if (playerSave.age <= 20) idealWeeks = 130       // ~2.5 years - young, wants stability
        else if (playerSave.age <= 22) idealWeeks = 112   // ~2 years - developing
        else if (playerSave.age <= 25) idealWeeks = 90    // ~1.7 years - prime, flexible
        else if (playerSave.age <= 28) idealWeeks = 72    // ~1.4 years - experienced
        else if (playerSave.age <= 31) idealWeeks = 52    // 1 year - aging
        else idealWeeks = 36                               // ~8 months - near retirement

        // Loyalty modifier: high loyalty = longer commitment comfort
        const loyalty = playerSave.loyalty ?? 50
        const loyaltyFactor = loyalty / 100
        idealWeeks = Math.round(idealWeeks * (0.8 + loyaltyFactor * 0.4)) // ±20%

        // Elite players want shorter deals (leverage to renegotiate)
        if (evaluation.overallRating >= 85) idealWeeks = Math.round(idealWeeks * 0.8)
        else if (evaluation.overallRating >= 78) idealWeeks = Math.round(idealWeeks * 0.9)

        // Deterministic variance ±15%
        const durationVariance = getNegotiationRng("DURATION_PREF").range(0.85, 1.15)
        idealWeeks = Math.round(idealWeeks * durationVariance)

        // Compute acceptable range around ideal
        const minWeeks = Math.max(12, Math.round(idealWeeks * 0.45))
        const maxWeeks = Math.min(156, Math.round(idealWeeks * 1.8))

        return { minWeeks, maxWeeks, idealWeeks: Math.max(12, Math.min(156, idealWeeks)) }
    }

    const durationPref = calculateDurationPreference()

    const formatWeeksAsYears = (weeks: number) => {
        const years = weeks / 52
        if (years < 1) return `${weeks} weeks`
        if (years === Math.floor(years)) return `${years} year${years > 1 ? "s" : ""}`
        return `${years.toFixed(1)} years`
    }

    // Handlers
    const handleBuyoutSubmit = () => {
        // AI Logic:
        // 1. Baseline: 95% of market value
        // 2. Variance: +/- 10% based on random factor (simulated 'mood' or 'stubbornness')
        const sanitizedBuyoutOffer = Math.max(0, Math.floor(buyoutOffer))
        const variance = getNegotiationRng("BUYOUT_THRESHOLD").range(0.9, 1.1)
        const minPrice = Math.round(evaluation.transferValue * variance)

        // Accept if within 3% of target (avoids near-miss rejections)
        if (sanitizedBuyoutOffer >= minPrice * 0.97) {
            setNegotiationLog(prev => [...prev, `Team accepted offer of ${formatMoney(sanitizedBuyoutOffer)}`])
            setStage("CONTRACT")
        } else {
            setNegotiationLog(prev => [...prev, `Offer of ${formatMoney(sanitizedBuyoutOffer)} rejected. Team wants ${formatMoney(minPrice)}.`]) // In hard mode, don't show specific price
            setAiMood("ANGRY")
        }
    }

    const handleContractSubmit = () => {
        const sanitizedDuration = Math.max(12, Math.min(156, Math.floor(durationOffer)))
        const sanitizedSalary = Math.max(0, Math.min(MAX_NEGOTIATION_SALARY, Math.floor(salaryOffer)))
        const sanitizedBuyoutOffer = Math.max(0, Math.floor(buyoutOffer))

        // Step 1: Check duration preference
        if (sanitizedDuration < durationPref.minWeeks) {
            setNegotiationLog(prev => [...prev, `Player wants a longer contract (at least ${formatWeeksAsYears(durationPref.minWeeks)}).`])
            setAiMood("ANGRY")
            return
        }
        if (sanitizedDuration > durationPref.maxWeeks) {
            setNegotiationLog(prev => [...prev, `Player doesn't want to commit that long (max ${formatWeeksAsYears(durationPref.maxWeeks)}).`])
            setAiMood("ANGRY")
            return
        }

        // Step 2: Check salary
        let baseSalary = evaluation.transferValue / 150

        // Deterministic variance blocks re-roll abuse via reload/reopen.
        const variance = getNegotiationRng("CONTRACT_THRESHOLD").range(0.9, 1.2)
        let minSalary = baseSalary * variance

        // Age tax (Veterans know their worth)
        if (playerSave.age > 28) minSalary *= 1.1

        // Duration fit modifier: closer to ideal = slight discount, edges of range = premium
        const distFromIdeal = Math.abs(sanitizedDuration - durationPref.idealWeeks) / Math.max(1, durationPref.maxWeeks - durationPref.minWeeks)
        const durationFitMultiplier = 0.95 + distFromIdeal * 0.10 // 0.95 at ideal, up to 1.05 at edge
        minSalary *= durationFitMultiplier

        const minimumSalary = Math.round(minSalary)

        // Accept if within 3% of target (avoids near-miss rejections)
        if (sanitizedSalary >= minimumSalary * 0.97) {
            // Execute the transfer first — only flip to SUCCESS if the store
            // accepts it. Previously the UI advanced to SUCCESS even when
            // the engine refused (roster full, contract conflict, etc.),
            // showing a "deal done" screen for a transfer that never happened.
            if (myTeam) {
                const result = transferPlayer(
                    playerId,
                    currentTeam?.id || "FA",
                    myTeam.id,
                    sanitizedBuyoutOffer,
                    {
                        salaryPerWeek: sanitizedSalary,
                        startWeek: currentWeek,
                        endWeek: currentWeek + sanitizedDuration,
                        buyout: Math.max(sanitizedSalary * 20, sanitizedBuyoutOffer * 2) // Default clause
                    }
                )
                if (result.success) {
                    setNegotiationLog(prev => [...prev, `Player accepted contract!`])
                    setStage("SUCCESS")
                } else {
                    setNegotiationLog(prev => [...prev, `Transfer rejected by board: ${result.message || "unknown error"}`])
                    setStage("FAILED")
                }
            } else {
                setNegotiationLog(prev => [...prev, `Player accepted contract!`])
                setStage("SUCCESS")
            }
        } else {
            setNegotiationLog(prev => [...prev, `Player rejected ${formatMoney(sanitizedSalary)}/wk. Minimum expected: ${formatMoney(minimumSalary)}/wk.`])
            setAiMood("ANGRY")
        }
    }

    const formatMoney = (val: number) => {
        if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`
        return `$${val.toLocaleString()}`
    }

    return (
        <AnimatePresence>
            <div className={cn("fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/85 backdrop-blur-md", className)}>
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="modal-title-negotiation"
                    className="glass-panel w-full max-w-4xl max-h-[min(600px,85vh)] flex overflow-hidden shadow-2xl border-white/10"
                >
                    {/* Left Panel: Player Info */}
                    <div className="w-1/3 border-r border-white/10 bg-black/20 p-6 flex flex-col relative">
                        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent" />

                        <div className="relative z-10 flex flex-col items-center text-center">
                            <div className="w-24 h-24 rounded-2xl bg-white/5 border border-white/10 mb-4 overflow-hidden shadow-lg">
                                <PlayerPortrait src={playerSave.portraitPath} alt={playerSave.nickname} size={96} />
                            </div>
                            <h2 id="modal-title-negotiation" className="text-2xl font-normal text-white">{playerSave.nickname}</h2>
                            <p className="text-sm text-muted-foreground mb-2">{playerSave.name}</p>

                            <Badge className={cn("mb-4", tierStyle.bgColor, tierStyle.color)}>
                                {tierStyle.label}
                            </Badge>

                            <div className="w-full space-y-4">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Rating</span>
                                    <span className="font-bold text-white">{evaluation.overallRating}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Age</span>
                                    <span className="font-bold text-white">{playerSave.age}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Country</span>
                                    <CountryFlag country={playerSave.nationality} showName={true} />
                                </div>
                                <Separator className="bg-white/10" />
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Market Value</span>
                                    <span className="font-bold text-emerald-400">{formatMoney(evaluation.transferValue)}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Current Team</span>
                                    <span className="font-bold text-white max-w-[120px] truncate">{currentTeam?.name || "Free Agent"}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Panel: Negotiation Interface */}
                    <div className="flex-1 flex flex-col bg-[#0e1217]">
                        {/* Header */}
                        <div className="p-6 border-b border-white/5 flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-normal uppercase tracking-tight text-white flex items-center gap-2">
                                    <Handshake className="text-primary" />
                                    {stage === "BUYOUT" ? "Transfer Negotiation" : !currentTeam ? "Sign Free Agent" : "Contract Offer"}
                                </h3>
                                <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">
                                    {stage === "BUYOUT" ? `Negotiating with ${currentTeam?.name}` : "Negotiating with Player Agent"}
                                </p>
                            </div>
                            <button onClick={onClose} className="p-2 hover:bg-white/5 active:bg-white/10 active:scale-90 rounded-lg transition-all" aria-label="Close dialog">
                                <XCircle className="text-muted-foreground" />
                            </button>
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 p-8 flex flex-col justify-center relative">
                            {/* Background Texture */}
                            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-[0.02]" />

                            {stage === "BUYOUT" && (
                                <div className="space-y-8 relative z-10">
                                    <div className="glass-panel p-6 border-white/5 bg-white/5">
                                        <label className="text-xs font-normal uppercase tracking-widest text-muted-foreground mb-2 block">Transfer Fee Offer</label>
                                        <div className="flex items-center gap-4">
                                            <div className="bg-black/30 p-4 rounded-xl flex-1 flex items-center gap-2 border border-white/10">
                                                <DollarSign className="text-emerald-400" />
                                                <input
                                                    type="number"
                                                    value={buyoutOffer}
                                                    onChange={(e) => {
                                                        const val = Number(e.target.value)
                                                        if (!Number.isFinite(val)) {
                                                            setBuyoutOffer(0)
                                                            return
                                                        }
                                                        const budgetCap = Math.max(0, Math.floor(myTeam?.budget || 0))
                                                        setBuyoutOffer(Math.max(0, Math.min(Math.floor(val), budgetCap)))
                                                    }}
                                                    className="bg-transparent border-none text-3xl font-normal text-white focus:outline-none w-full"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex justify-between mt-2 text-xs font-bold uppercase tracking-wider">
                                            <span className="text-muted-foreground">Market: {formatMoney(evaluation.transferValue)}</span>
                                            <span className={cn(
                                                (myTeam?.budget || 0) <= 0 ? "text-rose-400" : "text-emerald-400"
                                            )}>
                                                Budget: {formatMoney(myTeam?.budget || 0)}
                                            </span>
                                        </div>
                                        {(myTeam?.budget || 0) < evaluation.transferValue * 0.5 && (
                                            <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2 text-rose-400 text-[10px] font-bold uppercase">
                                                <AlertCircle size={14} />
                                                Insufficient funds for a competitive offer
                                            </div>
                                        )}
                                    </div>

                                    <Button
                                        onClick={handleBuyoutSubmit}
                                        disabled={buyoutOffer <= 0 || buyoutOffer > (myTeam?.budget || 0)}
                                        className="w-full h-14 text-lg font-normal bg-emerald-500 hover:bg-emerald-600 text-black disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        SUBMIT OFFER
                                    </Button>

                                    {negotiationLog.length > 0 && (
                                        <div className="bg-black/40 p-4 rounded-xl text-sm space-y-1">
                                            {negotiationLog.map((log, i) => (
                                                <p key={i} className="text-white/70">→ {log}</p>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {stage === "CONTRACT" && (
                                <div className="space-y-6 relative z-10">
                                    <div className="glass-panel p-6 border-white/5 bg-white/5 space-y-6">
                                        <div>
                                            <label className="text-xs font-normal uppercase tracking-widest text-muted-foreground mb-4 block">Weekly Salary</label>
                                            <div className="bg-black/30 p-4 rounded-xl flex-1 flex items-center gap-2 border border-white/10">
                                                <DollarSign className="text-emerald-400" />
                                                <input
                                                    type="number"
                                                    value={salaryOffer}
                                                    onChange={(e) => {
                                                        const val = Number(e.target.value)
                                                        if (!Number.isFinite(val)) {
                                                            setSalaryOffer(0)
                                                            return
                                                        }
                                                        setSalaryOffer(Math.max(0, Math.min(MAX_NEGOTIATION_SALARY, Math.floor(val))))
                                                    }}
                                                    className="bg-transparent border-none text-3xl font-normal text-white focus:outline-none w-full"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="text-xs font-normal uppercase tracking-widest text-muted-foreground mb-4 block">Contract Duration (Weeks)</label>
                                            <div className="flex items-center gap-4">
                                                <Slider
                                                    value={[durationOffer]}
                                                    onValueChange={(v) => setDurationOffer(Math.max(12, Math.min(156, Math.floor(v[0] || 52))))}
                                                    min={12}
                                                    max={156}
                                                    step={12}
                                                    className="flex-1"
                                                />
                                                <span className="w-20 text-right font-bold text-white">{durationOffer} wks</span>
                                            </div>
                                            <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
                                                <Clock size={12} />
                                                Player prefers {formatWeeksAsYears(durationPref.minWeeks)} – {formatWeeksAsYears(durationPref.maxWeeks)}
                                                {durationOffer >= durationPref.minWeeks && durationOffer <= durationPref.maxWeeks
                                                    ? <span className="text-emerald-400 ml-1">✓</span>
                                                    : <span className="text-rose-400 ml-1">✗</span>
                                                }
                                            </p>
                                        </div>
                                    </div>

                                    <Button onClick={handleContractSubmit} className="w-full h-14 text-lg font-normal bg-primary hover:bg-primary/90 text-primary-foreground">
                                        OFFER CONTRACT
                                    </Button>

                                    {negotiationLog.length > 0 && (
                                        <div className="bg-black/40 p-4 rounded-xl text-sm space-y-1">
                                            {negotiationLog.map((log, i) => (
                                                <p key={i} className="text-white/70">→ {log}</p>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {stage === "SUCCESS" && (
                                <div className="text-center space-y-6 relative z-10 animate-in fade-in zoom-in">
                                    <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto border border-emerald-500/50">
                                        <CheckCircle2 size={48} className="text-emerald-500" />
                                    </div>
                                    <div>
                                        <h2 className="text-3xl font-normal text-white uppercase transform skew-x-[-10deg]">Welcome to the Team!</h2>
                                        <p className="text-muted-foreground mt-2">{playerSave.nickname} has joined {myTeam?.name}</p>
                                    </div>
                                    <Button onClick={() => {
                                        router.push("/squad")
                                        onClose()
                                    }} className="w-full h-14 text-lg font-normal bg-emerald-500 hover:bg-emerald-600 text-black">
                                        GO TO SQUAD
                                    </Button>
                                </div>
                            )}

                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    )
}
