"use client"

import { motion, AnimatePresence } from "framer-motion"
import { useGameStore } from "@/store/game-store"
import { X, TrendingUp, Star, Award, Zap, AlertTriangle } from "lucide-react"
import { useEffect } from "react"

export interface ToastData {
    id: string
    message: string
    type: "level_up" | "xp_gain" | "achievement" | "info" | "warning" | "error"
    icon?: React.ReactNode
    duration?: number
}

export function ToastNotifications() {
    const toasts = useGameStore(state => state.toasts) || []
    const removeToast = useGameStore(state => state.removeToast)

    const getToastIcon = (toast: ToastData) => {
        if (toast.icon) return toast.icon
        switch (toast.type) {
            case "level_up": return <TrendingUp size={18} className="text-emerald-400" />
            case "xp_gain": return <Star size={18} className="text-amber-400" />
            case "achievement": return <Award size={18} className="text-purple-400" />
            case "warning": return <AlertTriangle size={18} className="text-red-400" />
            default: return <Zap size={18} className="text-cyan-400" />
        }
    }

    const getToastStyle = (toast: ToastData) => {
        switch (toast.type) {
            case "level_up": return "border-emerald-500/30 bg-emerald-500/10"
            case "xp_gain": return "border-amber-500/30 bg-amber-500/10"
            case "achievement": return "border-purple-500/30 bg-purple-500/10"
            case "warning": return "border-red-500/30 bg-red-500/10"
            default: return "border-cyan-500/30 bg-cyan-500/10"
        }
    }

    return (
        <div aria-live="polite" role="status" className="fixed top-16 right-6 z-toast flex flex-col gap-2 pointer-events-none">
            <AnimatePresence>
                {toasts.map(toast => (
                    <ToastItem
                        key={toast.id}
                        toast={toast}
                        onRemove={() => removeToast(toast.id)}
                        getIcon={getToastIcon}
                        getStyle={getToastStyle}
                    />
                ))}
            </AnimatePresence>
        </div>
    )
}

function ToastItem({
    toast,
    onRemove,
    getIcon,
    getStyle
}: {
    toast: ToastData,
    onRemove: () => void,
    getIcon: (t: ToastData) => React.ReactNode,
    getStyle: (t: ToastData) => string
}) {
    useEffect(() => {
        const timer = setTimeout(() => onRemove(), toast.duration || 4000)
        return () => clearTimeout(timer)
    }, [toast, onRemove])

    return (
        <motion.div
            initial={{ opacity: 0, x: 100, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 50, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl border backdrop-blur-lg shadow-xl ${getStyle(toast)}`}
        >
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                {getIcon(toast)}
            </div>
            <p className="text-sm font-bold text-white/90">{toast.message}</p>
            <button
                onClick={onRemove}
                className="p-1 rounded-lg hover:bg-white/10 transition-colors opacity-60 hover:opacity-100"
            >
                <X size={14} />
            </button>
        </motion.div>
    )
}
