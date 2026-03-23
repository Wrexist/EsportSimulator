import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Lock, Unlock, Check, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import * as LucideIcons from 'lucide-react'
import { TalentNode } from '@/engine/talent-trees'

interface TalentTreeProps {
    nodes: TalentNode[]
    unlockedIds: string[]
    availablePoints: number
    onUnlock: (talentId: string) => void
    readonly?: boolean
}

export function TalentTree({ nodes, unlockedIds = [], availablePoints, onUnlock, readonly = false }: TalentTreeProps) {
    // Spacing constants for extreme compactness
    const SPACING_X = 90
    const SPACING_Y = 120
    const NODE_WIDTH = 70

    // 1. Calculate Canvas Size
    const bounds = useMemo(() => {
        let maxX = 0, maxY = 0
        nodes.forEach(n => {
            if (n.position.x > maxX) maxX = n.position.x
            if (n.position.y > maxY) maxY = n.position.y
        })
        return {
            width: (maxX + 1) * SPACING_X,
            height: (maxY + 1) * SPACING_Y + 40 // Extra padding for labels
        }
    }, [nodes])

    // 2. Render Lines
    const renderConnections = () => {
        return nodes.map(node => {
            return node.requirements.map(reqId => {
                const parent = nodes.find(n => n.id === reqId)
                if (!parent) return null

                const isUnlocked = unlockedIds.includes(node.id)
                const isUnlockable = unlockedIds.includes(parent.id)

                const x1 = parent.position.x * SPACING_X + (NODE_WIDTH / 2)
                const y1 = parent.position.y * SPACING_Y + 60 // Centerish of parent
                const x2 = node.position.x * SPACING_X + (NODE_WIDTH / 2)
                const y2 = node.position.y * SPACING_Y // Top of node

                return (
                    <g key={`conn-${parent.id}-${node.id}`}>
                        {/* Glow effect for unlocked paths */}
                        {isUnlocked && (
                            <motion.path
                                d={`M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`}
                                fill="none"
                                stroke="rgba(var(--primary), 0.5)"
                                strokeWidth="4"
                                className="blur-[4px]"
                                initial={{ pathLength: 0 }}
                                animate={{ pathLength: 1 }}
                                transition={{ duration: 1 }}
                            />
                        )}
                        <motion.path
                            d={`M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`}
                            fill="none"
                            strokeWidth="2"
                            className={cn(
                                "transition-all duration-500",
                                isUnlocked ? "stroke-primary" : isUnlockable ? "stroke-white/40" : "stroke-white/10"
                            )}
                            strokeDasharray={!isUnlocked && isUnlockable ? "5,5" : "none"}
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={{ duration: 1, delay: 0.2 }}
                        />
                    </g>
                )
            })
        })
    }

    return (
        <div className="relative overflow-auto p-4 flex justify-center min-h-[350px] w-full">
            <div className="relative" style={{ width: bounds.width, height: bounds.height }}>
                <svg className="absolute inset-0 pointer-events-none overflow-visible z-0">
                    {renderConnections()}
                </svg>

                {nodes.map(node => {
                    const isUnlocked = unlockedIds.includes(node.id)
                    const requirementsMet = node.requirements.every(req => unlockedIds.includes(req))
                    const canUnlock = !isUnlocked && requirementsMet && availablePoints >= node.cost && !readonly

                    const Icon = (LucideIcons as any)[node.icon] || LucideIcons.Star

                    return (
                        <div
                            key={node.id}
                            className="absolute flex flex-col items-center z-10"
                            style={{
                                left: node.position.x * SPACING_X,
                                top: node.position.y * SPACING_Y,
                                width: NODE_WIDTH
                            }}
                        >
                            <TooltipProvider>
                                <Tooltip delayDuration={0}>
                                    <TooltipTrigger asChild>
                                        <button
                                            onClick={() => canUnlock && onUnlock(node.id)}
                                            disabled={!canUnlock && !isUnlocked}
                                            className={cn(
                                                "w-16 h-16 rounded-2xl border flex flex-col items-center justify-center transition-all duration-300 relative group z-10",
                                                isUnlocked
                                                    ? "bg-primary/20 border-primary text-primary shadow-[0_0_15px_rgba(var(--primary),0.3)] backdrop-blur-md"
                                                    : canUnlock
                                                        ? "bg-white/10 border-white/40 text-white hover:scale-105 hover:bg-white/20 hover:border-primary hover:text-white cursor-pointer hover:shadow-[0_0_10px_rgba(255,255,255,0.1)] backdrop-blur-sm"
                                                        : "bg-black/60 border-white/5 text-white/20 grayscale"
                                            )}
                                        >
                                            <div className={cn(
                                                "p-2.5 rounded-full transition-all duration-300 shadow-inner",
                                                isUnlocked ? "bg-primary text-black" : "bg-white/5"
                                            )}>
                                                <Icon size={isUnlocked ? 18 : 16} />
                                            </div>

                                            {/* Cost Badge */}
                                            {!isUnlocked && (
                                                <div className={cn(
                                                    "absolute -bottom-2 px-1.5 py-0.5 rounded-full text-[8px] font-normal border shadow-lg z-20",
                                                    canUnlock ? "bg-black border-primary text-primary" : "bg-black border-white/10 text-white/30"
                                                )}>
                                                    {node.cost} TP
                                                </div>
                                            )}

                                            {/* Checkmark */}
                                            {isUnlocked && (
                                                <div className="absolute -top-1.5 -right-1.5 bg-primary text-black rounded-full p-0.5 border border-black shadow-lg z-20">
                                                    <Check size={8} strokeWidth={4} />
                                                </div>
                                            )}
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-[200px] bg-black/80 backdrop-blur-xl border-white/10 p-3 shadow-2xl rounded-xl" sideOffset={5}>
                                        <div className="space-y-1.5">
                                            <div className="flex items-start justify-between gap-2">
                                                <p className="font-normal text-xs text-white uppercase tracking-wider">{node.name}</p>
                                            </div>

                                            <p className="text-[10px] text-white/70 leading-relaxed">{node.description}</p>

                                            <div className="pt-1.5 border-t border-white/10 mt-1.5">
                                                {!isUnlocked && !requirementsMet && (
                                                    <p className="text-[9px] text-red-400 flex items-center gap-1 font-bold uppercase tracking-wide">
                                                        <Lock size={8} /> Needs Requirements
                                                    </p>
                                                )}
                                                {!isUnlocked && requirementsMet && availablePoints < node.cost && (
                                                    <p className="text-[9px] text-amber-400 flex items-center gap-1 font-bold uppercase tracking-wide">
                                                        <Lock size={8} /> Need {node.cost} TP
                                                    </p>
                                                )}
                                                {!isUnlocked && requirementsMet && availablePoints >= node.cost && (
                                                    <p className="text-[9px] text-emerald-400 flex items-center gap-1 font-bold uppercase tracking-wide">
                                                        <Unlock size={8} /> Click to Unlock
                                                    </p>
                                                )}
                                                {isUnlocked && (
                                                    <p className="text-[9px] text-primary flex items-center gap-1 font-bold uppercase tracking-wide">
                                                        <Check size={8} /> Unlocked
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>

                            {/* Node Name Label */}
                            <div className={cn(
                                "mt-2 text-[9px] font-bold text-center uppercase tracking-wide leading-tight px-0.5 transition-colors duration-300",
                                isUnlocked ? "text-white" : "text-white/20"
                            )}>
                                {node.name}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
