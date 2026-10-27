"use client"

import { useEffect } from "react"
import Image from "next/image"
import { motion } from "framer-motion"
import { useShallow } from "zustand/react/shallow"
import { draftCupOutcome } from "@/engine/draft-cup"
import type { LeagueTitleMoment, TitleMoment } from "@/engine/moments"
import { isMajorTournament, seasonOfWeek } from "@/engine/official-stats"
import { trophyArtFor, trophyKindForTournament, type TrophyArtKind } from "@/lib/trophy-art"
import { useGameStore } from "@/store/game-store"
import { fireConfetti } from "@/lib/confetti-lazy"
import { useAppReducedMotion } from "@/lib/reduced-motion"
import { formatCurrency } from "@/lib/utils-extended"
import { cn } from "@/lib/utils"
import { AnimatedNumber } from "@/components/ui/animated-number"
import { TierTag } from "@/src/components/ui/TierTag"
import { colors, tokens } from "@/src/design/tokens"
import { MomentFacts, MomentFrame, MomentOverline, MomentRule, useReveal, type MomentFact } from "./MomentFrame"
import { ShareMajorToDiscord } from "./ShareMajorToDiscord"

const EASE = [...tokens.motion.easeOutExpo] as [number, number, number, number]
// Trophy gold, white and win green: the v2 celebration palette (tokens).
const CONFETTI = [colors.gold.DEFAULT, colors.gold.hover, colors["ink-1"], colors.positive]

const money = (n: number) => formatCurrency(Math.round(n), "$", false)

/** Confetti scaled to the title: a 3.5 s barrage from both sides for a major, one burst otherwise. */
function useTitleConfetti(momentKey: string, scale: "major" | "minor") {
    const reduce = useAppReducedMotion()
    useEffect(() => {
        if (reduce) return
        if (scale === "minor") {
            const t = setTimeout(() => { void fireConfetti({ particleCount: 90, spread: 75, startVelocity: 38, origin: { y: 0.35 }, colors: CONFETTI, zIndex: 210 }) }, 450)
            return () => clearTimeout(t)
        }
        const end = Date.now() + 3500
        const defaults = { startVelocity: 32, spread: 70, ticks: 70, colors: CONFETTI, zIndex: 210 }
        const interval = setInterval(() => {
            const left = end - Date.now()
            if (left <= 0) { clearInterval(interval); return }
            const particleCount = Math.max(4, Math.round(26 * (left / 3500)))
            void fireConfetti({ ...defaults, particleCount, angle: 60, origin: { x: 0, y: 0.65 } })
            void fireConfetti({ ...defaults, particleCount, angle: 120, origin: { x: 1, y: 0.65 } })
        }, 260)
        return () => clearInterval(interval)
    }, [momentKey, scale, reduce])
}

/** The project's trophy art (lib/trophy-art): the major cup, the tier cups, the league shield. */
function TrophyArt({ kind, size, delay = 0 }: { kind: TrophyArtKind; size: "major" | "minor"; delay?: number }) {
    const reduce = useAppReducedMotion()
    const art = trophyArtFor(kind)
    const box = size === "major" ? "h-[min(34vh,300px)] w-[min(34vh,300px)]" : "h-[min(24vh,200px)] w-[min(24vh,200px)]"
    return (
        <motion.div
            initial={reduce ? false : { opacity: 0, y: 40, scale: 0.86 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: reduce ? 0 : 0.9, delay: reduce ? 0 : delay, ease: EASE }}
            className={cn("relative shrink-0", box)}
        >
            <Image src={art.src} alt={art.label} fill sizes="300px" className="object-contain drop-shadow-xl" priority />
        </motion.div>
    )
}

