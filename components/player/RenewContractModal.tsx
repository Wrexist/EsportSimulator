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
import { ArrowRight } from "lucide-react"
import { formatCurrency } from "@/lib/utils-extended"
import { ARCHETYPE_INFO, getArchetype, renewalSalary } from "@/engine/personality"

interface RenewContractModalProps {
    player: PlayerSaveData
    currentSalary: number
    currentEndWeek: number
    currentWeek: number
    onConfirm: () => void
    trigger?: React.ReactNode
}

/** Renewal terms mirror the store: the archetype's raise (+10%; Loyal +5%, Mercenary +20%), +52 weeks (renewContract). */
export function RenewContractModal({ player, currentSalary, currentEndWeek, currentWeek, onConfirm, trigger }: RenewContractModalProps) {
    const [open, setOpen] = React.useState(false)

    const newSalary = renewalSalary(player, currentSalary)
    const raisePct = currentSalary > 0 ? Math.round((newSalary / currentSalary - 1) * 100) : 0
    const archetype = ARCHETYPE_INFO[getArchetype(player)].label
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
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Renew contract</DialogTitle>
                    <DialogDescription className="text-ink-3">
                        One more year for {player.nickname}, at a {raisePct}% raise ({archetype}{raisePct === 10 ? "" : raisePct < 10 ? ": loyal players take less" : ": he wants more"}).
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-3 py-2">
                    <div className="rounded-lg border border-line bg-raised p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Now</p>
                        <p className="mt-2 font-display text-2xl font-bold tabular-nums text-ink-2">{formatCurrency(currentSalary, "$", false)}</p>
                        <p className="text-xs text-ink-3">per week · {weeksRemaining} wks left</p>
                    </div>
                    <div className="flex items-center text-ink-3"><ArrowRight size={18} /></div>
                    <div className="rounded-lg border border-line-strong bg-raised p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">After renewal</p>
                        <p className="mt-2 font-display text-2xl font-bold tabular-nums text-ink-1">{formatCurrency(newSalary, "$", false)}</p>
                        <p className="text-xs text-ink-3">per week · {newWeeksRemaining} wks left</p>
                    </div>
                </div>

                <p className="text-sm text-ink-2">
                    Runs until week {currentEndWeek + 52}. You need 26 weeks of the raise ({formatCurrency((newSalary - currentSalary) * 26, "$", false)}) in the bank; nothing is charged up front.
                </p>

                <DialogFooter className="gap-2 sm:gap-2">
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button onClick={handleConfirm}>Sign renewal</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
