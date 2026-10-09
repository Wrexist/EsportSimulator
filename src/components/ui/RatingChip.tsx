import { cn } from "@/lib/utils"
import { ratingBand, RATING_TEXT } from "@/src/design/rating"

export type RatingChipSize = "sm" | "md" | "lg" | "xl"

const SIZE_CLASS: Record<RatingChipSize, string> = {
    sm: "min-w-7 px-1 text-[15px]",
    md: "min-w-9 px-1.5 text-lg",
    lg: "min-w-12 px-2 text-3xl",
    xl: "min-w-16 px-2 text-6xl",
}

export interface RatingChipProps {
    value: number
    size?: RatingChipSize
    /** Draw the number without the raised background (hero use). */
    bare?: boolean
    className?: string
    title?: string
}

/** RatingChip — a rating number in the display face, coloured by band. */
export function RatingChip({ value, size = "md", bare = false, className, title }: RatingChipProps) {
    const rounded = Math.round(value)
    return (
        <span
            title={title}
            className={cn(
                "inline-flex items-center justify-center font-display font-bold leading-none tabular-nums",
                !bare && "rounded-sm bg-raised py-1",
                SIZE_CLASS[size],
                RATING_TEXT[ratingBand(rounded)],
                className,
            )}
        >
            {rounded}
        </span>
    )
}
