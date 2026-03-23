"use client"

import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'

/**
 * Match Animation Effects
 * Visual effects for live match events
 */

/**
 * Kill Feed Animation
 */
export function KillFeedItem({
    killer,
    victim,
    weapon,
    isHeadshot
}: {
    killer: string
    victim: string
    weapon: string
    isHeadshot?: boolean
}) {
    return (
        <motion.div
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            className="glass-panel px-3 py-2 flex items-center gap-2 text-sm"
        >
            <span className="font-bold text-primary">{killer}</span>
            <span className="text-muted-foreground">{weapon}</span>
            {isHeadshot && <span className="text-red-500">💥</span>}
            <span className="text-muted-foreground">→</span>
            <span>{victim}</span>
        </motion.div>
    )
}

/**
 * Round Win Animation
 */
export function RoundWinBanner({
    winner,
    reason
}: {
    winner: 'CT' | 'T'
    reason: string
}) {
    const [show, setShow] = useState(true)

    useEffect(() => {
        const timer = setTimeout(() => setShow(false), 3000)
        return () => clearTimeout(timer)
    }, [])

    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    initial={{ scale: 0, rotate: -10 }}
                    animate={{ scale: 1, rotate: 0 }}
                    exit={{ scale: 0, opacity: 0 }}
                    className="fixed inset-0 flex items-center justify-center pointer-events-none z-50"
                >
                    <div className={`glass-panel p-8 text-center ${winner === 'CT' ? 'border-blue-500' : 'border-orange-500'
                        } border-2`}>
                        <h2 className="text-4xl font-normal mb-2">
                            {winner} WIN
                        </h2>
                        <p className="text-xl text-muted-foreground">{reason}</p>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}

/**
 * Bomb Plant/Defuse Indicator
 */
export function BombIndicator({
    type,
    timeRemaining
}: {
    type: 'plant' | 'defuse'
    timeRemaining: number
}) {
    return (
        <motion.div
            initial={{ scale: 0.8 }}
            animate={{
                scale: [0.8, 1.1, 1],
                transition: { duration: 0.3 }
            }}
            className={`fixed top-4 right-4 glass-panel p-4 ${type === 'plant' ? 'bg-orange-500/20' : 'bg-blue-500/20'
                }`}
        >
            <div className="flex items-center gap-3">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="text-2xl"
                >
                    {type === 'plant' ? '💣' : '🔧'}
                </motion.div>
                <div>
                    <div className="font-bold">
                        {type === 'plant' ? 'BOMB PLANTED' : 'DEFUSING'}
                    </div>
                    <div className="text-sm tabular-nums">
                        {timeRemaining}s
                    </div>
                </div>
            </div>
        </motion.div>
    )
}

/**
 * Score Update Animation
 */
export function ScoreUpdate({
    ctScore,
    tScore
}: {
    ctScore: number
    tScore: number
}) {
    return (
        <div className="flex items-center gap-8 justify-center">
            <motion.div
                key={`ct-${ctScore}`}
                initial={{ scale: 1.5, color: '#3b82f6' }}
                animate={{ scale: 1, color: '#fff' }}
                className="text-6xl font-normal"
            >
                {ctScore}
            </motion.div>

            <div className="text-2xl text-muted-foreground">-</div>

            <motion.div
                key={`t-${tScore}`}
                initial={{ scale: 1.5, color: '#f97316' }}
                animate={{ scale: 1, color: '#fff' }}
                className="text-6xl font-normal"
            >
                {tScore}
            </motion.div>
        </div>
    )
}

/**
 * Money Change Indicator
 */
export function MoneyChange({
    amount,
    reason
}: {
    amount: number
    reason: string
}) {
    return (
        <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${amount > 0 ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'
                }`}
        >
            <span className="font-bold">
                {amount > 0 ? '+' : ''}{amount}
            </span>
            <span className="text-xs opacity-75">{reason}</span>
        </motion.div>
    )
}

/**
 * Match Start Countdown
 */
export function MatchCountdown({ seconds }: { seconds: number }) {
    return (
        <motion.div
            key={seconds}
            initial={{ scale: 2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center pointer-events-none z-50"
        >
            <div className="text-9xl font-normal text-primary drop-shadow-2xl">
                {seconds}
            </div>
        </motion.div>
    )
}

/**
 * Ace Announcement
 */
export function AceAnnouncement({ playerName }: { playerName: string }) {
    const [show, setShow] = useState(true)

    useEffect(() => {
        const timer = setTimeout(() => setShow(false), 4000)
        return () => clearTimeout(timer)
    }, [])

    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{
                        scale: 1,
                        rotate: 0,
                        transition: { type: 'spring', duration: 0.8 }
                    }}
                    exit={{ scale: 0, opacity: 0 }}
                    className="fixed inset-0 flex items-center justify-center pointer-events-none z-50"
                >
                    <div className="glass-panel p-12 text-center border-4 border-amber-500">
                        <h2 className="text-6xl font-normal mb-4 text-amber-500">ACE!</h2>
                        <p className="text-3xl">{playerName}</p>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
