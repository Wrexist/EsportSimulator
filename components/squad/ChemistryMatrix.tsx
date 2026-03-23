"use client"

import React, { useMemo } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { PlayerSaveData } from "@/engine"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import Image from "next/image"
import { PlayerPortrait } from "@/components/ui/asset-images"

interface ChemistryMatrixProps {
    players: PlayerSaveData[]
    synergyMatrix?: Record<string, number>
    className?: string
}

export function ChemistryMatrix({ players, synergyMatrix = {}, className }: ChemistryMatrixProps) {
    const activePlayers = useMemo(() => players.slice(0, 5), [players]) // Ensure max 5 for the pentagon

    const getSynergy = (id1: string, id2: string) => {
        const key = [id1, id2].sort().join("_")
        return synergyMatrix[key] || 50
    }

    const { nodes, links } = useMemo(() => {
        const r = 130 // Radius of the circle
        const center = 180 // Center of the SVG canvas (360x360)

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
                    value: getSynergy(p1.id, p2.id)
                })
            }
        }
        return { nodes: calculatedNodes, links: calculatedLinks }
    }, [activePlayers, synergyMatrix])

    // Helper to get color info based on value
    const getStrokeStyle = (value: number) => {
        if (value >= 85) return { color: "#10b981", width: 3, opacity: 0.8, glow: "rgba(16,185,129,0.5)" } // Emerald
        if (value >= 70) return { color: "#3b82f6", width: 2, opacity: 0.6, glow: "rgba(59,130,246,0.3)" } // Blue
        if (value >= 50) return { color: "#f59e0b", width: 1, opacity: 0.4, glow: "rgba(245,158,11,0.1)" } // Amber
        return { color: "#f43f5e", width: 1, opacity: 0.2, glow: "transparent" } // Red
    }

    return (
        <div className={cn("glass-panel p-6 overflow-hidden relative min-h-[450px] flex flex-col items-center justify-center", className)}>
            {/* Dynamic Background */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.05)_0%,transparent_70%)] pointer-events-none" />

            <div className="w-full max-w-[400px] aspect-square relative z-10">
                <svg viewBox="0 0 360 360" className="w-full h-full drop-shadow-2xl overflow-visible">
                    {/* Connecting Lines */}
                    {links.map((link, i) => {
                        const style = getStrokeStyle(link.value)
                        return (
                            <g key={i} className="group/link hover:opacity-100 transition-opacity">
                                {/* Glow Effect Line (Thicker, Blurred) */}
                                <motion.line
                                    x1={link.source.x} y1={link.source.y}
                                    x2={link.target.x} y2={link.target.y}
                                    stroke={style.color}
                                    strokeWidth={style.width * 4}
                                    strokeOpacity={0.15}
                                    initial={{ pathLength: 0, opacity: 0 }}
                                    animate={{ pathLength: 1, opacity: 0.15 }}
                                    transition={{ duration: 1.5, delay: 0.2 }}
                                    className="blur-[4px]"
                                />
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
                                    className="transition-all duration-300 group-hover/link:stroke-[4]"
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
                                        <TooltipContent className="bg-black/90 border-white/10 backdrop-blur-xl">
                                            <p className="font-bold text-xs uppercase text-white flex items-center gap-2">
                                                <span>{link.source.nickname}</span>
                                                <span className="text-white/40">+</span>
                                                <span>{link.target.nickname}</span>
                                                <span className={cn("ml-2", style.color === "#10b981" ? "text-emerald-400" : style.color === "#3b82f6" ? "text-blue-400" : "text-amber-400")}>
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
                                className="w-12 h-12 rounded-full p-0.5 bg-black border border-white/10 relative z-20 group hover:scale-125 transition-transform duration-300 shadow-[0_0_20px_rgba(0,0,0,0.5)] cursor-default"
                            >
                                <div className="w-full h-full rounded-full overflow-hidden relative">
                                    <PlayerPortrait
                                        src={node.portraitPath}
                                        alt={node.nickname}
                                        size={48}
                                        className="w-full h-full"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/60" />
                                </div>

                                {/* Name Label */}
                                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-normal uppercase text-white tracking-wider whitespace-nowrap bg-black/60 px-2 py-0.5 rounded backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                    {node.nickname}
                                </div>
                            </motion.div>
                        </foreignObject>
                    ))}
                </svg>

                {/* Central Stats or Logo */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-b from-white/5 to-transparent blur-xl absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                    <div className="relative">
                        <span className="text-3xl font-normal text-white/90 tracking-tighter drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">
                            {Math.round(links.reduce((acc, l) => acc + l.value, 0) / (links.length || 1))}%
                        </span>
                        <p className="text-[8px] font-bold text-white/40 uppercase tracking-[0.3em] mt-1">Team Chemistry</p>
                    </div>
                </div>
            </div>

            {/* Legend / Footer */}
            <div className="flex items-center gap-6 mt-6 opacity-60">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-0.5 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                    <span className="text-[9px] font-bold uppercase text-white">Elite</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-8 h-0.5 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
                    <span className="text-[9px] font-bold uppercase text-white">Solid</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-8 h-0.5 bg-amber-500 rounded-full" />
                    <span className="text-[9px] font-bold uppercase text-white">Neutral</span>
                </div>
            </div>
        </div>
    )
}
