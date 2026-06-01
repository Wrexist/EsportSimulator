"use client"

import React, { useState } from "react"
import { useGameStore } from "@/store/game-store"
import { useCurrentTeam } from "@/hooks/useCurrentTeam"
import { motion } from "framer-motion"
import { X, Megaphone, Share2, Handshake, Sparkles, Coins, CalendarClock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/lib/toast"

interface BookMarketingModalProps {
    isOpen: boolean
    onClose: () => void
    week: number
}

type MarketingType = "SOCIAL" | "SPONSORSHIP" | "INFLUENCER"

const MARKETING_OPTIONS = {
    SOCIAL: {
        name: "Social Media Push",
        description: "Ramp up content creation across TikTok, X, and YouTube. Builds steady organic follower growth.",
        costPerWeek: 2000,
        followersPerWeek: 800,
        icon: Share2,
        color: "text-cyan-400",
        bg: "bg-cyan-500/10",
        border: "border-cyan-500/20",
    },
    SPONSORSHIP: {
        name: "Sponsorship Drive",
        description: "Partner with brands for co-promotional campaigns. Higher cost but stronger reach.",
        costPerWeek: 5000,
        followersPerWeek: 2000,
        icon: Handshake,
        color: "text-emerald-400",
        bg: "bg-emerald-500/10",
        border: "border-emerald-500/20",
    },
    INFLUENCER: {
        name: "Influencer Collab Tour",
        description: "Collaborate with gaming influencers and streamers. Maximum exposure but expensive.",
        costPerWeek: 10000,
        followersPerWeek: 4000,
        icon: Sparkles,
        color: "text-amber-400",
        bg: "bg-amber-500/10",
        border: "border-amber-500/20",
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

    const handleConfirm = () => {
        if (budget < totalCost) return

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
            toast.success(`${selectedOption.name} scheduled!`, {
                description: `${duration} week${duration > 1 ? "s" : ""} · +${totalFollowerGain.toLocaleString()} projected followers`,
            })
            onClose()
        } else {
            toast.error(result.message)
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-dropdown flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title-book-marketing"
                className="glass-panel w-full max-w-2xl p-6 shadow-2xl border-white/10"
            >
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                            <Megaphone size={20} />
                        </div>
                        <div>
                            <h2 id="modal-title-book-marketing" className="text-xl font-normal uppercase tracking-tighter text-white">Marketing Campaign</h2>
                            <p className="text-xs text-muted-foreground uppercase tracking-widest">Week {week}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 active:bg-white/15 active:scale-90 rounded-full transition-all" aria-label="Close dialog">
                        <X size={18} className="text-white/50 hover:text-white" />
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    {/* Left: Campaign Options */}
                    <div className="space-y-3">
                        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Campaign Type</p>
                        {(Object.keys(MARKETING_OPTIONS) as MarketingType[]).map(type => {
                            const opt = MARKETING_OPTIONS[type]
                            const Icon = opt.icon
                            const isSelected = selectedType === type
                            return (
                                <button
                                    key={type}
                                    onClick={() => setSelectedType(type)}
                                    className={`w-full p-3 rounded-lg border text-left transition-all ${isSelected ? `${opt.bg} ${opt.border} ring-1 ring-white/10` : "bg-black/30 border-white/5 hover:bg-white/5"}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-md ${opt.bg} flex items-center justify-center ${opt.color}`}>
                                            <Icon size={16} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-sm font-medium text-white">{opt.name}</h4>
                                            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{opt.description}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-3 mt-2 text-[10px]">
                                        <span className="text-muted-foreground"><Coins size={10} className="inline mr-1" />${opt.costPerWeek.toLocaleString()}/wk</span>
                                        <span className="text-emerald-400">+{opt.followersPerWeek.toLocaleString()} followers/wk</span>
                                    </div>
                                </button>
                            )
                        })}
                    </div>

                    {/* Right: Duration & Summary */}
                    <div className="space-y-4">
                        <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-widest mb-3">Duration</p>
                            <div className="flex items-center gap-4">
                                <Slider
                                    value={[duration]}
                                    onValueChange={([v]) => setDuration(v)}
                                    min={1}
                                    max={4}
                                    step={1}
                                    className="flex-1"
                                />
                                <Badge variant="secondary" className="text-xs min-w-[60px] justify-center">
                                    <CalendarClock size={12} className="mr-1" />
                                    {duration}w
                                </Badge>
                            </div>
                        </div>

                        <div className="bg-black/30 rounded-lg p-4 space-y-3">
                            <p className="text-xs text-muted-foreground uppercase tracking-widest">Summary</p>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Campaign</span>
                                    <span className="text-white font-medium">{selectedOption.name}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Duration</span>
                                    <span className="text-white">{duration} week{duration > 1 ? "s" : ""}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Total Cost</span>
                                    <span className={totalCost > budget ? "text-red-400" : "text-amber-400"}>
                                        ${totalCost.toLocaleString()}
                                    </span>
                                </div>
                                <div className="border-t border-white/5 pt-2 flex justify-between">
                                    <span className="text-muted-foreground">Projected Gain</span>
                                    <span className="text-emerald-400 font-medium">+{totalFollowerGain.toLocaleString()} followers</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-muted-foreground">Current Followers</span>
                                    <span className="text-white/60">{currentFollowers.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>

                        {totalCost > budget && (
                            <p className="text-xs text-red-400">Insufficient budget (${budget.toLocaleString()} available)</p>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/5">
                    <Button variant="ghost" onClick={onClose} className="hover:bg-white/5">
                        Cancel
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={totalCost > budget}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white border-none"
                    >
                        <Megaphone size={14} className="mr-2" />
                        Launch Campaign
                    </Button>
                </div>
            </motion.div>
        </div>
    )
}
