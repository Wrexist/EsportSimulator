import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// Re-export skeletons from the canonical location to eliminate the duplicate
// `Skeleton`/`CardSkeleton`/`TableSkeleton` implementations that used to live here.
export { Skeleton, CardSkeleton } from '@/src/components/ui/Skeleton'
export { TableRowSkeleton as TableSkeleton } from '@/src/components/ui/Skeleton'

interface LoadingStateProps {
    message?: string
    fullScreen?: boolean
    className?: string
    size?: 'sm' | 'md' | 'lg'
}

const sizeMap = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
}

/**
 * LoadingState — spinner with optional message, inline or full-screen.
 * Retained here (not moved) because it is unrelated to the skeleton family.
 */
export function LoadingState({
    message = 'Loading...',
    fullScreen = false,
    className,
    size = 'md',
}: LoadingStateProps) {
    return (
        <div className={cn(
            'flex flex-col items-center justify-center gap-4',
            fullScreen ? 'min-h-screen' : 'p-12',
            className,
        )}>
            <Loader2 className={cn(sizeMap[size], 'animate-spin text-primary')} />
            {message && (
                <p className="text-sm text-muted-foreground animate-pulse">{message}</p>
            )}
        </div>
    )
}
