"use client"
import { t } from "@/lib/i18n"

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

    // Helper to get color info based on value. SQUAD-16: strong and good
    // share one green and differ by weight, so they can't be confused.
    const getStrokeStyle = (value: number) => {
        if (value >= 85) return { color: "#3DD68C", width: 3.5, opacity: 1, tone: "text-positive" }       // strong pair
        if (value >= 70) return { color: "#3DD68C", width: 1.5, opacity: 0.6, tone: "text-positive" }     // good pair
        if (value >= 50) return { color: "#808A99", width: 1.5, opacity: 0.55, tone: "text-ink-2" }       // neutral pair
        return { color: "#FF8A3D", width: 1.5, opacity: 0.7, tone: "text-caution" }                         // friction
    }
    // SQUAD-16: lines stop at the portrait ring instead of running under it.
    const NODE_GAP = 27
    const clip = (a: { x: number; y: number }, b: { x: number; y: number }) => {
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
        const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len
        return { x1: a.x + ux * NODE_GAP, y1: a.y + uy * NODE_GAP, x2: b.x - ux * NODE_GAP, y2: b.y - uy * NODE_GAP }
    }

    return (
        <div className={cn("relative flex flex-col items-center justify-center overflow-hidden px-4 pb-4 pt-2", className)}>
            <div className="relative z-10 aspect-square w-full max-w-[320px]">
                <svg viewBox="0 0 360 360" className="h-full w-full overflow-visible">
                    {/* Connecting Lines */}
                    {links.map((link, i) => {
                        const style = getStrokeStyle(link.value)
                        const seg = clip(link.source, link.target)
                        return (
                            <g key={i} className="group/link hover:opacity-100 transition-opacity">
                                {/* Actual Line */}
                                <motion.line
                                    x1={seg.x1} y1={seg.y1}
                                    x2={seg.x2} y2={seg.y2}
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
                        <g key={node.id}>
                        <foreignObject
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
                                title={node.nickname}
                                className="group relative z-20 h-12 w-12 cursor-default rounded-full border border-line-strong bg-ink p-0.5 transition-colors duration-150 hover:border-ink-2"
                            >
                                <div className="w-full h-full rounded-full overflow-hidden relative">
                                    <PlayerPortrait
                                        src={node.portraitPath} seed={node.id}
                                        alt={node.nickname}
                                        size={48}
                                        className="w-full h-full"
                                    />
                                </div>

                            </motion.div>
                        </foreignObject>
                        {/* SQUAD-23: the name stays visible under the portrait (the old
                            hover label sat outside the foreignObject and was clipped). */}
                        <text x={node.x} y={node.y + 38} textAnchor="middle" fill="#C9D0DA" fontSize="12" fontWeight="600"
                            stroke="hsl(var(--card))" strokeWidth={4} strokeLinejoin="round" paintOrder="stroke" className="pointer-events-none select-none">
                            {node.nickname}
                        </text>
                        </g>
                    ))}
                </svg>

                {/* Central Stats or Logo */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                    <div className="relative rounded-full bg-panel px-5 py-5">
                        <span className="font-display text-4xl font-bold tabular-nums text-ink-1">
                            {Math.round(teamChemistry ?? links.reduce((acc, l) => acc + l.value, 0) / (links.length || 1))}%
                        </span>
                        <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{t("squad.chem.team")}</p>
                    </div>
                </div>
            </div>

            {/* Legend: what a pair line means */}
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-semibold text-ink-3">
                <span className="flex items-center gap-1 whitespace-nowrap"><span className="h-1 w-4 rounded-full bg-positive" />{t("squad.chem.strong")}</span>
                <span className="flex items-center gap-1 whitespace-nowrap"><span className="h-0.5 w-4 rounded-full bg-positive opacity-60" />{t("squad.chem.good")}</span>
                <span className="flex items-center gap-1 whitespace-nowrap"><span className="h-0.5 w-4 rounded-full bg-ink-3" />{t("squad.chem.neutral")}</span>
                <span className="flex items-center gap-1 whitespace-nowrap"><span className="h-0.5 w-4 rounded-full bg-caution" />{t("squad.chem.friction")}</span>
            </div>
        </div>
    )
}

export default memo(ChemistryMatrix)
