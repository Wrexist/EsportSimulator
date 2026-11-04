"use client"

import Image from "next/image"
import { motion } from "framer-motion"
import { ArrowDown, ArrowUp } from "lucide-react"
import type { TierMoveMoment } from "@/engine/moments"
import { trophyArtFor, trophyKindForTournament, type TrophyArtKind } from "@/lib/trophy-art"
import { formatCurrency } from "@/lib/utils-extended"
import { cn } from "@/lib/utils"
import { t } from "@/lib/i18n"
import { divisionName } from "@/lib/display-names"
import { MomentFacts, MomentFrame, MomentOverline, MomentRule, useReveal, type MomentFact } from "./MomentFrame"

const money = (n: number) => formatCurrency(Math.round(n), "$", false)

/** A stored rank band ("11-30", "below #60") as display text. */
function bandText(band: string): string {
    const below = /^below #?(\d+)$/.exec(band)
    if (below) return t("mo.bandBelow", { rank: below[1] })
    return `#${band.replace("-", "–#")}`
}

/** World-tier label ("S-Tier") to its tier cup; division labels have none. */
const tierKind = (label: string): TrophyArtKind | null => {
    const m = /^([SABC])-tier$/i.exec(label.trim())
    return m ? trophyKindForTournament(m[1]) : null
}

/** What a promotion puts within reach, drawn small beside its line (lib/trophy-art). */
function StakeArt({ kind }: { kind: TrophyArtKind }) {
    const art = trophyArtFor(kind)
    return <Image src={art.src} alt="" width={44} height={44} className="h-11 w-11 shrink-0 object-contain" />
}

function Change({ from, to, unit }: { from: number; to: number; unit?: string }) {
    const up = to > from
    return (
        <span className="inline-flex items-baseline gap-2">
            <span>{money(to)}</span>
            {unit && <span className="text-base font-semibold text-ink-3">{unit}</span>}
            <span className={cn("text-base font-semibold", up ? "text-positive" : "text-negative")}>{up ? "+" : "−"}{money(Math.abs(to - from))}</span>
        </span>
    )
}

/**
 * Promotion or relegation: the new tier, then only what really changes with
 * it (the next division's league payment and prize pool, or the world tier's
 * rank band and the league-entry events it gates).
 */
export function TierMoveMomentView({ moment, onDismiss }: { moment: TierMoveMoment; onDismiss: () => void }) {
    const reveal = useReveal()
    const up = moment.kind === "promotion"
    const tone = up ? "positive" : "negative"
    const Arrow = up ? ArrowUp : ArrowDown

    const facts: MomentFact[] = []
    if (moment.scope === "division") {
        if (moment.centralPayment) facts.push({ label: t("mo.leaguePayment"), value: <Change from={moment.centralPayment.from} to={moment.centralPayment.to} unit={t("mo.perWeek")} />, hint: t("mo.wasPerWeek", { amount: money(moment.centralPayment.from) }) })
        if (moment.prizePool) facts.push({ label: t("mo.splitPrizePool"), value: <Change from={moment.prizePool.from} to={moment.prizePool.to} />, hint: t("mo.was", { amount: money(moment.prizePool.from) }) })
    } else {
        if (moment.worldRank) facts.push({ label: t("mo.seasonFinish"), value: `#${moment.worldRank}`, hint: t("mo.worldRanking") })
        if (moment.band) facts.push({ label: t("mo.band", { tier: moment.toLabel }), value: bandText(moment.band), hint: t("mo.worldRanks") })
    }

    const now = moment.eligibleNow ?? []
    const lost = moment.eligibleLost ?? []
    const headlineId = `moment-tier-${moment.key}`
    const when = moment.scope === "division"
        ? (moment.split ? t("mo.whenSplit", { season: moment.season, split: moment.split }) : t("mo.whenSeason", { season: moment.season }))
        : t("mo.whenWorld", { season: moment.season })
    const fromLabel = divisionName(moment.fromLabel)
    const toLabel = divisionName(moment.toLabel)

    return (
        <MomentFrame momentKey={moment.key} labelledBy={headlineId} sound={up ? "promotion" : "relegation"} tone={tone} onDismiss={onDismiss}>
            <motion.div {...reveal(0.05)}>
                <MomentOverline tone={tone}>{when}</MomentOverline>
            </motion.div>
            <motion.h2 {...reveal(0.15, 26)} id={headlineId} className={cn("mt-4 font-display text-[clamp(80px,11vw,168px)] font-extrabold uppercase leading-[0.82]", up ? "text-positive" : "text-negative")}>
                {up ? t("mo.promoted") : t("mo.relegated")}
            </motion.h2>
            <motion.div {...reveal(0.4)} className="mt-6 flex items-center gap-5 font-display font-bold uppercase leading-none">
                <span className="text-[clamp(24px,2.6vw,36px)] text-ink-3">{fromLabel}</span>
                <Arrow className={cn("h-8 w-8", up ? "text-positive" : "text-negative")} aria-label={up ? t("mo.upTo") : t("mo.downTo")} />
                <span className="text-[clamp(30px,3.4vw,48px)] text-ink-1">{toLabel}</span>
            </motion.div>
            <MomentRule tone={tone} className="mt-8" delay={0.45} />
            {facts.length > 0 && (
                <motion.div {...reveal(0.65)} className="mt-8 w-full max-w-3xl">
                    <MomentFacts facts={facts} />
                </motion.div>
            )}
            {(moment.topDivision || now.length > 0 || lost.length > 0) && (
                <motion.ul {...reveal(0.8)} className="mt-6 w-full max-w-3xl space-y-2 text-left text-sm text-ink-2">
                    {moment.topDivision && <li className="flex items-center gap-3"><StakeArt kind="league" />{t("mo.topDivision")}</li>}
                    {now.length > 0 && <li className="flex items-center gap-3">{up && tierKind(moment.toLabel) ? <StakeArt kind={tierKind(moment.toLabel)!} /> : <span aria-hidden="true" className="w-11 shrink-0 text-center text-positive">—</span>}<span>{t("mo.eligibleNow", { tier: toLabel })} <span className="text-ink-1">{now.join(", ")}</span></span></li>}
                    {lost.length > 0 && <li className="flex items-center gap-3"><span aria-hidden="true" className="w-11 shrink-0 text-center text-negative">—</span><span>{t("mo.eligibleLost", { tier: fromLabel })} <span className="text-ink-1">{lost.join(", ")}</span></span></li>}
                </motion.ul>
            )}
        </MomentFrame>
    )
}
