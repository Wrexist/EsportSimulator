"use client"

import { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Trophy, Star, Crown } from "lucide-react"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { PlayerPortrait } from "@/components/ui/asset-images"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { Button } from "@/components/ui/button"
import { RatingChip } from "@/src/components/ui/RatingChip"
import { RoleTag } from "@/src/components/ui/RoleTag"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/utils-extended"
import { fireConfetti } from "@/lib/confetti-lazy"
import { soundManager } from "@/lib/sound-manager"
import type { LegendPickData } from "@/engine/save-types"
import { panelTransition } from "@/lib/motion"
import { useFocusTrap } from "@/lib/accessibility"
import { LEGEND_CONTRACT_WEEKS, LEGEND_MIN_RUNWAY_WEEKS, quoteLegendSigning } from "@/lib/legend-signing"

/** Trophy gold, its hover tint and the primary text colour (design system v2). */
const CONFETTI_GOLD = ["#F2B53A", "#FFC85C", "#F2F4F7"]

interface LegendPickModalProps {
    data: LegendPickData
    onSelect: (legendId: string) => void
}

export function LegendPickModal({ data, onSelect }: LegendPickModalProps) {
    const { players, teams, contracts, staff, currentWeek, playerTeamId, academyPlayers, clearLegendPick } = useGameStore(useShallow(state => ({
        players: state.players,
        teams: state.teams,
        contracts: state.contracts,
        staff: state.staff,
        currentWeek: state.currentWeek,
        playerTeamId: state.playerTeamId,
        academyPlayers: state.academyPlayers,
        clearLegendPick: state.clearLegendPick,
    })))
    const [selectedId, setSelectedId] = useState<string | null>(null)
    // The legend's wage is the real cost of this reward; show it and refuse a
    // signing the club can't carry (selectLegend enforces the same rule).
    const quote = useMemo(() => selectedId
        ? quoteLegendSigning({ players, teams, contracts, staff, currentWeek, playerTeamId, academyPlayers }, selectedId)
        : null, [selectedId, players, teams, contracts, staff, currentWeek, playerTeamId, academyPlayers])
    const canSign = !!selectedId && (quote?.affordable ?? true)
    const [confirmed, setConfirmed] = useState(false)
    const [mounted, setMounted] = useState(false)
    // Escape is not a close path; "Decline" is the explicit way out.
    const dialogRef = useFocusTrap(mounted)

    const candidates = data.candidates
        .map(id => players.find(p => p.id === id))
        .filter(Boolean) as any[]

    useEffect(() => {
        setMounted(true)
        // The legend pick follows the title moment: its own cue (Phase 5.4a).
        soundManager.play("award")
        // Gold confetti for the Major win legend reward
        const burst = () => {
            fireConfetti({
                particleCount: 80,
                spread: 100,
                origin: { y: 0.3 },
                colors: CONFETTI_GOLD,
                ticks: 80,
            })
        }
        burst()
        const t = setTimeout(burst, 800)
        return () => clearTimeout(t)
    }, [])

    const handleConfirm = () => {
        if (!selectedId || !canSign) return
        setConfirmed(true)
        soundManager.play("signing")
        // Big celebration confetti
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                fireConfetti({
                    particleCount: 120,
                    spread: 160,
                    origin: { x: 0.5, y: 0.4 },
                    colors: CONFETTI_GOLD,
                    ticks: 100,
                })
            }, i * 300)
        }
        setTimeout(() => onSelect(selectedId), 1500)
    }

    if (!mounted) return null

    const selectedName = candidates.find(c => c.id === selectedId)?.nickname

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-celebration flex items-center justify-center bg-ink/95"
            >
                <motion.div
                    variants={panelTransition}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    ref={dialogRef} tabIndex={-1}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="modal-title-legend-pick"
                    className="relative z-10 mx-4 max-h-[calc(100dvh-2rem)] w-full max-w-5xl overflow-y-auto overscroll-contain py-4"
                >
                    {/* Header */}
                    <motion.div
                        initial={{ y: -12, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.3 }}
                        className="mb-4 text-center [@media(min-height:800px)]:mb-8"
                    >
                        <p className="flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-gold">
                            <Trophy size={14} aria-hidden="true" /> Major champion reward
                        </p>
                        <h2 id="modal-title-legend-pick" className="mt-2 font-display text-5xl font-bold uppercase leading-none text-ink-1">
                            Choose your legend
                        </h2>
                        <p className="mt-2 text-sm text-ink-3">
                            {data.tournamentName} — select a legend to join your roster
                        </p>
                    </motion.div>

                    {/* Legend cards */}
                    {!confirmed && (
                        <div className="mb-4 grid grid-cols-3 gap-4 [@media(min-height:800px)]:mb-8">
                            {candidates.map((legend, i) => {
                                const selected = selectedId === legend.id
                                return (
                                    <motion.div
                                        key={legend.id}
                                        initial={{ y: 24, opacity: 0 }}
                                        animate={{ y: 0, opacity: 1 }}
                                        transition={{ delay: 0.4 + i * 0.12, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                                    >
                                        <button
                                            onClick={() => setSelectedId(legend.id)}
                                            aria-pressed={selected}
                                            className={cn(
                                                "relative w-full overflow-hidden rounded-lg border bg-panel text-left transition-colors duration-100 ease-out",
                                                selected ? "border-gold" : "border-line hover:border-line-strong",
                                            )}
                                        >
                                            {/* Portrait */}
                                            <div className="relative flex h-36 items-center justify-center border-b border-line bg-shell [@media(min-height:800px)]:h-48">
                                                <div className="h-28 w-28 overflow-hidden rounded-md bg-raised">
                                                    <PlayerPortrait src={legend.portraitPath} seed={legend.id} alt={legend.nickname} size={112} variant="hero" />
                                                </div>
                                                <RatingChip value={legend.skill} size="lg" className="absolute right-4 top-4" title={`Skill ${legend.skill}`} />
                                                <Crown className="absolute left-4 top-4 text-gold" size={18} aria-hidden="true" />
                                            </div>

                                            {/* Info */}
                                            <div className="p-5">
                                                <div className="mb-1 flex items-center gap-2">
                                                    <h3 className="text-xl font-bold text-ink-1">{legend.nickname}</h3>
                                                    <CountryFlag country={legend.nationality} />
                                                </div>
                                                <p className="mb-3 text-xs text-ink-3">{legend.name}</p>

                                                <div className="mb-3 flex items-center gap-2">
                                                    <RoleTag role={legend.role} />
                                                    <span className="rounded-sm border border-line px-1.5 py-0.5 text-[11px] font-semibold text-ink-2">
                                                        {legend.majorWins || 0}× Major
                                                    </span>
                                                </div>

                                                {/* Achievements */}
                                                <ul className="space-y-1.5">
                                                    {(legend.legendaryAchievements || []).slice(0, 3).map((ach: string, j: number) => (
                                                        <li key={j} className="flex items-center gap-2 text-xs text-ink-2">
                                                            <Star size={11} className="shrink-0 text-gold" aria-hidden="true" />
                                                            <span className="truncate">{ach}</span>
                                                        </li>
                                                    ))}
                                                </ul>

                                                {/* Key stats */}
                                                <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
                                                    <div>
                                                        <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Matches</dt>
                                                        <dd className="text-sm font-bold tabular-nums text-ink-1">{(legend.matchesPlayed || 0).toLocaleString()}</dd>
                                                    </div>
                                                    <div>
                                                        <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Rating</dt>
                                                        <dd className="text-sm font-bold tabular-nums text-ink-1">{(legend.avgRating || 0).toFixed(2)}</dd>
                                                    </div>
                                                    <div>
                                                        <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">MVPs</dt>
                                                        <dd className="text-sm font-bold tabular-nums text-ink-1">{legend.totalMVPs || 0}</dd>
                                                    </div>
                                                </dl>
                                            </div>

                                            {/* Selected indicator */}
                                            {selected && <div aria-hidden="true" className="h-1 bg-gold" />}
                                        </button>
                                    </motion.div>
                                )
                            })}
                        </div>
                    )}

                    {/* Confirmed state */}
                    {confirmed && selectedId && (
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="py-16 text-center"
                        >
                            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-lg border border-gold/50 bg-gold/10">
                                <Crown size={40} className="text-gold" aria-hidden="true" />
                            </div>
                            <h2 className="mb-2 font-display text-4xl font-bold uppercase text-ink-1">
                                {selectedName} joins your team
                            </h2>
                            <p className="text-ink-3">A legend returns to the stage.</p>
                        </motion.div>
                    )}

                    {/* Confirm */}
                    {!confirmed && (
                        <motion.div
                            initial={{ y: 12, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.8 }}
                            className="text-center"
                        >
                            {quote && (
                                <p role="status" className={cn("mb-3 text-sm", quote.affordable ? "text-ink-2" : "text-caution")}>
                                    Wage {formatCurrency(quote.salary, "$", false)}/week for {LEGEND_CONTRACT_WEEKS / 52} years.{" "}
                                    {quote.weeklyNet >= 0
                                        ? "Your club stays cash-positive."
                                        : `Cash lasts about ${quote.runwayWeeks} weeks at the new rate.`}
                                    {!quote.affordable && ` You need at least ${LEGEND_MIN_RUNWAY_WEEKS} weeks of cover to sign.`}
                                </p>
                            )}
                            <div className="flex flex-wrap items-center justify-center gap-3">
                                <Button size="lg" onClick={handleConfirm} disabled={!canSign} className="h-12 min-w-[260px] px-10 text-base">
                                    {selectedId ? `Sign ${selectedName}` : "Select a legend"}
                                </Button>
                                <Button size="lg" variant="outline" onClick={clearLegendPick} className="h-12 px-6">
                                    Decline
                                </Button>
                            </div>
                        </motion.div>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}
