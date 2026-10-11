"use client"

import Image from "next/image"
import { motion } from "framer-motion"
import { ArrowDown, ArrowUp } from "lucide-react"
import type { TierMoveMoment } from "@/engine/moments"
import { trophyArtFor, trophyKindForTournament, type TrophyArtKind } from "@/lib/trophy-art"
import { formatCurrency } from "@/lib/utils-extended"
import { cn } from "@/lib/utils"
import { MomentFacts, MomentFrame, MomentOverline, MomentRule, useReveal, type MomentFact } from "./MomentFrame"

const money = (n: number) => formatCurrency(Math.round(n), "$", false)

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
        if (moment.centralPayment) facts.push({ label: "League payment", value: <Change from={moment.centralPayment.from} to={moment.centralPayment.to} unit="/wk" />, hint: `Was ${money(moment.centralPayment.from)} a week · from the next split` })
        if (moment.prizePool) facts.push({ label: "Split prize pool", value: <Change from={moment.prizePool.from} to={moment.prizePool.to} />, hint: `Was ${money(moment.prizePool.from)}` })
    } else {
        if (moment.worldRank) facts.push({ label: "Season finish", value: `#${moment.worldRank}`, hint: "World ranking" })
        if (moment.band) facts.push({ label: `${moment.toLabel} band`, value: moment.band.startsWith("below") ? moment.band : `#${moment.band.replace("-", "–#")}`, hint: "World ranks" })
    }

    const now = moment.eligibleNow ?? []
    const lost = moment.eligibleLost ?? []
    const headlineId = `moment-tier-${moment.key}`
    const when = moment.scope === "division" ? `Season ${moment.season}${moment.split ? ` · Split ${moment.split}` : ""} final table` : `Season ${moment.season} final world ranking`

    return (
        <MomentFrame momentKey={moment.key} labelledBy={headlineId} sound={up ? "promotion" : "relegation"} tone={tone} onDismiss={onDismiss}>
            <motion.div {...reveal(0.05)}>
                <MomentOverline tone={tone}>{when}</MomentOverline>
            </motion.div>
            <motion.h2 {...reveal(0.15, 26)} id={headlineId} className={cn("mt-4 font-display text-[clamp(80px,11vw,168px)] font-extrabold uppercase leading-[0.82]", up ? "text-positive" : "text-negative")}>
                {up ? "Promoted" : "Relegated"}
            </motion.h2>
            <motion.div {...reveal(0.4)} className="mt-6 flex items-center gap-5 font-display font-bold uppercase leading-none">
                <span className="text-[clamp(24px,2.6vw,36px)] text-ink-3">{moment.fromLabel}</span>
                <Arrow className={cn("h-8 w-8", up ? "text-positive" : "text-negative")} aria-label={up ? "up to" : "down to"} />
                <span className="text-[clamp(30px,3.4vw,48px)] text-ink-1">{moment.toLabel}</span>
            </motion.div>
            <MomentRule tone={tone} className="mt-8" delay={0.45} />
            {facts.length > 0 && (
                <motion.div {...reveal(0.65)} className="mt-8 w-full max-w-3xl">
                    <MomentFacts facts={facts} />
                </motion.div>
            )}
            {(moment.topDivision || now.length > 0 || lost.length > 0) && (
                <motion.ul {...reveal(0.8)} className="mt-6 w-full max-w-3xl space-y-2 text-left text-sm text-ink-2">
                    {moment.topDivision && <li className="flex items-center gap-3"><StakeArt kind="league" />The Division 1 champion lifts this trophy for the cabinet.</li>}
                    {now.length > 0 && <li className="flex items-center gap-3">{up && tierKind(moment.toLabel) ? <StakeArt kind={tierKind(moment.toLabel)!} /> : <span aria-hidden="true" className="w-11 shrink-0 text-center text-positive">—</span>}<span>Now eligible ({moment.toLabel} entry): <span className="text-ink-1">{now.join(", ")}</span></span></li>}
                    {lost.length > 0 && <li className="flex items-center gap-3"><span aria-hidden="true" className="w-11 shrink-0 text-center text-negative">—</span><span>No longer eligible ({moment.fromLabel} entry): <span className="text-ink-1">{lost.join(", ")}</span></span></li>}
                </motion.ul>
            )}
        </MomentFrame>
    )
}
