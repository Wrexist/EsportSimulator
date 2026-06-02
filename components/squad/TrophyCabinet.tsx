"use client"

import React, { memo } from "react"
import { motion } from "framer-motion"
import { Trophy, Calendar, Medal } from "lucide-react"
import { cn } from "@/lib/utils"
import Image from "next/image"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"

interface TrophyEntry {
    tournamentId: string
    tournamentName: string
    week: number
    mvpId?: string
    trophyPath?: string
    tier?: string
}

interface TrophyCabinetProps {
    trophies: TrophyEntry[]
    title?: string
    className?: string
}

function TrophyCabinetInner({ trophies, title = "Trophy Cabinet", className }: TrophyCabinetProps) {
    // Group trophies by row if needed, or just a grid
    return (
        <div className={cn("space-y-6", className)}>
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-normal uppercase tracking-widest text-white flex items-center gap-2">
                    <Trophy size={16} className="text-amber-400" /> {title}
                </h3>
                <span className="text-[10px] font-bold text-muted-foreground uppercase">{trophies.length} Trophies</span>
            </div>

            <div className="relative p-8 rounded-[32px] bg-black/40 border border-white/5 overflow-hidden">
                {/* Decorative elements */}
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
                <div className="absolute bottom-0 left-0 w-full h-8 bg-gradient-to-t from-amber-500/5 to-transparent" />

                {trophies.length === 0 ? (
                    <div className="py-12 flex flex-col items-center justify-center text-center opacity-20">
                        <Trophy size={48} className="mb-4" />
                        <p className="text-[10px] font-normal uppercase tracking-[0.2em]">The cabinet is currently empty</p>
                        <p className="text-[8px] uppercase mt-1">Win tournaments to display your legacy</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-8">
                        <TooltipProvider>
                            {trophies.map((trophy, idx) => (
                                // Stable key — the index isn't in the key
                                // (so re-ordering doesn't bust identity)
                                // but it IS used to stagger the entrance
                                // animation delay below.
                                <Tooltip key={`${trophy.tournamentId}-${trophy.week}`}>
                                    <TooltipTrigger asChild>
                                        <motion.div
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: idx * 0.1 }}
                                            className="group relative flex flex-col items-center"
                                        >
                                            {/* Reflection/Shadow */}
                                            <div className="absolute -bottom-2 w-12 h-2 bg-amber-500/20 blur-md rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />

                                            {/* Trophy Visual */}
                                            <div className="relative w-16 h-20 flex items-center justify-center mb-4 transition-transform duration-500 group-hover:-translate-y-2 group-hover:scale-110">
                                                {trophy.trophyPath ? (
                                                    <div className="relative w-full h-full flex items-center justify-center">
                                                        {/* Trophy Image */}
                                                        <Image
                                                            src={trophy.trophyPath}
                                                            alt={trophy.tournamentName}
                                                            width={64}
                                                            height={80}
                                                            className="object-contain drop-shadow-[0_0_15px_rgba(245,158,11,0.3)]"
                                                        />
                                                        {/* Shine Effect */}
                                                        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 rounded-full" />
                                                    </div>
                                                ) : (
                                                    <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.1)]">
                                                        <Trophy size={28} />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Plaque / Label */}
                                            <div className="w-full text-center">
                                                <p className="text-[8px] font-normal text-amber-500/80 uppercase tracking-tighter line-clamp-1 mb-0.5">
                                                    {trophy.tournamentName}
                                                </p>
                                                <p className="text-[7px] text-muted-foreground font-bold uppercase">
                                                    Week {trophy.week}
                                                </p>
                                            </div>

                                            {/* The "Shelf" line effect for individual trophies */}
                                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-8 h-[1px] bg-white/10 group-hover:bg-amber-500/40 transition-colors" />
                                        </motion.div>
                                    </TooltipTrigger>
                                    <TooltipContent className="bg-[#1a1f26] border-white/10 p-3 rounded-xl shadow-2xl backdrop-blur-xl">
                                        <div className="space-y-2">
                                            <p className="text-sm font-normal text-amber-400 uppercase tracking-wide">{trophy.tournamentName}</p>
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2 text-[10px] text-white/60">
                                                    <Calendar size={12} />
                                                    <span>Won in Week {trophy.week}</span>
                                                </div>
                                                {trophy.mvpId && (
                                                    <div className="flex items-center gap-2 text-[10px] text-amber-400">
                                                        <Medal size={12} />
                                                        <span>Tournament MVP Awarded</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </TooltipContent>
                                </Tooltip>
                            ))}
                        </TooltipProvider>
                    </div>
                )}

                {/* The Glass Shelf Aesthetic */}
                <div className="absolute bottom-12 left-8 right-8 h-[2px] bg-gradient-to-r from-transparent via-white/10 to-transparent border-t border-white/5 pointer-events-none" />
            </div>
        </div>
    )
}

export const TrophyCabinet = memo(TrophyCabinetInner)
