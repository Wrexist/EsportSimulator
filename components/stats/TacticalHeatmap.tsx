"use client"

import React, { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

interface HeatPoint {
    x: number // 0-100
    y: number // 0-100
    value: number // 0-1
}

interface TacticalHeatmapProps {
    mapName: string
    points: HeatPoint[]
    className?: string
}

export function TacticalHeatmap({ mapName, points, className }: TacticalHeatmapProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)

    useEffect(() => {
        const canvas = canvasRef.current as any
        if (!canvas) return
        const ctx = canvas.getContext("2d") as any
        if (!ctx) return

        // Clear and draw
        const drawHeatmap = () => {
            const { width, height } = canvas
            ctx.clearRect(0, 0, width, height)

            // Draw blur circles for points
            points.forEach(point => {
                const x = (point.x / 100) * width
                const y = (point.y / 100) * height
                const radius = 30 * point.value

                const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
                gradient.addColorStop(0, `rgba(59, 130, 246, ${0.4 * point.value})`)
                gradient.addColorStop(1, "rgba(59, 130, 246, 0)")

                ctx.fillStyle = gradient
                ctx.beginPath()
                ctx.arc(x, y, radius, 0, Math.PI * 2)
                ctx.fill()
            })
        }

        drawHeatmap()
    }, [points])

    return (
        <div className={cn("relative rounded-3xl overflow-hidden border border-white/5 bg-black/60 aspect-video", className)}>
            {/* Map Background (Mocked with an illustration or name) */}
            <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none select-none">
                <span className="text-8xl font-normal uppercase tracking-[0.5em]">{mapName}</span>
            </div>

            <canvas
                ref={canvasRef}
                width={800}
                height={450}
                className="absolute inset-0 w-full h-full mix-blend-screen"
            />

            {/* Map Legend */}
            <div className="absolute bottom-4 left-4 flex items-center gap-4 bg-black/40 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10">
                <div className="flex flex-col gap-1">
                    <span className="text-[8px] font-normal uppercase tracking-widest text-muted-foreground">Tactical Density</span>
                    <div className="h-1.5 w-32 rounded-full bg-gradient-to-r from-blue-500/10 via-blue-500/50 to-primary" />
                </div>
                <div className="text-[10px] font-bold text-white uppercase italic">
                    {mapName} Radar Active
                </div>
            </div>
        </div>
    )
}
