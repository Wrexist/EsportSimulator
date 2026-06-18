"use client"

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
    const accent = fierce ? "#ef4444" : "#f59e0b"
    const label = fierce ? "FIERCE RIVALRY" : "HEATED RIVALRY"
    const flameStyle = { animation: fierce ? "pulse 1.5s ease-in-out infinite" : undefined } as const

    return (
        <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mx-auto mb-3 flex w-fit items-center gap-2.5 rounded-full border px-4 py-1.5 backdrop-blur-sm"
            style={{
                color: accent,
                borderColor: `${accent}55`,
                background: `${accent}14`,
                boxShadow: fierce ? `0 0 16px ${accent}33` : undefined,
            }}
        >
            <Flame className="w-3.5 h-3.5" style={flameStyle} />
            <span className="text-[11px] font-extrabold tracking-[0.15em]">{label}</span>
            <span className="text-[10px] font-semibold tracking-wider opacity-70">
                H2H {rivalry.wins}–{rivalry.losses}
            </span>
            <Flame className="w-3.5 h-3.5" style={flameStyle} />
        </motion.div>
    )
}
