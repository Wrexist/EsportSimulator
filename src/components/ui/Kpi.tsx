import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface KpiProps {
    label: string
    value: ReactNode
    /** Small line under the value (delta, context). */
    hint?: ReactNode
    className?: string
    valueClassName?: string
}

/** Kpi — an overline label with a display-face number. Group several in a KpiStrip. */
export function Kpi({ label, value, hint, className, valueClassName }: KpiProps) {
    return (
        <div className={cn("min-w-0", className)}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{label}</p>
            <p className={cn("mt-1 font-display text-[28px] font-bold leading-none tabular-nums text-ink-1", valueClassName)}>{value}</p>
            {hint != null && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
        </div>
    )
}

/** KpiStrip — KPIs separated by hairlines. */
export function KpiStrip({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div className={cn("flex items-stretch divide-x divide-line rounded-lg border border-line bg-panel", className)}>
            {Array.isArray(children)
                ? children.map((child, i) => <div key={i} className="px-5 py-3">{child}</div>)
                : <div className="px-5 py-3">{children}</div>}
        </div>
    )
}
