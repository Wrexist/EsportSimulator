"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useAppReducedMotion } from "@/lib/reduced-motion"
import { Trophy, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import Image from "next/image"
import { fireConfetti } from "@/lib/confetti-lazy"
import { soundManager } from "@/lib/sound-manager"
import { AnimatedNumber } from "@/components/ui/animated-number"
import { useFocusTrap } from "@/lib/accessibility"
import { formatCurrency } from "@/lib/utils-extended"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { TierTag } from "@/src/components/ui/TierTag"

interface TournamentWinCelebrationProps {
    data: {
        tournamentId?: string
        tournamentName: string
        tier: string
        /** The event's prize pool (the winner is paid a share of it). */
        prize: number
        repGain: number
        fanGain: number
        logoPath?: string
        trophyPath?: string
    }
    onClose: () => void
}

// Trophy gold, white and win green — the v2 celebration palette.
const CONFETTI_COLORS = ["#F2B53A", "#FFC85C", "#F2F4F7", "#3DD68C"]

/**
 * The title moment: a full-screen card over the whole app. The prize line
 * shows what the club was actually paid (its PRIZE ledger entry for this
 * event); the payload only carries the event's whole prize pool.
 */
export function TournamentWinCelebration({ data, onClose }: TournamentWinCelebrationProps) {
    const [mounted, setMounted] = useState(false)
    const reduceMotion = useAppReducedMotion()
    const dialogRef = useFocusTrap(mounted, onClose)
    const { financeLedger, playerTeamId } = useGameStore(useShallow(state => ({
        financeLedger: state.financeLedger,
        playerTeamId: state.playerTeamId,
    })))

    useEffect(() => {
        setMounted(true)

        // The peak moment of the game — give it fanfare. soundManager self-gates
        // on the user's sound setting, and sound is independent of reduced-motion.
        soundManager.play("victory")

        // No confetti barrage for reduced motion; the card still appears.
        if (reduceMotion) return

        const duration = 4 * 1000
        const animationEnd = Date.now() + duration
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0, colors: CONFETTI_COLORS }
        const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min

        const interval: ReturnType<typeof setInterval> = setInterval(function () {
            const timeLeft = animationEnd - Date.now()
            if (timeLeft <= 0) return clearInterval(interval)
            const particleCount = 40 * (timeLeft / duration)
            fireConfetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } })
            fireConfetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } })
        }, 250)

        return () => clearInterval(interval)
    }, [reduceMotion])

    if (!mounted) return null

    // Prize actually credited to the club for this title, if booked yet.
    const prizeEntry = data.tournamentId
        ? financeLedger.find(e => e.teamId === playerTeamId && e.type === "INCOME" && e.category === "PRIZE" && e.id.startsWith(`prize_${data.tournamentId}_`))
        : undefined

    const reveal = (delay: number) => ({
        initial: reduceMotion ? false : { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.3, delay: reduceMotion ? 0 : delay, ease: "easeOut" as const },
    })

    return (
        <AnimatePresence>
            <motion.div
                ref={dialogRef} tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title-tournament-win"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-overlay flex items-center justify-center bg-ink p-6"
            >
                <button
                    onClick={onClose}
                    aria-label="Close celebration"
                    title="Close"
                    className="absolute right-6 top-6 rounded p-2 text-ink-3 transition-colors hover:bg-hover hover:text-ink-1"
                >
                    <X className="h-5 w-5" aria-hidden="true" />
                </button>

                <div className="flex w-full max-w-3xl flex-col items-center text-center">
                    <motion.div
                        initial={reduceMotion ? false : { opacity: 0, scale: 0.85 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                        className="relative h-40 w-40 [@media(min-height:800px)]:h-56 [@media(min-height:800px)]:w-56"
                    >
                        {data.trophyPath ? (
                            <Image src={data.trophyPath} alt="" fill sizes="224px" className="object-contain" />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center rounded-full border border-gold/50 bg-gold/10">
                                <Trophy className="h-1/2 w-1/2 text-gold" aria-hidden="true" />
                            </div>
                        )}
                    </motion.div>

                    <motion.div {...reveal(0.25)} className="mt-6 flex items-center gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gold">Champions</span>
                        <TierTag tier={data.tier} />
                    </motion.div>
                    <motion.h2 {...reveal(0.3)} id="modal-title-tournament-win" className="mt-2 font-display text-[64px] font-extrabold uppercase leading-[0.9] text-ink-1">
                        {data.tournamentName}
                    </motion.h2>

                    <motion.dl {...reveal(0.45)} className="mt-8 grid w-full max-w-2xl grid-cols-3 divide-x divide-line rounded-lg border border-line bg-panel">
                        <div className="px-5 py-4">
                            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{prizeEntry ? "Prize money" : "Prize pool"}</dt>
                            <dd className="mt-1 font-display text-[32px] font-bold leading-none tabular-nums text-ink-1">
                                <AnimatedNumber value={prizeEntry ? prizeEntry.amount : data.prize} animateOnMount duration={1200} format={(n) => formatCurrency(Math.round(n), "$", false)} />
                            </dd>
                        </div>
                        <div className="px-5 py-4">
                            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">New followers</dt>
                            <dd className="mt-1 font-display text-[32px] font-bold leading-none tabular-nums text-ink-1">+{data.fanGain.toLocaleString("en-US")}</dd>
                        </div>
                        <div className="px-5 py-4">
                            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Reputation</dt>
                            <dd className="mt-1 font-display text-[32px] font-bold leading-none tabular-nums text-ink-1">+{data.repGain}</dd>
                        </div>
                    </motion.dl>

                    <motion.div {...reveal(0.55)} className="mt-8">
                        <Button onClick={onClose} className="h-12 px-10 text-base">
                            Continue
                        </Button>
                    </motion.div>
                </div>
            </motion.div>
        </AnimatePresence>
    )
}
