"use client"

import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

interface PlayerStatMeterProps {
    label: string
    value: number
    max?: number
    colorClass?: string
    showValue?: boolean
}

export function PlayerStatMeter({ label, value, max = 100, colorClass, showValue = true }: PlayerStatMeterProps) {
    const percentage = Math.min(100, Math.max(0, (value / max) * 100))

    return (
        <div className="space-y-1">
            <div className="flex justify-between text-xs">
                <span className="font-medium text-muted-foreground">{label}</span>
                {showValue && <span className="font-bold">{value.toFixed(0)}</span>}
            </div>
            <Progress value={percentage} className={cn("h-2", colorClass)} />
        </div>
    )
}
