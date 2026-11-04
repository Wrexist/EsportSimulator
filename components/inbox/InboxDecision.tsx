"use client"

/**
 * Answer panels for the three decision kinds. Every button goes through the
 * store action that really applies the outcome, and every label states what
 * that action does (see describeChoice / the offer copy below).
 */

import Link from "next/link"
import { useState, type ReactNode } from "react"
import { useShallow } from "zustand/react/shallow"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { useGameStore } from "@/store/game-store"
import type { GameEventSaveData } from "@/engine/save-types"
import { formatCurrency, formatSignedCurrency } from "@/lib/utils-extended"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { choiceLabel, describeChoice, type ChoiceLike, type EffectChip, type InboxContext } from "./inbox-model"
import { getArchetype } from "@/engine/personality"
import { PERSONALITY_TUNING } from "@/lib/balance-tuning"
import { CLAUSE_TUNING } from "@/engine/contract-clauses"
import { useInboxDrawer } from "./inbox-drawer-store"
import { t, tn } from "@/lib/i18n"

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- event data shape varies by type
type AnyData = Record<string, any>

const MIN_WEEKS_BETWEEN_JOBS = 12

function Chips({ chips }: { chips: EffectChip[] }) {
    return (
        <span className="flex flex-wrap justify-end gap-x-2.5 gap-y-0.5">
            {chips.map((c, i) => (
                <span
                    key={i}
                    className={cn(
                        "text-xs font-semibold tabular-nums",
                        c.tone === "positive" ? "text-positive" : c.tone === "negative" ? "text-negative" : "text-ink-3",
                    )}
                >
                    {c.label}
                </span>
            ))}
        </span>
    )
}

function OptionButton({ label, chips, blockedReason, onClick, busy }: {
    label: ReactNode
    chips: EffectChip[]
    blockedReason?: string
    onClick: () => void
    busy?: boolean
}) {
    return (
        <Button
            variant="outline"
            onClick={onClick}
            disabled={!!blockedReason || busy}
            className="h-auto w-full items-start justify-between gap-4 whitespace-normal px-3.5 py-3 text-left"
        >
            <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-ink-1">{label}</span>
                {blockedReason && <span className="mt-0.5 block text-xs font-medium text-caution">{blockedReason}</span>}
            </span>
            <Chips chips={chips} />
        </Button>
    )
}

function Terms({ rows }: { rows: [string, ReactNode][] }) {
    return (
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 rounded-md border border-line bg-raised px-4 py-3 text-sm">
            {rows.map(([k, v]) => (
                <div key={k} className="contents">
                    <dt className="text-ink-3">{k}</dt>
                    <dd className="text-right font-semibold tabular-nums text-ink-1">{v}</dd>
                </div>
            ))}
        </dl>
    )
}

function SectionLabel({ children }: { children: ReactNode }) {
    return <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{children}</h4>
}

/** Event choices resolved through `resolveEventChoice`. */
export function ChoiceDecision({ event, budget }: { event: GameEventSaveData; budget: number }) {
    const resolveEventChoice = useGameStore(s => s.resolveEventChoice)
    const choices = ((event as { choices?: ChoiceLike[] }).choices ?? [])
    const data = (event.data ?? {}) as AnyData
    const isContract = event.type === "CONTRACT" && data.playerId

    const answer = (choice: ChoiceLike) => {
        resolveEventChoice(event.id, choice.id)
        const after = useGameStore.getState().eventsLog.find(e => e.id === event.id)
        if (after?.selectedChoiceId === choice.id) toast.success(t("ib.toast.decided", { choice: choiceLabel(choice) }))
    }

    return (
        <section className="space-y-2.5">
            <SectionLabel>{t("ib.yourAnswer")}</SectionLabel>
            {choices.map(choice => {
                const outcome = describeChoice(event, choice, budget)
                return (
                    <OptionButton
                        key={choice.id}
                        label={choiceLabel(choice)}
                        chips={outcome.chips}
                        blockedReason={outcome.blockedReason}
                        onClick={() => answer(choice)}
                    />
                )
            })}
            {isContract && (
                <p className="pt-1 text-xs leading-relaxed text-ink-3">
                    {t("ib.contractNote")}
                </p>
            )}
        </section>
    )
}

