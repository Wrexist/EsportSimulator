import { cn } from "@/lib/utils"
import { RatingChip } from "./RatingChip"

export interface TeamStandingProps {
    /** World ranking; a side without one (a drafted team) shows only its OVR. */
    rank?: number | null
    ovr?: number | null
    className?: string
}

/** TeamStanding — a team's world rank and OVR in one compact tag, for brackets and lists. */
export function TeamStanding({ rank, ovr, className }: TeamStandingProps) {
    if (!rank && ovr == null) return null
    const label = [rank ? `World rank ${rank}` : null, ovr != null ? `Team OVR ${ovr}` : null].filter(Boolean).join(", ")
    return (
        <span className={cn("inline-flex shrink-0 items-center gap-1", className)} title={label} aria-label={label}>
            {rank ? <span className="text-[11px] font-semibold tabular-nums text-ink-3">#{rank}</span> : null}
            {ovr != null && <RatingChip value={ovr} size="sm" bare className="min-w-0 px-0 text-[13px]" />}
        </span>
    )
}
