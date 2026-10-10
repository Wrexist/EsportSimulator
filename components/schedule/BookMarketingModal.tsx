"use client"

import React, { useState } from "react"
import { useGameStore } from "@/store/game-store"
import { useCurrentTeam } from "@/hooks/useCurrentTeam"
import { Share2, Handshake, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/utils-extended"
import { ScheduleDialog } from "./ScheduleDialog"

interface BookMarketingModalProps {
    isOpen: boolean
    onClose: () => void
    week: number
}

type MarketingType = "SOCIAL" | "SPONSORSHIP" | "INFLUENCER"

// followersPerWeek is added by the fanbase-growth processor for every week
// the campaign runs; the booking is paid once, up front.
const MARKETING_OPTIONS = {
    SOCIAL: {
        name: "Social Media Push",
        description: "Ramp up content creation across your social channels.",
        costPerWeek: 2000,
        followersPerWeek: 800,
        icon: Share2,
    },
    SPONSORSHIP: {
        name: "Sponsorship Drive",
        description: "Co-promotional campaigns with partner brands.",
        costPerWeek: 5000,
        followersPerWeek: 2000,
        icon: Handshake,
    },
    INFLUENCER: {
        name: "Influencer Collab Tour",
        description: "Collaborations with gaming creators and streamers.",
        costPerWeek: 10000,
        followersPerWeek: 4000,
        icon: Sparkles,
    },
}

export function BookMarketingModal({ isOpen, onClose, week }: BookMarketingModalProps) {
    const scheduleActivity = useGameStore(state => state.scheduleActivity)
    const playerTeam = useCurrentTeam()
    const [selectedType, setSelectedType] = useState<MarketingType>("SOCIAL")
    const [duration, setDuration] = useState(1)
    const budget = playerTeam?.budget || 0
    const currentFollowers = playerTeam?.followers || 0

    const selectedOption = MARKETING_OPTIONS[selectedType]
    const totalCost = selectedOption.costPerWeek * duration
    const totalFollowerGain = selectedOption.followersPerWeek * duration
    const affordable = totalCost <= budget

    const handleConfirm = () => {
        if (!affordable) return

        const result = scheduleActivity({
            id: `marketing_${week}_${selectedType}_${duration}`,
            type: "MARKETING",
            week: week,
            duration: duration,
            cost: totalCost,
            name: selectedOption.name,
            description: selectedOption.description,
            effect: {
                morale: duration >= 3 ? 5 : 0,
            },
            data: {
                marketingType: selectedType,
                followersPerWeek: selectedOption.followersPerWeek,
            },
        })

        if (result.success) {
            toast.success(`${selectedOption.name} scheduled`, {
                description: `${duration} week${duration > 1 ? "s" : ""} · +${totalFollowerGain.toLocaleString("en-US")} followers`,
            })
            onClose()
        } else {
            toast.error(result.message)
        }
    }

    return (
        <ScheduleDialog
            isOpen={isOpen}
            onClose={onClose}
            titleId="modal-title-book-marketing"
            title="Marketing campaign"
            subtitle={`Starts week ${week} · followers are added each week it runs`}
            className="max-w-2xl"
            footer={
                <>
                    {!affordable && <p role="alert" className="mr-auto text-xs font-medium text-negative">Not enough funds ({formatCurrency(budget, "$", false)} available).</p>}
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleConfirm} disabled={!affordable}>Launch for {formatCurrency(totalCost, "$", false)}</Button>
                </>
            }
        >
            <ul className="divide-y divide-line">
                {(Object.keys(MARKETING_OPTIONS) as MarketingType[]).map(type => {
                    const opt = MARKETING_OPTIONS[type]
                    const Icon = opt.icon
                    const isSelected = selectedType === type
                    return (
                        <li key={type}>
                            <button
                                type="button"
                                aria-pressed={isSelected}
                                onClick={() => setSelectedType(type)}
                                className={cn(
                                    "flex w-full items-start gap-4 border-l-2 px-6 py-3.5 text-left transition-colors",
                                    isSelected ? "border-gold bg-hover" : "border-transparent hover:bg-raised",
                                )}
                            >
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-raised text-ink-2"><Icon size={17} /></span>
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-baseline justify-between gap-3">
                                        <span className="text-sm font-semibold text-ink-1">{opt.name}</span>
                                        <span className="shrink-0 text-xs tabular-nums text-ink-2">{formatCurrency(opt.costPerWeek, "$", false)} / wk</span>
                                    </span>
                                    <span className="block text-xs text-ink-3">{opt.description}</span>
                                    <span className="mt-1 block text-xs text-positive">+{opt.followersPerWeek.toLocaleString("en-US")} followers / wk</span>
                                </span>
                            </button>
                        </li>
                    )
                })}
            </ul>

            <div className="grid grid-cols-1 gap-6 border-t border-line px-6 py-5 sm:grid-cols-2">
                <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Duration</p>
                    <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Duration in weeks">
                        {[1, 2, 3, 4].map(w => (
                            <button
                                key={w}
                                type="button"
                                role="radio"
                                aria-checked={duration === w}
                                onClick={() => setDuration(w)}
                                className={cn(
                                    "h-10 rounded-md border text-sm font-semibold tabular-nums transition-colors",
                                    duration === w ? "border-gold bg-hover text-ink-1" : "border-line bg-shell text-ink-2 hover:bg-raised",
                                )}
                            >
                                {w}w
                            </button>
                        ))}
                    </div>
                </div>
                <dl className="divide-y divide-line rounded-md border border-line text-sm">
                    <div className="flex justify-between px-3 py-2"><dt className="text-ink-3">Followers now</dt><dd className="tabular-nums text-ink-1">{currentFollowers.toLocaleString("en-US")}</dd></div>
                    <div className="flex justify-between px-3 py-2"><dt className="text-ink-3">Campaign adds</dt><dd className="tabular-nums text-positive">+{totalFollowerGain.toLocaleString("en-US")}</dd></div>
                    <div className="flex justify-between px-3 py-2"><dt className="font-semibold text-ink-2">Paid when booked</dt><dd className={cn("font-semibold tabular-nums", affordable ? "text-ink-1" : "text-negative")}>{formatCurrency(totalCost, "$", false)}</dd></div>
                </dl>
            </div>
        </ScheduleDialog>
    )
}
