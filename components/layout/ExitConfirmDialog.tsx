"use client"

import { motion, AnimatePresence } from "framer-motion"
import { AlertTriangle, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useFocusTrap } from "@/lib/accessibility"

export type ExitDialogVariant = "saving" | "saveFailed" | "simulationRunning"

interface ExitConfirmDialogProps {
    open: boolean
    variant: ExitDialogVariant
    onConfirm: () => void
    onCancel: () => void
}

const VARIANT_CONFIG = {
    saving: {
        icon: Save,
        iconColor: "text-gold",
        iconBg: "bg-gold/10",
        title: "Saving Your Game",
        description: "Please wait while your progress is being saved...",
        showButtons: false,
    },
    saveFailed: {
        icon: AlertTriangle,
        iconColor: "text-caution",
        iconBg: "bg-caution/10",
        title: "Auto-Save Failed",
        description: "Your latest progress could not be saved. Are you sure you want to exit without saving?",
        showButtons: true,
    },
    simulationRunning: {
        icon: AlertTriangle,
        iconColor: "text-negative",
        iconBg: "bg-negative/10",
        title: "Process Still Running",
        description: "A simulation or save operation is still in progress. Exiting now may result in data loss.",
        showButtons: true,
    },
} as const

export function ExitConfirmDialog({ open, variant, onConfirm, onCancel }: ExitConfirmDialogProps) {
    const config = VARIANT_CONFIG[variant]
    const Icon = config.icon

    // Escape cancels — except while a save is in flight ("saving" has no
    // buttons), where the dialog must stay up until the write completes.
    const dialogRef = useFocusTrap(open, config.showButtons ? onCancel : undefined)

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-celebration bg-ink/90 flex items-center justify-center p-4"
                >
                    <motion.div
                        initial={{ scale: 0.9, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.9, y: 20, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                        ref={dialogRef} tabIndex={-1}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="modal-title-exit-confirm"
                        className="bg-panel border border-line-strong rounded-[10px] p-8 max-w-md w-full max-h-[calc(100dvh-2rem)] overflow-y-auto text-center relative"
                    >

                        {/* Icon */}
                        <div className={`w-16 h-16 rounded-lg ${config.iconBg} ${config.iconColor} flex items-center justify-center mx-auto mb-6 relative`}>
                            {variant === "saving" ? (
                                <Spinner className="size-8" />
                            ) : (
                                <Icon size={32} />
                            )}
                        </div>

                        {/* Title */}
                        <h2 id="modal-title-exit-confirm" className="font-display text-2xl font-bold text-ink-1 mb-2 uppercase relative">
                            {config.title}
                        </h2>

                        {/* Description */}
                        <p className="text-ink-2 mb-8 relative">
                            {config.description}
                        </p>

                        {/* Buttons */}
                        {config.showButtons && (
                            <div className="flex gap-4 w-full relative">
                                <Button
                                    onClick={onCancel}
                                    size="lg"
                                    className="flex-1 h-12"
                                >
                                    Stay
                                </Button>
                                <Button
                                    onClick={onConfirm}
                                    variant="outline"
                                    size="lg"
                                    className="flex-1 h-12 border-negative/40 text-negative hover:bg-negative/10"
                                >
                                    Exit
                                </Button>
                            </div>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
