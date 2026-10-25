"use client"

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
import { buyerReputationFactor, freeAgentWageFactor, recruitmentSalary } from "@/engine/recruitment"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { SeededRNG } from "@/engine/rng"
import { getBoardSanctionedFee } from "@/engine/board-expectations"
import { quotePlayerSigning } from "@/engine/finance-forecast"
import { archetypeWageFactor, contractDemandLines, contractLengthFactor, getArchetype } from "@/engine/personality"
import { formatCurrency } from "@/lib/utils-extended"
import { clauseFields, NO_CLAUSES, wageWithClauses, type ClauseTerms } from "@/engine/contract-clauses"
import { rivalFeePremium, rivalInterest } from "@/engine/transfer-hype"
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

// Hidden-price bands (mirrors the thresholds below).
const FEE_BAND = [0.9, 1.1] as const
const WAGE_BAND = [0.9, 1.2] as const
const ACCEPT_WITHIN = 0.97

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

export function formatWeeksAsYears(weeks: number): string {
    const years = weeks / 52
    if (years < 1) return `${weeks} weeks`
    if (years === Math.floor(years)) return `${years} year${years > 1 ? "s" : ""}`
    return `${years.toFixed(1)} years`
}

/** Probability that `ratio` (offer / centre) clears a floor drawn uniformly from `band`, accepted within 3%. */
function bandChance(ratio: number, band: readonly [number, number]): number {
    if (!Number.isFinite(ratio) || ratio <= 0) return 0
    const effective = ratio / ACCEPT_WITHIN
    return Math.max(0, Math.min(1, (effective - band[0]) / (band[1] - band[0])))
}

