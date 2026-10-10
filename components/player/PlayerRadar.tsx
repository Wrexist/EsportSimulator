"use client"

import { memo, useMemo } from "react"
import type { PlayerSaveData } from "@/engine/save-types"
import { cn } from "@/lib/utils"

/**
 * Player DNA — a small, neutral radar of derived play-style axes. The axes are
 * averages of stored attributes (a summary, not extra numbers the engine reads).
 */
export function playerDnaAxes(p: PlayerSaveData) {
    return [
        { label: "Firepower", value: (p.skill + p.rifle) / 2 },
        { label: "Entry", value: (p.skill + p.reaction) / 2 },
        { label: "Trading", value: (p.teamwork + p.tactic) / 2 },
        { label: "Utility", value: p.grenades ?? 0 },
        { label: "Clutch", value: p.clutch ?? 0 },
        { label: "Sniping", value: p.awp ?? 0 },
    ].map(a => ({ ...a, value: Math.round(Number.isFinite(a.value) ? a.value : 0) }))
}

const SIZE = 220
const C = SIZE / 2
const R = 72

export const PlayerRadar = memo(function PlayerRadar({ player, className }: { player: PlayerSaveData; className?: string }) {
    const axes = useMemo(() => playerDnaAxes(player), [player])
    const n = axes.length
    const at = (i: number, r: number) => {
        const a = (Math.PI * 2 * i) / n - Math.PI / 2
        return [C + r * Math.cos(a), C + r * Math.sin(a)] as const
    }
    const ring = (r: number) => axes.map((_, i) => at(i, r).join(",")).join(" ")
    const shape = axes.map((ax, i) => at(i, (Math.max(0, Math.min(100, ax.value)) / 100) * R).join(",")).join(" ")

    return (
        <svg viewBox={`-50 0 ${SIZE + 100} ${SIZE}`} role="img" aria-label={`Player DNA: ${axes.map(a => `${a.label} ${a.value}`).join(", ")}`} className={cn("h-auto w-full max-w-[380px]", className)}>
            {[0.25, 0.5, 0.75, 1].map(f => (
                <polygon key={f} points={ring(R * f)} fill="none" className="stroke-line-strong" strokeWidth={f === 1 ? 1 : 0.6} />
            ))}
            {axes.map((_, i) => {
                const [x, y] = at(i, R)
                return <line key={i} x1={C} y1={C} x2={x} y2={y} className="stroke-line" strokeWidth={0.8} />
            })}
            <polygon points={shape} className="fill-ink-1/10 stroke-ink-1" strokeWidth={1.25} strokeLinejoin="round" />
            {axes.map((ax, i) => {
                const [x, y] = at(i, R + 20)
                const anchor = Math.abs(x - C) < 4 ? "middle" : x < C ? "end" : "start"
                return (
                    <text key={ax.label} x={x} y={y} textAnchor={anchor} dominantBaseline="middle" className="fill-ink-3 text-[11px]">
                        {ax.label} <tspan className="fill-ink-1 font-semibold">{ax.value}</tspan>
                    </text>
                )
            })}
        </svg>
    )
})
