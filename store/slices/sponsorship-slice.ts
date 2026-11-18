"use client"

/**
 * Sponsorship slice.
 *
 * Two thin actions for the sponsor-offer carousel:
 *   - refreshSponsorOffers: regenerate the offer pool deterministically
 *     from the team + current week, leaving out offers already declined
 *     (MARKET-02, 2026-11-17: the weekly processor deals and clears the
 *     week's offers; this only seeds a career that has none).
 *   - declineSponsorOffer: drop one offer from the pool and remember
 *     the ID so the same generator seed doesn't re-show it before the
 *     next refresh.
 *
 * Extracted from game-store.ts. Generation is delegated to
 * SponsorGenerator which lives next to the rest of the economy logic.
 */

import type { SponsorshipActions, SliceCreator } from "@/store/types"
import { SeededRNG } from "@/engine"
import { SponsorGenerator } from "@/engine/economy-manager"
import { EconomyEngine } from "@/engine/economy-engine"

export const createSponsorshipSlice: SliceCreator<SponsorshipActions> = (set) => ({
    refreshSponsorOffers: () => {
        set((state) => {
            const team = state.teams.find(t => t.id === state.playerTeamId)
            if (!team) return
            // Mix the last RNG seed with the current week so re-rolls during
            // the same week are stable (same seed + same week = same set).
            const rng = new SeededRNG(state.lastRngSeed + state.currentWeek * 7919)
            const declined = new Set(state.declinedSponsorOfferIds || [])
            state.sponsorOffers = SponsorGenerator.generateVariedOffers(team, state.currentWeek, rng,
                EconomyEngine.sponsorCostBase(team, state.contracts, state.staff || [], state.currentWeek + 1))
                .filter(o => !declined.has(o.id))
        })
    },

    declineSponsorOffer: (offerId: string) => {
        set((state) => {
            state.sponsorOffers = state.sponsorOffers.filter(o => o.id !== offerId)
            state.declinedSponsorOfferIds.push(offerId)
        })
    },
})
