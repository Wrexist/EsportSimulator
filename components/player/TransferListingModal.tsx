"use client"

import React from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PlayerSaveData } from "@/engine/save-types"
import { Slider } from "@/components/ui/slider"
import { PlayerPortrait } from "@/components/ui/asset-images"
import { RatingChip } from "@/src/components/ui/RatingChip"
import { useFocusTrap } from "@/lib/accessibility"
import { formatCurrency } from "@/lib/utils-extended"
import { cn } from "@/lib/utils"

interface TransferListingModalProps {
    isOpen: boolean
    onClose: () => void
    player: PlayerSaveData
    /** Evaluated overall rating shown on the card. */
    overall?: number
    estimatedValue: number
    isListed: boolean
    onConfirm: (price: number) => void
}

/**
 * Bid interest per AI club per week scales with exp(2 × (1 − price/value))
 * (engine/ai/transfer-market.ts); offers are anchored at 90% market value +
 * 10% of the asking price. The copy below describes exactly that.
 */
function interestCopy(multiplier: number): { label: string; detail: string; tone: string } {
    if (multiplier < 0.8) return { label: "More bids", detail: "Below market value: clubs bid more often. Offers still land near market value.", tone: "text-ink-1" }
    if (multiplier <= 1.1) return { label: "Normal interest", detail: "Around market value: clubs bid at the usual weekly rate.", tone: "text-ink-1" }
    if (multiplier <= 1.5) return { label: "Fewer bids", detail: "Above market value: fewer clubs bid each week, and offers only move about 10% toward your price.", tone: "text-caution" }
    return { label: "Few bids", detail: "Far above market value: bids become rare, and offers still sit near market value.", tone: "text-caution" }
}

export function TransferListingModal({ isOpen, onClose, player, overall, estimatedValue, isListed, onConfirm }: TransferListingModalProps) {
    const [priceMultiplier, setPriceMultiplier] = React.useState(1.0)
    const askingPrice = Math.round(estimatedValue * priceMultiplier)
    const interest = interestCopy(priceMultiplier)
    const dialogRef = useFocusTrap(isOpen, onClose)

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-ink/80 p-4">
            <div
                ref={dialogRef} tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title-transfer-listing"
                className="relative max-h-[calc(100dvh-6rem)] w-full max-w-lg overflow-y-auto rounded-[10px] border border-line-strong bg-panel p-6"
            >
                <button onClick={onClose} aria-label="Close dialog" className="absolute right-4 top-4 rounded p-1.5 text-ink-3 transition-colors hover:bg-hover hover:text-ink-1">
                    <X size={18} />
                </button>

                <h2 id="modal-title-transfer-listing" className="font-display text-2xl font-bold uppercase text-ink-1">
                    {isListed ? "Remove from transfer list" : "Transfer list"}
                </h2>
                <p className="mt-1 text-sm text-ink-3">
                    {isListed
                        ? `Clubs stop bidding for ${player.nickname}.`
                        : `Clubs can bid for ${player.nickname} each week. You accept or reject every offer.`}
                </p>

                <div className="mt-5 flex items-center gap-4 rounded-lg border border-line bg-raised p-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded">
                        <PlayerPortrait seed={player.id} src={player.portraitPath} alt={player.nickname} size={48} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold text-ink-1">{player.nickname}</p>
                        <p className="text-xs text-ink-3">Market value <span className="font-semibold tabular-nums text-ink-1">{formatCurrency(estimatedValue)}</span></p>
                    </div>
                    {overall != null && <RatingChip value={overall} />}
                </div>

                {!isListed && (
                    <div className="mt-6 space-y-4">
                        <div className="flex items-end justify-between">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Asking price</p>
                                <p className="mt-1 font-display text-4xl font-bold leading-none tabular-nums text-ink-1">{formatCurrency(askingPrice)}</p>
                            </div>
                            <span className={cn("text-sm font-semibold", interest.tone)}>{interest.label}</span>
                        </div>

                        <Slider
                            defaultValue={[1.0]}
                            max={2.0}
                            min={0.5}
                            step={0.05}
                            onValueChange={vals => setPriceMultiplier(vals[0])}
                            className="py-3"
                            aria-label="Asking price as a share of market value"
                        />
                        <div className="flex justify-between text-xs tabular-nums text-ink-3">
                            <span>50%</span>
                            <span>Market value</span>
                            <span>200%</span>
                        </div>

                        <p className="rounded-lg border border-line bg-raised px-3 py-2.5 text-sm text-ink-2">{interest.detail}</p>
                    </div>
                )}

                <div className="mt-6 flex gap-3">
                    <Button variant="outline" onClick={onClose} className="h-10 flex-1">Cancel</Button>
                    <Button
                        variant={isListed ? "outline" : "default"}
                        onClick={() => {
                            onConfirm(askingPrice)
                            onClose()
                        }}
                        className="h-10 flex-1"
                    >
                        {isListed ? "Remove listing" : "List player"}
                    </Button>
                </div>
            </div>
        </div>
    )
}
