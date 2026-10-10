"use client"

import { useFocusTrap } from "@/lib/accessibility"

import React, { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import Image from "next/image"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { useCurrentTeam } from "@/hooks/useCurrentTeam"
import { SeededRNG } from "@/engine/rng"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { CheckCircle2, X } from "lucide-react"
import { cn } from "@/lib/utils"

import { formatCurrency } from "@/lib/utils-extended"
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
    const { marketStaff, staff: activeStaff, hireStaff, renewStaffContract, currentWeek, saveId } = useGameStore(useShallow(state => ({
        marketStaff: state.marketStaff,
        staff: state.staff,
        hireStaff: state.hireStaff,
        renewStaffContract: state.renewStaffContract,
        currentWeek: state.currentWeek,
        saveId: state.saveId,
    })))

    // Find staff member in Market OR Active Staff (for renewals). A hire
    // removes them from the market, so keep the last match around for the
    // confirmation screen (it used to vanish the moment the hire landed).
    const liveMember = isRenewal
        ? activeStaff.find(s => s.id === staffId)
        : marketStaff.find(s => s.id === staffId) ?? activeStaff.find(s => s.id === staffId)
    const lastMember = useRef(liveMember)
    if (liveMember) lastMember.current = liveMember
    const staffMember = liveMember ?? lastMember.current

    const myTeam = useCurrentTeam()

    // Local State
    const [stage, setStage] = useState<NegotiationStage>("OFFER")
    const [salaryOffer, setSalaryOffer] = useState<number>(0)
    const [durationOffer, setDurationOffer] = useState<number>(52) // 1 year default
    const [negotiationLog, setNegotiationLog] = useState<string[]>([])

    // Reset when opening or changing staff. Deliberately gated on staffId
    // (not staffMember object) so an unrelated salary update on the same
    // staff member while the modal is open doesn't reset the negotiation
    // state mid-flow.
    useEffect(() => {
        if (isOpen && staffMember) {
            setStage("OFFER")
            const baseSalary = staffMember.salaryPerWeek
            setSalaryOffer(isRenewal ? Math.round(baseSalary * 1.1) : baseSalary)
            setDurationOffer(52)
            setNegotiationLog([])
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, staffId, isRenewal])

    const dialogRef = useFocusTrap(isOpen && !!staffMember, onClose)
    if (!isOpen || !staffMember) return null

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
                myTeam?.id || "NO_TEAM",
                isRenewal ? "renewal" : "hire"
            )
        ).range(0.95, 1.05)
        const minAcceptable = Math.round(targetSalary * variance)

        // Accept if within 3% of target (avoids absurd $1 rejections)
        if (sanitizedSalaryOffer >= minAcceptable * 0.97) {
            // Execute Transaction
            if (isRenewal) {
                const result = renewStaffContract(staffId, sanitizedSalaryOffer, sanitizedDuration)
                if (!result.success) {
                    setNegotiationLog(prev => [...prev, result.message])
                    return
                }
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
            setNegotiationLog(prev => [...prev, `Offer rejected. ${staffMember.name} expects around ${formatCurrency(Math.round(minAcceptable), "$", false)}/wk.`])
        }
    }

    const signingBonus = Math.min(MAX_STAFF_SIGNING_BONUS, Math.max(0, Math.floor(salaryOffer)) * 2)

    if (typeof window === "undefined") return null

    return createPortal(
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-ink/80 p-4">
            <div
                ref={dialogRef} tabIndex={-1} role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title-staff-negotiation"
                className="flex h-[min(560px,calc(100dvh-2rem))] w-full max-w-3xl overflow-hidden rounded-[10px] border border-line-strong bg-panel"
            >
                {/* Left: who you're negotiating with */}
                <div className="flex w-[260px] shrink-0 flex-col overflow-y-auto border-r border-line bg-raised p-5">
                    <div className="relative mb-4 h-20 w-20 overflow-hidden rounded-lg bg-hover">
                        <Image src={staffMember.portraitPath || "/staff_placeholder.webp"} alt={staffMember.name} fill className="object-cover" />
                    </div>
                    <h2 id="modal-title-staff-negotiation" className="font-display text-2xl font-bold uppercase leading-tight text-ink-1">{staffMember.name}</h2>
                    <div className="mt-1 flex items-center gap-2 text-sm text-ink-2">
                        {staffMember.nationality && <CountryFlag country={staffMember.nationality} size={14} />}
                        <span className="capitalize">{staffMember.role}</span>
                        {staffMember.rarity && <span className="text-ink-3">· {staffMember.rarity}</span>}
                    </div>
                    <dl className="mt-5 divide-y divide-line rounded-lg border border-line bg-panel text-sm">
                        <div className="flex justify-between px-3 py-2"><dt className="text-ink-3">Level</dt><dd className="font-semibold text-ink-1">{staffMember.level}</dd></div>
                        <div className="flex justify-between gap-3 px-3 py-2"><dt className="text-ink-3">Specialty</dt><dd className="truncate font-semibold text-ink-1">{staffMember.specialization}</dd></div>
                        <div className="flex justify-between px-3 py-2"><dt className="text-ink-3">{isRenewal ? "Current wage" : "Asking"}</dt><dd className="font-semibold tabular-nums text-ink-1">{formatCurrency(staffMember.salaryPerWeek, "$", false)}/wk</dd></div>
                    </dl>
                </div>

                {/* Right: the offer */}
                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between border-b border-line px-6 py-4">
                        <div>
                            <h3 className="text-base font-semibold text-ink-1">{isRenewal ? "Contract renewal" : "Make an offer"}</h3>
                            <p className="text-sm text-ink-3">{isRenewal ? "Expect to pay around 15% more to keep them." : "Epic staff want about 5% over the asking wage, Legendary about 10%."}</p>
                        </div>
                        <button onClick={onClose} className="rounded p-1.5 text-ink-3 transition-colors hover:bg-hover hover:text-ink-1" aria-label="Close dialog">
                            <X size={18} />
                        </button>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
                        {stage === "OFFER" && (
                            <div className="space-y-6">
                                <label className="block">
                                    <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Weekly wage</span>
                                    <span className="flex items-center gap-2 rounded border border-line bg-shell px-3 focus-within:border-gold">
                                        <span className="text-xl text-ink-3">$</span>
                                        <input
                                            type="number"
                                            aria-label="Weekly salary offer" value={salaryOffer}
                                            onChange={(e) => {
                                                const val = Number(e.target.value)
                                                if (!Number.isFinite(val)) {
                                                    setSalaryOffer(0)
                                                    return
                                                }
                                                setSalaryOffer(Math.max(0, Math.min(MAX_STAFF_SALARY, Math.floor(val))))
                                            }}
                                            className="h-12 w-full border-none bg-transparent font-display text-3xl font-bold tabular-nums text-ink-1 focus:outline-hidden"
                                        />
                                    </span>
                                    {!isRenewal && (
                                        <span className="mt-2 block text-xs text-ink-3">
                                            Sign-on fee <span className="font-semibold tabular-nums text-ink-1">{formatCurrency(signingBonus, "$", false)}</span> (two weeks), paid on signing
                                        </span>
                                    )}
                                </label>

                                <div>
                                    <div className="mb-3 flex items-baseline justify-between">
                                        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Length</span>
                                        <span className="text-sm text-ink-2"><span className="font-display text-xl font-bold tabular-nums text-ink-1">{durationOffer}</span> weeks · ends week {currentWeek + durationOffer}</span>
                                    </div>
                                    <Slider
                                        aria-label="Contract duration" aria-valuetext={`${durationOffer} weeks`} value={[durationOffer]}
                                        onValueChange={(v) => setDurationOffer(Math.max(MIN_CONTRACT_WEEKS, Math.min(MAX_CONTRACT_WEEKS, Math.floor(v[0] || 52))))}
                                        min={MIN_CONTRACT_WEEKS}
                                        max={MAX_CONTRACT_WEEKS}
                                        step={4}
                                    />
                                    <p className="mt-2 text-xs text-ink-3">Two years or more lowers their expected wage by about 5%.</p>
                                </div>

                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-ink-3">Club budget</span>
                                    <span className={cn("font-semibold tabular-nums", myTeam && myTeam.budget < signingBonus ? "text-negative" : "text-ink-1")}>
                                        {formatCurrency(myTeam?.budget ?? 0, "$", false)}
                                    </span>
                                </div>

                                <Button
                                    onClick={handleOfferSubmit}
                                    disabled={!isRenewal && (myTeam?.budget || 0) < signingBonus}
                                    className="h-11 w-full"
                                >
                                    {isRenewal ? "Offer renewal" : "Send offer"}
                                </Button>

                                {negotiationLog.length > 0 && (
                                    <ul className="space-y-1 rounded-lg border border-line bg-raised px-3 py-2.5 text-sm text-ink-2">
                                        {negotiationLog.map((log, i) => <li key={i}>{log}</li>)}
                                    </ul>
                                )}
                            </div>
                        )}

                        {stage === "SUCCESS" && (
                            <div className="space-y-5 py-4 text-center">
                                <CheckCircle2 size={40} className="mx-auto text-positive" />
                                <div>
                                    <h2 className="font-display text-3xl font-bold uppercase text-ink-1">{isRenewal ? "Contract renewed" : "Welcome aboard"}</h2>
                                    <p className="mt-1 text-sm text-ink-3">{staffMember.name} agreed to the terms.</p>
                                </div>
                                <dl className="mx-auto max-w-xs divide-y divide-line rounded-lg border border-line text-sm">
                                    <div className="flex justify-between px-3 py-2"><dt className="text-ink-3">Wage</dt><dd className="font-semibold tabular-nums text-ink-1">{formatCurrency(salaryOffer, "$", false)}/wk</dd></div>
                                    <div className="flex justify-between px-3 py-2"><dt className="text-ink-3">Length</dt><dd className="font-semibold tabular-nums text-ink-1">{durationOffer} weeks</dd></div>
                                </dl>
                                <Button onClick={onClose} className="h-11 w-full">Done</Button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    )
}
