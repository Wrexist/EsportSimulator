"use client"
import { t } from "@/lib/i18n"

import { getRivalryBetween, isDerby } from "@/engine/history-tracker"
import type { TeamSaveData } from "@/engine/save-types"
import { Flame } from "lucide-react"
import { motion } from "framer-motion"

/**
 * Pre-match derby framing — shown when the two teams carry an established
 * (HEATED/FIERCE) rivalry. A pure read of the tracked rivalry data; renders
 * nothing for ordinary matchups, so it's safe to mount unconditionally.
 */
export function DerbyBanner({ homeTeam, awayTeam }: { homeTeam?: TeamSaveData; awayTeam?: TeamSaveData }) {
    if (!homeTeam || !awayTeam) return null
    const rivalry = getRivalryBetween(homeTeam, awayTeam.id)
    if (!rivalry || !isDerby(rivalry.intensity)) return null

    const fierce = rivalry.intensity === "FIERCE"
    const label = fierce ? t("live.fierceRivalry") : t("live.heatedRivalry")

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="mx-auto mb-2 flex w-fit items-center gap-2 rounded-sm border border-line-strong bg-panel px-3 py-1"
        >
            <Flame className={fierce ? "h-3.5 w-3.5 text-negative" : "h-3.5 w-3.5 text-caution"} aria-hidden="true" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-1">{label}</span>
            <span className="text-xs tabular-nums text-ink-3">
                {t("live.headToHead", { wins: rivalry.wins, losses: rivalry.losses })}
            </span>
        </motion.div>
    )
}
