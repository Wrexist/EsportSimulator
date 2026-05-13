"use client"

import React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, DollarSign, AlertCircle, TrendingUp, TrendingDown, Info, ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PlayerSaveData } from "@/engine/save-types"
import { Badge } from "@/components/ui/badge"
import Image from "next/image"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import { PlayerPortrait } from "@/components/ui/asset-images"

interface TransferListingModalProps {
    isOpen: boolean
    onClose: () => void
    player: PlayerSaveData
    estimatedValue: number
    isListed: boolean
    onConfirm: (price: number) => void
}

export function TransferListingModal({
    isOpen,
    onClose,
    player,
    estimatedValue,
    isListed,
    onConfirm
}: TransferListingModalProps) {
    const [priceMultiplier, setPriceMultiplier] = React.useState(1.0)
    const askingPrice = Math.round(estimatedValue * priceMultiplier)

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 top-16 z-modal flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title-transfer-listing"
                className="glass-panel w-full max-w-lg overflow-hidden border-white/10 shadow-2xl relative"
            >
                {/* Header Pattern */}
                <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-primary/10 to-transparent pointer-events-none" />
                <div className="absolute top-0 right-0 p-4 z-10">
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors group">
                        <X size={20} className="text-white/40 group-hover:text-white" />
                    </button>
                </div>

                <div className="relative z-10 p-8 flex flex-col items-center text-center">
                    {/* Icon Circle */}
                    <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-2xl ${isListed ? 'bg-red-500/20 border border-red-500/30' : 'bg-emerald-500/20 border border-emerald-500/30'}`}>
                        {isListed ? (
                            <Info size={40} className="text-red-400" />
                        ) : (
                            <ShoppingCart size={40} className="text-emerald-400" />
                        )}
                    </div>

                    <h2 id="modal-title-transfer-listing" className="text-3xl font-normal text-white uppercase tracking-tighter mb-2">
                        {isListed ? "Unlist Player" : "Transfer List"}
                    </h2>
                    <p className="text-muted-foreground text-sm max-w-sm mb-8">
                        {isListed
                            ? `Are you sure you want to stop listing ${player.nickname} for transfer? Current market interest will be lost.`
                            : `List ${player.nickname} on the transfer market. AI teams will be able to submit purchase offers for evaluation.`
                        }
                    </p>

                    {/* Player Mini Card */}
                    <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-4 mb-8">
                        <div className="w-16 h-16 rounded-xl overflow-hidden bg-black/40 border border-white/5 shrink-0">
                            <PlayerPortrait src={(player as any).portraitPath} alt={player.nickname} size={64} />
                        </div>
                        <div className="flex-1 text-left">
                            <div className="flex items-center gap-2">
                                <h4 className="font-normal text-white uppercase">{player.nickname}</h4>
                                <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-white/10 font-normal">
                                    {(player as any).level || 1} LVL
                                </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                                Market Value: <span className="text-emerald-400 font-bold">${(estimatedValue / 1000).toFixed(0)}k</span>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-2xl font-normal text-white">{Math.round((player as any).overallRating || 50)}</div>
                            <div className="text-[9px] text-muted-foreground uppercase font-normal tracking-widest">OVR</div>
                        </div>
                    </div>

                    {!isListed && (
                        <div className="w-full space-y-6 mb-8">
                            <div className="space-y-4">
                                <div className="flex justify-between items-end">
                                    <div className="text-left">
                                        <div className="text-[10px] text-muted-foreground uppercase font-normal tracking-widest mb-1">Asking Price</div>
                                        <div className="text-3xl font-normal text-white leading-none">
                                            ${(askingPrice / 1000).toFixed(0)}k
                                        </div>
                                    </div>
                                    <Badge
                                        variant="outline"
                                        className={cn(
                                            "font-normal uppercase tracking-widest px-3 py-1 border-0 rounded-full",
                                            priceMultiplier < 0.8 ? "bg-emerald-500/20 text-emerald-400" :
                                                priceMultiplier <= 1.1 ? "bg-blue-500/20 text-blue-400" :
                                                    priceMultiplier <= 1.5 ? "bg-amber-500/20 text-amber-400" :
                                                        "bg-red-500/20 text-red-400"
                                        )}
                                    >
                                        {priceMultiplier < 0.8 ? "Bargain" :
                                            priceMultiplier <= 1.1 ? "Fair Price" :
                                                priceMultiplier <= 1.5 ? "Premium" : "Extortionate"}
                                    </Badge>
                                </div>

                                <Slider
                                    defaultValue={[1.0]}
                                    max={2.0}
                                    min={0.5}
                                    step={0.05}
                                    onValueChange={(vals) => setPriceMultiplier(vals[0])}
                                    className="py-4"
                                />

                                <div className="flex justify-between text-[10px] text-muted-foreground font-normal uppercase tracking-widest px-1">
                                    <span>50%</span>
                                    <span>Market Value (100%)</span>
                                    <span>200%</span>
                                </div>
                            </div>

                            <div className={cn(
                                "flex items-start gap-3 p-4 border rounded-2xl text-left transition-colors duration-100 ease-out",
                                priceMultiplier <= 1.1 ? "bg-emerald-500/5 border-emerald-500/20" :
                                    priceMultiplier <= 1.5 ? "bg-amber-500/5 border-amber-500/20" :
                                        "bg-red-500/5 border-red-500/20"
                            )}>
                                {priceMultiplier <= 1.1 ? (
                                    <TrendingUp size={18} className="text-emerald-400 mt-0.5 shrink-0" />
                                ) : priceMultiplier <= 1.5 ? (
                                    <AlertCircle size={18} className="text-amber-400 mt-0.5 shrink-0" />
                                ) : (
                                    <TrendingDown size={18} className="text-red-400 mt-0.5 shrink-0" />
                                )}
                                <div className="space-y-1">
                                    <div className={cn(
                                        "text-xs font-normal uppercase tracking-tight",
                                        priceMultiplier <= 1.1 ? "text-emerald-400" :
                                            priceMultiplier <= 1.5 ? "text-amber-400" :
                                                "text-red-400"
                                    )}>
                                        {priceMultiplier <= 0.8 ? "Maximum Market Interest" :
                                            priceMultiplier <= 1.1 ? "Stable Market Interest" :
                                                priceMultiplier <= 1.5 ? "Limited Market Interest" :
                                                    "Critical Lack of Interest"}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground leading-relaxed">
                                        {priceMultiplier <= 0.8 ? "Low price will trigger rapid bidding from AI teams. Expect multiple offers within days." :
                                            priceMultiplier <= 1.1 ? "Competitive pricing ensures steady interest from major teams looking to strengthen rosters." :
                                                priceMultiplier <= 1.5 ? "Higher price reduces the pool of potential buyers. Selling may take several weeks." :
                                                    "Price is significantly above market valuation. Receiving any offer would be extremely rare."}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 w-full">
                        <Button
                            variant="outline"
                            onClick={onClose}
                            className="flex-1 h-12 border-white/10 hover:bg-white/5 text-white/60 font-normal uppercase tracking-widest"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={() => {
                                onConfirm(askingPrice)
                                onClose()
                            }}
                            className={`flex-1 h-12 font-normal uppercase tracking-widest shadow-lg ${isListed
                                ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/20'
                                : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20'
                                }`}
                        >
                            {isListed ? "Stop Listing" : "Confirm Listing"}
                        </Button>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
