"use client"

import { motion, AnimatePresence } from "framer-motion"
import { useGameStore } from "@/store/game-store"
import { X, TrendingUp, Star, Award, Zap, AlertTriangle } from "lucide-react"
import { useEffect, useCallback } from "react"
import { liquidSpring, quickEase } from "@/lib/motion"

export interface ToastData {
    id: string
    message: string
    type: "level_up" | "xp_gain" | "achievement" | "info" | "warning" | "error"
    icon?: React.ReactNode
    duration?: number
}

function getToastIcon(toast: ToastData) {
    if (toast.icon) return toast.icon
    switch (toast.type) {
        case "level_up": return <TrendingUp size={18} className="text-emerald-400" />
        case "xp_gain": return <Star size={18} className="text-amber-400" />
        case "achievement": return <Award size={18} className="text-purple-400" />
        case "warning": return <AlertTriangle size={18} className="text-red-400" />
        default: return <Zap size={18} className="text-cyan-400" />
    }
}

function getToastStyle(toast: ToastData) {
    switch (toast.type) {
        case "level_up": return "border-emerald-300/25"
        case "xp_gain": return "border-amber-300/25"
        case "achievement": return "border-violet-300/25"
        case "warning": return "border-red-300/25"
        default: return "border-cyan-200/25"
    }
}

export function ToastNotifications() {
    const toasts = useGameStore(state => state.toasts) || []
    const removeToast = useGameStore(state => state.removeToast)

    return (
        <div aria-live="polite" role="status" className="fixed top-16 right-6 z-toast flex flex-col gap-2 pointer-events-none">
            <AnimatePresence>
                {toasts.map(toast => (
                    <ToastItem
                        key={toast.id}
                        toast={toast}
                        removeToast={removeToast}
                    />
                ))}
            </AnimatePresence>
        </div>
    )
}

function ToastItem({
    toast,
    removeToast,
}: {
    toast: ToastData,
    removeToast: (id: string) => void,
}) {
    const onRemove = useCallback(() => removeToast(toast.id), [removeToast, toast.id])

    // Use toast.id (not the toast object reference) so the auto-dismiss timer
    // does NOT reset every time the parent re-renders. Previously the inline
    // `() => removeToast(toast.id)` prop changed identity on each render,
    // re-triggering this effect and pushing the dismissal further out.
    useEffect(() => {
        const timer = setTimeout(() => removeToast(toast.id), toast.duration || 4000)
        return () => clearTimeout(timer)
    }, [toast.id, toast.duration, removeToast])

    return (
        <motion.div
            initial={{ opacity: 0, x: 28, scale: 0.98, filter: "blur(6px)" }}
            animate={{ opacity: 1, x: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, x: 18, scale: 0.98, filter: "blur(6px)" }}
            transition={toast.duration ? quickEase : liquidSpring}
            className={`pointer-events-auto liquid-panel flex items-center gap-3 px-4 py-3 rounded-lg border ${getToastStyle(toast)}`}
        >
            <div className="w-8 h-8 rounded-lg bg-white/[0.08] flex items-center justify-center shrink-0">
                {getToastIcon(toast)}
            </div>
            <p className="text-sm font-semibold text-white/90">{toast.message}</p>
            <button
                onClick={onRemove}
                className="p-1 rounded-lg hover:bg-white/10 transition-colors text-white/50 hover:text-white"
            >
                <X size={14} />
            </button>
        </motion.div>
    )
}
