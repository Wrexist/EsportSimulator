import React, { memo, useMemo } from "react"
import { PlayerSaveData } from "@/engine/save-types"
import { cn } from "@/lib/utils"
import { motion } from "framer-motion"

interface SynergyChartProps {
    players: PlayerSaveData[]
    className?: string
}

// Hoisted so the labels array reference is stable across renders — the
// useMemo for labelCoords below depends on it.
const SYNERGY_LABELS = ["Firepower", "Teamwork", "Tactics", "Utility", "Mental"] as const

const SynergyChartComponent: React.FC<SynergyChartProps> = ({ players, className }) => {


    // 3. Calculate Radar Stats
    const stats = useMemo(() => {
        if (players.length === 0) return [0, 0, 0, 0, 0]

        const getAvg = (keys: (keyof PlayerSaveData)[]) => {
            const sum = players.reduce((acc, p) => {
                // Guard missing stats — an undefined field would make pSum NaN and
                // poison the SVG polygon coordinates ("NaN,NaN" → blank chart).
                const pSum = keys.reduce((kAcc, k) => kAcc + (Number(p[k]) || 0), 0)
                return acc + (pSum / keys.length)
            }, 0)
            return sum / players.length
        }

        // Data points: [Firepower, Teamwork, Tactics, Utility, Mental]
        return [
            getAvg(["skill", "rifle", "awp"]),
            getAvg(["teamwork"]),
            getAvg(["tactic", "leader"]),
            getAvg(["grenades"]),
            getAvg(["morale", "amicability", "stressResistance"])
        ]
    }, [players])

    // Radar Chart Points
    // 5 points polygon
    const points = useMemo(() => stats.map((val, i) => {
        const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2
        const r = (val / 100) * 80 // 80px radius max
        const x = 100 + r * Math.cos(angle)
        const y = 100 + r * Math.sin(angle)
        return `${x},${y}`
    }).join(" "), [stats])

    const labelCoords = useMemo(() => SYNERGY_LABELS.map((label, i) => {
        const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2
        const r = 105 // Label radius
        const x = 100 + r * Math.cos(angle)
        const y = 100 + r * Math.sin(angle)
        const align: React.SVGProps<SVGTextElement>['textAnchor'] = x < 90 ? 'end' : x > 110 ? 'start' : 'middle'
        return { x, y, label, align }
    }), [])

    const overallScore = useMemo(() => Math.round(stats.reduce((a, b) => a + b, 0) / 5), [stats])

    return (
        <div className={cn("flex flex-col items-center justify-center", className)}>
            {/* Five-axis team profile. Inset so the axis labels stay inside the panel. */}
            <div className="relative flex w-full items-center justify-center px-8 py-2">
                <div className="relative flex aspect-square w-full max-w-[240px] items-center justify-center">
                    <svg viewBox="0 0 200 200" className="w-full h-full overflow-visible">
                        <defs>
                            <linearGradient id="radarGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#F2B53A" stopOpacity="0.35" />
                                <stop offset="100%" stopColor="#F2B53A" stopOpacity="0.08" />
                            </linearGradient>
                        </defs>

                        {/* Outer Ring */}
                        <circle cx="100" cy="100" r="88" fill="none" stroke="rgba(255,255,255,0.07)" />

                        {/* Background Grid - Pentagons */}
                        {[20, 40, 60, 80].map(r => (
                            <polygon
                                key={r}
                                points={Array.from({ length: 5 }).map((_, i) => {
                                    const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2
                                    return `${100 + r * Math.cos(angle)},${100 + r * Math.sin(angle)}`
                                }).join(" ")}
                                fill="none"
                                stroke="rgba(255,255,255,0.07)"
                                strokeWidth="0.6"
                            />
                        ))}

                        {/* Axis Lines */}
                        {Array.from({ length: 5 }).map((_, i) => {
                            const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2
                            return <line key={i} x1="100" y1="100" x2={100 + 88 * Math.cos(angle)} y2={100 + 88 * Math.sin(angle)} stroke="rgba(255,255,255,0.07)" />
                        })}

                        {/* Data Polygon with Animation */}
                        <motion.polygon
                            points={points}
                            fill="url(#radarGradient)"
                            stroke="#F2B53A"
                            strokeWidth="1.5"
                            initial={{ scale: 0, opacity: 0, transformOrigin: "100px 100px" }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ duration: 1, type: "spring" }}
                        />

                        {/* Vertex Dots */}
                        {stats.map((val, i) => {
                            const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2
                            const r = (val / 100) * 80
                            const x = 100 + r * Math.cos(angle)
                            const y = 100 + r * Math.sin(angle)
                            return (
                                <motion.circle
                                    key={i}
                                    cx={x} cy={y} r="2.5"
                                    fill="#F2F4F7"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.5 + i * 0.1 }}
                                />
                            )
                        })}

                        {/* Labels */}
                        {labelCoords.map((l, i) => (
                            <text
                                key={i}
                                x={l.x}
                                y={l.y}
                                textAnchor={l.align}
                                fill="#808A99"
                                fontSize="8"
                                fontWeight="600"
                                className="pointer-events-none select-none uppercase tracking-[0.08em]"
                                dy="0.3em"
                            >
                                {l.label}
                            </text>
                        ))}
                    </svg>
                </div>
            </div>
            {overallScore > 0 && (
                <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Profile rating</span>
                    <span className="font-display text-2xl font-bold tabular-nums text-ink-1">{overallScore}</span>
                </div>
            )}
        </div>
    )
}

export const SynergyChart = memo(SynergyChartComponent)
export default SynergyChart
