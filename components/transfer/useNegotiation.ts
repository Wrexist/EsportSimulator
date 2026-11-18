"use client"
import { intlLocale, t, tn } from "@/lib/i18n"

/**
 * Player-signing negotiation state + rules, shared by the docked deal panel
 * (Transfers / Scouting) and the NegotiationModal (player profile, desktop
 * market). The acceptance rules are unchanged from the original modal: a
 * deterministic per-week hidden asking price, accepted within 3%.
 *
 * `feeChance` / `wageChance` are honest probabilities over that hidden price:
 * the club's floor is uniform in [0.90, 1.10] x market value and the player's
 * in [0.90, 1.20] x base wage, so an offer's chance is where it sits in that
 * band. They change no outcome.
 *
 * Phase 5.2: the player's archetype scales the wage he asks and the length
 * he wants (engine/personality.ts, the same factor recruitmentSalary uses for
 * every club); `personalityLines` states it on the negotiation screen.
 *
 * The race (engine/transfer-hype.ts): every AI club in for an Icon, Star or
 * Wonderkid this week raises a selling club's hidden price by 3% (up to 12%). The
 * rivals beaten to the signature are carried into the signing reveal.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import { negotiationBaseWage } from "@/engine/recruitment"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { SeededRNG } from "@/engine/rng"
import { getBoardSanctionedFee } from "@/engine/board-expectations"
import { quotePlayerSigning } from "@/engine/finance-forecast"
import { contractDemandLines, contractLengthFactor, getArchetype } from "@/engine/personality"
import { formatCurrency } from "@/lib/utils-extended"
import { clauseFields, NO_CLAUSES, wageWithClauses, type ClauseTerms } from "@/engine/contract-clauses"
import {
    ACCEPT_WITHIN, bandChance, chanceWithCounter, clampFeeOffer, counterOffer, durationWageFactor, FEE_BAND, feeCounterOffer, feeOfferBlock, initialFeeOffer, maxFeeOffer,
    wageChance as wageChanceFor, wageRange as wageRangeFor, wageThreshold,
} from "./negotiation-rules"
import { rivalFeePremium, rivalInterest } from "@/engine/transfer-hype"
import { strategicRefusalEndsWeek, strategicRefusalWeek } from "@/engine/roster-rules"
import type { SigningSignature } from "@/engine/moments"

export type NegotiationStage = "BUYOUT" | "CONTRACT" | "SIGN" | "SUCCESS" | "FAILED"

/** Terms the player agreed to, waiting for the manager's signature. */
export interface PendingDeal {
    salary: number
    duration: number
    fee: number
    clauses: ClauseTerms
}

export const MAX_NEGOTIATION_SALARY = 10_000_000
export const MIN_CONTRACT_WEEKS = 12
export const MAX_CONTRACT_WEEKS = 156

const deterministicSeed = (...parts: Array<string | number | undefined | null>): number => {
    const payload = parts
        .filter((part): part is string | number => part !== undefined && part !== null)
        .map(String)
        .join("|")

    let hash = 2166136261
    for (let i = 0; i < payload.length; i++) {
        hash ^= payload.charCodeAt(i)
        hash = Math.imul(hash, 16777619)
    }

    return (hash >>> 0) || 1
}

const money = (value: number) => formatCurrency(value, "$", false)

/**
 * NEWPLAYER-11 (2026-11-17): fees agreed this week, by save, player and week
 * (with the selling club), so reopening the deal returns to the contract step.
 * Kept for the session only (a full reload starts the talks again).
 */
const agreedFees = new Map<string, { fee: number; clubId: string }>()

