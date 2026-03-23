"use client"

import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip } from "recharts"
import { useMemo } from "react"

interface StatPoint {
    subject: string
    value: number
    fullMark: number
}

interface PlayerSpiderChartProps {
    stats: {
        firepower?: number
        entrying?: number
        trading?: number
        opening?: number
        clutching?: number
        sniping?: number
        utility?: number
    }
    playerName?: string
    size?: "sm" | "md" | "lg"
    showLabels?: boolean
    animated?: boolean
    glowColor?: string
}

// Beautiful gradient colors for the chart - BLUE THEME
const CHART_COLORS = {
    primary: "#3b82f6", // Blue
    secondary: "#60a5fa", // Light Blue
    accent: "#2563eb", // Darker Blue
    glow: "rgba(59, 130, 246, 0.5)",
}

// Custom tooltip component
const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload
        return (
            <div className="bg-background/95 backdrop-blur-sm border border-border/50 rounded-lg px-3 py-2 shadow-xl">
                <p className="text-sm font-medium text-foreground">{data.subject}</p>
                <p className="text-lg font-bold" style={{ color: getStatColor(data.value) }}>
                    {data.value}
                    <span className="text-xs text-muted-foreground ml-1">/100</span>
                </p>
            </div>
        )
    }
    return null
}

// Get color based on stat value
function getStatColor(value: number): string {
    if (value >= 80) return "#22c55e" // Green - Excellent
    if (value >= 60) return "#eab308" // Yellow - Good
    if (value >= 40) return "#f97316" // Orange - Average
    return "#ef4444" // Red - Below Average
}

// Get average stat color for the main fill - BLUE THEME
function getAverageColor(stats: number[]): string {
    const avg = stats.reduce((a, b) => a + b, 0) / stats.length
    if (avg >= 70) return "#3b82f6" // Blue for elite
    if (avg >= 50) return "#60a5fa" // Light blue for good
    return "#93c5fd" // Lighter blue for developing
}

export function PlayerSpiderChart({
    stats,
    playerName,
    size = "md",
    showLabels = true,
    animated = true,
    glowColor,
}: PlayerSpiderChartProps) {
    const data: StatPoint[] = useMemo(() => [
        { subject: "Firepower", value: stats.firepower ?? 0, fullMark: 100 },
        { subject: "Entry", value: stats.entrying ?? 0, fullMark: 100 },
        { subject: "Trading", value: stats.trading ?? 0, fullMark: 100 },
        { subject: "Opening", value: stats.opening ?? 0, fullMark: 100 },
        { subject: "Clutch", value: stats.clutching ?? 0, fullMark: 100 },
        { subject: "Sniping", value: stats.sniping ?? 0, fullMark: 100 },
        { subject: "Utility", value: stats.utility ?? 0, fullMark: 100 },
    ], [stats])

    const statValues = data.map(d => d.value)
    const avgStat = Math.round(statValues.reduce((a, b) => a + b, 0) / statValues.length)
    const chartColor = glowColor || getAverageColor(statValues)

    const sizeConfig = {
        sm: { height: 200, fontSize: 10, outerRadius: "70%" },
        md: { height: 300, fontSize: 12, outerRadius: "75%" },
        lg: { height: 400, fontSize: 14, outerRadius: "80%" },
    }

    const config = sizeConfig[size]

    return (
        <div className="relative group">
            {/* Glow effect behind the chart */}
            <div
                className="absolute inset-0 blur-3xl opacity-20 group-hover:opacity-30 transition-opacity duration-500 rounded-full"
                style={{ background: `radial-gradient(circle, ${chartColor} 0%, transparent 70%)` }}
            />

            {/* Player name header */}
            {playerName && (
                <div className="text-center mb-2">
                    <h3 className="text-lg font-semibold text-foreground">{playerName}</h3>
                    <p className="text-sm text-muted-foreground">
                        Overall: <span className="font-bold" style={{ color: getStatColor(avgStat) }}>{avgStat}</span>
                    </p>
                </div>
            )}

            {/* Main chart */}
            <div style={{ height: config.height }} className="w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius={config.outerRadius} data={data}>
                        {/* Gradient definition */}
                        <defs>
                            <linearGradient id="statGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={chartColor} stopOpacity={0.8} />
                                <stop offset="100%" stopColor={chartColor} stopOpacity={0.3} />
                            </linearGradient>
                            <filter id="glow">
                                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                                <feMerge>
                                    <feMergeNode in="coloredBlur" />
                                    <feMergeNode in="SourceGraphic" />
                                </feMerge>
                            </filter>
                        </defs>

                        {/* Grid with custom styling */}
                        <PolarGrid
                            stroke="currentColor"
                            strokeOpacity={0.15}
                            gridType="polygon"
                        />

                        {/* Axis labels */}
                        {showLabels && (
                            <PolarAngleAxis
                                dataKey="subject"
                                tick={({ x, y, payload }) => {
                                    const statData = data.find(d => d.subject === payload.value)
                                    const value = statData?.value ?? 0
                                    return (
                                        <g transform={`translate(${x},${y})`}>
                                            <text
                                                x={0}
                                                y={0}
                                                dy={4}
                                                textAnchor="middle"
                                                fill="currentColor"
                                                fontSize={config.fontSize}
                                                className="font-medium"
                                            >
                                                {payload.value}
                                            </text>
                                            <text
                                                x={0}
                                                y={14}
                                                textAnchor="middle"
                                                fill={getStatColor(value)}
                                                fontSize={config.fontSize - 2}
                                                className="font-bold"
                                            >
                                                {value}
                                            </text>
                                        </g>
                                    )
                                }}
                            />
                        )}

                        {/* Hidden radius axis */}
                        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />

                        {/* Main radar area with gradient fill */}
                        <Radar
                            name="Stats"
                            dataKey="value"
                            stroke={chartColor}
                            strokeWidth={2}
                            fill="url(#statGradient)"
                            fillOpacity={0.6}
                            filter="url(#glow)"
                            animationDuration={animated ? 1500 : 0}
                            animationEasing="ease-out"
                        />

                        {/* Interactive tooltip */}
                        <Tooltip content={<CustomTooltip />} />
                    </RadarChart>
                </ResponsiveContainer>
            </div>

            {/* Stat legend */}
            <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs">
                {data.map((stat) => (
                    <div
                        key={stat.subject}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted/50 hover:bg-muted transition-colors"
                    >
                        <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: getStatColor(stat.value) }}
                        />
                        <span className="text-muted-foreground">{stat.subject}</span>
                        <span className="font-semibold" style={{ color: getStatColor(stat.value) }}>
                            {stat.value}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    )
}

// Re-export original for backwards compatibility
export { PlayerRadarChart } from "./player-radar-chart"
