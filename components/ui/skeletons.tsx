"use client"

/**
 * Re-exports from the canonical skeleton module (`src/components/ui/Skeleton`).
 * Kept here for backwards compatibility with existing imports; new code should
 * import directly from `@/src/components/ui/Skeleton`.
 */

import { cn } from '@/lib/utils'
import {
    Skeleton,
    CardSkeleton,
    PlayerCardSkeleton,
    StatTileSkeleton,
    TableRowSkeleton,
} from '@/src/components/ui/Skeleton'

export { Skeleton, CardSkeleton, PlayerCardSkeleton, TableRowSkeleton }
export const StatBoxSkeleton = StatTileSkeleton

/** Full-page placeholder — used by Suspense boundaries on feature screens. */
export function PageSkeleton({ title }: { title?: string }) {
    return (
        <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in duration-300">
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                    <CardSkeleton key={i} />
                ))}
            </div>
        </div>
    )
}

/** Match card placeholder — used by tournament lists. */
export function MatchCardSkeleton() {
    return (
        <div className={cn('rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3')}>
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

/** Sidebar-item placeholder. */
export function SidebarItemSkeleton() {
    return (
        <div className="flex items-center gap-3 p-3 rounded-xl">
            <Skeleton className="w-5 h-5 rounded" />
            <Skeleton className="h-4 w-24" />
        </div>
    )
}
