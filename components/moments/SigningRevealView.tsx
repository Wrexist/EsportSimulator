"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Swords, TrendingUp } from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import type { SigningMoment } from "@/engine/moments"
import { signatureViewBox } from "./signature-box"
import { useGameStore } from "@/store/game-store"
import { fireConfetti } from "@/lib/confetti-lazy"
import { formatGameCalendarDate, gameCalendarDate } from "@/lib/game-calendar"
import { useAppReducedMotion } from "@/lib/reduced-motion"
import { formatCurrency } from "@/lib/utils-extended"
import { cn } from "@/lib/utils"
import { t, tn } from "@/lib/i18n"
import { Trans } from "@/lib/trans"
import { ARCHETYPE_INFO, type PersonalityArchetype } from "@/engine/personality"
import { PlayerPortrait } from "@/components/ui/asset-images"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { RatingChip } from "@/src/components/ui/RatingChip"
import { RoleTag } from "@/src/components/ui/RoleTag"
import { colors, tokens } from "@/src/design/tokens"
import { rivalLine } from "@/engine/transfer-hype"
import { StandingBadge, STANDING_FRAME } from "@/components/transfer/StandingBadge"
import { startingSwapFor } from "@/lib/lineup-upgrade"
import { MomentFacts, MomentFrame, MomentOverline, MomentRule, useReveal, type MomentFact } from "./MomentFrame"

