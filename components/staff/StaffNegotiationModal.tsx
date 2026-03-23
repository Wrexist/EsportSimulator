"use client"

import React, { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { useGameStore } from "@/store/game-store"
import { StaffSaveData } from "@/engine/save-types"
import { SeededRNG } from "@/engine/rng"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { CountryFlag } from "@/components/ui/CountryFlag"
import {
    DollarSign,
    Briefcase,
    CheckCircle2,
    XCircle,
    Handshake,
    AlertCircle,
    Calendar,
    UserCheck
} from "lucide-react"
import { cn } from "@/lib/utils"

interface StaffNegotiationModalProps {
    staffId: string
    isOpen: boolean
    onClose: () => void
    isRenewal?: boolean
}

type NegotiationStage = "OFFER" | "SUCCESS" | "FAILED"

const MAX_STAFF_SALARY = 2_000_000
const MAX_STAFF_SIGNING_BONUS = 10_000_000
const MIN_CONTRACT_WEEKS = 12
const MAX_CONTRACT_WEEKS = 156

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

export function StaffNegotiationModal({ staffId, isOpen, onClose, isRenewal = false }: StaffNegotiationModalProps) {
    const { teams, playerTeamId, marketStaff, staff: activeStaff, hireStaff, renewStaffContract, currentWeek, saveId } = useGameStore()

    // Find staff member in Market OR Active Staff (for renewals)
    const staffMember = isRenewal
        ? activeStaff.find(s => s.id === staffId)
        : marketStaff.find(s => s.id === staffId)

    const myTeam = teams.find(t => t.id === playerTeamId)

    // Local State
    const [stage, setStage] = useState<NegotiationStage>("OFFER")
    const [salaryOffer, setSalaryOffer] = useState<number>(0)
    const [durationOffer, setDurationOffer] = useState<number>(52) // 1 year default
    const [negotiationLog, setNegotiationLog] = useState<string[]>([])

    // Reset when opening or changing staff
    useEffect(() => {
        if (isOpen && staffMember) {
            setStage("OFFER")
            const baseSalary = staffMember.salaryPerWeek
            setSalaryOffer(isRenewal ? Math.round(baseSalary * 1.1) : baseSalary)
            setDurationOffer(52)
            setNegotiationLog([])
        }
    }, [isOpen, staffId, isRenewal])

    if (!isOpen || !staffMember) return null

    // Determine Rarity Colors
    const getRarityColor = (rarity?: string) => {
        switch (rarity) {
            case "Legendary": return "bg-amber-500/20 text-amber-500 border-amber-500/50"
            case "Epic": return "bg-purple-500/20 text-purple-400 border-purple-500/50"
            case "Rare": return "bg-blue-500/20 text-blue-400 border-blue-500/50"
            default: return "bg-slate-500/20 text-slate-400 border-slate-500/50"
        }
    }

    const handleOfferSubmit = () => {
        // AI Logic for Staff Negotiation
        // Staff are generally more stable, but won't accept lowballs.

        const sanitizedSalaryOffer = Math.max(0, Math.min(MAX_STAFF_SALARY, Math.floor(salaryOffer)))
        const sanitizedDuration = Math.max(MIN_CONTRACT_WEEKS, Math.min(MAX_CONTRACT_WEEKS, Math.floor(durationOffer)))
        let targetSalary = staffMember.salaryPerWeek
        if (isRenewal) targetSalary *= 1.15 // Expect a raise for renewal

        // Rarity Tax
        if (staffMember.rarity === "Legendary") targetSalary *= 1.1
        if (staffMember.rarity === "Epic") targetSalary *= 1.05

        // Duration Factor: Prefer longer contracts (job security)
        // If duration > 1 year (52 weeks), willing to accept slightly less
        if (sanitizedDuration >= 104) targetSalary *= 0.95

        // Deterministic variance blocks re-roll abuse via reload/reopen.
        const variance = new SeededRNG(
            deterministicSeed(
                saveId || "local",
                currentWeek,
                staffId,
                playerTeamId || "NO_TEAM",
                isRenewal ? "renewal" : "hire"
            )
        ).range(0.95, 1.05)
        const minAcceptable = Math.round(targetSalary * variance)

        // Accept if within 3% of target (avoids absurd $1 rejections)
        if (sanitizedSalaryOffer >= minAcceptable * 0.97) {
            // Execute Transaction
            if (isRenewal) {
                renewStaffContract(staffId, sanitizedSalaryOffer, sanitizedDuration)
                setNegotiationLog(prev => [...prev, `${staffMember.name} accepted the offer!`])
                setStage("SUCCESS")
            } else {
                // Determine signing bonus (2 weeks salary)
                const signingBonus = Math.min(MAX_STAFF_SIGNING_BONUS, sanitizedSalaryOffer * 2)
                const result = hireStaff(staffId, { salary: sanitizedSalaryOffer, duration: sanitizedDuration, signingBonus })
                if (result.success) {
                    setNegotiationLog(prev => [...prev, `${staffMember.name} accepted the offer!`])
                    setStage("SUCCESS")
                } else {
                    setNegotiationLog(prev => [...prev, result.message])
                }
            }

        } else {
            setNegotiationLog(prev => [...prev, `Offer rejected. ${staffMember.name} expects around $${Math.round(minAcceptable).toLocaleString()}/wk.`])
        }
    }

    const signingBonus = Math.min(MAX_STAFF_SIGNING_BONUS, Math.max(0, Math.floor(salaryOffer)) * 2)

    if (typeof window === "undefined") return null

    return createPortal(
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="glass-panel w-full max-w-4xl h-[600px] flex overflow-hidden shadow-2xl border-white/10"
                >
                    {/* Left Panel: Staff Info */}
                    <div className="w-1/3 border-r border-white/10 bg-black/20 p-6 flex flex-col relative">
                        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent" />

                        <div className="relative z-10 flex flex-col items-center text-center">
                            <div className="w-24 h-24 rounded-2xl bg-white/5 border border-white/10 mb-4 overflow-hidden shadow-lg relative">
                                {staffMember.portraitPath ? (
                                    <Image src={staffMember.portraitPath} alt={staffMember.name} fill className="object-cover" />
                                ) : (
                                    <Image src="/staff_placeholder.png" alt={staffMember.name} fill className="object-cover opacity-80" />
                                )}
                            </div>
                            <h2 className="text-2xl font-normal text-white">{staffMember.name}</h2>
                            <div className="text-sm text-muted-foreground mb-2 flex items-center gap-2 justify-center">
                                {staffMember.nationality && <CountryFlag country={staffMember.nationality} size={14} />}
                                {staffMember.role.toUpperCase()}
                            </div>

                            {staffMember.rarity && (
                                <Badge variant="outline" className={cn("mb-4", getRarityColor(staffMember.rarity))}>
                                    {staffMember.rarity}
                                </Badge>
                            )}

                            <div className="w-full space-y-4 text-left bg-white/5 p-4 rounded-xl border border-white/5">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Level</span>
                                    <span className="font-bold text-white">Lvl {staffMember.level}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Specialization</span>
                                    <span className="font-bold text-white truncate max-w-[120px]">{staffMember.specialization}</span>
                                </div>
                                <Separator className="bg-white/10" />
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Current Rate</span>
                                    <span className="font-bold text-emerald-400">${staffMember.salaryPerWeek.toLocaleString()}/wk</span>
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
                                    {isRenewal ? "Contract Renewal" : "Staff Offer"}
                                </h3>
                                <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">
                                    {isRenewal ? "Retaining Talent" : "Hiring New Staff"}
                                </p>
                            </div>
                            <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg" aria-label="Close dialog">
                                <XCircle className="text-muted-foreground" />
                            </button>
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 p-8 flex flex-col justify-center relative">
                            {/* Background Texture - Removed missing grid.svg */}
                            <div className="absolute inset-0 bg-white/5 opacity-[0.02]" />

                            {stage === "OFFER" && (
                                <div className="space-y-6 relative z-10">
                                    <div className="glass-panel p-6 border-white/5 bg-white/5 space-y-6">
                                        {/* Salary Input */}
                                        <div>
                                            <label className="text-xs font-normal uppercase tracking-widest text-muted-foreground mb-2 block">Weekly Salary Offer</label>
                                            <div className="bg-black/30 p-4 rounded-xl flex items-center gap-2 border border-white/10">
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
                                                        setSalaryOffer(Math.max(0, Math.min(MAX_STAFF_SALARY, Math.floor(val))))
                                                    }}
                                                    className="bg-transparent border-none text-3xl font-normal text-white focus:outline-none w-full"
                                                />
                                            </div>
                                            {!isRenewal && (
                                                <p className="text-[10px] text-muted-foreground mt-2 uppercase font-bold tracking-wider">
                                                    Sign-on Fee: <span className="text-white">${signingBonus.toLocaleString()}</span> (2 weeks)
                                                </p>
                                            )}
                                        </div>

                                        {/* Duration Slider */}
                                        <div>
                                            <label className="text-xs font-normal uppercase tracking-widest text-muted-foreground mb-4 block">Contract Duration</label>
                                            <div className="flex items-center gap-4">
                                                <Slider
                                                    value={[durationOffer]}
                                                    onValueChange={(v) => setDurationOffer(Math.max(MIN_CONTRACT_WEEKS, Math.min(MAX_CONTRACT_WEEKS, Math.floor(v[0] || 52))))}
                                                    min={MIN_CONTRACT_WEEKS}
                                                    max={MAX_CONTRACT_WEEKS}
                                                    step={4}
                                                    className="flex-1"
                                                />
                                                <div className="w-24 text-right">
                                                    <span className="font-bold text-white text-xl">{durationOffer}</span>
                                                    <span className="text-xs text-muted-foreground ml-1">WEEKS</span>
                                                </div>
                                            </div>
                                            <p className="text-[10px] text-muted-foreground mt-2 uppercase font-bold tracking-wider">
                                                Ends: Week {currentWeek + durationOffer}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Budget Check */}
                                    <div className="flex justify-between items-center px-2">
                                        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                            Team Budget: <span className={cn(myTeam && myTeam.budget < signingBonus ? "text-rose-400" : "text-emerald-400")}>
                                                ${myTeam?.budget.toLocaleString()}
                                            </span>
                                        </div>
                                    </div>

                                    <Button
                                        onClick={handleOfferSubmit}
                                        disabled={!isRenewal && (myTeam?.budget || 0) < signingBonus}
                                        className="w-full h-14 text-lg font-normal bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50"
                                    >
                                        {isRenewal ? "OFFER RENEWAL" : "SEND OFFER"}
                                    </Button>

                                    {negotiationLog.length > 0 && (
                                        <div className="bg-black/40 p-4 rounded-xl text-sm space-y-1 animate-in slide-in-from-bottom-2">
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
                                        <h2 className="text-3xl font-normal text-white uppercase transform skew-x-[-10deg]">
                                            {isRenewal ? "Contract Renewed!" : "Welcome Aboard!"}
                                        </h2>
                                        <p className="text-muted-foreground mt-2">
                                            {staffMember.name} has agreed to the terms.
                                        </p>
                                    </div>
                                    <div className="bg-white/5 p-4 rounded-xl max-w-sm mx-auto border border-white/10">
                                        <div className="flex justify-between mb-2">
                                            <span className="text-muted-foreground text-xs uppercase font-bold">Salary</span>
                                            <span className="text-emerald-400 font-bold">${salaryOffer.toLocaleString()}/wk</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground text-xs uppercase font-bold">Duration</span>
                                            <span className="text-white font-bold">{durationOffer} Weeks</span>
                                        </div>
                                    </div>
                                    <Button onClick={onClose} className="w-full h-14 text-lg font-normal bg-emerald-500 hover:bg-emerald-600 text-black">
                                        CLOSE
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>
            </div >
        </AnimatePresence >,
        document.body
    )
}
