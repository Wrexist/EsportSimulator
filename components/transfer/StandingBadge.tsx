import { Crown, Sparkles, Star } from "lucide-react"
import { STANDING_LABEL, type MarketStanding } from "@/engine/transfer-hype"
import { cn } from "@/lib/utils"

const STYLE: Record<MarketStanding, string> = {
    ICON: "border-gold/60 bg-gold/10 text-gold",
    STAR: "border-ink-2/50 bg-ink-1/5 text-ink-1",
    WONDERKID: "border-side-ct/50 bg-side-ct/10 text-side-ct",
}
const ICON = { ICON: Crown, STAR: Star, WONDERKID: Sparkles } as const
const TITLE: Record<MarketStanding, string> = {
    ICON: "Icon: among the 1% most valuable players in the world",
    STAR: "Star: among the 5% most valuable players in the world",
    WONDERKID: "Wonderkid: 20 or younger and among the 20% most valuable players",
}

/** Market standing badge (Icon / Star / Wonderkid), from public market value. */
export function StandingBadge({ standing, size = "sm", className }: { standing: MarketStanding | undefined; size?: "xs" | "sm" | "md"; className?: string }) {
    if (!standing) return null
    const Icon = ICON[standing]
    return (
        <span
            title={TITLE[standing]}
            className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-sm border font-semibold uppercase tracking-[0.08em]",
                size === "xs" ? "px-1 py-px text-[9px]" : size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[13px]",
                STYLE[standing],
                className,
            )}
        >
            <Icon size={size === "xs" ? 9 : size === "sm" ? 10 : 13} aria-hidden="true" className={cn(standing !== "WONDERKID" && "fill-current")} />
            {STANDING_LABEL[standing]}
        </span>
    )
}

/** Card frame per standing (spotlight cards, signing reveal). */
export const STANDING_FRAME: Record<MarketStanding, string> = {
    ICON: "border-gold/70 shadow-[0_0_48px_-12px_rgb(242_181_58/0.55)]",
    STAR: "border-ink-2/60 shadow-[0_0_40px_-14px_rgb(242_244_247/0.35)]",
    WONDERKID: "border-side-ct/60 shadow-[0_0_40px_-14px_rgb(90_169_255/0.45)]",
}
