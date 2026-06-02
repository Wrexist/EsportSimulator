import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// Re-export skeletons from the canonical location to eliminate the duplicate
// `Skeleton`/`CardSkeleton`/`TableSkeleton` implementations that used to live here.
export { Skeleton, CardSkeleton } from '@/src/components/ui/Skeleton'
export { TableRowSkeleton as TableSkeleton } from '@/src/components/ui/Skeleton'

/**
 * Universe-flavored loading copy. Pick one with `flavor="match"` from a
 * caller instead of passing a hand-rolled string, so loading screens
 * feel consistent across the game instead of a generic spinner.
 */
export const FLAVORED_LOADING: Record<string, string> = {
    default: 'Loading…',
    boot: 'Booting systems…',
    save: 'Pulling save from cloud…',
    teams: 'Scouting talent…',
    match: 'Warming up servers…',
    tournament: 'Seeding the bracket…',
    transfers: 'Opening the transfer window…',
    stats: 'Crunching demos…',
    training: 'Loading drill schedules…',
    finance: 'Reconciling the books…',
    schedule: 'Compiling fixtures…',
}

interface LoadingStateProps {
    message?: string
    /** Convenience: pass a key like "match" instead of a literal string. */
    flavor?: keyof typeof FLAVORED_LOADING
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
 * Prefer `flavor="match"` over a hand-rolled string so copy stays
 * consistent across screens.
 */
export function LoadingState({
    message,
    flavor,
    fullScreen = false,
    className,
    size = 'md',
}: LoadingStateProps) {
    const displayMessage = message ?? FLAVORED_LOADING[flavor ?? 'default'] ?? 'Loading…'
    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center gap-4',
                fullScreen ? 'min-h-screen liquid-app-bg' : 'p-12',
                className,
            )}
            role="status"
            aria-live="polite"
            aria-busy="true"
        >
            <Loader2 className={cn(sizeMap[size], 'animate-spin text-cyan-200')} aria-hidden="true" />
            {displayMessage && (
                <p className="text-sm text-white/55">{displayMessage}</p>
            )}
        </div>
    )
}
