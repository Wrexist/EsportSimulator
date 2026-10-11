import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface ScreenHeaderProps {
    title: ReactNode
    eyebrow?: ReactNode
    subtitle?: ReactNode
    /** Left of the title (crest, portrait). */
    leading?: ReactNode
    /** Right side (KPIs, actions). */
    aside?: ReactNode
    className?: string
}

/** ScreenHeader — the one page heading: gold overline, display title, quiet subtitle. */
export function ScreenHeader({ title, eyebrow, subtitle, leading, aside, className }: ScreenHeaderProps) {
    return (
        <header className={cn("flex flex-wrap items-end justify-between gap-x-8 gap-y-4", className)}>
            <div className="flex min-w-0 items-center gap-4">
                {leading}
                <div className="min-w-0">
                    {eyebrow != null && <p className="premium-eyebrow">{eyebrow}</p>}
                    <h1 className="page-title">{title}</h1>
                    {subtitle != null && <p className="mt-1.5 text-sm text-ink-3">{subtitle}</p>}
                </div>
            </div>
            {aside != null && <div className="flex shrink-0 items-center gap-3">{aside}</div>}
        </header>
    )
}
