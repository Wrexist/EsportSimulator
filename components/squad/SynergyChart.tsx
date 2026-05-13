import React, { memo, useMemo } from "react"
import { PlayerSaveData } from "@/engine/save-types"
import { cn } from "@/lib/utils"
import { Users } from "lucide-react"
import { motion } from "framer-motion"

interface SynergyChartProps {
    players: PlayerSaveData[]
    className?: string
}

const SynergyChartComponent: React.FC<SynergyChartProps> = ({ players, className }) => {


    // 3. Calculate Radar Stats
    const stats = useMemo(() => {
        if (players.length === 0) return [0, 0, 0, 0, 0]

        const getAvg = (keys: (keyof PlayerSaveData)[]) => {
            const sum = players.reduce((acc, p) => {
                const pSum = keys.reduce((kAcc, k) => kAcc + (p[k] as number), 0)
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

    const labels = ["Firepower", "Teamwork", "Tactics", "Utility", "Mental"]
    const labelCoords = useMemo(() => labels.map((label, i) => {
        const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2
        const r = 105 // Label radius
        const x = 100 + r * Math.cos(angle)
        const y = 100 + r * Math.sin(angle)
        return { x, y, label, align: x < 90 ? 'end' : x > 110 ? 'start' : 'middle' }
    }), [])

    const overallScore = useMemo(() => Math.round(stats.reduce((a, b) => a + b, 0) / 5), [stats])

    return (
        <div className={cn("flex flex-col items-center justify-center", className)}>
            {/* Visual Chart - High Tech HUD Style */}
            <div className="flex items-center justify-center relative py-2 w-full">
                {/* Decorative HUD Elements */}
                <div className="absolute inset-0 bg-blue-500/5 blur-3xl rounded-full pointer-events-none" />
                <div className="relative w-full aspect-square max-w-[300px] flex items-center justify-center">
                    <svg viewBox="0 0 200 200" className="w-full h-full overflow-visible">
                        <defs>
                            <linearGradient id="radarGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.6" />
                                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.1" />
                            </linearGradient>
                            <filter id="glow">
                                <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                                <feMerge>
                                    <feMergeNode in="coloredBlur" />
                                    <feMergeNode in="SourceGraphic" />
                                </feMerge>
                            </filter>
                        </defs>

                        {/* Outer Ring */}
                        <circle cx="100" cy="100" r="90" fill="none" stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
                        <circle cx="100" cy="100" r="94" fill="none" stroke="rgba(255,255,255,0.03)" />

                        {/* Background Grid - Pentagons */}
                        {[20, 40, 60, 80].map(r => (
                            <polygon
                                key={r}
                                points={Array.from({ length: 5 }).map((_, i) => {
                                    const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2
                                    return `${100 + r * Math.cos(angle)},${100 + r * Math.sin(angle)}`
                                }).join(" ")}
                                fill="none"
                                stroke="rgba(255,255,255,0.05)"
                                strokeWidth="0.5"
                            />
                        ))}

                        {/* Axis Lines */}
                        {Array.from({ length: 5 }).map((_, i) => {
                            const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2
                            return <line key={i} x1="100" y1="100" x2={100 + 88 * Math.cos(angle)} y2={100 + 88 * Math.sin(angle)} stroke="rgba(255,255,255,0.05)" />
                        })}

                        {/* Data Polygon with Animation */}
                        <motion.polygon
                            points={points}
                            fill="url(#radarGradient)"
                            stroke="#60a5fa"
                            strokeWidth="2"
                            filter="url(#glow)"
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
                                    fill="#fff"
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
                                fill="rgba(255,255,255,0.7)"
                                fontSize="7"
                                fontWeight="800"
                                className="uppercase font-mono tracking-widest pointer-events-none select-none"
                                dy="0.3em"
                            >
                                {l.label}
                            </text>
                        ))}
                    </svg>
                </div>
            </div>
            {overallScore > 0 && (
                <div className="text-xs font-bold text-blue-400 mt-2">
                    SYNERGY RATING: <span className="text-white text-lg ml-1">{overallScore}</span>
                </div>
            )}
        </div>
    )
}

export const SynergyChart = memo(SynergyChartComponent)
export default SynergyChart
