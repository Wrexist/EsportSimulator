"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import type { GameEventSaveData, PlayerSaveData, TeamSaveData } from "@/engine/save-types"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { deriveExpectationTier, getTierTargets, rankTargetFor } from "@/engine/board-expectations"
import { getTierStyle, type TierLevel } from "@/engine/tier-system"
import { Button } from "@/components/ui/button"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { TeamLink } from "@/components/ui/EntityLink"
import { Panel } from "@/src/components/ui/Panel"
import { RatingChip } from "@/src/components/ui/RatingChip"
import { formatCurrency } from "@/lib/utils-extended"

/**
 * Between clubs (Phase 4.4, G9): the job market after a dismissal (sacked,
 * or the club folded) or at the start of a career begun without a club.
 * Offers are the engine's between-clubs offers (JobOfferGenerator); taking
 * one continues the career there. While between clubs every management
 * screen shows this (GameShell), since there is no club to run.
 */
export function DismissalJobMarket({ blockedRoute = false }: { blockedRoute?: boolean }) {
    const router = useRouter()
    const s = useGameStore(useShallow(st => ({
        gameOverReason: st.gameOverReason,
        currentWeek: st.currentWeek,
        playerTeamId: st.playerTeamId,
        teams: st.teams,
        players: st.players,
        eventsLog: st.eventsLog,
        league: st.league,
        managerDetails: st.managerDetails,
        acceptJobOffer: st.acceptJobOffer,
        declineJobOffer: st.declineJobOffer,
        negotiateJobOffer: st.negotiateJobOffer,
        findMoreJobOffers: st.findMoreJobOffers,
    })))
    const [error, setError] = useState<string | null>(null)
    const [note, setNote] = useState<string | null>(null)
    const [confirming, setConfirming] = useState<string | null>(null)
    const [noneLeft, setNoneLeft] = useState(false)
    const team = s.teams.find(t => t.id === s.playerTeamId)
    const firstJob = s.gameOverReason === "UNEMPLOYED"
    const isSacked = s.gameOverReason === "SACKED"
    const offers = s.eventsLog
        .filter(e => e.type === "JOB_OFFER" && e.data?.afterDismissal && !e.selectedChoiceId && !e.data?.isWithdrawn && Number(e.data.deadlineWeek) >= s.currentWeek)
        .sort((a, b) => Number(a.data.offeringTeamRank ?? 999) - Number(b.data.offeringTeamRank ?? 999))
    const playerById = useMemo(() => new Map(s.players.map(p => [p.id, p])), [s.players])

    // Career so far (a first job has none).
    const stints = s.managerDetails?.stints ?? []
    const record = stints.reduce((r, st) => ({ m: r.m + st.matches, w: r.w + st.wins, l: r.l + st.losses, t: r.t + st.trophies }), { m: 0, w: 0, l: 0, t: 0 })
    const lastStint = stints[stints.length - 1]
    const weeksAtClub = lastStint ? Math.max(1, (lastStint.toWeek ?? s.currentWeek) - lastStint.fromWeek + 1) : 0

    const run = (fn: () => void) => { setError(null); setNote(null); fn() }
    const take = (offer: GameEventSaveData) => run(() => {
        const result = s.acceptJobOffer(offer.id)
        if (result.success) router.push("/")
        else setError(result.message)
    })
    const decline = (offer: GameEventSaveData) => run(() => { s.declineJobOffer(offer.id); setConfirming(null) })
    const negotiate = (offer: GameEventSaveData) => run(() => {
        const result = s.negotiateJobOffer(offer.id)
        if (result.success) setNote(result.message)
        else setError(result.message)
    })
    const more = () => run(() => {
        const added = s.findMoreJobOffers()
        if (added === 0) setNoneLeft(true)
        else setNote(`${added} more ${added === 1 ? "club wants" : "clubs want"} to talk.`)
    })

    const eyebrow = firstJob ? "Looking for work" : "Between clubs"
    const title = firstJob ? "Pick your first club" : isSacked ? "Relieved of duty" : "Organization dissolved"

    return (
        <div className="flex min-h-[75vh] items-start justify-center py-6">
            <Panel className="w-full max-w-3xl rounded-[10px] border-line-strong" padded={false}>
                <div className="space-y-2 p-6">
                    <p className={firstJob ? "text-[11px] font-semibold uppercase tracking-[0.08em] text-gold" : "text-[11px] font-semibold uppercase tracking-[0.08em] text-negative"}>{eyebrow}</p>
                    <h1 className="font-display text-4xl font-bold uppercase leading-none text-ink-1">{title}</h1>
                    {firstJob ? (
                        <p className="text-sm text-ink-2">
                            No club and no record yet. These clubs will take a chance on a new manager. Win with one and bigger clubs will start calling.
                        </p>
                    ) : (
                        <p className="text-sm text-ink-2">
                            {isSacked
                                ? `${team?.name ?? "Your club"} ended your contract after a final warning from the board.`
                                : `After 8 weeks in the red, ${team?.name ?? "your club"} has been forced to disband.`}
                            {lastStint && ` You were there ${weeksAtClub} ${weeksAtClub === 1 ? "week" : "weeks"}.`}
                        </p>
                    )}
                    {!firstJob && record.m > 0 && (
                        <p className="text-xs text-ink-3">
                            Career: {stints.length} {stints.length === 1 ? "club" : "clubs"} · {record.w}–{record.l} in official matches · {record.t} {record.t === 1 ? "trophy" : "trophies"}
                        </p>
                    )}
                    {blockedRoute && <p className="text-xs text-ink-3">That screen opens once you have a club again.</p>}
                </div>

                {offers.length > 0 && (
                    <div className="border-t border-line">
                        <p className="px-6 pt-4 text-sm font-semibold text-ink-1">{firstJob ? "Offers on the table" : "Clubs that want you"}</p>
                        <ul className="divide-y divide-line">
                            {offers.map(offer => {
                                const club = s.teams.find(t => t.id === offer.data.offeringTeamId)
                                const division = club ? s.league?.current?.divisions.find(d => d.teamIds.includes(club.id))?.name : undefined
                                return (
                                    <OfferRow
                                        key={offer.id} offer={offer} club={club} division={division} lookup={id => playerById.get(id)} currentWeek={s.currentWeek}
                                        confirming={confirming === offer.id}
                                        onAccept={() => (confirming === offer.id ? take(offer) : setConfirming(offer.id))}
                                        onCancel={() => setConfirming(null)}
                                        onDecline={() => decline(offer)}
                                        onNegotiate={() => negotiate(offer)}
                                    />
                                )
                            })}
                        </ul>
                    </div>
                )}

                {offers.length < 3 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-4">
                        <p className="text-sm text-ink-2">
                            {noneLeft
                                ? "No other club is hiring right now."
                                : offers.length ? "Turned some down? Your agent can ask around." : "Every offer is gone. Your agent can ask around."}
                        </p>
                        <Button variant="outline" size="sm" disabled={noneLeft} onClick={more}>Find more offers</Button>
                    </div>
                )}

                {(error || note) && <p className={`px-6 pt-3 text-sm ${error ? "text-negative" : "text-ink-2"}`} role={error ? "alert" : "status"}>{error ?? note}</p>}
                <div className="flex justify-end gap-2 p-6">
                    <Button variant="outline" onClick={() => router.push("/load-game")}>Load save</Button>
                    <Button variant="outline" onClick={() => router.push("/main-menu")}>Main menu</Button>
                </div>
            </Panel>
        </div>
    )
}

