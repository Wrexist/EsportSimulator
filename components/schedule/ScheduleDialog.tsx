"use client"

import type { ReactNode } from "react"
import { motion } from "framer-motion"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useFocusTrap } from "@/lib/accessibility"

interface ScheduleDialogProps {
    isOpen: boolean
    onClose: () => void
    /** id for aria-labelledby; must be unique on the page. */
    titleId: string
    title: ReactNode
    subtitle?: ReactNode
    children: ReactNode
    /** Right-aligned actions row. */
    footer?: ReactNode
    className?: string
    bodyClassName?: string
    closeLabel?: string
}

/**
 * The schedule's modal frame (design system v2): solid panel, 10px corners,
 * display-face title, footer actions on the right. Escape closes and focus
 * stays inside (shared useFocusTrap contract).
 */
export function ScheduleDialog({ isOpen, onClose, titleId, title, subtitle, children, footer, className, bodyClassName, closeLabel = "Close dialog" }: ScheduleDialogProps) {
    const dialogRef = useFocusTrap(isOpen, onClose)

    if (!isOpen) return null

    return (
        <div
            className="fixed inset-0 z-modal flex items-center justify-center bg-ink/80 p-4"
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
        >
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                ref={dialogRef} tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className={cn("flex max-h-[calc(100dvh-4rem)] w-full max-w-lg flex-col overflow-hidden rounded-[10px] border border-line-strong bg-panel outline-none", className)}
            >
                <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-6 py-4">
                    <div className="min-w-0">
                        <h2 id={titleId} className="font-display text-2xl font-bold uppercase leading-none tracking-[0.01em] text-ink-1">{title}</h2>
                        {subtitle != null && <p className="mt-1.5 text-sm text-ink-3">{subtitle}</p>}
                    </div>
                    <button type="button" onClick={onClose} aria-label={closeLabel} className="-mr-1.5 rounded-md p-1.5 text-ink-3 transition-colors hover:bg-raised hover:text-ink-1">
                        <X size={18} />
                    </button>
                </header>
                <div className={cn("min-h-0 flex-1 overflow-y-auto", bodyClassName)}>{children}</div>
                {footer != null && <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-6 py-4">{footer}</footer>}
            </motion.div>
        </div>
    )
}
