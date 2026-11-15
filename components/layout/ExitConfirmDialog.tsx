"use client"

import { motion, AnimatePresence } from "framer-motion"
import { AlertTriangle, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useFocusTrap } from "@/lib/accessibility"
import { t } from "@/lib/i18n"

export type ExitDialogVariant = "saving" | "saveFailed" | "simulationRunning" | "unsaved"

interface ExitConfirmDialogProps {
    open: boolean
    variant: ExitDialogVariant
    onConfirm: () => void
    onCancel: () => void
    /** "unsaved" only: save, then exit. */
    onSaveAndExit?: () => void
}

/** Title and description are translation keys, read when the dialog renders. */
const VARIANT_CONFIG = {
    saving: {
        icon: Save,
        iconColor: "text-gold",
        iconBg: "bg-gold/10",
        title: "exit.saving.t",
        description: "exit.saving.m",
        showButtons: false,
    },
    saveFailed: {
        icon: AlertTriangle,
        iconColor: "text-caution",
        iconBg: "bg-caution/10",
        title: "exit.saveFailed.t",
        description: "exit.saveFailed.m",
        showButtons: true,
    },
    unsaved: {
        icon: Save,
        iconColor: "text-gold",
        iconBg: "bg-gold/10",
        title: "exit.unsaved.t",
        description: "exit.unsaved.m",
        showButtons: true,
    },
    simulationRunning: {
        icon: AlertTriangle,
        iconColor: "text-negative",
        iconBg: "bg-negative/10",
        title: "exit.running.t",
        description: "exit.running.m",
        showButtons: true,
    },
} as const

export function ExitConfirmDialog({ open, variant, onConfirm, onCancel, onSaveAndExit }: ExitConfirmDialogProps) {
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
                            {t(config.title)}
                        </h2>

                        {/* Description */}
                        <p className="text-ink-2 mb-8 relative">
                            {t(config.description)}
                        </p>

                        {/* Buttons */}
                        {variant === "unsaved" && onSaveAndExit && (
                            <Button onClick={onSaveAndExit} size="lg" className="w-full h-12 mb-3 relative">
                                {t("exit.saveAndExit")}
                            </Button>
                        )}
                        {config.showButtons && (
                            <div className="flex gap-4 w-full relative">
                                <Button
                                    onClick={onCancel}
                                    size="lg"
                                    className="flex-1 h-12"
                                >
                                    {t("exit.stay")}
                                </Button>
                                <Button
                                    onClick={onConfirm}
                                    variant="outline"
                                    size="lg"
                                    className="flex-1 h-12 border-negative/40 text-negative hover:bg-negative/10"
                                >
                                    {variant === "unsaved" ? t("exit.withoutSaving") : t("exit.exit")}
                                </Button>
                            </div>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
