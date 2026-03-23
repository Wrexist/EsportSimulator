"use client"

import { motion, AnimatePresence } from "framer-motion"
import { AlertTriangle, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useEffect } from "react"

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
        iconColor: "text-cyan-400",
        iconBg: "bg-cyan-500/10",
        glowColor: "bg-cyan-500/10",
        title: "Saving Your Game",
        description: "Please wait while your progress is being saved...",
        showButtons: false,
    },
    saveFailed: {
        icon: AlertTriangle,
        iconColor: "text-amber-400",
        iconBg: "bg-amber-500/10",
        glowColor: "bg-amber-500/10",
        title: "Auto-Save Failed",
        description: "Your latest progress could not be saved. Are you sure you want to exit without saving?",
        showButtons: true,
    },
    simulationRunning: {
        icon: AlertTriangle,
        iconColor: "text-red-400",
        iconBg: "bg-red-500/10",
        glowColor: "bg-red-500/10",
        title: "Process Still Running",
        description: "A simulation or save operation is still in progress. Exiting now may result in data loss.",
        showButtons: true,
    },
} as const

export function ExitConfirmDialog({ open, variant, onConfirm, onCancel }: ExitConfirmDialogProps) {
    const config = VARIANT_CONFIG[variant]
    const Icon = config.icon

    useEffect(() => {
        if (!open || !config.showButtons) return
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault()
                onCancel()
            }
        }
        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [open, config.showButtons, onCancel])

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
                >
                    <motion.div
                        initial={{ scale: 0.9, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.9, y: 20, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                        className="bg-[#0e1217] border border-white/10 rounded-3xl p-8 max-w-md w-full text-center shadow-2xl relative overflow-hidden"
                    >
                        {/* Ambient glow */}
                        <div className={`absolute top-0 inset-x-0 h-32 ${config.glowColor} blur-3xl pointer-events-none`} />

                        {/* Icon */}
                        <div className={`w-16 h-16 rounded-2xl ${config.iconBg} ${config.iconColor} flex items-center justify-center mx-auto mb-6 relative`}>
                            {variant === "saving" ? (
                                <Spinner className="size-8" />
                            ) : (
                                <Icon size={32} />
                            )}
                        </div>

                        {/* Title */}
                        <h2 className="text-2xl font-normal text-white mb-2 uppercase tracking-tight relative">
                            {config.title}
                        </h2>

                        {/* Description */}
                        <p className="text-muted-foreground mb-8 relative">
                            {config.description}
                        </p>

                        {/* Buttons */}
                        {config.showButtons && (
                            <div className="flex gap-4 w-full relative">
                                <Button
                                    onClick={onCancel}
                                    size="lg"
                                    className="flex-1 h-14 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white font-normal uppercase tracking-widest rounded-xl shadow-lg shadow-cyan-500/20"
                                >
                                    Stay
                                </Button>
                                <Button
                                    onClick={onConfirm}
                                    variant="outline"
                                    size="lg"
                                    className="flex-1 h-14 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50 font-normal uppercase tracking-widest rounded-xl"
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
