import { cn } from "@/lib/utils"

/** "S_TIER" / "S" / "s-tier" → "S"; "QUALIFIER" → "Q"; unknown → null. */
export function normalizeTier(tier: string | null | undefined): "S" | "A" | "B" | "C" | "Q" | null {
    if (!tier) return null
    const t = tier.toUpperCase().replace(/[-\s]/g, "_")
    if (t.startsWith("QUAL")) return "Q"
    const letter = t.replace(/_?TIER$/, "")
    return letter === "S" || letter === "A" || letter === "B" || letter === "C" ? letter : null
}

/**
 * TierTag — a tournament tier as a neutral tag. Tier is prestige, not
 * status: only S-tier (majors) earns the gold outline.
 */
export function TierTag({ tier, className }: { tier: string | null | undefined; className?: string }) {
    const t = normalizeTier(tier)
    if (!t) return null
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold uppercase leading-none tracking-[0.06em]",
                t === "S" ? "border-gold/60 text-gold" : "border-line-strong text-ink-2",
                className,
            )}
        >
            {t === "Q" ? "Qualifier" : `${t}-tier`}
        </span>
    )
}
