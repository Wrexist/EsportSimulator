import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LoadingStateProps {
    message?: string
    fullScreen?: boolean
    className?: string
    size?: 'sm' | 'md' | 'lg'
}

const sizeMap = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
}

/**
 * Loading State Component
 * Shows spinner with optional message
 * Can be inline or full-screen
 */
export function LoadingState({
    message = "Loading...",
    fullScreen = false,
    className,
    size = 'md'
}: LoadingStateProps) {
    const content = (
        <div className={cn(
            "flex flex-col items-center justify-center gap-4",
            fullScreen ? "min-h-screen" : "p-12",
            className
        )}>
            <Loader2 className={cn(sizeMap[size], "animate-spin text-primary")} />
            {message && (
                <p className="text-sm text-muted-foreground animate-pulse">
                    {message}
                </p>
            )}
        </div>
    )

    return content
}

/**
 * Skeleton Loader
 * For content that's loading in place
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn("animate-pulse rounded-md bg-white/5", className)}
            {...props}
        />
    )
}

/**
 * Loading Skeleton for player/staff cards
 */
export function CardSkeleton() {
    return (
        <div className="glass-panel p-4 space-y-3">
            <div className="flex gap-4">
                <Skeleton className="w-16 h-16 rounded" />
                <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                </div>
            </div>
            <Skeleton className="h-20 w-full" />
        </div>
    )
}

/**
 * Loading Skeleton for table rows
 */
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
    return (
        <>
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="flex gap-4 py-3 border-b border-white/5">
                    <Skeleton className="h-10 flex-1" />
                    <Skeleton className="h-10 w-24" />
                    <Skeleton className="h-10 w-32" />
                </div>
            ))}
        </>
    )
}
