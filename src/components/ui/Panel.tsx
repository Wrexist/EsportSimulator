import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface PanelProps {
    title?: ReactNode
    /** Small gold overline above the title. */
    eyebrow?: ReactNode
    /** Right side of the header (links, toggles, counts). */
    actions?: ReactNode
    children: ReactNode
    /** Body padding; turn off for edge-to-edge tables. */
    padded?: boolean
    className?: string
    bodyClassName?: string
    as?: "section" | "div" | "aside"
}

/**
 * Panel — the one surface of design system v2: solid graphite, 1px line,
 * 8px corners, optional 44px header. Replaces glass-panel / glass-card /
 * liquid-panel / Card for new screens.
 */
export function Panel({ title, eyebrow, actions, children, padded = true, className, bodyClassName, as: Tag = "section" }: PanelProps) {
    const hasHeader = title != null || actions != null || eyebrow != null
    return (
        <Tag className={cn("min-w-0 rounded-lg border border-line bg-panel", className)}>
            {hasHeader && (
                <header className="flex min-h-11 items-center justify-between gap-3 border-b border-line px-4 py-2">
                    <div className="min-w-0">
                        {eyebrow != null && <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gold">{eyebrow}</p>}
                        {title != null && <h2 className="truncate text-sm font-semibold text-ink-1">{title}</h2>}
                    </div>
                    {actions != null && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
                </header>
            )}
            <div className={cn(padded && "p-4", bodyClassName)}>{children}</div>
        </Tag>
    )
}