/** An AI club bidding for one of your players (`acceptTransferOffer` / reject). */
export function TransferOfferDecision({ event, ctx }: { event: GameEventSaveData; ctx: InboxContext }) {
    const { acceptTransferOffer, resolveEventChoice, player, playsThisWeek } = useGameStore(useShallow(s => {
        const data = (event.data ?? {}) as AnyData
        return {
            acceptTransferOffer: s.acceptTransferOffer,
            resolveEventChoice: s.resolveEventChoice,
            player: s.players.find(p => p.id === data.playerId),
            playsThisWeek: s.scheduledMatches.some(m =>
                m.week === s.currentWeek && !m.result && (m.homeTeamId === s.playerTeamId || m.awayTeamId === s.playerTeamId)),
        }
    }))
    const data = (event.data ?? {}) as AnyData
    const who = (data.playerId && ctx.playerName(String(data.playerId))) || data.playerName || t("ib.thePlayer")
    const fee = typeof data.offerAmount === "number" ? data.offerAmount : 0
    const acceptBlocked = !player?.forSale
        ? t("ib.bid.notListed")
        : playsThisWeek ? t("ib.bid.playsThisWeek") : undefined

    const sellOnFee = Math.round(fee * (1 - CLAUSE_TUNING.SELL_ON_FEE_CUT))
    const accept = (sellOn = false) => {
        acceptTransferOffer(event.id, { sellOn })
        const after = useGameStore.getState().eventsLog.find(e => e.id === event.id)
        if (after?.selectedChoiceId === "accept" || !useGameStore.getState().teams.find(tm => tm.id === ctx.playerTeamId)?.rosterIds.includes(String(data.playerId))) {
            toast.success(data.teamName ? t("ib.toast.sold", { name: who, club: data.teamName }) : t("ib.toast.soldAnon", { name: who }))
        }
    }
    const reject = () => {
        resolveEventChoice(event.id, "reject")
        if (useGameStore.getState().eventsLog.find(e => e.id === event.id)?.selectedChoiceId === "reject") toast.info(t("ib.toast.bidRejected", { name: who }))
    }

    return (
        <section className="space-y-3">
            <Terms rows={[
                [t("ib.bid.club"), data.teamName || t("ib.unknown")],
                [t("ib.bid.fee"), formatCurrency(fee, "$", false)],
                ...(typeof data.salaryPerWeek === "number" ? [[t("ib.bid.wage"), t("ib.perWeek", { amount: formatCurrency(data.salaryPerWeek, "$", false) })] as [string, ReactNode]] : []),
            ]} />
            <SectionLabel>{t("ib.yourAnswer")}</SectionLabel>
            <OptionButton
                label={t("ib.bid.accept")}
                chips={[{ label: formatSignedCurrency(fee, "$", false), tone: "positive" }, { label: t("ib.bid.leaves", { name: who }), tone: "negative" }]}
                blockedReason={acceptBlocked}
                onClick={() => accept()}
            />
            <OptionButton
                label={t("ib.bid.acceptSellOn", { pct: Math.round(CLAUSE_TUNING.SELL_ON_SHARE * 100) })}
                chips={[{ label: formatSignedCurrency(sellOnFee, "$", false), tone: "positive" }, { label: t("ib.bid.sellOnShare", { pct: Math.round(CLAUSE_TUNING.SELL_ON_SHARE * 100) }), tone: "positive" }, { label: t("ib.bid.leaves", { name: who }), tone: "negative" }]}
                blockedReason={acceptBlocked}
                onClick={() => accept(true)}
            />
            <OptionButton
                label={t("ib.bid.reject")}
                chips={[
                    { label: t("ib.bid.stays", { name: who }), tone: "neutral" },
                    ...(player && getArchetype(player) === "MERCENARY" ? [{ label: t("ib.fx.moraleWho", { n: PERSONALITY_TUNING.MERCENARY_BID_REJECT_MORALE, name: t("arch.MERCENARY.label") }), tone: "negative" as const }] : []),
                ]}
                onClick={reject}
            />
            <div className="flex flex-wrap gap-2 pt-1">
                {data.playerId && <DrawerLink href={`/player/${data.playerId}`}>{t("ib.viewWho", { name: who })}</DrawerLink>}
                <DrawerLink href="/transfers">{t("ib.link.transfers")}</DrawerLink>
            </div>
        </section>
    )
}

