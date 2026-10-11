import { cn } from "@/lib/utils"

export interface SparklineProps {
    /** Oldest → newest. */
    values: number[]
    /** Optional reference line (e.g. a 1.00 match rating). */
    baseline?: number
    /** Fixed y-range; defaults to the data range padded around the baseline. */
    min?: number
    max?: number
    width?: number
    height?: number
    /** Accessible summary, e.g. "Last 8 match ratings". */
    label: string
    className?: string
}

/**
 * Sparkline — a quiet trend line for dense screens (form, ratings).
 * Neutral stroke; the newest point is the only emphasised mark.
 */
export function Sparkline({ values, baseline, min, max, width = 160, height = 36, label, className }: SparklineProps) {
    if (values.length === 0) return null
    const pad = 3
    const lo = min ?? Math.min(...values, baseline ?? Infinity)
    const hi = max ?? Math.max(...values, baseline ?? -Infinity)
    const span = hi - lo || 1
    const x = (i: number) => values.length === 1 ? width / 2 : pad + (i * (width - pad * 2)) / (values.length - 1)
    const y = (v: number) => pad + (1 - (v - lo) / span) * (height - pad * 2)
    const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")
    const last = values[values.length - 1]

    return (
        <svg
            role="img"
            aria-label={label}
            viewBox={`0 0 ${width} ${height}`}
            width={width}
            height={height}
            className={cn("overflow-visible", className)}
        >
            {baseline != null && baseline >= lo && baseline <= hi && (
                <line x1={0} x2={width} y1={y(baseline)} y2={y(baseline)} className="stroke-line-strong" strokeDasharray="2 3" strokeWidth={1} />
            )}
            <polyline points={points} fill="none" className="stroke-ink-2" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={x(values.length - 1)} cy={y(last)} r={2.5} className="fill-ink-1" />
        </svg>
    )
}
