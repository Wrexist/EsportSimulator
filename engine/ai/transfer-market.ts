/**
 * AI transfer-market subsystems — three flows extracted from
 * ai-manager.ts (Phase K4):
 *
 *   1. listPlayerForTransfer  (panic-sale flag-setter)
 *      Crisis-mode wage dump: pick the worst salary-to-value ratio on
 *      the roster, flag forSale + set a listing price.
 *
 *   2. processAITransferMarket (poaching the player's roster)
 *      Each AI team rolls up to MAX_TRANSFER_OFFERS_PER_TEAM_PER_WEEK
 *      offers against every player-team player currently flagged
 *      forSale. Interest scales with: skill, potential, role-fit, and
 *      the listing-price vs. market-value ratio.
 *
 *   3. processAIToAITransfers (AI ↔ AI moves)
 *      Bench dumps (6+ roster, weakest < 55 skill) and explicit
 *      listings feed an availablePlayers pool. Buying teams (≤5
 *      roster + budget > $100k) try to sign the highest-skill
 *      candidate they can afford. Capped at 3 transfers per week.
 *
 * All three are pure save-mutators — no instance state, no module
 * globals beyond constants. AIManager keeps facade methods so the
 * external caller (engine/processors/ai-world-processor.ts) still
 * sees AIManager.processAIToAITransfers(...) unchanged.
 */

import type {
    GameSave,
    TeamSaveData,
    PlayerSaveData,
    ContractSaveData,
} from "../save-types"
import type { SeededRNG } from "../rng"
import type { EventType } from "../../types"
import { getPlayerIndex } from "./player-index"
import { aiRoll } from "./rng-helpers"

import { recruitmentBudget, recruitmentRole, recruitmentSalary } from "../recruitment"
import { evaluatePlayer } from "../player-evaluation"
import { applyRosterChangePenalty } from "../chemistry-engine"
import { recalculateTeamSynergy } from "../processors/team-synergy-recalc"

const MAX_TRANSFER_OFFERS_PER_TEAM_PER_WEEK = 2
const MAX_AI_TRANSFERS_PER_WEEK = 3
const POACHER_MIN_BUDGET = 50_000
const BUYER_MIN_BUDGET = 100_000
const BUYER_MAX_ROSTER = 5
const MAX_ROSTER_SIZE = 7
const BENCH_DUMP_MIN_ROSTER = 6
const BENCH_DUMP_SKILL_CEILING = 55
const TRANSFER_CONTRACT_WEEKS = 52

/**
 * Market valuation for an AI offer on a listed player.
 *
 * `potential` is on a 0-100 scale. The multiplier/overpay thresholds were
 * previously 0-20-scale leftovers (16/14 and 17/15), so virtually EVERY
 * listed player cleared them and always got the max 1.5× / 1.2× — the tiers
 * were dead branches and any benched player could be sold for an inflated
 * fortune. Thresholds are now expressed against the real 0-100 scale so the
 * boosts apply only to genuinely high-potential prospects.
 *
 * Extracted as a pure function so the valuation can be unit-tested directly.
 */
export function aiMarketValuation(
    skill: number,
    potential: number,
    tier: string | undefined,
): { baseValue: number; potentialMultiplier: number; overpayBuffer: number } {
    let baseValue = (skill * 100) + (potential * 150)
    if (tier === "ELITE") baseValue *= 50
    else if (tier === "PRO") baseValue *= 20
    else baseValue *= 5

    const potentialMultiplier = potential > 80 ? 1.5 : potential > 70 ? 1.2 : 1.0
    const overpayBuffer = potential > 85 ? 1.2 : potential > 75 ? 1.1 : 1.0
    return { baseValue, potentialMultiplier, overpayBuffer }
}

/**
 * Crisis-mode panic sale. Flag the player whose salary-to-value ratio
 * hurts the team most. No mutation of save.contracts — the listing is
 * just a `forSale` flag + a sticker price; the actual transfer happens
 * later via processAIToAITransfers (or player accepting an offer).
 */