export function formatWeeksAsYears(weeks: number): string {
    const years = weeks / 52
    if (years < 1) return tn("deal.weeks", weeks)
    if (years === Math.floor(years)) return tn("deal.years", years)
    return t("deal.yearsDecimal", { n: years.toLocaleString(intlLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })
}

export function useNegotiation(playerId: string | null, active = true) {
    const { players, teams, contracts, staff, academyCount, playerTeamId, transferPlayer, currentWeek, saveId, addToast, boardState, queueSigningMoment, scheduledMatches } = useGameStore(useShallow(state => ({
        players: state.players,
        teams: state.teams,
        contracts: state.contracts,
        staff: state.staff,
        academyCount: state.academyPlayers.length,
        playerTeamId: state.playerTeamId,
        transferPlayer: state.transferPlayer,
        currentWeek: state.currentWeek,
        saveId: state.saveId,
        addToast: state.addToast,
        boardState: state.boardState,
        queueSigningMoment: state.queueSigningMoment,
        scheduledMatches: state.scheduledMatches,
    })))

    const playerSave = playerId ? players.find(p => p.id === playerId) : undefined
    const currentTeam = playerId ? teams.find(t => t.rosterIds.includes(playerId)) : undefined
    const myTeam = teams.find(t => t.id === playerTeamId)
    const budget = myTeam?.budget ?? 0
    const boardSanction = getBoardSanctionedFee(boardState, budget)
    /** MARKET-15: the board's "cash at season end" objective, if it set one. */
    const cashTarget = boardState?.objectives?.find(o => o.id === "finance")?.target ?? null
    /**
     * MARKET-05 (2026-11-17): the selling club won't deal with a club it plays
     * within three weeks (the store's strategic refusal); said before any offer.
     */
    const refusal = useMemo(() => {
        if (!currentTeam || !myTeam || currentTeam.id === myTeam.id) return null
        const week = strategicRefusalWeek(scheduledMatches, currentWeek, currentTeam.id, myTeam.id)
        return week === null ? null : { week, endsWeek: strategicRefusalEndsWeek(scheduledMatches, currentWeek, currentTeam.id, myTeam.id) }
    }, [scheduledMatches, currentWeek, currentTeam, myTeam])

    const [stage, setStage] = useState<NegotiationStage>("BUYOUT")
    const [buyoutOffer, setBuyoutOfferRaw] = useState<number>(0)
    const [salaryOffer, setSalaryOfferRaw] = useState<number>(0)
    const [durationOffer, setDurationOfferRaw] = useState<number>(52)
    /** G13: release clause and bonuses; the wage he asks moves with them. */
    const [clauses, setClausesRaw] = useState<ClauseTerms>(NO_CLAUSES)
    const [negotiationLog, setNegotiationLog] = useState<string[]>([])
    const [initializedKey, setInitializedKey] = useState("")
    const [failureMessage, setFailureMessage] = useState<string | null>(null)
    const [pendingDeal, setPendingDeal] = useState<PendingDeal | null>(null)
    /** NEWPLAYER-11: the fee the selling club accepted (shown at the top of the contract step). */
    const [agreedFee, setAgreedFee] = useState<number | null>(null)
    /** MARKET-07: the counter-offers on the table this week (the wage one holds for the length and clauses it was made at). */
    const [feeCounter, setFeeCounter] = useState<number | null>(null)
    const [wageCounter, setWageCounter] = useState<{ value: number; key: string } | null>(null)
    const sessionKey = `${saveId}:${playerId}:${currentWeek}`
    const originalOwner = useRef<string | null>(null)
    // transferPlayer is synchronous, but React batches state updates — a
    // same-frame double-click would call the handler twice before `stage`
    // re-renders. A ref updates synchronously and closes that window.
    const dealSubmittedRef = useRef(false)

    const costPreview = useMemo(() => myTeam && playerId ? quotePlayerSigning(myTeam, players, contracts, staff, currentWeek, playerId, buyoutOffer, salaryOffer, durationOffer, academyCount) : null,
        [myTeam, players, contracts, staff, currentWeek, playerId, buyoutOffer, salaryOffer, durationOffer, academyCount])

    const ready = !!playerSave && initializedKey === sessionKey
    const evaluation = useMemo(() => playerSave ? evaluatePlayer(playerSave, undefined, undefined, currentWeek) : null, [playerSave, currentWeek])
    /** AI clubs in the race for him; each one lifts a selling club's price (free agents: no fee to lift). */
    const rivals = useMemo(() => active && playerSave ? rivalInterest(playerSave, { teams, players, currentWeek, playerTeamId, saveId }) : [],
        [active, playerSave, teams, players, currentWeek, playerTeamId, saveId])
    const feePremium = currentTeam ? rivalFeePremium(rivals.length) : 0
    /** The centre of the club's hidden price: market value plus the rival premium. */
    const askingValue = evaluation ? Math.round(evaluation.transferValue * (1 + feePremium)) : 0

    const getNegotiationRng = (phase: string) => new SeededRNG(
        deterministicSeed(saveId || "local", currentWeek, playerId ?? "", currentTeam?.id || "FA", myTeam?.id || "NO_TEAM", phase)
    )

    const durationPref = useMemo(() => {
        if (!playerSave || !evaluation) return { minWeeks: 24, maxWeeks: 104, idealWeeks: 52 }
        let idealWeeks: number
        if (playerSave.age <= 20) idealWeeks = 130
        else if (playerSave.age <= 22) idealWeeks = 112
        else if (playerSave.age <= 25) idealWeeks = 90
        else if (playerSave.age <= 28) idealWeeks = 72
        else if (playerSave.age <= 31) idealWeeks = 52
        else idealWeeks = 36

        const loyalty = playerSave.loyalty ?? 50
        idealWeeks = Math.round(idealWeeks * (0.8 + (loyalty / 100) * 0.4))
        // Phase 5.2: Loyal wants a longer deal, Mercenary a shorter one.
        idealWeeks = Math.round(idealWeeks * contractLengthFactor(getArchetype(playerSave)))

        if (evaluation.overallRating >= 85) idealWeeks = Math.round(idealWeeks * 0.8)
        else if (evaluation.overallRating >= 78) idealWeeks = Math.round(idealWeeks * 0.9)

        const rng = new SeededRNG(deterministicSeed(saveId || "local", currentWeek, playerId ?? "", currentTeam?.id || "FA", myTeam?.id || "NO_TEAM", "DURATION_PREF"))
        idealWeeks = Math.round(idealWeeks * rng.range(0.85, 1.15))

        const minWeeks = Math.max(12, Math.round(idealWeeks * 0.45))
        const maxWeeks = Math.min(156, Math.round(idealWeeks * 1.8))
        return { minWeeks, maxWeeks, idealWeeks: Math.max(12, Math.min(156, idealWeeks)) }
    }, [playerSave, evaluation, saveId, currentWeek, playerId, currentTeam?.id, myTeam?.id])

    const personalityLines = playerSave && evaluation ? contractDemandLines(getArchetype(playerSave), evaluation.overallRating, myTeam) : []

    /** His wage before length and clauses (Phase 5.2 archetype included; engine/recruitment negotiationBaseWage). */
    const baseWage = useMemo(() => playerSave ? negotiationBaseWage(playerSave, currentWeek, myTeam) : 0, [playerSave, currentWeek, myTeam])
    /** Base weekly wage before the hidden variance and the clauses (same factors as the acceptance rule). */
    const wageBeforeClauses = (duration: number) => baseWage * durationWageFactor(duration, durationPref)
    const wageCentre = (duration: number) => wageWithClauses(wageBeforeClauses(duration), clauses)
    /** How much less a week he asks for the clauses (at the current length). */
    const clauseSaving = Math.max(0, Math.round(wageBeforeClauses(durationOffer) - wageCentre(durationOffer)))
    const setClauses = (next: Partial<ClauseTerms>) => setClausesRaw(prev => ({
        release: next.release ?? prev.release,
        appearanceBonus: Math.max(0, Math.min(MAX_NEGOTIATION_SALARY, Math.floor(next.appearanceBonus ?? prev.appearanceBonus) || 0)),
        titleBonus: Math.max(0, Math.min(MAX_NEGOTIATION_SALARY, Math.floor(next.titleBonus ?? prev.titleBonus) || 0)),
    }))

    // MARKET-02: a fee can't be typed past the board's limit any more than past the funds.
    const setBuyoutOffer = (val: number) => setBuyoutOfferRaw(clampFeeOffer(val, budget, boardSanction))
    const setSalaryOffer = (val: number) => {
        if (!Number.isFinite(val)) { setSalaryOfferRaw(0); return }
        setSalaryOfferRaw(Math.max(0, Math.min(MAX_NEGOTIATION_SALARY, Math.floor(val))))
    }
    const setDurationOffer = (val: number) => setDurationOfferRaw(Math.max(MIN_CONTRACT_WEEKS, Math.min(MAX_CONTRACT_WEEKS, Math.floor(val || 52))))

    // MARKET-03: an offer that can't be made has no chance to show.
    const feeChance = feeOfferBlock(buyoutOffer, budget, boardSanction) ? 0
        : chanceWithCounter(askingValue > 0 ? bandChance(buyoutOffer / askingValue, FEE_BAND) : 1, buyoutOffer, feeCounter)
    const durationOk = durationOffer >= durationPref.minWeeks && durationOffer <= durationPref.maxWeeks
    // MARKET-10: band and odds come from the acceptance rule itself (clause
    // credits are fixed sums, so scaling the clause-adjusted centre was off).
    const wageBase = wageBeforeClauses(durationOffer)
    /** Where the player's hidden minimum can sit (effective, after the 3% grace). */
    const wageRange = wageRangeFor(wageBase, clauses)
    const termsKey = (duration: number) => `${duration}|${clauses.release}|${clauses.appearanceBonus}|${clauses.titleBonus}`
    const activeWageCounter = wageCounter && wageCounter.key === termsKey(durationOffer) ? wageCounter.value : null
    const wageChance = !durationOk ? 0 : chanceWithCounter(wageBase > 0 ? wageChanceFor(salaryOffer, wageBase, clauses) : 1, salaryOffer, activeWageCounter)
    /** Lowest wage with a sure yes at the current length. */
    const sureWage = wageRange[1]
    /** Where the club's hidden price can sit (effective, after the 3% grace). */
    const feeRange: [number, number] = askingValue > 0
        ? [Math.ceil(askingValue * FEE_BAND[0] * ACCEPT_WITHIN), Math.ceil(askingValue * FEE_BAND[1] * ACCEPT_WITHIN)]
        : [0, 0]

    const openingFee = initialFeeOffer(askingValue, budget, boardSanction)
    // MARKET-04: open at the length he wants, so the opening wage is the table's "Wage ask".
    const openingWeeks = durationPref.idealWeeks
    const openingWage = wageRangeFor(wageBeforeClauses(openingWeeks), NO_CLAUSES)[1]

    // Initialization: fresh terms whenever the player, week or save changes.
    useEffect(() => {
        if (active && playerId && initializedKey !== sessionKey && playerSave) {
            const initialTeam = teams.find(t => t.rosterIds.includes(playerId))
            originalOwner.current = initialTeam?.id || null
            setBuyoutOfferRaw(0)
            setDurationOfferRaw(openingWeeks)
            setClausesRaw(NO_CLAUSES)
            setNegotiationLog([])
            setFeeCounter(null)
            setWageCounter(null)
            setFailureMessage(null)
            setPendingDeal(null)
            setAgreedFee(null)
            dealSubmittedRef.current = false

            const agreed = initialTeam ? agreedFees.get(sessionKey) : undefined
            if (!initialTeam) {
                setStage("CONTRACT")
            } else if (agreed && agreed.clubId === initialTeam.id) {
                // NEWPLAYER-11: the club already took this fee this week; back to the contract.
                setBuyoutOfferRaw(agreed.fee)
                setAgreedFee(agreed.fee)
                setNegotiationLog([t("nego.log.feeAccepted", { club: initialTeam.name, fee: money(agreed.fee) })])
                setStage("CONTRACT")
            } else {
                setStage("BUYOUT")
                // MARKET-17: open at the club's asking value, within funds and the board's limit.
                setBuyoutOfferRaw(openingFee)
            }

            // MARKET-08: open at the wage he signs for at this length (the top
            // of his hidden band), not the AI clubs' recruitmentSalary.
            setSalaryOfferRaw(openingWage)
            setInitializedKey(sessionKey)
        } else if (!active) {
            setInitializedKey("")
            setNegotiationLog([])
            setFailureMessage(null)
            dealSubmittedRef.current = false
        }
    }, [active, initializedKey, sessionKey, playerSave, playerId, teams, openingFee, openingWage, openingWeeks])

    // MARKET-03: funds or the board's limit dropped while the fee is still
    // being offered (a scouting fee paid from this panel, a weekly settlement):
    // bring the typed fee back within them. An agreed fee is left alone.
    const feeLimit = maxFeeOffer(budget, boardSanction)
    useEffect(() => {
        if (stage === "BUYOUT") setBuyoutOfferRaw(v => Math.min(v, feeLimit))
    }, [feeLimit, stage])

    /** The signing reveal (Phase 5.4a): a full-screen moment with the deal as made. */
    const celebrateSigning = (signing: Parameters<typeof queueSigningMoment>[0]) => {
        queueSigningMoment(signing)
    }

    const submitBuyout = () => {
        if (!evaluation) return
        // MARKET-02: the store refuses a fee above funds or the board's limit at signing; refuse it here.
        if (feeOfferBlock(buyoutOffer, budget, boardSanction)) return
        const sanitizedBuyoutOffer = Math.max(0, Math.floor(buyoutOffer))
        const variance = getNegotiationRng("BUYOUT_THRESHOLD").range(0.9, 1.1)
        const minPrice = Math.round(askingValue * variance)

        if (sanitizedBuyoutOffer >= minPrice * ACCEPT_WITHIN) {
            const accepted = t("nego.log.feeAccepted", { club: currentTeam?.name ?? t("nego.log.theClub"), fee: money(sanitizedBuyoutOffer) })
            setNegotiationLog(prev => [...prev, accepted])
            // NEWPLAYER-11: say it where the player looks, and keep it for the week.
            setAgreedFee(sanitizedBuyoutOffer)
            if (currentTeam) agreedFees.set(sessionKey, { fee: sanitizedBuyoutOffer, clubId: currentTeam.id })
            addToast({ message: accepted, type: "info" })
            setStage("CONTRACT")
        } else {
            // MARKET-07: a counter-offer, never the exact hidden price.
            // MARKET-03 (2026-11-17): never above what you may offer when the club would take that;
            // when even its lowest price is beyond it, say so.
            const { counter, reachable } = feeCounterOffer(minPrice * ACCEPT_WITHIN, feeRange[1], feeLimit, getNegotiationRng("BUYOUT_COUNTER").range(1.02, 1.1))
            setFeeCounter(counter)
            const line = t("nego.log.feeRejected", { fee: money(sanitizedBuyoutOffer), club: currentTeam?.name ?? t("nego.log.theClub"), counter: money(counter) })
            setNegotiationLog(prev => [...prev, reachable ? line : `${line} ${t("nego.log.feeOverLimit", { max: money(feeLimit) })}`])
        }
    }

    const submitContract = () => {
        if (!playerSave || !evaluation) return
        if ((currentTeam?.id || null) !== originalOwner.current) {
            setFailureMessage(t("nego.clubChanged"))
            return
        }
        const sanitizedDuration = Math.max(12, Math.min(156, Math.floor(durationOffer)))
        const sanitizedSalary = Math.max(0, Math.min(MAX_NEGOTIATION_SALARY, Math.floor(salaryOffer)))
        const sanitizedBuyoutOffer = Math.max(0, Math.floor(buyoutOffer))

        if (sanitizedDuration < durationPref.minWeeks) {
            setNegotiationLog(prev => [...prev, t("nego.log.longer", { length: formatWeeksAsYears(durationPref.minWeeks) })])
            return
        }
        if (sanitizedDuration > durationPref.maxWeeks) {
            setNegotiationLog(prev => [...prev, t("nego.log.shorter", { length: formatWeeksAsYears(durationPref.maxWeeks) })])
            return
        }

        const variance = getNegotiationRng("CONTRACT_THRESHOLD").range(0.9, 1.2)
        const minimumSalary = wageThreshold(wageBeforeClauses(sanitizedDuration), variance, clauses)

        if (sanitizedSalary >= minimumSalary * ACCEPT_WITHIN) {
            // Terms agreed: the paper contract comes out for the manager to sign.
            setNegotiationLog(prev => [...prev, t("nego.log.agreed")])
            setPendingDeal({ salary: sanitizedSalary, duration: sanitizedDuration, fee: sanitizedBuyoutOffer, clauses })
            setStage("SIGN")
        } else {
            // MARKET-07: a counter-offer at this length and these clauses, never the exact minimum.
            const sure = wageRangeFor(wageBeforeClauses(sanitizedDuration), clauses)[1]
            const counter = counterOffer(minimumSalary * ACCEPT_WITHIN, sure, getNegotiationRng("CONTRACT_COUNTER").range(1.02, 1.1))
            setWageCounter({ value: counter, key: termsKey(sanitizedDuration) })
            setNegotiationLog(prev => [...prev, t("nego.log.wageRejected", { wage: money(sanitizedSalary), counter: money(counter) })])
        }
    }

    /**
     * The manager signed the paper contract: the deal is completed on the
     * agreed terms, and the reveal carries the signature. Returns whether the
     * transfer went through.
     */
    const signContract = (signature: SigningSignature | null): boolean => {
        if (!playerSave || !pendingDeal || !myTeam) return false
        if ((currentTeam?.id || null) !== originalOwner.current) {
            setFailureMessage(t("nego.clubChanged"))
            setStage("FAILED")
            return false
        }
        if (dealSubmittedRef.current) return false
        dealSubmittedRef.current = true
        const { salary, duration, fee, clauses: agreed } = pendingDeal
        const result = transferPlayer(
            playerSave.id,
            currentTeam?.id || "FA",
            myTeam.id,
            fee,
            {
                salaryPerWeek: salary,
                startWeek: currentWeek,
                endWeek: currentWeek + duration,
                buyout: Math.max(salary * 20, fee * 2),
                ...clauseFields(agreed, salary, fee),
            }
        )
        if (result.success) {
            agreedFees.delete(sessionKey)
            setNegotiationLog(prev => [...prev, t("nego.log.signed")])
            setStage("SUCCESS")
            celebrateSigning({
                playerId: playerSave.id, fee, salaryPerWeek: salary, contractEndWeek: currentWeek + duration, fromTeamId: currentTeam?.id ?? null,
                rivalNames: rivals.slice(0, 3).map(r => r.name), rivalCount: rivals.length, rosterBefore: myTeam.rosterIds,
                signature: signature ?? undefined,
            })
            return true
        }
        const reason = result.message || t("nego.couldNotComplete")
        setNegotiationLog(prev => [...prev, t("nego.log.rejected", { reason })])
        setFailureMessage(reason)
        setStage("FAILED")
        addToast({ message: t("nego.failedToast", { reason }), type: "error" })
        return false
    }

    /** Put the contract down unsigned: back to the terms (the agreement stands this week). */
    const cancelSigning = () => {
        setPendingDeal(null)
        setStage("CONTRACT")
    }

    /** Re-arm after a failure so the manager can fix the blocker and re-offer. */
    const retry = () => {
        dealSubmittedRef.current = false
        setFailureMessage(null)
        setStage("CONTRACT")
    }

    return {
        ready,
        playerSave,
        currentTeam,
        myTeam,
        budget,
        boardSanction,
        cashTarget,
        refusal,
        agreedFee,
        evaluation,
        rivals,
        feePremium,
        askingValue,
        stage,
        buyoutOffer, setBuyoutOffer,
        salaryOffer, setSalaryOffer,
        durationOffer, setDurationOffer,
        clauses, setClauses, clauseSaving,
        durationPref,
        durationOk,
        personalityLines,
        negotiationLog,
        failureMessage,
        costPreview,
        feeChance,
        wageChance,
        sureWage,
        wageRange,
        feeRange,
        submitBuyout,
        submitContract,
        pendingDeal,
        signContract,
        cancelSigning,
        retry,
    }
}

export type NegotiationState = ReturnType<typeof useNegotiation>
