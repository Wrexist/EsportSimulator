"use client"

import { cn } from '@/lib/utils'
import { Skeleton } from './skeleton'

/**
 * Card Skeleton - For loading team/player cards
 */
export function CardSkeleton({ className }: { className?: string }) {
    return (
        <div className={cn("glass-panel p-4 space-y-3", className)}>
            <div className="flex items-center gap-3">
                <Skeleton className="w-12 h-12 rounded-xl" />
                <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                </div>
            </div>
            <div className="flex gap-2">
                <Skeleton className="h-8 flex-1 rounded-lg" />
                <Skeleton className="h-8 flex-1 rounded-lg" />
                <Skeleton className="h-8 flex-1 rounded-lg" />
            </div>
        </div>
    )
}

/**
 * Table Row Skeleton - For loading table data
 */
export function TableRowSkeleton({ columns = 5 }: { columns?: number }) {
    return (
        <tr className="border-b border-white/5">
            {Array.from({ length: columns }).map((_, i) => (
                <td key={i} className="p-3">
                    <Skeleton className="h-4 w-full" />
                </td>
            ))}
        </tr>
    )
}

/**
 * Player Card Skeleton - For roster/player list loading
 */
export function PlayerCardSkeleton() {
    return (
        <div className="flex items-center gap-4 p-3 bg-white/5 rounded-xl">
            <Skeleton className="w-14 h-14 rounded-xl shrink-0" />
            <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-20" />
            </div>
            <div className="text-right space-y-1">
                <Skeleton className="h-6 w-10 ml-auto" />
                <Skeleton className="h-2 w-8 ml-auto" />
            </div>
        </div>
    )
}

/**
 * Stat Box Skeleton - For loading stat cards
 */
export function StatBoxSkeleton() {
    return (
        <div className="text-center p-3 bg-white/5 rounded-xl space-y-2">
            <Skeleton className="h-8 w-12 mx-auto" />
            <Skeleton className="h-2 w-16 mx-auto" />
        </div>
    )
}

/**
 * Page Skeleton - Full page loading state
 */
export function PageSkeleton({ title }: { title?: string }) {
    return (
        <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in duration-300">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div className="space-y-2">
                    {title ? (
                        <h1 className="text-4xl font-normal tracking-tighter uppercase text-white/50">
                            {title}
                        </h1>
                    ) : (
                        <Skeleton className="h-10 w-48" />
                    )}
                    <Skeleton className="h-4 w-64" />
                </div>
                <Skeleton className="h-10 w-24 rounded-xl" />
            </div>

            {/* Content */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                    <CardSkeleton key={i} />
                ))}
            </div>
        </div>
    )
}

/**
 * Match Card Skeleton - For tournament match loading
 */
export function MatchCardSkeleton() {
    return (
        <div className="glass-panel p-4 space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Skeleton className="w-8 h-8 rounded-lg" />
                    <Skeleton className="h-4 w-20" />
                </div>
                <Skeleton className="h-6 w-10" />
                <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="w-8 h-8 rounded-lg" />
                </div>
            </div>
            <div className="flex justify-center">
                <Skeleton className="h-6 w-16 rounded-full" />
            </div>
        </div>
    )
}

/**
 * Sidebar Item Skeleton
 */
export function SidebarItemSkeleton() {
    return (
        <div className="flex items-center gap-3 p-3 rounded-xl">
            <Skeleton className="w-5 h-5 rounded" />
            <Skeleton className="h-4 w-24" />
        </div>
    )
}