export function listPlayerForTransfer(team: TeamSaveData, save: GameSave): void {
    const playerIndex = getPlayerIndex(save)
    const players = team.rosterIds
        .map(id => playerIndex.get(id))
        .filter((p): p is PlayerSaveData => !!p)
    const notForSale = players.filter(p => !p.forSale)
    if (notForSale.length === 0) return

    const contractByPlayer = new Map<string, ContractSaveData>()
    for (const c of save.contracts) {
        if (c.teamId === team.id) contractByPlayer.set(c.playerId, c)
    }

    // Higher score = better candidate to dump (high wage, low value).
    const wageBurden = (p: PlayerSaveData) => {
        const salary = contractByPlayer.get(p.id)?.salaryPerWeek ?? 0
        const skill = p.skill ?? 50
        const tactic = p.tactic ?? 50
        const age = p.age ?? 22
        const ageDecline = Math.max(0, age - 27) * 5
        return salary / Math.max(20, skill + tactic - ageDecline)
    }
    const target = notForSale.reduce(
        (worst, p) => (wageBurden(p) > wageBurden(worst) ? p : worst),
        notForSale[0],
    )
    target.forSale = true
    target.transferListingPrice = (target.prestigeScore || 50) * 1000
    target.weeksOnTransferList = 0
}

/**
 * AI teams making offers for the player's transfer-listed roster.
 * Up to MAX_TRANSFER_OFFERS_PER_TEAM_PER_WEEK per AI team per week.
 * Offers post as TRANSFER_OFFER events with accept/reject choices the
 * player resolves in their inbox.
 */
export function processAITransferMarket(
    save: GameSave,
    playerTeamId: string,
    rng?: SeededRNG,
): void {
    const playerTeam = save.teams.find(t => t.id === playerTeamId)
    if (!playerTeam) return

    const playerIndex = getPlayerIndex(save)
    const userPlayersForSale = playerTeam.rosterIds
        .map(id => playerIndex.get(id))
        .filter((p): p is PlayerSaveData => !!p && !!p.forSale && !p.isRetired)

    if (userPlayersForSale.length === 0) return

    const aiTeams = save.teams.filter(t => t.id !== playerTeamId)

    // Build Set of existing pending transfer-offer keys for O(1) dedup. This
    // must span ALL weeks, not just the current one: an offer the player hasn't
    // resolved yet (no selectedChoiceId) should block the same AI team from
    // re-offering for the same player. Scoping this to the current week let a
    // fresh offer pile up every week for a left-listed player, growing the
    // inbox/save unbounded.
    for (const event of save.eventsLog) {
        if (event.type === "TRANSFER_OFFER" && !event.selectedChoiceId
            && Number(event.data?.expiresWeek ?? event.week + 2) <= save.currentWeek) {
            event.selectedChoiceId = "expired"
            event.acknowledged = true
            event.data.message = "This transfer offer expired. The club can submit a new bid if it remains interested."
        }
    }
    const existingOfferKeys = new Set<string>()
    for (const e of save.eventsLog) {
        if (e.type === "TRANSFER_OFFER" && !e.selectedChoiceId && e.data?.teamId && e.data?.playerId) {
            existingOfferKeys.add(`${e.data.teamId}_${e.data.playerId}`)
        }
    }

    aiTeams.forEach(aiTeam => {
        if (aiTeam.budget < POACHER_MIN_BUDGET || aiTeam.rosterIds.length >= MAX_ROSTER_SIZE) return
        const canAfford = recruitmentBudget(save, aiTeam)
        let offersMade = 0

        // Pre-compute the AI team's role coverage once for role-fit weighting.
        const aiRoles = new Set<string>()
        for (const id of aiTeam.rosterIds) {
            const p = playerIndex.get(id)
            if (p?.role) aiRoles.add(recruitmentRole(p.role))
        }

        userPlayersForSale.forEach(player => {
            if (offersMade >= MAX_TRANSFER_OFFERS_PER_TEAM_PER_WEEK) return

            const existingOffer = existingOfferKeys.has(`${aiTeam.id}_${player.id}`)
            if (existingOffer) return

            // Market value + potential-based multipliers (0-100 scale; see aiMarketValuation).
            const { potentialMultiplier, overpayBuffer } = aiMarketValuation(
                player.skill, player.potential, player.tier,
            )

            const baseValue = evaluatePlayer(player, undefined, undefined, save.currentWeek).transferValue
            const listingPrice = player.transferListingPrice || baseValue
            const priceRatio = listingPrice / baseValue

            // Role-fit: missing role = +40% interest; saturated role = -15%.
            const playerRole = recruitmentRole(player.role)
            const roleFitMultiplier = !aiRoles.has(playerRole) ? 1.4
                : aiRoles.size <= 4 ? 1.0
                : 0.85

            // Ratio 1.0 → 30% × potentialMultiplier; ratio 0.5 → ~80%.
            const interestMultiplier = Math.exp(2 * (1 - priceRatio))
            const baseChance = 0.3 * potentialMultiplier * roleFitMultiplier
            const finalChance = Math.min(0.98, baseChance * interestMultiplier)

            if (aiRoll(rng) > finalChance) return

            // Offer: anchored to baseValue, 10% pull toward asking price,
            // overpay buffer for high-potential prospects (from aiMarketValuation), ±15% random.
            const anchoredValue = ((baseValue * 0.9) + (listingPrice * 0.1)) * overpayBuffer

            const offerAmount = Math.round(anchoredValue * (0.85 + aiRoll(rng) * 0.3))

            if (!canAfford(recruitmentSalary(player, save.currentWeek), offerAmount)) return

            const eventId = `offer_${save.currentWeek}_${aiTeam.id}_${player.id}_${offerAmount}`

            save.eventsLog.push({
                id: eventId,
                type: "TRANSFER_OFFER" as unknown as EventType,
                week: save.currentWeek,
                data: {
                    teamId: aiTeam.id,
                    teamName: aiTeam.name,
                    playerId: player.id,
                    playerName: player.nickname,
                    offerAmount: offerAmount,
                    expiresWeek: save.currentWeek + 2,
                    salaryPerWeek: recruitmentSalary(player, save.currentWeek),
                    message: `${aiTeam.name} has submitted a transfer offer for ${player.nickname}.`,
                },
                acknowledged: false,
                choices: [
                    { id: "accept", text: "Accept Offer", effects: {} },
                    { id: "reject", text: "Reject", effects: {} },
                ],
            })
            offersMade++
        })
    })
}