function squadRating(club: TeamSaveData, lookup: (id: string) => PlayerSaveData | undefined, week: number): number | null {
    const five = club.rosterIds.map(lookup).filter((p): p is PlayerSaveData => !!p && !p.isRetired).slice(0, 5)
    if (!five.length) return null
    return five.reduce((n, p) => n + evaluatePlayer(p, undefined, undefined, week).overallRating, 0) / five.length
}

function OfferRow({ offer, club, division, lookup, currentWeek, confirming, onAccept, onCancel, onDecline, onNegotiate }: {
    offer: GameEventSaveData
    club: TeamSaveData | undefined
    /** League division the club plays in, when it has one. */
    division?: string
    lookup: (id: string) => PlayerSaveData | undefined
    currentWeek: number
    confirming: boolean
    onAccept: () => void
    onCancel: () => void
    onDecline: () => void
    onNegotiate: () => void
}) {
    const rank = Number(offer.data.offeringTeamRank ?? club?.worldRanking ?? 0)
    const wage = Number(offer.data.salaryOffer ?? 0)
    const ovr = club ? squadRating(club, lookup, currentWeek) : null
    const tier = division ?? (club ? getTierStyle(club.tier as TierLevel).label : null)
    const goal = club ? getTierTargets(deriveExpectationTier(rank || 30, club.reputation)) : null
    const rankTarget = club ? rankTargetFor(rank || 30, club.reputation) : 0
    const canNegotiate = Number(offer.data.negotiationPatience ?? 0) > 0
    return (
        <li className="px-6 py-4">
            <div className="flex items-start gap-4">
                {club && <TeamLogoDisplay team={club} size={40} />}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <TeamLink id={club?.id} className="truncate font-semibold text-ink-1">{String(offer.data.offeringTeamName)}</TeamLink>
                        {ovr !== null && <RatingChip value={ovr} size="sm" title="Average overall of the starting five" />}
                    </div>
                    <p className="text-xs text-ink-3">
                        World #{rank || "—"} · {String(offer.data.offeringTeamRegion ?? club?.region ?? "")}{tier ? ` · ${tier}` : ""}{club ? ` · budget ${formatCurrency(club.budget)}` : ""}
                    </p>
                    {goal && (
                        <p className="mt-1 text-xs text-ink-2">
                            Board: {goal.label}{rankTarget > 0 ? `, finish the season in the world top ${rankTarget}` : ""}.
                        </p>
                    )}
                    <p className="mt-1 text-xs text-ink-2">
                        Wage {formatCurrency(wage)}/wk · signing funds for the club {formatCurrency(wage * 4)}
                    </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {confirming ? (
                        <>
                            <p className="text-xs text-ink-2">Take this job?</p>
                            <div className="flex gap-1.5">
                                <Button size="sm" variant="outline" onClick={onCancel}>Not yet</Button>
                                <Button size="sm" onClick={onAccept}>Sign</Button>
                            </div>
                        </>
                    ) : (
                        <>
                            <Button size="sm" onClick={onAccept}>Accept</Button>
                            <div className="flex gap-1.5">
                                <Button size="sm" variant="ghost" disabled={!canNegotiate} onClick={onNegotiate} title={canNegotiate ? "Ask for a higher wage. Push too hard and they may walk away." : "They will not negotiate further."}>Ask for more</Button>
                                <Button size="sm" variant="ghost" onClick={onDecline}>Decline</Button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </li>
    )
}