export function useNegotiation(playerId: string | null, active = true) {
    const { players, teams, contracts, staff, academyCount, playerTeamId, transferPlayer, currentWeek, saveId, addToast, boardState, queueSigningMoment } = useGameStore(useShallow(state => ({
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
    })))

    const playerSave = playerId ? players.find(p => p.id === playerId) : undefined
    const currentTeam = playerId ? teams.find(t => t.rosterIds.includes(playerId)) : undefined
    const myTeam = teams.find(t => t.id === playerTeamId)
    const budget = myTeam?.budget ?? 0
    const boardSanction = getBoardSanctionedFee(boardState, budget)

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
    const sessionKey = `${saveId}:${playerId}:${currentWeek}`
    const originalOwner = useRef<string | null>(null)
    // transferPlayer is synchronous, but React batches state updates — a
    // same-frame double-click would call the handler twice before `stage`
    // re-renders. A ref updates synchronously and closes that window.
    const dealSubmittedRef = useRef(false)

    const costPreview = useMemo(() => myTeam && playerId ? quotePlayerSigning(myTeam, players, contracts, staff, currentWeek, playerId, buyoutOffer, salaryOffer, durationOffer, academyCount) : null,
        [myTeam, players, contracts, staff, currentWeek, playerId, buyoutOffer, salaryOffer, durationOffer, academyCount])

    // Initialization: fresh terms whenever the player, week or save changes.
    useEffect(() => {
        if (active && playerId && initializedKey !== sessionKey && playerSave) {
            const initialTeam = teams.find(t => t.rosterIds.includes(playerId))
            originalOwner.current = initialTeam?.id || null
            setBuyoutOfferRaw(0)
            setDurationOfferRaw(104)
            setClausesRaw(NO_CLAUSES)
            setNegotiationLog([])
            setFailureMessage(null)
            setPendingDeal(null)
            dealSubmittedRef.current = false

            if (!initialTeam) {
                setStage("CONTRACT")
            } else {
                setStage("BUYOUT")
                const contract = contracts.find(c => c.playerId === playerId && c.teamId === initialTeam.id && c.endWeek > currentWeek)
                setBuyoutOfferRaw(Math.round((contract?.buyout || evaluatePlayer(playerSave, undefined, undefined, currentWeek).transferValue) * 0.8))
            }

            setSalaryOfferRaw(recruitmentSalary(playerSave, currentWeek, myTeam))
            setInitializedKey(sessionKey)
        } else if (!active) {
            setInitializedKey("")
            setNegotiationLog([])
            setFailureMessage(null)
            dealSubmittedRef.current = false
        }
    }, [active, initializedKey, sessionKey, playerSave, playerId, teams, contracts, currentWeek, myTeam])

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

    /** Archetype wage factor for this buyer (Phase 5.2; same rule as recruitmentSalary). */
    const personalityWage = playerSave && evaluation ? archetypeWageFactor(getArchetype(playerSave), evaluation.overallRating, myTeam) : 1
    const personalityLines = playerSave && evaluation ? contractDemandLines(getArchetype(playerSave), evaluation.overallRating, myTeam) : []

    /** Base weekly wage before the hidden variance and the clauses (same factors as the acceptance rule). */
    const wageBeforeClauses = (duration: number) => {
        if (!playerSave || !evaluation) return 0
        let base = evaluation.transferValue / 150
        if (playerSave.age > 28) base *= 1.1
        base *= freeAgentWageFactor(playerSave, currentWeek) * buyerReputationFactor(myTeam) * personalityWage
        const distFromIdeal = Math.abs(duration - durationPref.idealWeeks) / Math.max(1, durationPref.maxWeeks - durationPref.minWeeks)
        return base * (0.95 + distFromIdeal * 0.10)
    }
    const wageCentre = (duration: number) => wageWithClauses(wageBeforeClauses(duration), clauses)
    /** How much less a week he asks for the clauses (at the current length). */
    const clauseSaving = Math.max(0, Math.round(wageBeforeClauses(durationOffer) - wageCentre(durationOffer)))
    const setClauses = (next: Partial<ClauseTerms>) => setClausesRaw(prev => ({
        release: next.release ?? prev.release,
        appearanceBonus: Math.max(0, Math.min(MAX_NEGOTIATION_SALARY, Math.floor(next.appearanceBonus ?? prev.appearanceBonus) || 0)),
        titleBonus: Math.max(0, Math.min(MAX_NEGOTIATION_SALARY, Math.floor(next.titleBonus ?? prev.titleBonus) || 0)),
    }))

    const setBuyoutOffer = (val: number) => {
        if (!Number.isFinite(val)) { setBuyoutOfferRaw(0); return }
        const budgetCap = Math.max(0, Math.floor(budget))
        setBuyoutOfferRaw(Math.max(0, Math.min(Math.floor(val), budgetCap)))
    }
    const setSalaryOffer = (val: number) => {
        if (!Number.isFinite(val)) { setSalaryOfferRaw(0); return }
        setSalaryOfferRaw(Math.max(0, Math.min(MAX_NEGOTIATION_SALARY, Math.floor(val))))
    }
    const setDurationOffer = (val: number) => setDurationOfferRaw(Math.max(MIN_CONTRACT_WEEKS, Math.min(MAX_CONTRACT_WEEKS, Math.floor(val || 52))))

    const feeChance = askingValue > 0 ? bandChance(buyoutOffer / askingValue, FEE_BAND) : 1
    const durationOk = durationOffer >= durationPref.minWeeks && durationOffer <= durationPref.maxWeeks
    const centre = wageCentre(durationOffer)
    const wageChance = !durationOk ? 0 : centre > 0 ? bandChance(salaryOffer / centre, WAGE_BAND) : 1
    /** Lowest wage with a sure yes at the current length. */
    const sureWage = Math.ceil(centre * WAGE_BAND[1] * ACCEPT_WITHIN)
    /** Where the player's hidden minimum can sit (effective, after the 3% grace). */
    const wageRange: [number, number] = [Math.ceil(centre * WAGE_BAND[0] * ACCEPT_WITHIN), sureWage]
    /** Where the club's hidden price can sit (effective, after the 3% grace). */
    const feeRange: [number, number] = askingValue > 0
        ? [Math.ceil(askingValue * FEE_BAND[0] * ACCEPT_WITHIN), Math.ceil(askingValue * FEE_BAND[1] * ACCEPT_WITHIN)]
        : [0, 0]

    /** The signing reveal (Phase 5.4a): a full-screen moment with the deal as made. */
    const celebrateSigning = (signing: Parameters<typeof queueSigningMoment>[0]) => {
        queueSigningMoment(signing)
    }

    const submitBuyout = () => {
        if (!evaluation) return
        const sanitizedBuyoutOffer = Math.max(0, Math.floor(buyoutOffer))
        const variance = getNegotiationRng("BUYOUT_THRESHOLD").range(0.9, 1.1)
        const minPrice = Math.round(askingValue * variance)

        if (sanitizedBuyoutOffer >= minPrice * 0.97) {
            setNegotiationLog(prev => [...prev, `${currentTeam?.name ?? "The club"} accepted ${money(sanitizedBuyoutOffer)}.`])
            setStage("CONTRACT")
        } else {
            setNegotiationLog(prev => [...prev, `${money(sanitizedBuyoutOffer)} rejected. ${currentTeam?.name ?? "The club"} accepts ${money(Math.ceil(minPrice * 0.97))} or more.`])
        }
    }

    const submitContract = () => {
        if (!playerSave || !evaluation) return
        if ((currentTeam?.id || null) !== originalOwner.current) {
            setFailureMessage("This player's club changed during negotiations. Reopen the deal to get current terms.")
            return
        }
        const sanitizedDuration = Math.max(12, Math.min(156, Math.floor(durationOffer)))
        const sanitizedSalary = Math.max(0, Math.min(MAX_NEGOTIATION_SALARY, Math.floor(salaryOffer)))
        const sanitizedBuyoutOffer = Math.max(0, Math.floor(buyoutOffer))

        if (sanitizedDuration < durationPref.minWeeks) {
            setNegotiationLog(prev => [...prev, `Wants a longer contract (at least ${formatWeeksAsYears(durationPref.minWeeks)}).`])
            return
        }
        if (sanitizedDuration > durationPref.maxWeeks) {
            setNegotiationLog(prev => [...prev, `Won't commit that long (at most ${formatWeeksAsYears(durationPref.maxWeeks)}).`])
            return
        }

        const baseSalary = evaluation.transferValue / 150
        const variance = getNegotiationRng("CONTRACT_THRESHOLD").range(0.9, 1.2)
        let minSalary = baseSalary * variance
        if (playerSave.age > 28) minSalary *= 1.1
        minSalary *= freeAgentWageFactor(playerSave, currentWeek) * buyerReputationFactor(myTeam) * personalityWage
        const distFromIdeal = Math.abs(sanitizedDuration - durationPref.idealWeeks) / Math.max(1, durationPref.maxWeeks - durationPref.minWeeks)
        minSalary *= 0.95 + distFromIdeal * 0.10
        const minimumSalary = Math.round(wageWithClauses(minSalary, clauses))

        if (sanitizedSalary >= minimumSalary * 0.97) {
            // Terms agreed: the paper contract comes out for the manager to sign.
            setNegotiationLog(prev => [...prev, "Terms agreed. The contract is ready to sign."])
            setPendingDeal({ salary: sanitizedSalary, duration: sanitizedDuration, fee: sanitizedBuyoutOffer, clauses })
            setStage("SIGN")
        } else {
            setNegotiationLog(prev => [...prev, `${money(sanitizedSalary)}/wk rejected. Accepts ${money(Math.ceil(minimumSalary * 0.97))}/wk or more at this length.`])
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
            setFailureMessage("This player's club changed during negotiations. Reopen the deal to get current terms.")
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
                ...clauseFields(agreed, salary),
            }
        )
        if (result.success) {
            setNegotiationLog(prev => [...prev, "Contract signed."])
            setStage("SUCCESS")
            celebrateSigning({
                playerId: playerSave.id, fee, salaryPerWeek: salary, contractEndWeek: currentWeek + duration, fromTeamId: currentTeam?.id ?? null,
                rivalNames: rivals.slice(0, 3).map(r => r.name), rivalCount: rivals.length, rosterBefore: myTeam.rosterIds,
                signature: signature ?? undefined,
            })
            return true
        }
        const reason = result.message || "The deal could not be completed."
        setNegotiationLog(prev => [...prev, `Transfer rejected: ${reason}`])
        setFailureMessage(reason)
        setStage("FAILED")
        addToast({ message: `Transfer failed: ${reason}`, type: "error" })
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
