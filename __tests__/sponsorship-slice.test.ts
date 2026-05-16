/**
 * Tests for the sponsorship slice (offer carousel).
 *
 * Two thin actions:
 *   - refreshSponsorOffers: regenerate the offer pool deterministically
 *     from the team + current week (seed = lastRngSeed + week * 7919),
 *     and clear declinedSponsorOfferIds.
 *   - declineSponsorOffer: drop the matching offer from the pool and
 *     remember its ID so the same generator seed doesn't re-show it
 *     before the next refresh.
 *
 * The generator output itself isn't pinned — that's SponsorGenerator's
 * responsibility. What we pin here is the SLICE-level contract:
 *   - refresh seeds the offer list and clears the declined set
 *   - decline filters by id and appends to the declined set
 *   - missing team is a no-op (no crash)
 */

import { produce, enableMapSet } from "immer"
import { createSponsorshipSlice } from "@/store/slices/sponsorship-slice"
import type { TeamSaveData } from "@/engine/save-types"
import type { StoreState } from "@/store/types"

enableMapSet()

function makeHarness(initial: Partial<StoreState>) {
    let state = initial as StoreState
    const set = (
        patch: Partial<StoreState> | ((draft: StoreState) => void)
    ) => {
        if (typeof patch === "function") {
            state = produce(state, patch as (s: StoreState) => void)
        } else {
            state = { ...state, ...patch }
        }
    }
    const get = () => state
    return { state: () => state, set, get }
}

function makeTeam(id: string, overrides: Partial<TeamSaveData> = {}): TeamSaveData {
    return {
        id, name: id, shortName: id.slice(0, 4).toUpperCase(),
        budget: 1_000_000, rosterIds: [], staffIds: [],
        trophies: [], facilities: [], sponsors: [],
        fanbase: 1000, playstyle: "default", reputation: 50,
        region: "EU", facilitiesLevel: 1, leagueTier: "B_TIER",
        elo: 1500, recentForm: [], worldRanking: 25,
        ...overrides,
    } as unknown as TeamSaveData
}

function makeBaseState(overrides: Partial<StoreState> = {}): Partial<StoreState> {
    return {
        teams: [makeTeam("player")],
        sponsorOffers: [],
        declinedSponsorOfferIds: [],
        currentWeek: 5,
        playerTeamId: "player",
        lastRngSeed: 12345,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(overrides as any),
    }
}

describe("refreshSponsorOffers", () => {
    test("seeds sponsorOffers with at least one offer and clears declinedSponsorOfferIds", () => {
        const h = makeHarness(makeBaseState({
            sponsorOffers: [],
            declinedSponsorOfferIds: ["old_offer_1", "old_offer_2"],
        }))
        const slice = createSponsorshipSlice(h.set, h.get)
        slice.refreshSponsorOffers()
        // Generator produces at least one offer for a default team.
        expect(h.state().sponsorOffers.length).toBeGreaterThan(0)
        // Declined set is cleared on refresh.
        expect(h.state().declinedSponsorOfferIds).toEqual([])
    })

    test("missing player team is a silent no-op", () => {
        const h = makeHarness(makeBaseState({
            teams: [makeTeam("rival")], // no team with id "player"
            sponsorOffers: [],
        }))
        const slice = createSponsorshipSlice(h.set, h.get)
        slice.refreshSponsorOffers()
        // sponsorOffers stays untouched on missing team.
        expect(h.state().sponsorOffers).toEqual([])
    })

    test("determinism: same seed + same week produces the same offer set", () => {
        const h1 = makeHarness(makeBaseState({ lastRngSeed: 999, currentWeek: 10 }))
        const h2 = makeHarness(makeBaseState({ lastRngSeed: 999, currentWeek: 10 }))
        const slice1 = createSponsorshipSlice(h1.set, h1.get)
        const slice2 = createSponsorshipSlice(h2.set, h2.get)
        slice1.refreshSponsorOffers()
        slice2.refreshSponsorOffers()
        // Same seed + same week → same generated id list.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ids1 = h1.state().sponsorOffers.map(o => (o as any).id).sort()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ids2 = h2.state().sponsorOffers.map(o => (o as any).id).sort()
        expect(ids1).toEqual(ids2)
    })
})

describe("declineSponsorOffer", () => {
    test("filters the offer out and adds its id to declinedSponsorOfferIds", () => {
        const h = makeHarness(makeBaseState({
            sponsorOffers: [
                { id: "o1", name: "Brand A" } as never,
                { id: "o2", name: "Brand B" } as never,
                { id: "o3", name: "Brand C" } as never,
            ],
            declinedSponsorOfferIds: [],
        }))
        const slice = createSponsorshipSlice(h.set, h.get)
        slice.declineSponsorOffer("o2")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(h.state().sponsorOffers.map(o => (o as any).id)).toEqual(["o1", "o3"])
        expect(h.state().declinedSponsorOfferIds).toEqual(["o2"])
    })

    test("declining the same id twice still pushes both records (deliberate — refresh clears)", () => {
        // Slice doesn't dedupe; refresh is the cleanup point. Pin behavior.
        const h = makeHarness(makeBaseState({
            sponsorOffers: [{ id: "o1" } as never],
            declinedSponsorOfferIds: ["o1"],
        }))
        const slice = createSponsorshipSlice(h.set, h.get)
        slice.declineSponsorOffer("o1")
        // declinedSponsorOfferIds gets a second copy because the slice
        // intentionally doesn't dedupe — refreshSponsorOffers is the
        // single canonical clear point.
        expect(h.state().declinedSponsorOfferIds).toEqual(["o1", "o1"])
    })

    test("declining an unknown id is a no-op on sponsorOffers + still appends to declined", () => {
        const h = makeHarness(makeBaseState({
            sponsorOffers: [{ id: "o1" } as never],
            declinedSponsorOfferIds: [],
        }))
        const slice = createSponsorshipSlice(h.set, h.get)
        slice.declineSponsorOffer("ghost_id")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(h.state().sponsorOffers.map(o => (o as any).id)).toEqual(["o1"])
        expect(h.state().declinedSponsorOfferIds).toEqual(["ghost_id"])
    })
})
