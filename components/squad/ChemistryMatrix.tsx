"use client"

import React, { memo, useMemo } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { PlayerSaveData } from "@/engine"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { PlayerPortrait } from "@/components/ui/asset-images"

interface ChemistryMatrixProps {
    players: PlayerSaveData[]
    synergyMatrix?: Record<string, number>
    className?: string
    /** The team chemistry the match engine uses (team.chemistry). Shown in the centre. */
    teamChemistry?: number
}

function ChemistryMatrix({ players, synergyMatrix = {}, teamChemistry, className }: ChemistryMatrixProps) {
    const activePlayers = useMemo(() => players.slice(0, 5), [players]) // Ensure max 5 for the pentagon

    const { nodes, links } = useMemo(() => {
        const r = 130 // Radius of the circle
        const center = 180 // Center of the SVG canvas (360x360)

        // Synergy lookup inlined so the dep array can be a stable set of
        // base values (synergyMatrix object identity) instead of going
        // through a closure that captured it.
        const lookupSynergy = (id1: string, id2: string) => {
            const key = [id1, id2].sort().join("_")
            return synergyMatrix[key] || 50
        }

        const calculatedNodes = activePlayers.map((p, i) => {
            const angle = (Math.PI * 2 * i) / activePlayers.length - Math.PI / 2
            return {
                ...p,
                x: center + r * Math.cos(angle),
                y: center + r * Math.sin(angle),
                angle
            }
        })

        const calculatedLinks = []
        for (let i = 0; i < calculatedNodes.length; i++) {
            for (let j = i + 1; j < calculatedNodes.length; j++) {
                const p1 = calculatedNodes[i]
                const p2 = calculatedNodes[j]
                calculatedLinks.push({
                    source: p1,
                    target: p2,
                    value: lookupSynergy(p1.id, p2.id)
                })
            }
        }
        return { nodes: calculatedNodes, links: calculatedLinks }
    }, [activePlayers, synergyMatrix])

    // Helper to get color info based on value
    const getStrokeStyle = (value: number) => {
        if (value >= 85) return { color: "#3DD68C", width: 3, opacity: 0.9, tone: "text-positive" }       // strong pair
        if (value >= 70) return { color: "#8FE3B5", width: 2, opacity: 0.7, tone: "text-rating-good" }    // good pair
        if (value >= 50) return { color: "#808A99", width: 1.5, opacity: 0.55, tone: "text-ink-2" }       // neutral pair
        return { color: "#FF8A3D", width: 1.5, opacity: 0.7, tone: "text-caution" }                         // friction
    }

    return (
        <div className={cn("relative flex flex-col items-center justify-center overflow-hidden px-4 pb-4 pt-2", className)}>
            <div className="relative z-10 aspect-square w-full max-w-[320px]">
                <svg viewBox="0 0 360 360" className="h-full w-full overflow-visible">
                    {/* Connecting Lines */}
                    {links.map((link, i) => {
                        const style = getStrokeStyle(link.value)
                        return (
                            <g key={i} className="group/link hover:opacity-100 transition-opacity">
                                {/* Actual Line */}
                                <motion.line
                                    x1={link.source.x} y1={link.source.y}
                                    x2={link.target.x} y2={link.target.y}
                                    stroke={style.color}
                                    strokeWidth={style.width}
                                    strokeOpacity={style.opacity}
                                    strokeLinecap="round"
                                    initial={{ pathLength: 0 }}
                                    animate={{ pathLength: 1 }}
                                    transition={{ duration: 1, ease: "easeOut" }}
                                    className="transition-all duration-300 group-hover/link:stroke-4"
                                />

                                {/* Link Tooltip Trigger Area (Invisible but clickable) */}
                                <TooltipProvider>
                                    <Tooltip delayDuration={0}>
                                        <TooltipTrigger asChild>
                                            <line
                                                x1={link.source.x} y1={link.source.y}
                                                x2={link.target.x} y2={link.target.y}
                                                stroke="transparent"
                                                strokeWidth="20"
                                                className="cursor-pointer"
                                            />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p className="flex items-center gap-2 text-xs font-semibold text-ink-1">
                                                <span>{link.source.nickname}</span>
                                                <span className="text-ink-3">+</span>
                                                <span>{link.target.nickname}</span>
                                                <span className={cn("ml-2 tabular-nums", style.tone)}>
                                                    {link.value}%
                                                </span>
                                            </p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </g>
                        )
                    })}

                    {/* Nodes */}
                    {nodes.map((node) => (
                        <foreignObject
                            key={node.id}
                            x={node.x - 24}
                            y={node.y - 24}
                            width={48}
                            height={48}
                            className="overflow-visible"
                        >
                            <motion.div
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.5 }}
                                className="group relative z-20 h-12 w-12 cursor-default rounded-full border border-line-strong bg-ink p-0.5 transition-transform duration-200 hover:scale-110"
                            >
                                <div className="w-full h-full rounded-full overflow-hidden relative">
                                    <PlayerPortrait
                                        src={node.portraitPath} seed={node.id}
                                        alt={node.nickname}
                                        size={48}
                                        className="w-full h-full"
                                    />
                                </div>

                                {/* Name Label */}
                                <div className="pointer-events-none absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm bg-raised px-2 py-0.5 text-[11px] font-semibold text-ink-1 opacity-0 transition-opacity group-hover:opacity-100">
                                    {node.nickname}
                                </div>
                            </motion.div>
                        </foreignObject>
                    ))}
                </svg>

                {/* Central Stats or Logo */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                    <div className="relative rounded-md bg-panel/90 px-3 py-2">
                        <span className="font-display text-4xl font-bold tabular-nums text-ink-1">
                            {Math.round(teamChemistry ?? links.reduce((acc, l) => acc + l.value, 0) / (links.length || 1))}%
                        </span>
                        <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Team chemistry</p>
                    </div>
                </div>
            </div>

            {/* Legend: what a pair line means */}
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] font-semibold text-ink-3">
                <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded-full bg-positive" />Strong pair</span>
                <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded-full bg-rating-good" />Good</span>
                <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded-full bg-ink-3" />Neutral</span>
                <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded-full bg-caution" />Friction</span>
            </div>
        </div>
    )
}

export default memo(ChemistryMatrix)
