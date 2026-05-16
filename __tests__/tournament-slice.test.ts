/**
 * Tests for the tournament slice — focused on qualifyForTournament and
 * awardCircuitPoints, the two paths that don't require synthesizing a
 * FULL_TOURNAMENT_CALENDAR entry. registerForTournament and
 * checkTournamentEligibility lean heavily on real tournament data
 * and the QualificationEngine; those paths are exercised indirectly
 * by the week-tick smoke tests.
 *
 * Coverage:
 *   qualifyForTournament
 *     - idempotent: same tournament instance won't be added twice
 *     - happy path: writes a QUALIFIED row with normalized identity
 *
 *   awardCircuitPoints
 *     - placement-1 (winner) creates a circuitPoints entry, news item,
 *       championships++ on player-team S_TIER wins
 *     - subsequent placements accumulate onto the same circuitPoints
 *       entry (results[] grows; points stack)
 *     - placement with 0-point payout returns silently (no entry, no
 *       news)
 *     - non-player-team winner doesn't bump managerDetails.championships
 *     - news pushed to newsFeed AND capped at 50
 */

import { produce, enableMapSet } from "immer"
import { createTournamentSlice } from "@/store/slices/tournament-slice"
import { FULL_TOURNAMENT_CALENDAR, CIRCUIT_POINTS } from "@/data/tournament-calendar"
import { steamService } from "@/engine/steam-service"
import type { TeamSaveData } from "@/engine/save-types"
import type { StoreState } from "@/store/types"

enableMapSet()

interface ServiceSnapshot {
    isInitialized: boolean
    electronBridge: unknown
}

function attachStubSteam(): ServiceSnapshot {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = steamService as any
    const previous: ServiceSnapshot = {
        isInitialized: svc.isInitialized,
        electronBridge: svc.electronBridge,
    }
    svc.isInitialized = true
    svc.electronBridge = null // stub mode — calls are no-ops
    return previous
}

function restoreSteam(previous: ServiceSnapshot): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = steamService as any
    svc.isInitialized = previous.isInitialized
    svc.electronBridge = previous.electronBridge
}

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
        budget: 100_000, rosterIds: [], staffIds: [],
        trophies: [], facilities: [], sponsors: [],
        fanbase: 1000, playstyle: "default", reputation: 50,
        region: "EU", facilitiesLevel: 1, leagueTier: "B_TIER",
        elo: 1500, recentForm: [],
        ...overrides,
    } as unknown as TeamSaveData
}

function makeBaseState(overrides: Partial<StoreState> = {}): Partial<StoreState> {
    return {
        teams: [makeTeam("player"), makeTeam("rival")],
        players: [],
        tournamentQualifications: [],
        circuitPoints: [],
        newsFeed: [],
        eventsLog: [],
        currentWeek: 5,
        playerTeamId: "player",
        managerDetails: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            name: "Test Mgr", championships: 0,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        lastRngSeed: 1,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(overrides as any),
    }
}

describe("qualifyForTournament", () => {
    let snap: ServiceSnapshot | null = null
    beforeEach(() => { snap = attachStubSteam() })
    afterEach(() => { if (snap) restoreSteam(snap); snap = null })

    test("pushes a QUALIFIED row for the player team", () => {
        const tournamentId = FULL_TOURNAMENT_CALENDAR[0]?.id
        if (!tournamentId) return
        const h = makeHarness(makeBaseState())
        const slice = createTournamentSlice(h.set, h.get)
        slice.qualifyForTournament(tournamentId, "POINTS")
        expect(h.state().tournamentQualifications.length).toBe(1)
        const row = h.state().tournamentQualifications[0]
        expect(row.status).toBe("QUALIFIED")
        expect(row.teamId).toBe("player")
    })

    test("idempotent: same tournament won't be added twice", () => {
        const tournamentId = FULL_TOURNAMENT_CALENDAR[0]?.id
        if (!tournamentId) return
        const h = makeHarness(makeBaseState())
        const slice = createTournamentSlice(h.set, h.get)
        slice.qualifyForTournament(tournamentId, "POINTS")
        slice.qualifyForTournament(tournamentId, "POINTS")
        expect(h.state().tournamentQualifications.length).toBe(1)
    })

    test("no-op when playerTeamId is missing (legacy save with no team selected)", () => {
        const tournamentId = FULL_TOURNAMENT_CALENDAR[0]?.id
        if (!tournamentId) return
        const h = makeHarness(makeBaseState({ playerTeamId: null }))
        const slice = createTournamentSlice(h.set, h.get)
        slice.qualifyForTournament(tournamentId, "POINTS")
        expect(h.state().tournamentQualifications.length).toBe(0)
    })
})

