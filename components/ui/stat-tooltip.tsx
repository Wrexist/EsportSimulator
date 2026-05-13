import React from 'react'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import { HelpCircle } from 'lucide-react'

interface StatTooltipProps {
    children: React.ReactNode
    title: string
    description?: string
    formula?: string
    side?: 'top' | 'right' | 'bottom' | 'left'
}

/**
 * Stat Tooltip Component
 * Shows helpful information about game stats
 * 
 * @example
 * <StatTooltip
 *   title="Team Chemistry"
 *   description="How well your players work together"
 *   formula="Average compatibility × roster stability"
 * >
 *   <Badge>85%</Badge>
 * </StatTooltip>
 */
export function StatTooltip({
    children,
    title,
    description,
    formula,
    side = 'top'
}: StatTooltipProps) {
    return (
        <TooltipProvider>
            <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                    {children}
                </TooltipTrigger>
                <TooltipContent side={side} className="max-w-xs">
                    <div className="space-y-1">
                        <div className="font-bold">{title}</div>
                        {description && (
                            <p className="text-xs text-muted-foreground">{description}</p>
                        )}
                        {formula && (
                            <div className="text-xs font-mono text-blue-400 mt-2 pt-2 border-t border-white/10">
                                {formula}
                            </div>
                        )}
                    </div>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}

/**
 * Help Icon Tooltip
 * Simple ? icon with helpful text
 */
export function HelpTooltip({
    content,
    side = 'top'
}: {
    content: string
    side?: 'top' | 'right' | 'bottom' | 'left'
}) {
    return (
        <TooltipProvider>
            <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                    <button className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                        <HelpCircle className="w-4 h-4" />
                    </button>
                </TooltipTrigger>
                <TooltipContent side={side} className="max-w-xs">
                    <p className="text-sm">{content}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}

/**
 * Rarity Tooltip
 * Explains player/staff rarity tiers
 */
export function RarityTooltip({ rarity }: { rarity: string }) {
    const rarityInfo: Record<string, { description: string; color: string }> = {
        Common: {
            description: 'Standard tier. Most players fall into this category.',
            color: 'text-gray-400'
        },
        Rare: {
            description: 'Above average. Better stats and potential.',
            color: 'text-blue-400'
        },
        Epic: {
            description: 'High quality. Significant bonuses',
            color: 'text-purple-400'
        },
        Legendary: {
            description: 'Top 1% elite talent. Maximum bonuses and potential.',
            color: 'text-orange-400'
        }
    }

    const info = rarityInfo[rarity] || rarityInfo['Common']

    return (
        <StatTooltip
            title={`${rarity} Rarity`}
            description={info.description}
        >
            <span className={`font-bold ${info.color}`}>{rarity}</span>
        </StatTooltip>
    )
}

/**
 * Stat explanation tooltips for common game stats
 */
export const StatExplanations = {
    aim: "Player's shooting accuracy and mechanical skill",
    positioning: "Map awareness and positioning sense",
    utility: "Effective use of grenades and abilities",
    gamesense: "Reading the game and making smart decisions",
    clutch: "Performance in high-pressure 1vX situations",
    consistency: "Ability to maintain performance level",
    teamwork: "Communication and coordination with teammates",

    // Staff stats
    motivation: "Ability to boost player morale",
    tactics: "Strategic knowledge and planning",
    development: "Player improvement and training effectiveness",

    // Team stats
    chemistry: "How well the roster works together (compatibility × stability)",
    prestige: "Team reputation affecting transfers and sponsors",
    facilities: "Training center quality affecting player development"
}

/**
 * Quick stat tooltip wrapper
 */
export function QuickStatTooltip({
    stat,
    children
}: {
    stat: keyof typeof StatExplanations
    children: React.ReactNode
}) {
    return (
        <StatTooltip
            title={stat.charAt(0).toUpperCase() + stat.slice(1)}
            description={StatExplanations[stat]}
        >
            {children}
        </StatTooltip>
    )
}
