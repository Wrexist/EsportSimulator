import { cn } from "@/lib/utils"

export interface RatingRangeProps {
    /** Inclusive [low, high] estimate on the 0–99 rating scale. */
    range: [number, number]
    /** Drop the bar (text only) for very tight cells. */
    compact?: boolean
    className?: string
}

/**
 * RatingRange — an uncertain rating: the estimate as text plus a thin bar
 * marking where the band sits on 0–99. Deliberately uncoloured: a range is
 * a knowledge state, not a verdict, so it never borrows the rating ladder.
 */
export function RatingRange({ range, compact = false, className }: RatingRangeProps) {
    const lo = Math.max(0, Math.min(99, Math.round(Math.min(range[0], range[1]))))
    const hi = Math.max(0, Math.min(99, Math.round(Math.max(range[0], range[1]))))
    return (
        <span
            className={cn("inline-flex flex-col items-center gap-1", className)}
            title={`Scouting estimate: between ${lo} and ${hi}`}
        >
            <span className="font-display text-[15px] font-bold leading-none tabular-nums text-ink-2">
                {lo}<span className="text-ink-3">–</span>{hi}
            </span>
            {!compact && (
                <span aria-hidden="true" className="relative block h-1 w-12 rounded-full bg-hover">
                    <span
                        className="absolute inset-y-0 rounded-full bg-ink-3"
                        style={{ left: `${(lo / 99) * 100}%`, width: `${Math.max(4, ((hi - lo) / 99) * 100)}%` }}
                    />
                </span>
            )}
        </span>
    )
}
