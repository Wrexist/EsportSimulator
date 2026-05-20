"use client"

/**
 * Sponsorship slice.
 *
 * Two thin actions for the sponsor-offer carousel:
 *   - refreshSponsorOffers: regenerate the offer pool deterministically
 *     from the team + current week, and clear the declined-offer set so
 *     the same offers can resurface in a different shape later.
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

export const createSponsorshipSlice: SliceCreator<SponsorshipActions> = (set) => ({
    refreshSponsorOffers: () => {
        set((state) => {
            const team = state.teams.find(t => t.id === state.playerTeamId)
            if (!team) return
            // Mix the last RNG seed with the current week so re-rolls during
            // the same week are stable (same seed + same week = same set).
            const rng = new SeededRNG(state.lastRngSeed + state.currentWeek * 7919)
            state.sponsorOffers = SponsorGenerator.generateVariedOffers(team, state.currentWeek, rng)
            state.declinedSponsorOfferIds = []
        })
    },

    declineSponsorOffer: (offerId: string) => {
        set((state) => {
            state.sponsorOffers = state.sponsorOffers.filter(o => o.id !== offerId)
            state.declinedSponsorOfferIds.push(offerId)
        })
    },
})