/** Another club wants you as manager (`JobOfferGenerator` via the events slice). */
export function JobOfferDecision({ event }: { event: GameEventSaveData }) {
    const router = useRouter()
    const close = useInboxDrawer(s => s.close)
    const { acceptJobOffer, declineJobOffer, negotiateJobOffer, currentWeek, lastJobChangeWeek, clubName, activeMatch } = useGameStore(useShallow(s => ({
        acceptJobOffer: s.acceptJobOffer,
        declineJobOffer: s.declineJobOffer,
        negotiateJobOffer: s.negotiateJobOffer,
        currentWeek: s.currentWeek,
        lastJobChangeWeek: s.managerDetails?.lastJobChangeWeek,
        clubName: s.teams.find(tm => tm.id === s.playerTeamId)?.name,
        activeMatch: !!s.activeMatchId,
    })))
    const [busy, setBusy] = useState(false)
    const data = (event.data ?? {}) as AnyData
    const team = data.offeringTeamName || t("ib.theClub")
    const salary = typeof data.salaryOffer === "number" ? data.salaryOffer : 0
    const signingFunds = salary * 4
    const patience = typeof data.negotiationPatience === "number" ? data.negotiationPatience : 0
    const weeksSinceMove = lastJobChangeWeek != null ? currentWeek - lastJobChangeWeek : Infinity
    const acceptBlocked = activeMatch
        ? t("ib.job.finishMatch")
        : weeksSinceMove < MIN_WEEKS_BETWEEN_JOBS
            ? tn("ib.job.tooSoon", MIN_WEEKS_BETWEEN_JOBS - weeksSinceMove, { weeks: MIN_WEEKS_BETWEEN_JOBS })
            : undefined

    const accept = () => {
        setBusy(true)
        const result = acceptJobOffer(event.id)
        if (result.success) {
            toast.success(result.message)
            close()
            router.push("/")
        } else {
            toast.error(result.message)
            setBusy(false)
        }
    }
    const negotiate = () => {
        const result = negotiateJobOffer(event.id)
        if (result.message) (result.success ? toast.success : toast.error)(result.message)
    }

    return (
        <section className="space-y-3">
            <Terms rows={[
                [t("ib.job.club"), team],
                ...(data.offeringTeamRegion ? [[t("ib.job.region"), data.offeringTeamRegion] as [string, ReactNode]] : []),
                ...(data.offeringTeamRank ? [[t("ib.job.rank"), `#${data.offeringTeamRank}`] as [string, ReactNode]] : []),
                [t("ib.job.funds"), formatCurrency(signingFunds, "$", false)],
            ]} />
            <SectionLabel>{t("ib.yourAnswer")}</SectionLabel>
            <OptionButton
                label={t("ib.job.join", { club: team })}
                chips={[
                    { label: t("ib.job.fromNextWeek"), tone: "neutral" },
                    { label: t("ib.job.toBudget", { amount: formatSignedCurrency(signingFunds, "$", false) }), tone: "positive" },
                ]}
                blockedReason={acceptBlocked}
                busy={busy}
                onClick={accept}
            />
            <OptionButton
                label={t("ib.job.negotiate")}
                chips={[
                    { label: t("ib.job.askMore"), tone: "neutral" },
                    { label: tn("ib.job.triesLeft", patience), tone: "neutral" },
                    { label: t("ib.job.mayWithdraw"), tone: "negative" },
                ]}
                blockedReason={patience <= 0 ? t("ib.job.noMoreTalks") : undefined}
                busy={busy}
                onClick={negotiate}
            />
            <OptionButton
                label={clubName ? t("ib.job.stayAt", { club: clubName }) : t("ib.job.stay")}
                chips={[{ label: t("ib.fx.chemistry", { n: "+5" }), tone: "positive" }]}
                busy={busy}
                onClick={() => {
                    declineJobOffer(event.id)
                    toast.info(t("ib.toast.turnedDown", { club: team }))
                }}
            />
        </section>
    )
}

/** A link inside the drawer that also closes it. */
export function DrawerLink({ href, children }: { href: string; children: ReactNode }) {
    const close = useInboxDrawer(s => s.close)
    return (
        <Button asChild variant="outline" size="sm">
            <Link href={href} onClick={close}>{children}</Link>
        </Button>
    )
}
