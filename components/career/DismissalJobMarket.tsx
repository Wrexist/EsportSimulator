"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import { Button } from "@/components/ui/button"
import { Panel } from "@/src/components/ui/Panel"
import { formatCurrency } from "@/lib/utils-extended"

/**
 * Career-over screen with the job market (Phase 4.4): a dismissed manager
 * (sacked, or the club folded) can take an offer from another club and keep
 * the career going instead of the old "Load save / Main menu" dead end.
 * Offers are the engine's dismissal offers (JobOfferGenerator.createDismissalOffers).
 */
export function DismissalJobMarket() {
    const router = useRouter()
    const { gameOverReason, gameOverWeek, currentWeek, playerTeamId, teams, eventsLog, acceptJobOffer } = useGameStore(useShallow(s => ({
        gameOverReason: s.gameOverReason,
        gameOverWeek: s.gameOverWeek,
        currentWeek: s.currentWeek,
        playerTeamId: s.playerTeamId,
        teams: s.teams,
        eventsLog: s.eventsLog,
        acceptJobOffer: s.acceptJobOffer,
    })))
    const [error, setError] = useState<string | null>(null)
    const team = teams.find(t => t.id === playerTeamId)
    const isSacked = gameOverReason === "SACKED"
    const weeksPlayed = gameOverWeek ?? currentWeek
    const offers = eventsLog
        .filter(e => e.type === "JOB_OFFER" && e.data?.afterDismissal && !e.selectedChoiceId && !e.data?.isWithdrawn)
        .sort((a, b) => Number(a.data.offeringTeamRank ?? 999) - Number(b.data.offeringTeamRank ?? 999))

    const take = (id: string) => {
        const result = acceptJobOffer(id)
        if (result.success) router.push("/")
        else setError(result.message)
    }

    return (
        <div className="flex min-h-[75vh] items-center justify-center">
            <Panel className="w-full max-w-xl rounded-[10px] border-line-strong" padded={false}>
                <div className="space-y-2 p-6">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-negative">{offers.length ? "Between clubs" : "Career over"}</p>
                    <h1 className="font-display text-4xl font-bold uppercase leading-none text-ink-1">
                        {isSacked ? "Relieved of duty" : "Organization dissolved"}
                    </h1>
                    <p className="text-sm text-ink-2">
                        {isSacked
                            ? `${team?.name ?? "Your club"} has terminated your contract after a final warning from the board.`
                            : `After 8 consecutive weeks of insolvency, ${team?.name ?? "your team"} has been forced to disband.`}
                        {" "}Seasons managed: {Math.floor((weeksPlayed - 1) / 52) + 1}. Trophies: {team?.trophies?.length ?? 0}.
                    </p>
                </div>
                {offers.length > 0 && (
                    <div className="border-t border-line">
                        <p className="px-6 pt-4 text-sm font-semibold text-ink-1">Clubs that want you</p>
                        <ul className="divide-y divide-line">
                            {offers.map(offer => (
                                <li key={offer.id} className="flex items-center justify-between gap-4 px-6 py-3">
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold text-ink-1">{String(offer.data.offeringTeamName)}</p>
                                        <p className="text-xs text-ink-3">
                                            World #{String(offer.data.offeringTeamRank ?? "—")} · {String(offer.data.offeringTeamRegion ?? "")} · {formatCurrency(Number(offer.data.salaryOffer ?? 0))}/wk
                                        </p>
                                    </div>
                                    <Button size="sm" onClick={() => take(offer.id)}>Accept</Button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                {error && <p className="px-6 pt-3 text-sm text-negative" role="alert">{error}</p>}
                <div className="flex justify-end gap-2 p-6">
                    <Button variant="outline" onClick={() => router.push("/load-game")}>Load save</Button>
                    <Button variant={offers.length ? "outline" : "default"} onClick={() => router.push("/main-menu")}>Main menu</Button>
                </div>
            </Panel>
        </div>
    )
}