const EASE = [...tokens.motion.easeOutExpo] as [number, number, number, number]
const money = (n: number) => formatCurrency(Math.round(n), "$", false)
/** Signature size on the reveal (px): its height, and the most width it may take. */
const SIG_HEIGHT = 72
const SIG_MAX_WIDTH = 300

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
    const info = ARCHETYPE_INFO[raw.trim().toUpperCase() as PersonalityArchetype]
    if (info) return info.label
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
    if (moment.big) return t("mo.sign.big")
    if (moment.standing === "ICON") return t("mo.sign.icon")
    if (moment.standing === "STAR") return t("mo.sign.star")
    if (moment.standing === "WONDERKID") return t("mo.sign.wonderkid")
    return t("mo.sign.new")
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
    // NEWPLAYER-01: a signing lands on the bench. When he beats a starter
    // (of his role, else the weakest), offer to start him from the reveal.
    const startSwap = useGameStore(useShallow(s => {
        const team = s.teams.find(tm => tm.id === s.playerTeamId)
        if (!team || s.activeMatchId || (s.proCareer && s.proCareer.retiredWeek == null)) return null
        const swap = startingSwapFor(team.rosterIds, s.players, moment.playerId, s.currentWeek)
        if (!swap) return null
        return { teamId: team.id, from: swap.benchIndex, to: swap.starterIndex, replaced: s.players.find(p => p.id === swap.starterId)?.nickname ?? "" }
    }))
    const startHim = () => {
        if (!startSwap) return
        const st = useGameStore.getState()
        st.swapRosterPositions(startSwap.teamId, startSwap.from, startSwap.to)
        st.addToast({ type: "info", message: t("squad.lineupUpdated") })
    }

    const celebrated = moment.big || moment.standing === "ICON"
    const shown = useCountUp(moment.rating, 0.55, 0.9, reduce)
    useEffect(() => {
        if (!celebrated || reduce) return
        const t = setTimeout(() => { void fireConfetti({ particleCount: 70, spread: 70, startVelocity: 34, origin: { x: 0.32, y: 0.4 }, colors: [colors.gold.DEFAULT, colors["ink-1"]], zIndex: 210 }) }, 700)
        return () => clearTimeout(t)
    }, [celebrated, moment.key, reduce])

    const headlineId = `moment-signing-${moment.key}`
    const name = player?.nickname ?? t("mo.sign.newPlayer")
    const archetype = archetypeOf(player)
    const endSeason = Math.floor((moment.contractEndWeek - 1) / 52) + 1
    // The same end date as the signed contract paper (same day of the week).
    const endDate = gameStartDate ? formatGameCalendarDate(gameCalendarDate(gameStartDate, moment.contractEndWeek, moment.day ?? 0), { month: "short", year: "numeric" }) : null
    const weeks = Math.max(0, moment.contractEndWeek - moment.week)

    const facts: MomentFact[] = [
        moment.fee > 0
            ? { label: t("mo.sign.fee"), value: money(moment.fee), hint: moment.fromTeamName ? t("mo.sign.from", { team: moment.fromTeamName }) : undefined }
            : { label: t("mo.sign.fee"), value: t("mo.sign.free"), hint: moment.fromTeamName ? t("mo.sign.from", { team: moment.fromTeamName }) : t("mo.sign.freeAgent") },
        { label: t("mo.sign.wage"), value: <>{money(moment.salaryPerWeek)}<span className="ml-1 text-base font-semibold text-ink-3">{t("mo.perWeek")}</span></> },
        { label: t("mo.sign.contract"), value: endDate ?? t("mo.seasonN", { n: endSeason }), hint: tn("mo.sign.contractHint", weeks, { season: endSeason }) },
    ]

    const frame = moment.big ? STANDING_FRAME.ICON : moment.standing ? STANDING_FRAME[moment.standing] : "border-line-strong"
    const sweep = !reduce && (moment.big || !!moment.standing)
    const rivals = moment.rivalNames ?? []
    const gain = moment.squad ? moment.squad.after - moment.squad.before : 0
    const sig = moment.signature
    const sigBox = sig ? signatureViewBox(sig) : null

    return (
        <MomentFrame
            momentKey={moment.key}
            labelledBy={headlineId}
            sound="signing"
            onDismiss={onDismiss}
            actionLabel={t("mo.sign.action")}
            extraAction={startSwap ? { label: t("mo.sign.start", { name: startSwap.replaced }), onClick: startHim } : undefined}
        >
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
                    {/* NEWPLAYER-21 (2026-11-17): the big number is his rating, not a shirt number. */}
                    <div className="absolute bottom-4 left-4 flex flex-col items-start">
                        <RatingChip value={shown} size="xl" bare className="drop-shadow-lg" />
                        <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-1 drop-shadow">{t("common.ovr")}</span>
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
                        {t("mo.sign.official")}
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
                        {[player?.name && player.name !== player.nickname ? player.name : null, player?.age != null ? t("mo.sign.age", { age: player.age }) : null]
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
                            <span><Trans k="mo.sign.beatRivals" params={{ rivals: rivalLine(rivals, moment.rivalCount ?? rivals.length) }} tags={{ b: (text) => <span className="font-semibold text-ink-1">{text}</span> }} /></span>
                        </motion.p>
                    )}
                    <MomentRule className="mt-7 max-w-none" delay={0.55} />
                    <motion.div {...reveal(0.75)} className="mt-7">
                        <MomentFacts facts={facts} />
                    </motion.div>
                    {moment.squad && (
                        <motion.div {...reveal(0.95)} className="mt-4 flex items-center gap-3 text-sm text-ink-3">
                            <TrendingUp size={16} aria-hidden="true" className={gain > 0 ? "text-positive" : "text-ink-3"} />
                            <span>{t("mo.sign.bestFive")}</span>
                            <span className="font-display text-xl font-bold tabular-nums text-ink-2">{moment.squad.before}</span>
                            <span aria-hidden="true">→</span>
                            <span className="font-display text-xl font-bold tabular-nums text-ink-1">{moment.squad.after}</span>
                            {gain !== 0 && <span className={cn("font-semibold tabular-nums", gain > 0 ? "text-positive" : "text-negative")}>{gain > 0 ? `+${gain}` : gain}</span>}
                            {gain === 0 && <span>· {t("mo.sign.depth")}</span>}
                        </motion.div>
                    )}
                    {sig && sigBox && (
                        // MARKET-11 (2026-11-17): the signature fills its box and the caption sits under it, on the line.
                        <motion.div {...reveal(1.05)} className="mt-5 inline-flex flex-col items-stretch">
                            <svg viewBox={`${sigBox.x} ${sigBox.y} ${sigBox.w} ${sigBox.h}`} style={{ height: SIG_HEIGHT, width: Math.min(SIG_MAX_WIDTH, SIG_HEIGHT * sigBox.w / Math.max(1, sigBox.h)) }} className="shrink-0" role="img" aria-label={t("mo.sign.signatureAlt")}>
                                <motion.path
                                    d={sig.d}
                                    fill="none"
                                    stroke={colors["ink-1"]}
                                    strokeWidth={2.6}
                                    vectorEffect="non-scaling-stroke"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    initial={reduce ? false : { pathLength: 0 }}
                                    animate={{ pathLength: 1 }}
                                    transition={{ duration: reduce ? 0 : 1.2, delay: reduce ? 0 : 1.1, ease: "easeInOut" }}
                                />
                            </svg>
                            <p className="mt-1 border-t border-line-strong pt-1.5 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-3">{t("mo.sign.signedBy")}</p>
                        </motion.div>
                    )}
                </div>
            </div>
        </MomentFrame>
    )
}
