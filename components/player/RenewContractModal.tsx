"use client"

import React from "react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { PlayerSaveData } from "@/engine/save-types"
import { ArrowRight, Calendar, DollarSign, PenTool } from "lucide-react"

interface RenewContractModalProps {
    player: PlayerSaveData
    currentSalary: number
    currentEndWeek: number
    currentWeek: number
    onConfirm: () => void
    trigger?: React.ReactNode
}

export function RenewContractModal({ player, currentSalary, currentEndWeek, currentWeek, onConfirm, trigger }: RenewContractModalProps) {
    const [open, setOpen] = React.useState(false)

    const newSalary = Math.round(currentSalary * 1.1)
    const weeksRemaining = Math.max(0, currentEndWeek - currentWeek)
    const newWeeksRemaining = weeksRemaining + 52

    const handleConfirm = () => {
        onConfirm()
        setOpen(false)
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger}
            </DialogTrigger>
            <DialogContent className="bg-black/80 backdrop-blur-xl border-white/10 text-white max-w-md">
                <DialogHeader>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-3 rounded-full bg-blue-500/20 text-blue-400">
                            <PenTool size={24} />
                        </div>
                        <div>
                            <DialogTitle className="text-xl font-bold">Contract Renewal Proposal</DialogTitle>
                            <DialogDescription className="text-blue-200/60">
                                Negotiating terms with {player.nickname}
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Visual Comparison Card */}
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                        {/* Current */}
                        <div className="space-y-4 text-center opacity-60">
                            <div className="text-xs uppercase tracking-widest font-bold text-muted-foreground">Current</div>
                            <div className="space-y-1">
                                <div className="text-sm flex items-center justify-center gap-1"><DollarSign size={12} /> {currentSalary.toLocaleString()}</div>
                                <div className="text-sm flex items-center justify-center gap-1"><Calendar size={12} /> {weeksRemaining} wks</div>
                            </div>
                        </div>

                        {/* Arrow */}
                        <div className="text-blue-500 flex justify-center">
                            <ArrowRight size={24} />
                        </div>

                        {/* New */}
                        <div className="space-y-4 text-center p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                            <div className="text-xs uppercase tracking-widest font-bold text-blue-400">New Offer</div>
                            <div className="space-y-1">
                                <div className="text-lg font-bold text-white flex items-center justify-center gap-1">
                                    <DollarSign size={14} /> {newSalary.toLocaleString()}
                                </div>
                                <div className="text-sm font-medium text-blue-200 flex items-center justify-center gap-1">
                                    <Calendar size={12} /> +52 wks (Total: {newWeeksRemaining})
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white/5 p-4 rounded-lg text-sm text-muted-foreground border border-white/5">
                        <p>
                            Renewing for <strong>1 Year</strong> will secure <strong>{player.nickname}</strong>'s services until Week {currentEndWeek + 52}.
                            The salary will increase by <span className="text-emerald-400 font-bold">10%</span>.
                        </p>
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="ghost" onClick={() => setOpen(false)} className="hover:bg-white/10 hover:text-white">
                        Cancel Negotiation
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        className="bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-bold border-0 shadow-[0_0_20px_rgba(59,130,246,0.4)] transition-all hover:scale-105"
                    >
                        Sign Renewal
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
