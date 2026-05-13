"use client"

import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, AlertCircle, Info, TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Feedback Animations
 * Visual feedback for user actions
 */

// Success pulse animation
export function SuccessPulse({ children, show }: { children: React.ReactNode; show: boolean }) {
    return (
        <AnimatePresence mode="wait">
            {show && (
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 1.2, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="relative"
                >
                    {children}
                    <motion.div
                        className="absolute inset-0 bg-emerald-500/20 rounded-full"
                        initial={{ scale: 1 }}
                        animate={{ scale: 1.5, opacity: 0 }}
                        transition={{ duration: 0.6, repeat: 2 }}
                    />
                </motion.div>
            )}
        </AnimatePresence>
    )
}

// Stat change indicator
export function StatChange({
    value,
    oldValue,
    showAnimation = true
}: {
    value: number
    oldValue?: number
    showAnimation?: boolean
}) {
    if (oldValue === undefined) return <span>{value}</span>

    const change = value - oldValue
    const isIncrease = change > 0
    const isDecrease = change < 0

    return (
        <span className="inline-flex items-center gap-1">
            <span>{value}</span>
            {showAnimation && change !== 0 && (
                <motion.span
                    initial={{ y: -10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 10, opacity: 0 }}
                    className={cn(
                        'text-xs font-bold',
                        isIncrease && 'text-emerald-500',
                        isDecrease && 'text-red-500'
                    )}
                >
                    {isIncrease && <TrendingUp className="w-3 h-3 inline" />}
                    {isDecrease && <TrendingDown className="w-3 h-3 inline" />}
                    {change > 0 ? '+' : ''}{change}
                </motion.span>
            )}
        </span>
    )
}

// Money counter animation
export function MoneyCounter({ amount, prefix = '$' }: { amount: number; prefix?: string }) {
    return (
        <motion.span
            key={amount}
            initial={{ scale: 1.2, color: '#10b981' }}
            animate={{ scale: 1, color: 'inherit' }}
            transition={{ duration: 0.3 }}
        >
            {prefix}{amount.toLocaleString()}
        </motion.span>
    )
}

// Shake animation for errors
export function ShakeOnError({
    children,
    error
}: {
    children: React.ReactNode
    error: boolean
}) {
    return (
        <motion.div
            animate={error ? {
                x: [0, -10, 10, -10, 10, 0],
                transition: { duration: 0.4 }
            } : {}}
        >
            {children}
        </motion.div>
    )
}

// Slide up notification
export function SlideUpNotification({
    show,
    type = 'info',
    message
}: {
    show: boolean
    type?: 'success' | 'error' | 'info'
    message: string
}) {
    const icons = {
        success: CheckCircle2,
        error: AlertCircle,
        info: Info
    }

    const colors = {
        success: 'bg-emerald-500/10 border-emerald-500/50 text-emerald-500',
        error: 'bg-red-500/10 border-red-500/50 text-red-500',
        info: 'bg-blue-500/10 border-blue-500/50 text-blue-500'
    }

    const Icon = icons[type]

    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -50, opacity: 0 }}
                    className={cn(
                        'fixed bottom-4 right-4 p-4 rounded-lg border flex items-center gap-3 shadow-lg z-50',
                        colors[type]
                    )}
                >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{message}</span>
                </motion.div>
            )}
        </AnimatePresence>
    )
}

// Floating action feedback
export function FloatingFeedback({
    show,
    message,
    x,
    y
}: {
    show: boolean
    message: string
    x: number
    y: number
}) {
    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    initial={{ x, y, opacity: 0, scale: 0.5 }}
                    animate={{
                        y: y - 50,
                        opacity: [0, 1, 1, 0],
                        scale: [0.5, 1, 1, 0.8]
                    }}
                    transition={{ duration: 1.5 }}
                    className="fixed pointer-events-none z-50 font-bold text-emerald-500"
                    style={{ left: x, top: y }}
                >
                    {message}
                </motion.div>
            )}
        </AnimatePresence>
    )
}

// Loading skeleton with pulse
export function SkeletonPulse({ className }: { className?: string }) {
    return (
        <motion.div
            className={cn('bg-white/5 rounded', className)}
            animate={{
                opacity: [0.5, 1, 0.5]
            }}
            transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: 'easeInOut'
            }}
        />
    )
}

// XP gain animation
export function XPGainAnimation({
    show,
    amount
}: {
    show: boolean
    amount: number
}) {
    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    initial={{ y: 0, opacity: 1, scale: 1 }}
                    animate={{
                        y: -50,
                        opacity: 0,
                        scale: 1.2
                    }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1 }}
                    className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-50"
                >
                    <div className="text-3xl font-normal text-amber-500">
                        +{amount} XP
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
