import { RatingChip, type RatingChipSize } from "@/src/components/ui/RatingChip"
import { RatingRange } from "@/src/components/ui/RatingRange"
import type { VisibleStats } from "@/engine/scouting-system"
import { cn } from "@/lib/utils"

/**
 * The rating as the club actually knows it:
 *  - unscouted → one muted "Scout to reveal" chip (the public ±20 band is noise),
 *  - partial report → the real estimate band,
 *  - full report / own player → the exact rating.
 */
export function ScoutedRating({ knowledge, size = "md", className }: {
    knowledge: Pick<VisibleStats, "ovrRange" | "scoutingLevel"> | undefined
    size?: RatingChipSize
    className?: string
}) {
    if (!knowledge || knowledge.scoutingLevel === "NONE") {
        return (
            <span className={cn("inline-flex items-center whitespace-nowrap rounded-sm border border-dashed border-line-strong px-1.5 py-0.5 text-[11px] font-medium text-ink-3", className)}>
                Scout to reveal
            </span>
        )
    }
    const value = knowledge.ovrRange
    if (Array.isArray(value)) return <RatingRange range={value} className={className} />
    return <RatingChip value={value} size={size} className={className} />
}

export const REPORT_LABEL: Record<VisibleStats["scoutingLevel"], string> = {
    NONE: "Unscouted",
    BASIC: "Basic report",
    ADVANCED: "Advanced report",
    EXPERT: "Expert report",
    ELITE: "Full report",
}
