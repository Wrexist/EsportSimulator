"use client"
import { t } from "@/lib/i18n"
/**
 * C5: a player's workload (carried fatigue) and this week's injury chance,
 * from the same formula the week rolls (engine/workload.ts).
 */
import { cn } from "@/lib/utils"
import { riskPct, workloadOf } from "@/engine/workload"
import type { PlayerSaveData } from "@/engine/save-types"

const TONE = {
    good: "bg-positive/15 text-positive",
    neutral: "bg-raised text-ink-2",
    warn: "bg-caution/15 text-caution",
    bad: "bg-negative/15 text-negative",
} as const

export function LoadChip({ player, className }: { player: Pick<PlayerSaveData, "fatigue" | "health" | "age"> & Partial<Pick<PlayerSaveData, "injury" | "knock">>; className?: string }) {
    if (player.injury) return <span className={cn("text-xs text-ink-3", className)}>{t("load.injured")}</span>
    const w = workloadOf(player)
    const title = t("load.title", { load: w.load, risk: riskPct(w.risk) }) + (player.knock ? " " + t("load.knockTitle", { knock: player.knock.name, pct: Math.round(player.knock.escalateChance * 100) }) : "")
    return (
        <span title={title} className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-1.5 py-0.5 text-[11px] font-semibold tabular-nums", TONE[w.tone], className)} data-testid="load-chip">
            {t(`load.band.${w.band}`)} · {riskPct(w.risk)}{player.knock ? ` · ${t("load.knock")}` : ""}
        </span>
    )
}
