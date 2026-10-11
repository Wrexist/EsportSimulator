import { cn } from "@/lib/utils"
import { conditionTone, CONDITION_FILL, type ConditionTone } from "@/src/design/rating"

export interface MeterProps {
    /** 0–100 */
    value: number
    /** Accessible name, e.g. "Morale". */
    label: string
    tone?: ConditionTone | "auto"
    showValue?: boolean
    className?: string
    trackClassName?: string
}

/** Meter — a compact 0–100 condition bar for dense tables. */
export function Meter({ value, label, tone = "auto", showValue = true, className, trackClassName }: MeterProps) {
    const clamped = Math.max(0, Math.min(100, Math.round(value)))
    const resolved = tone === "auto" ? conditionTone(clamped) : tone
    return (
        <div className={cn("flex items-center gap-2", className)}>
            <div
                role="meter"
                aria-label={label}
                aria-valuenow={clamped}
                aria-valuemin={0}
                aria-valuemax={100}
                className={cn("h-1.5 w-14 overflow-hidden rounded-full bg-hover", trackClassName)}
            >
                <div className={cn("h-full rounded-full", CONDITION_FILL[resolved])} style={{ width: `${clamped}%` }} />
            </div>
            {showValue && <span className="w-7 text-right text-xs tabular-nums text-ink-2">{clamped}</span>}
        </div>
    )
}