/**
 * AI-to-AI transfer market. Two pools feed `availablePlayers`:
 *   (a) Bench dumps — teams with 6+ roster auto-offer their weakest if
 *       below the BENCH_DUMP_SKILL_CEILING (55).
 *   (b) Explicit listings — anyone flagged forSale from
 *       listPlayerForTransfer.
 *
 * Buying teams (under-roster + decent budget) roll 5% per week to
 * sign the best available player they can afford. Total capped at
 * MAX_AI_TRANSFERS_PER_WEEK (3) to prevent market chaos.
 */
export function processAIToAITransfers(
    save: GameSave,
    playerTeamId: string,
    rng: SeededRNG,
): void {
    let transferCount = 0
    const playerIndex = getPlayerIndex(save)

    const availablePlayers: { player: PlayerSaveData; team: TeamSaveData }[] = []
    const offeredIds = new Set<string>()

    for (const team of save.teams) {
        if (team.id === playerTeamId) continue
        const roster = team.rosterIds
            .map(id => playerIndex.get(id))
            .filter((p): p is PlayerSaveData => !!p && !p.isRetired)

        // (a) Bench dump.
        if (roster.length >= BENCH_DUMP_MIN_ROSTER) {
            const worst = roster.reduce((min, p) => ((p.skill ?? 0) < (min.skill ?? 0) ? p : min), roster[0])
            if (worst && (worst.skill ?? 0) < BENCH_DUMP_SKILL_CEILING && !offeredIds.has(worst.id)) {
                availablePlayers.push({ player: worst, team })
                offeredIds.add(worst.id)
            }
        }

        // (b) Explicit listings.
        for (const p of roster) {
            if (p.forSale && !offeredIds.has(p.id)) {
                availablePlayers.push({ player: p, team })
                offeredIds.add(p.id)
            }
        }
    }

    const buyingTeams = save.teams.filter(t =>
        t.id !== playerTeamId && t.budget > BUYER_MIN_BUDGET && t.rosterIds.length <= BUYER_MAX_ROSTER
    )

    for (const buyer of buyingTeams) {
        if (transferCount >= MAX_AI_TRANSFERS_PER_WEEK) break
        if (rng.next() > 0.05) continue // 5% per team per week

        const canAfford = recruitmentBudget(save, buyer)
        const candidates = availablePlayers.filter(ap => ap.team.id !== buyer.id && ap.team.rosterIds.length > 5
            && ap.team.rosterIds.includes(ap.player.id) && !ap.player.isRetired)
            .map(ap => {
                const contract = save.contracts.find(c => c.playerId === ap.player.id && c.teamId === ap.team.id && c.endWeek > save.currentWeek)
                const fee = Math.round(contract?.buyout || evaluatePlayer(ap.player, undefined, undefined, save.currentWeek).transferValue)
                return { ap, fee, salary: recruitmentSalary(ap.player, save.currentWeek) }
            }).filter(c => canAfford(c.salary, c.fee))
            .sort((a, b) => (b.ap.player.skill ?? 0) - (a.ap.player.skill ?? 0) || a.ap.player.id.localeCompare(b.ap.player.id))
        if (!candidates.length) continue
        const { ap: candidate, fee, salary: weeklySalary } = candidates[0]
        // Re-assert the hard roster cap immediately before the push (the buyer
        // filter only checks <= BUYER_MAX_ROSTER at selection time).
        if (buyer.rosterIds.length >= MAX_ROSTER_SIZE) continue

        // Execute.
        candidate.team.rosterIds = candidate.team.rosterIds.filter(id => id !== candidate.player.id)
        // Defensive guard against double-add if a buyer already has this player.
        if (!buyer.rosterIds.includes(candidate.player.id)) {
            buyer.rosterIds.push(candidate.player.id)
        }
        buyer.budget -= fee
        candidate.team.budget += fee
        save.financeLedger ??= []
        for (const [team, type] of [[buyer, "EXPENSE"], [candidate.team, "INCOME"]] as const) {
            save.financeLedger.push({ id: `fin_ai_transfer_${save.currentWeek}_${candidate.player.id}_${team.id}`, week: save.currentWeek,
                teamId: team.id, type, category: type === "EXPENSE" ? "TRANSFER_OUT" : "TRANSFER_IN", amount: fee, description: `Transfer: ${candidate.player.nickname}`, balance: team.budget })
            applyRosterChangePenalty(team, save.currentWeek, 1)
        }
        if (candidate.team.activeRoleTraining) {
            candidate.team.activeRoleTraining = candidate.team.activeRoleTraining.filter(t => t.playerId !== candidate.player.id)
            candidate.team.trainingSlotsUsed = candidate.team.activeRoleTraining.length
        }
        recalculateTeamSynergy(candidate.team, save.players)
        recalculateTeamSynergy(buyer, save.players)
        // Clear listing flags so the new owner doesn't immediately re-receive
        // a market offer for the same player.
        candidate.player.forSale = false
        candidate.player.transferListingPrice = undefined
        candidate.player.weeksOnTransferList = undefined

        // Scope contract removal to the seller — wiping by playerId alone
        // can clobber unrelated historical/ghost contracts.
        const sellerTeamId = candidate.team.id
        save.contracts = save.contracts.filter(c => !(c.playerId === candidate.player.id && c.teamId === sellerTeamId))
        save.contracts.push({
            playerId: candidate.player.id,
            teamId: buyer.id,
            salaryPerWeek: weeklySalary,
            startWeek: save.currentWeek,
            endWeek: save.currentWeek + TRANSFER_CONTRACT_WEEKS,
            buyout: fee * 2,
        })

        if (save.transferHistory) {
            save.transferHistory.push({
                id: `transfer_ai2ai_${save.currentWeek}_${candidate.player.id}_${buyer.id}`,
                week: save.currentWeek,
                type: "TRANSFER",
                playerId: candidate.player.id,
                playerName: candidate.player.nickname,
                fromTeamId: candidate.team.id,
                fromTeamName: candidate.team.name,
                toTeamId: buyer.id,
                toTeamName: buyer.name,
                fee,
            })
        }

        if (save.newsFeed) {
            save.newsFeed.unshift({
                id: `news_ai2ai_${save.currentWeek}_${candidate.player.id}`,
                title: `${candidate.player.nickname} transferred to ${buyer.name}`,
                content: `${buyer.name} have acquired ${candidate.player.nickname} from ${candidate.team.name} for $${fee.toLocaleString()}.`,
                category: "TRANSFER",
                playerId: candidate.player.id,
                teamId: buyer.id,
                week: save.currentWeek,
                engagement: { likes: rng.int(100, 3000), views: rng.int(1000, 15000) },
            })
            if (save.newsFeed.length > 50) save.newsFeed.pop()
        }

        // Remove from pool so the same player isn't sold twice in one tick.
        const idx = availablePlayers.indexOf(candidate)
        if (idx !== -1) availablePlayers.splice(idx, 1)
        transferCount++
    }
}
