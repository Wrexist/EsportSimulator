import React, { useMemo } from 'react'
import {
    Lock,
    Unlock,
    Check,
    // Talent-node icons. The set must cover every `icon:` value used in
    // engine/talent-trees.ts. The TALENT_ICON_MAP below dispatches at
    // render time; new icons need to be added here AND to the map. This
    // replaces the previous `import * as LucideIcons from 'lucide-react'`
    // namespace import, which is incompatible with the lucide-react
    // modularizeImports rule (which refuses namespace imports because
    // they pull the entire icon library into the bundle).
    Anchor,
    BookOpen,
    Brain,
    Crosshair,
    Crown,
    Diamond,
    Dumbbell,
    Ear,
    Eye,
    FileSpreadsheet,
    Flame,
    Flower2,
    Globe,
    GraduationCap,
    Heart,
    MessageSquare,
    SearchCheck,
    ShieldAlert,
    Star,
    Target,
    Users2,
    Video,
    Zap,
    type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { TalentNode } from '@/engine/talent-trees'

/**
 * Talent-node icon dispatch. Mirrors the talent definitions in
 * engine/talent-trees.ts — keep both in sync. Unknown icon names fall
 * back to Star (the original namespace-lookup default).
 */
const TALENT_ICON_MAP: Record<string, LucideIcon> = {
    Anchor,
    BookOpen,
    Brain,
    Crosshair,
    Crown,
    Diamond,
    Dumbbell,
    Ear,
    Eye,
    FileSpreadsheet,
    Flame,
    Flower2,
    Globe,
    GraduationCap,
    Heart,
    MessageSquare,
    SearchCheck,
    ShieldAlert,
    Star,
    Target,
    Unlock,
    Users2,
    Video,
    Zap,
}

interface TalentTreeProps {
    nodes: TalentNode[]
    unlockedIds: string[]
    availablePoints: number
    onUnlock: (talentId: string) => void
    readonly?: boolean
}

const SPACING_X = 112
const SPACING_Y = 104
const NODE = 52

/**
 * TalentTree — talent nodes on a quiet grid. Owned nodes read solid, nodes you
 * can buy now get a gold outline (the one call to action), the rest stay dim.
 */
export function TalentTree({ nodes, unlockedIds = [], availablePoints, onUnlock, readonly = false }: TalentTreeProps) {
    const bounds = useMemo(() => {
        let maxX = 0, maxY = 0
        nodes.forEach(n => {
            if (n.position.x > maxX) maxX = n.position.x
            if (n.position.y > maxY) maxY = n.position.y
        })
        return { width: maxX * SPACING_X + NODE + 56, height: maxY * SPACING_Y + NODE + 40 }
    }, [nodes])

    const center = (n: TalentNode) => ({ x: n.position.x * SPACING_X + 28 + NODE / 2, y: n.position.y * SPACING_Y + NODE / 2 })

    return (
        <div className="flex w-full justify-center overflow-x-auto px-4 py-5">
            <div className="relative shrink-0" style={{ width: bounds.width, height: bounds.height }}>
                <svg className="pointer-events-none absolute inset-0 overflow-visible" width={bounds.width} height={bounds.height} aria-hidden="true">
                    {nodes.flatMap(node => node.requirements.map(reqId => {
                        const parent = nodes.find(n => n.id === reqId)
                        if (!parent) return null
                        const a = center(parent), b = center(node)
                        const owned = unlockedIds.includes(node.id)
                        const open = unlockedIds.includes(parent.id)
                        return (
                            <path
                                key={`${parent.id}-${node.id}`}
                                d={`M ${a.x} ${a.y + NODE / 2} C ${a.x} ${(a.y + b.y) / 2}, ${b.x} ${(a.y + b.y) / 2}, ${b.x} ${b.y - NODE / 2}`}
                                fill="none"
                                strokeWidth={owned ? 1.5 : 1}
                                strokeDasharray={!owned && open ? "4 4" : undefined}
                                className={owned ? "stroke-ink-2" : open ? "stroke-line-strong" : "stroke-line"}
                            />
                        )
                    }))}
                </svg>

                {nodes.map(node => {
                    const isUnlocked = unlockedIds.includes(node.id)
                    const requirementsMet = node.requirements.every(req => unlockedIds.includes(req))
                    const canUnlock = !isUnlocked && requirementsMet && availablePoints >= node.cost && !readonly
                    const Icon = TALENT_ICON_MAP[node.icon] ?? Star
                    const status = isUnlocked ? "Owned"
                        : !requirementsMet ? "Needs the talent above"
                            : availablePoints < node.cost ? `Needs ${node.cost} point${node.cost > 1 ? "s" : ""}`
                                : readonly ? "Available" : "Click to unlock"

                    return (
                        <div
                            key={node.id}
                            className="absolute flex flex-col items-center"
                            style={{ left: node.position.x * SPACING_X, top: node.position.y * SPACING_Y, width: NODE + 56 }}
                        >
                            <TooltipProvider>
                                <Tooltip delayDuration={100}>
                                    <TooltipTrigger asChild>
                                        <button
                                            type="button"
                                            onClick={() => canUnlock && onUnlock(node.id)}
                                            aria-disabled={!canUnlock}
                                            aria-label={`${node.name}: ${node.description} ${status}.`}
                                            className={cn(
                                                "relative flex items-center justify-center rounded-md border transition-colors duration-150",
                                                isUnlocked
                                                    ? "border-line-strong bg-hover text-ink-1"
                                                    : canUnlock
                                                        ? "cursor-pointer border-gold bg-raised text-ink-1 hover:bg-hover"
                                                        : "cursor-default border-line bg-shell text-ink-3",
                                            )}
                                            style={{ width: NODE, height: NODE }}
                                        >
                                            <Icon size={20} />
                                            {isUnlocked ? (
                                                <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-positive text-ink">
                                                    <Check size={10} strokeWidth={3} />
                                                </span>
                                            ) : (
                                                <span className={cn(
                                                    "absolute -bottom-2 rounded-sm border px-1 text-[11px] font-semibold leading-4 tabular-nums",
                                                    canUnlock ? "border-gold bg-panel text-gold" : "border-line bg-panel text-ink-3",
                                                )}>
                                                    {node.cost}
                                                </span>
                                            )}
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-[220px] p-3" sideOffset={6}>
                                        <p className="text-sm font-semibold text-ink-1">{node.name}</p>
                                        <p className="mt-1 text-xs leading-relaxed text-ink-2">{node.description}</p>
                                        <p className={cn("mt-2 flex items-center gap-1 text-xs font-semibold", isUnlocked ? "text-positive" : canUnlock ? "text-gold" : "text-ink-3")}>
                                            {isUnlocked ? <Check size={11} /> : canUnlock ? <Unlock size={11} /> : <Lock size={11} />} {status}
                                        </p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                            <span className={cn("mt-3 text-center text-xs leading-tight", isUnlocked ? "font-semibold text-ink-1" : "text-ink-3")}>
                                {node.name}
                            </span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