describe("awardCircuitPoints", () => {
    let snap: ServiceSnapshot | null = null
    beforeEach(() => { snap = attachStubSteam() })
    afterEach(() => { if (snap) restoreSteam(snap); snap = null })

    test("placement-1 winner creates a circuitPoints entry + news item", () => {
        // Pick a real tournament from the calendar (any with a valid tier).
        const tournament = FULL_TOURNAMENT_CALENDAR.find(t => t.tier in CIRCUIT_POINTS)
        if (!tournament) return
        const h = makeHarness(makeBaseState())
        const slice = createTournamentSlice(h.set, h.get)
        slice.awardCircuitPoints("player", tournament.id, 1)
        expect(h.state().circuitPoints.length).toBe(1)
        expect(h.state().circuitPoints[0].teamId).toBe("player")
        expect(h.state().circuitPoints[0].points).toBeGreaterThan(0)
        // News item logged.
        const news = h.state().newsFeed.find(n => n.category === "TOURNAMENT")
        expect(news).toBeDefined()
        expect(news!.title).toContain("win")
    })

    test("subsequent placements accumulate points onto the same circuitPoints entry", () => {
        const tournament = FULL_TOURNAMENT_CALENDAR.find(t => t.tier in CIRCUIT_POINTS)
        if (!tournament) return
        const h = makeHarness(makeBaseState())
        const slice = createTournamentSlice(h.set, h.get)
        slice.awardCircuitPoints("player", tournament.id, 1)
        const pointsAfterFirst = h.state().circuitPoints[0].points
        slice.awardCircuitPoints("player", tournament.id, 2)
        const after = h.state().circuitPoints
        // Still exactly 1 circuitPoints entry (accumulator pattern).
        expect(after.length).toBe(1)
        expect(after[0].points).toBeGreaterThanOrEqual(pointsAfterFirst)
        // results[] grew to length 2.
        expect(after[0].results.length).toBe(2)
    })

    test("placement payout of 0 is a silent no-op (no entry, no news)", () => {
        const tournament = FULL_TOURNAMENT_CALENDAR.find(t => t.tier in CIRCUIT_POINTS)
        if (!tournament) return
        const h = makeHarness(makeBaseState())
        const slice = createTournamentSlice(h.set, h.get)
        // Picking an absurdly high placement → no points table entry → 0 payout
        slice.awardCircuitPoints("player", tournament.id, 999)
        expect(h.state().circuitPoints.length).toBe(0)
        expect(h.state().newsFeed.length).toBe(0)
    })

    test("rival team winning S_TIER does NOT bump managerDetails.championships", () => {
        const sTier = FULL_TOURNAMENT_CALENDAR.find(t => t.tier === "S_TIER")
        if (!sTier) return
        const h = makeHarness(makeBaseState())
        const slice = createTournamentSlice(h.set, h.get)
        slice.awardCircuitPoints("rival", sTier.id, 1)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((h.state().managerDetails as any).championships).toBe(0)
    })

    test("player winning S_TIER bumps championships counter", () => {
        const sTier = FULL_TOURNAMENT_CALENDAR.find(t => t.tier === "S_TIER")
        if (!sTier) return
        const h = makeHarness(makeBaseState())
        const slice = createTournamentSlice(h.set, h.get)
        slice.awardCircuitPoints("player", sTier.id, 1)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((h.state().managerDetails as any).championships).toBe(1)
    })

    test("newsFeed stays capped at 50 entries on win-spam", () => {
        const tournament = FULL_TOURNAMENT_CALENDAR.find(t => t.tier in CIRCUIT_POINTS)
        if (!tournament) return
        // Seed newsFeed at the cap.
        const seeded = Array.from({ length: 50 }, (_, i) => ({
            id: `old_${i}`, title: `Old ${i}`, content: "",
            category: "TOURNAMENT", teamId: "rival", week: 1,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any)
        const h = makeHarness(makeBaseState({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            newsFeed: seeded as any,
        }))
        const slice = createTournamentSlice(h.set, h.get)
        slice.awardCircuitPoints("player", tournament.id, 1)
        expect(h.state().newsFeed.length).toBe(50)
        // Newest news at index 0.
        expect(h.state().newsFeed[0].teamId).toBe("player")
    })
})
