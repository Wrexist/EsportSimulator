"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Swords, TrendingUp } from "lucide-react"
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
import { rivalLine } from "@/engine/transfer-hype"
import { StandingBadge, STANDING_FRAME } from "@/components/transfer/StandingBadge"
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

/** Counts from a low number up to `target` after `delay` seconds (instant with reduced motion). */
function useCountUp(target: number, delay: number, duration: number, reduce: boolean): number {
    const from = Math.max(0, Math.min(target, 40))
    const [value, setValue] = useState(reduce ? target : from)
    useEffect(() => {
        if (reduce) { setValue(target); return }
        let raf = 0
        let start = 0
        const tick = (t: number) => {
            if (!start) start = t
            const k = Math.min(1, Math.max(0, (t - start) / 1000 - delay) / duration)
            setValue(Math.round(from + (target - from) * (1 - Math.pow(1 - k, 3))))
            if (k < 1) raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(raf)
    }, [target, delay, duration, reduce, from])
    return value
}

function overline(moment: SigningMoment): string {
    if (moment.big) return "Blockbuster signing"
    if (moment.standing === "ICON") return "Icon signing"
    if (moment.standing === "STAR") return "Star signing"
    if (moment.standing === "WONDERKID") return "Wonderkid signing"
    return "New signing"
}

/**
 * Signing reveal: the new player's card, full-screen. Rating 85+ gets the
 * bigger reveal (larger card, gold frame, one modest confetti burst); an
 * Icon, Star or Wonderkid gets its frame and a light sweep. The rating
 * counts up, an "Official" stamp lands, and the reveal names the clubs that
 * were in the race and what he adds to the best five.
 */
export function SigningRevealView({ moment, onDismiss }: { moment: SigningMoment; onDismiss: () => void }) {
    const reveal = useReveal()
    const reduce = useAppReducedMotion()
    const { player, gameStartDate } = useGameStore(useShallow(s => ({ player: s.players.find(p => p.id === moment.playerId), gameStartDate: s.gameStartDate })))

    const celebrated = moment.big || moment.standing === "ICON"
    const shown = useCountUp(moment.rating, 0.55, 0.9, reduce)
    useEffect(() => {
        if (!celebrated || reduce) return
        const t = setTimeout(() => { void fireConfetti({ particleCount: 70, spread: 70, startVelocity: 34, origin: { x: 0.32, y: 0.4 }, colors: [colors.gold.DEFAULT, colors["ink-1"]], zIndex: 210 }) }, 700)
        return () => clearTimeout(t)
    }, [celebrated, moment.key, reduce])

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

    const frame = moment.big ? STANDING_FRAME.ICON : moment.standing ? STANDING_FRAME[moment.standing] : "border-line-strong"
    const sweep = !reduce && (moment.big || !!moment.standing)
    const rivals = moment.rivalNames ?? []
    const gain = moment.squad ? moment.squad.after - moment.squad.before : 0

    return (
        <MomentFrame momentKey={moment.key} labelledBy={headlineId} sound="signing" onDismiss={onDismiss} actionLabel="Welcome aboard">
            <div className="flex w-full items-center justify-center gap-14 text-left">
                <motion.div
                    initial={reduce ? false : { opacity: 0, x: -60, rotateY: -12 }}
                    animate={{ opacity: 1, x: 0, rotateY: 0 }}
                    transition={{ duration: reduce ? 0 : 0.8, ease: EASE }}
                    className={cn(
                        "relative shrink-0 rounded-lg border bg-raised",
                        moment.big ? "h-[min(56vh,480px)] w-[min(44vh,380px)]" : "h-[min(48vh,400px)] w-[min(38vh,320px)]",
                        frame,
                    )}
                >
                    <div className="absolute inset-0 overflow-hidden rounded-lg">
                        <PlayerPortrait src={player?.portraitPath} alt={name} seed={moment.playerId} fill className="object-cover object-top" />
                        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-ink/90 to-transparent" />
                        {sweep && (
                            <motion.div
                                aria-hidden="true"
                                initial={{ x: "-130%" }}
                                animate={{ x: "230%" }}
                                transition={{ duration: 1.1, delay: 0.9, ease: EASE }}
                                className="absolute inset-y-0 w-1/2 -skew-x-12 bg-linear-to-r from-transparent via-white/25 to-transparent"
                            />
                        )}
                    </div>
                    {moment.standing && (
                        <div className="absolute left-4 top-4">
                            <StandingBadge standing={moment.standing} size="md" />
                        </div>
                    )}
                    <div className="absolute bottom-4 left-4">
                        <RatingChip value={shown} size="xl" bare className="drop-shadow-lg" />
                    </div>
                    <motion.div
                        aria-hidden="true"
                        initial={reduce ? false : { opacity: 0, scale: 1.9, rotate: -14 }}
                        animate={{ opacity: 1, scale: 1, rotate: -9 }}
                        transition={{ duration: reduce ? 0 : 0.32, delay: reduce ? 0 : 1.35, ease: [0.2, 1.4, 0.4, 1] }}
                        className={cn(
                            "absolute -right-5 top-8 rounded-sm border-[3px] bg-ink/70 px-3 py-1 font-display text-2xl font-extrabold uppercase tracking-[0.18em]",
                            celebrated ? "border-gold text-gold" : "border-ink-1 text-ink-1",
                        )}
                    >
                        Official
                    </motion.div>
                </motion.div>

                <div className="min-w-0 max-w-xl">
                    <motion.div {...reveal(0.25)}>
                        <MomentOverline>{overline(moment)}</MomentOverline>
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
                        <StandingBadge standing={moment.standing} size="md" />
                        {archetype && (
                            <span className="inline-flex items-center rounded-sm border border-gold/50 px-1.5 py-0.5 text-[13px] font-semibold uppercase tracking-[0.06em] text-gold">
                                {archetype}
                            </span>
                        )}
                    </motion.div>
                    {rivals.length > 0 && (
                        <motion.p {...reveal(0.7)} className="mt-5 flex items-start gap-2 text-base text-ink-2">
                            <Swords size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-gold" />
                            <span>Beat <span className="font-semibold text-ink-1">{rivalLine(rivals, moment.rivalCount ?? rivals.length)}</span> to the signature.</span>
                        </motion.p>
                    )}
                    <MomentRule className="mt-7 max-w-none" delay={0.55} />
                    <motion.div {...reveal(0.75)} className="mt-7">
                        <MomentFacts facts={facts} />
                    </motion.div>
                    {moment.squad && (
                        <motion.div {...reveal(0.95)} className="mt-4 flex items-center gap-3 text-sm text-ink-3">
                            <TrendingUp size={16} aria-hidden="true" className={gain > 0 ? "text-positive" : "text-ink-3"} />
                            <span>Best five OVR</span>
                            <span className="font-display text-xl font-bold tabular-nums text-ink-2">{moment.squad.before}</span>
                            <span aria-hidden="true">→</span>
                            <span className="font-display text-xl font-bold tabular-nums text-ink-1">{moment.squad.after}</span>
                            {gain !== 0 && <span className={cn("font-semibold tabular-nums", gain > 0 ? "text-positive" : "text-negative")}>{gain > 0 ? `+${gain}` : gain}</span>}
                            {gain === 0 && <span>· squad depth</span>}
                        </motion.div>
                    )}
                    {moment.signature && (
                        <motion.div {...reveal(1.05)} className="mt-5 flex items-end gap-4">
                            <svg viewBox={`0 0 ${moment.signature.w} ${moment.signature.h}`} className="h-16 w-48 shrink-0" role="img" aria-label="Your signature on the contract">
                                <motion.path
                                    d={moment.signature.d}
                                    fill="none"
                                    stroke={colors["ink-1"]}
                                    strokeWidth={2.6}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    initial={reduce ? false : { pathLength: 0 }}
                                    animate={{ pathLength: 1 }}
                                    transition={{ duration: reduce ? 0 : 1.2, delay: reduce ? 0 : 1.1, ease: "easeInOut" }}
                                />
                            </svg>
                            <p className="pb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-3">Signed by the manager</p>
                        </motion.div>
                    )}
                </div>
            </div>
        </MomentFrame>
    )
}
