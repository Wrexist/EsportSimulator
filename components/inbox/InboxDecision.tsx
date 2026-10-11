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
import { useInboxDrawer } from "./inbox-drawer-store"

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
        if (after?.selectedChoiceId === choice.id) toast.success(`Decision made: ${choiceLabel(choice)}`)
    }

    return (
        <section className="space-y-2.5">
            <SectionLabel>Your answer</SectionLabel>
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
                    These replies only change morale and loyalty. To extend the deal, offer new terms on the player&apos;s page.
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
    const who = (data.playerId && ctx.playerName(String(data.playerId))) || data.playerName || "The player"
    const fee = typeof data.offerAmount === "number" ? data.offerAmount : 0
    const acceptBlocked = !player?.forSale
        ? "No longer on the transfer list"
        : playsThisWeek ? "You play this week — the roster must stay intact" : undefined

    const accept = () => {
        acceptTransferOffer(event.id)
        const after = useGameStore.getState().eventsLog.find(e => e.id === event.id)
        if (after?.selectedChoiceId === "accept" || !useGameStore.getState().teams.find(t => t.id === ctx.playerTeamId)?.rosterIds.includes(String(data.playerId))) {
            toast.success(`${who} sold to ${data.teamName || "the bidding club"}`)
        }
    }
    const reject = () => {
        resolveEventChoice(event.id, "reject")
        if (useGameStore.getState().eventsLog.find(e => e.id === event.id)?.selectedChoiceId === "reject") toast.info(`Bid for ${who} rejected`)
    }

    return (
        <section className="space-y-3">
            <Terms rows={[
                ["Bidding club", data.teamName || "Unknown"],
                ["Fee", formatCurrency(fee, "$", false)],
                ...(typeof data.salaryPerWeek === "number" ? [["Their wage offer", `${formatCurrency(data.salaryPerWeek, "$", false)}/wk`] as [string, ReactNode]] : []),
            ]} />
            <SectionLabel>Your answer</SectionLabel>
            <OptionButton
                label="Accept the bid"
                chips={[{ label: formatSignedCurrency(fee, "$", false), tone: "positive" }, { label: `${who} leaves`, tone: "negative" }]}
                blockedReason={acceptBlocked}
                onClick={accept}
            />
            <OptionButton
                label="Reject"
                chips={[
                    { label: `${who} stays`, tone: "neutral" },
                    ...(player && getArchetype(player) === "MERCENARY" ? [{ label: `${PERSONALITY_TUNING.MERCENARY_BID_REJECT_MORALE} morale (Mercenary)`, tone: "negative" as const }] : []),
                ]}
                onClick={reject}
            />
            <div className="flex flex-wrap gap-2 pt-1">
                {data.playerId && <DrawerLink href={`/player/${data.playerId}`}>View {who}</DrawerLink>}
                <DrawerLink href="/transfers">Transfer market</DrawerLink>
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
        clubName: s.teams.find(t => t.id === s.playerTeamId)?.name,
        activeMatch: !!s.activeMatchId,
    })))
    const [busy, setBusy] = useState(false)
    const data = (event.data ?? {}) as AnyData
    const team = data.offeringTeamName || "The club"
    const salary = typeof data.salaryOffer === "number" ? data.salaryOffer : 0
    const signingFunds = salary * 4
    const patience = typeof data.negotiationPatience === "number" ? data.negotiationPatience : 0
    const weeksSinceMove = lastJobChangeWeek != null ? currentWeek - lastJobChangeWeek : Infinity
    const acceptBlocked = activeMatch
        ? "Finish the active match first"
        : weeksSinceMove < MIN_WEEKS_BETWEEN_JOBS
            ? `Spend ${MIN_WEEKS_BETWEEN_JOBS} weeks at your club before moving (${MIN_WEEKS_BETWEEN_JOBS - weeksSinceMove} to go)`
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
                ["Club", team],
                ...(data.offeringTeamRegion ? [["Region", data.offeringTeamRegion] as [string, ReactNode]] : []),
                ...(data.offeringTeamRank ? [["World rank", `#${data.offeringTeamRank}`] as [string, ReactNode]] : []),
                ["Signing funds for the club", formatCurrency(signingFunds, "$", false)],
            ]} />
            <SectionLabel>Your answer</SectionLabel>
            <OptionButton
                label={`Join ${team}`}
                chips={[
                    { label: "You manage them from next week", tone: "neutral" },
                    { label: `${formatSignedCurrency(signingFunds, "$", false)} to their budget`, tone: "positive" },
                ]}
                blockedReason={acceptBlocked}
                busy={busy}
                onClick={accept}
            />
            <OptionButton
                label="Negotiate"
                chips={[
                    { label: "Ask for 5–15% more", tone: "neutral" },
                    { label: `${patience} ${patience === 1 ? "try" : "tries"} left`, tone: "neutral" },
                    { label: "They may withdraw", tone: "negative" },
                ]}
                blockedReason={patience <= 0 ? "They won't negotiate further" : undefined}
                busy={busy}
                onClick={negotiate}
            />
            <OptionButton
                label={`Stay at ${clubName || "your club"}`}
                chips={[{ label: "+5 chemistry", tone: "positive" }]}
                busy={busy}
                onClick={() => {
                    declineJobOffer(event.id)
                    toast.info(`You turned down ${team}`)
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
