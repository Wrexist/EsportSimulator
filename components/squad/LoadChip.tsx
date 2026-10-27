"use client"
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
    if (player.injury) return <span className={cn("text-xs text-ink-3", className)}>Injured</span>
    const w = workloadOf(player)
    const title = `Load ${w.load} (fatigue). Injury chance this week: ${riskPct(w.risk)}.${player.knock ? ` Playing through a ${player.knock.name.toLowerCase()}: ${Math.round(player.knock.escalateChance * 100)}% chance it worsens at the next check.` : ""}`
    return (
        <span title={title} className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-1.5 py-0.5 text-[11px] font-semibold tabular-nums", TONE[w.tone], className)} data-testid="load-chip">
            {w.label} · {riskPct(w.risk)}{player.knock ? " · knock" : ""}
        </span>
    )
}
