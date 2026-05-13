"use client"

import { useMemo } from 'react'
import {
    LineChart,
    Line,
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    Area,
    AreaChart
} from 'recharts'

/**
 * Data Visualization Components
 * Pre-configured charts for game statistics
 */

interface ChartProps {
    data: any[]
    height?: number
    className?: string
}

interface StatsRadarProps {
    stats: {
        aim: number
        positioning: number
        utility: number
        gamesense: number
        clutch: number
        consistency: number
    }
    height?: number
    className?: string
}

/**
 * Performance Line Chart
 * Shows player/team performance over time
 */
export function PerformanceChart({ data, height = 300, className }: ChartProps) {
    return (
        <ResponsiveContainer width="100%" height={height} className={className}>
            <AreaChart data={data}>
                <defs>
                    <linearGradient id="colorPerformance" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis dataKey="week" stroke="#888" />
                <YAxis stroke="#888" />
                <Tooltip
                    contentStyle={{
                        backgroundColor: '#1a1a1a',
                        border: '1px solid #333',
                        borderRadius: '8px'
                    }}
                />
                <Area
                    type="monotone"
                    dataKey="rating"
                    stroke="#3b82f6"
                    fillOpacity={1}
                    fill="url(#colorPerformance)"
                />
            </AreaChart>
        </ResponsiveContainer>
    )
}

/**
 * Win/Loss Bar Chart
 */
export function WinLossChart({ data, height = 300, className }: ChartProps) {
    return (
        <ResponsiveContainer width="100%" height={height} className={className}>
            <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis dataKey="month" stroke="#888" />
                <YAxis stroke="#888" />
                <Tooltip
                    contentStyle={{
                        backgroundColor: '#1a1a1a',
                        border: '1px solid #333',
                        borderRadius: '8px'
                    }}
                />
                <Legend />
                <Bar dataKey="wins" fill="#10b981" />
                <Bar dataKey="losses" fill="#ef4444" />
            </BarChart>
        </ResponsiveContainer>
    )
}

/**
 * Role Distribution Pie Chart
 */
export function RoleDistributionChart({ data, height = 300, className }: ChartProps) {
    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

    return (
        <ResponsiveContainer width="100%" height={height} className={className}>
            <PieChart>
                <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry) => `${entry.name}: ${entry.value}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                >
                    {data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                </Pie>
                <Tooltip
                    contentStyle={{
                        backgroundColor: '#1a1a1a',
                        border: '1px solid #333',
                        borderRadius: '8px'
                    }}
                />
            </PieChart>
        </ResponsiveContainer>
    )
}

/**
 * Financial Trend Chart
 */
export function FinancialChart({ data, height = 300, className }: ChartProps) {
    return (
        <ResponsiveContainer width="100%" height={height} className={className}>
            <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis dataKey="week" stroke="#888" />
                <YAxis stroke="#888" />
                <Tooltip
                    contentStyle={{
                        backgroundColor: '#1a1a1a',
                        border: '1px solid #333',
                        borderRadius: '8px'
                    }}
                    formatter={(value: any) => `$${value.toLocaleString()}`}
                />
                <Legend />
                <Line
                    type="monotone"
                    dataKey="balance"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ fill: '#10b981' }}
                />
                <Line
                    type="monotone"
                    dataKey="income"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ fill: '#3b82f6' }}
                />
                <Line
                    type="monotone"
                    dataKey="expenses"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={{ fill: '#ef4444' }}
                />
            </LineChart>
        </ResponsiveContainer>
    )
}

/**
 * Player Stats Radar (requires recharts radar)
 */
export function StatsRadar({ stats, height = 300, className }: StatsRadarProps) {
    const data = [
        { stat: 'Aim', value: stats.aim, fullMark: 20 },
        { stat: 'Positioning', value: stats.positioning, fullMark: 20 },
        { stat: 'Utility', value: stats.utility, fullMark: 20 },
        { stat: 'Game Sense', value: stats.gamesense, fullMark: 20 },
        { stat: 'Clutch', value: stats.clutch, fullMark: 20 },
        { stat: 'Consistency', value: stats.consistency, fullMark: 20 },
    ]

    return (
        <div className={className} style={{ height }}>
            {/* Simple bar representation as fallback */}
            <div className="space-y-2">
                {data.map(item => (
                    <div key={item.stat}>
                        <div className="flex justify-between text-xs mb-1">
                            <span>{item.stat}</span>
                            <span>{item.value}/{item.fullMark}</span>
                        </div>
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-primary rounded-full"
                                style={{ width: `${(item.value / item.fullMark) * 100}%` }}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

/**
 * Simple stat card for KPIs
 */
export function StatCard({
    label,
    value,
    trend,
    trendValue,
    icon
}: {
    label: string
    value: string | number
    trend?: 'up' | 'down' | 'neutral'
    trendValue?: string
    icon?: React.ReactNode
}) {
    const trendColors = {
        up: 'text-emerald-500',
        down: 'text-red-500',
        neutral: 'text-gray-500'
    }

    return (
        <div className="glass-panel p-4">
            <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">{label}</span>
                {icon}
            </div>
            <div className="text-2xl font-bold">{value}</div>
            {trend && trendValue && (
                <div className={`text-xs mt-1 ${trendColors[trend]}`}>
                    {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trendValue}
                </div>
            )}
        </div>
    )
}
