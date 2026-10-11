"use client"

import { useEffect } from "react"
import { motion } from "framer-motion"
import { useShallow } from "zustand/react/shallow"
import type { SigningMoment } from "@/engine/moments"
import { useGameStore } from "@/store/game-store"
import { fireConfetti } from "@/lib/confetti-lazy"
import { formatGameCalendarDate, gameCalendarDate } from "@/lib/game-calendar"
import { useAppReducedMotion } from "@/lib/reduced-motion"
import { formatCurrency } from "@/lib/utils-extended"
import { cn } from "@/lib/utils"
import { PlayerPortrait } from "@/components/ui/asset-images"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { RatingChip } from "@/src/components/ui/RatingChip"
import { RoleTag } from "@/src/components/ui/RoleTag"
import { colors, tokens } from "@/src/design/tokens"
import { MomentFacts, MomentFrame, MomentOverline, MomentRule, useReveal, type MomentFact } from "./MomentFrame"

const EASE = [...tokens.motion.easeOutExpo] as [number, number, number, number]
const money = (n: number) => formatCurrency(Math.round(n), "$", false)

/** Headline size by name length, so a long tag stays on one line. */
function nameSize(name: string, big: boolean): string {
    const n = name.length
    if (n <= 6) return big ? "text-[clamp(84px,9.5vw,148px)]" : "text-[clamp(72px,8vw,124px)]"
    if (n <= 9) return big ? "text-[clamp(68px,7.4vw,120px)]" : "text-[clamp(60px,6.6vw,104px)]"
    if (n <= 12) return "text-[clamp(52px,5.6vw,88px)]"
    return "text-[clamp(42px,4.4vw,68px)]"
}

/** Personality archetype, read defensively (stream 5.2 adds `player.personality`). */
function archetypeOf(player: unknown): string | null {
    const raw = (player as { personality?: { archetype?: unknown } } | null | undefined)?.personality?.archetype
    if (typeof raw !== "string" || !raw.trim()) return null
    const words = raw.trim().replace(/[_-]+/g, " ").toLowerCase()
    return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * Signing reveal: the new player's card, full-screen. Rating 85+ gets the
 * bigger reveal (larger card, gold frame, one modest confetti burst).
 */
export function SigningRevealView({ moment, onDismiss }: { moment: SigningMoment; onDismiss: () => void }) {
    const reveal = useReveal()
    const reduce = useAppReducedMotion()
    const { player, gameStartDate } = useGameStore(useShallow(s => ({ player: s.players.find(p => p.id === moment.playerId), gameStartDate: s.gameStartDate })))

    useEffect(() => {
        if (!moment.big || reduce) return
        const t = setTimeout(() => { void fireConfetti({ particleCount: 70, spread: 70, startVelocity: 34, origin: { x: 0.32, y: 0.4 }, colors: [colors.gold.DEFAULT, colors["ink-1"]], zIndex: 210 }) }, 700)
        return () => clearTimeout(t)
    }, [moment.big, moment.key, reduce])

    const headlineId = `moment-signing-${moment.key}`
    const name = player?.nickname ?? "New player"
    const archetype = archetypeOf(player)
    const endSeason = Math.floor((moment.contractEndWeek - 1) / 52) + 1
    const endDate = gameStartDate ? formatGameCalendarDate(gameCalendarDate(gameStartDate, moment.contractEndWeek), { month: "short", year: "numeric" }) : null
    const weeks = Math.max(0, moment.contractEndWeek - moment.week)

    const facts: MomentFact[] = [
        moment.fee > 0
            ? { label: "Transfer fee", value: money(moment.fee), hint: moment.fromTeamName ? `From ${moment.fromTeamName}` : undefined }
            : { label: "Transfer fee", value: "Free", hint: moment.fromTeamName ? `From ${moment.fromTeamName}` : "Free agent" },
        { label: "Wage", value: <>{money(moment.salaryPerWeek)}<span className="ml-1 text-base font-semibold text-ink-3">/wk</span></> },
        { label: "Contract", value: endDate ?? `Season ${endSeason}`, hint: `${weeks} weeks · ends season ${endSeason}` },
    ]

    return (
        <MomentFrame momentKey={moment.key} labelledBy={headlineId} sound="signing" onDismiss={onDismiss} actionLabel="Welcome aboard">
            <div className="flex w-full items-center justify-center gap-14 text-left">
                <motion.div
                    initial={reduce ? false : { opacity: 0, x: -60, rotateY: -12 }}
                    animate={{ opacity: 1, x: 0, rotateY: 0 }}
                    transition={{ duration: reduce ? 0 : 0.8, ease: EASE }}
                    className={cn(
                        "relative shrink-0 overflow-hidden rounded-lg border bg-raised",
                        moment.big ? "h-[min(56vh,480px)] w-[min(44vh,380px)] border-gold/70" : "h-[min(48vh,400px)] w-[min(38vh,320px)] border-line-strong",
                    )}
                >
                    <PlayerPortrait src={player?.portraitPath} alt={name} seed={moment.playerId} fill className="object-cover object-top" />
                    <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-ink/90 to-transparent" />
                    <div className="absolute bottom-4 left-4">
                        <RatingChip value={moment.rating} size="xl" bare className="drop-shadow-lg" />
                    </div>
                </motion.div>

                <div className="min-w-0 max-w-xl">
                    <motion.div {...reveal(0.25)}>
                        <MomentOverline>{moment.big ? "Blockbuster signing" : "New signing"}</MomentOverline>
                    </motion.div>
                    <motion.h2
                        {...reveal(0.35, 22)}
                        id={headlineId}
                        className={cn("mt-3 font-display font-extrabold uppercase leading-[0.86] text-ink-1 [overflow-wrap:anywhere]", nameSize(name, moment.big))}
                    >
                        {name}
                    </motion.h2>
                    <motion.div {...reveal(0.5)} className="mt-4 flex flex-wrap items-center gap-3 text-lg text-ink-2">
                        {player?.nationality && <CountryFlag country={player.nationality} size={24} />}
                        {[player?.name && player.name !== player.nickname ? player.name : null, player?.age != null ? `Age ${player.age}` : null]
                            .filter(Boolean)
                            .map((part, i) => <span key={i} className={i > 0 ? "text-ink-3" : undefined}>{i > 0 ? `· ${part}` : part}</span>)}
                    </motion.div>
                    <motion.div {...reveal(0.6)} className="mt-4 flex flex-wrap items-center gap-2">
                        <RoleTag role={player?.role} className="text-[13px]" />
                        {archetype && (
                            <span className="inline-flex items-center rounded-sm border border-gold/50 px-1.5 py-0.5 text-[13px] font-semibold uppercase tracking-[0.06em] text-gold">
                                {archetype}
                            </span>
                        )}
                    </motion.div>
                    <MomentRule className="mt-7 max-w-none" delay={0.55} />
                    <motion.div {...reveal(0.75)} className="mt-7">
                        <MomentFacts facts={facts} />
                    </motion.div>
                </div>
            </div>
        </MomentFrame>
    )
}