/** Tournament title: full-screen for every tier, scaled up for majors. */
export function TitleMomentView({ moment, onDismiss }: { moment: TitleMoment; onDismiss: () => void }) {
    const reveal = useReveal()
    const scale = moment.major ? "major" : "minor"
    useTitleConfetti(moment.key, scale)
    const { financeLedger, playerTeamId, draftCupScore, managerName, teamName } = useGameStore(useShallow(s => ({
        financeLedger: s.financeLedger, playerTeamId: s.playerTeamId,
        managerName: s.managerDetails?.name, teamName: s.teams.find(t => t.id === s.playerTeamId)?.name,
        // G7: a Draft Cup title shows the run score; the run ends here, so no prize or reputation follows.
        draftCupScore: s.draftCup?.tournamentId === moment.tournamentId ? draftCupOutcome(s as never)?.score ?? null : null,
    })))
    // The prize actually booked for this title, once the week tick has paid it.
    const booked = financeLedger.find(e => e.teamId === playerTeamId && e.type === "INCOME" && e.category === "PRIZE" && e.id.startsWith(`prize_${moment.tournamentId}_`))
    const prize = booked?.amount ?? moment.prize
    const prizeLabel = booked || !moment.prizeIsPool ? "Prize money" : "Prize pool"
    const prizeHint = booked || moment.prizeBooked ? "Paid to your club" : moment.prizeIsPool ? "Your share is paid when the week ends" : "Paid when the week ends"

    const facts: MomentFact[] = []
    if (draftCupScore != null) facts.push({ label: "Run score", value: <AnimatedNumber value={draftCupScore} animateOnMount duration={1400} format={n => String(Math.round(n))} />, hint: "The breakdown comes next" })
    else if (prize > 0) facts.push({ label: prizeLabel, value: <AnimatedNumber value={prize} animateOnMount duration={1400} format={money} />, hint: prizeHint })
    if (moment.repGain > 0 && draftCupScore == null) facts.push({ label: "Reputation", value: `+${moment.repGain}`, hint: moment.prizeBooked ? "Added" : "Added when the week ends" })
    if (moment.fanGain && draftCupScore == null) facts.push({ label: "New followers", value: `+${moment.fanGain.toLocaleString("en-US")}` })

    const headlineId = `moment-title-${moment.key}`
    // S-tier titles get the full-scale moment; only a Major is called one.
    const isMajor = isMajorTournament(moment.tournamentId)
    return (
        <MomentFrame momentKey={moment.key} labelledBy={headlineId} sound={moment.major ? "titleWinMajor" : "titleWin"} onDismiss={onDismiss}>
            <TrophyArt kind={trophyKindForTournament(moment.tier, { major: isMajor })} size={scale} />
            <motion.div {...reveal(0.35)} className="mt-8 flex items-center gap-3">
                <MomentOverline>{isMajor ? "Major champions" : "Champions"}</MomentOverline>
                <TierTag tier={moment.tier} />
            </motion.div>
            <motion.h2
                {...reveal(0.45, 22)}
                id={headlineId}
                className={cn("mt-3 max-w-5xl font-display font-extrabold uppercase leading-[0.86] text-ink-1", moment.major ? "text-[clamp(64px,8.5vw,128px)]" : "text-[clamp(52px,6.5vw,92px)]")}
            >
                {moment.tournamentName}
            </motion.h2>
            {moment.finalOpponentName && moment.finalScore && (
                <motion.p {...reveal(0.6)} className="mt-4 text-lg text-ink-2">
                    Beat <span className="font-semibold text-ink-1">{moment.finalOpponentName}</span>{" "}
                    <span className="font-display text-xl font-bold tabular-nums text-ink-1">{moment.finalScore.replace("-", "–")}</span>
                    {moment.finalStage ? <> in the {moment.finalStage.toLowerCase()}</> : null}
                </motion.p>
            )}
            <MomentRule className="mt-8" delay={0.55} />
            {facts.length > 0 && (
                <motion.div {...reveal(0.75)} className="mt-8 w-full max-w-3xl">
                    <MomentFacts facts={facts} />
                </motion.div>
            )}
            {isMajor && teamName && draftCupScore == null && (
                <ShareMajorToDiscord
                    delay={0.9}
                    share={{
                        managerName: managerName && managerName !== "Unknown" ? managerName : null,
                        teamName,
                        tournamentName: moment.tournamentName,
                        opponentName: moment.finalOpponentName ?? null,
                        finalScore: moment.finalScore ?? null,
                        season: seasonOfWeek(moment.week),
                    }}
                />
            )}
        </MomentFrame>
    )
}

/** Regional league division title. */
export function LeagueTitleMomentView({ moment, onDismiss }: { moment: LeagueTitleMoment; onDismiss: () => void }) {
    const reveal = useReveal()
    useTitleConfetti(moment.key, "minor")
    const facts: MomentFact[] = [
        { label: "Record", value: `${moment.wins}–${moment.losses}`, hint: `${moment.points} points` },
    ]
    if (moment.prize > 0) facts.push({ label: "Prize money", value: <AnimatedNumber value={moment.prize} animateOnMount duration={1200} format={money} />, hint: "Paid to your club" })
    if (moment.repGain > 0) facts.push({ label: "Reputation", value: `+${moment.repGain}` })
    const headlineId = `moment-league-${moment.key}`
    return (
        <MomentFrame momentKey={moment.key} labelledBy={headlineId} sound="titleWin" onDismiss={onDismiss}>
            <TrophyArt kind="league" size="minor" />
            <motion.div {...reveal(0.35)} className="mt-8">
                <MomentOverline>Division champions</MomentOverline>
            </motion.div>
            <motion.h2 {...reveal(0.45, 22)} id={headlineId} className="mt-3 font-display text-[clamp(52px,6.5vw,96px)] font-extrabold uppercase leading-[0.86] text-ink-1">
                {moment.divisionName}
            </motion.h2>
            <motion.p {...reveal(0.6)} className="mt-4 text-lg text-ink-2">
                Season {moment.season} · Split {moment.split}
                {moment.trophy && <> · <span className="font-semibold text-gold">Added to your trophy cabinet</span></>}
            </motion.p>
            <MomentRule className="mt-8" delay={0.55} />
            <motion.div {...reveal(0.75)} className="mt-8 w-full max-w-3xl">
                <MomentFacts facts={facts} />
            </motion.div>
        </MomentFrame>
    )
}
