/**
 * Tests for the weekly sponsor-goals processor.
 *
 * This is the money-path that pays out bonuses when a team hits a
 * sponsor goal (gain followers / maintain morale). Idempotency is
 * critical: a rollback/resume path can re-enter the same week, so
 * the processor must NOT double-pay.
 *
 * Coverage:
 *   - "Gain Followers" goal accumulates from this week's follower delta
 *     (uses sponsor.followerCheckpoint to avoid double-counting)
 *   - "Maintain Morale > 80" goal bumps +1 only when avg morale > 80
 *   - Hitting target → goal locked at target, payout to budget,
 *     ledger row written, SPONSOR_OFFER event surfaced on player team
 *   - Non-player team payouts: ledger row only, no event
 *   - Idempotency: re-running same week doesn't double-pay
 *   - Ledger dedup: same payout id won't add a second row
 *   - Sponsor expiry: remainingWeeks decrements; sponsor dropped at 0
 *   - Expiry event surfaced on player team only
 */

import { processWeeklySponsorGoals } from "@/engine/processors/sponsor-goals-processor"
import type { GameSave, TeamSaveData, SponsorSaveData } from "@/engine/save-types"

function makeTeam(id: string, overrides: Partial<TeamSaveData> = {}): TeamSaveData {
    return {
        id, name: id, shortName: id.slice(0, 4).toUpperCase(),
        budget: 100_000, rosterIds: ["p1", "p2"], staffIds: [],
        trophies: [], facilities: [], sponsors: [],
        followers: 0, fanbase: 1000, playstyle: "default", reputation: 50,
        region: "EU", facilitiesLevel: 1, leagueTier: "B_TIER",
        elo: 1500, recentForm: [],
        ...overrides,
    } as unknown as TeamSaveData
}

interface Goal {
    id: string
    description: string
    current: number
    target: number
    bonusPayout: number
    isCompleted: boolean
}

function makeSponsor(
    id: string,
    overrides: Partial<{
        name: string
        remainingWeeks: number
        lastProcessedWeek: number
        followerCheckpoint: number
        goals: Goal[]
    }> = {}
): SponsorSaveData {
    return {
        id, name: id, tier: "BASIC",
        contractLength: 52, weeklyPayment: 5000,
        remainingWeeks: 50,
        goals: [],
        ...overrides,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any as SponsorSaveData
}

function makeSave(overrides: Partial<GameSave> = {}): GameSave {
    return {
        currentWeek: 10,
        playerTeamId: "player",
        teams: [],
        players: [
            { id: "p1", morale: 75 },
            { id: "p2", morale: 75 },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ] as any,
        contracts: [],
        staff: [],
        marketStaff: [],
        academyPlayers: [],
        scheduledMatches: [],
        completedMatches: [],
        scheduledActivities: [],
        financeLedger: [],
        eventsLog: [],
        newsFeed: [],
        tournaments: [],
        tournamentQualifications: [],
        lastRngSeed: 1,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(overrides as any),
    } as unknown as GameSave
}

describe("processWeeklySponsorGoals — Gain Followers goal", () => {
    test("progresses by the follower delta since lastChecked", () => {
        const sponsor = makeSponsor("s1", {
            followerCheckpoint: 1000,
            goals: [{
                id: "g1", description: "Gain Followers",
                current: 0, target: 500, bonusPayout: 10000, isCompleted: false,
            }],
        })
        const save = makeSave({
            teams: [makeTeam("player", { followers: 1300, sponsors: [sponsor] })],
        })
        processWeeklySponsorGoals(save)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const goal = ((save.teams[0] as any).sponsors[0] as any).goals[0]
        expect(goal.current).toBe(300) // 1300 - 1000
        expect(goal.isCompleted).toBe(false)
    })

    test("hitting target pays bonus to player team, writes ledger row, surfaces event", () => {
        const sponsor = makeSponsor("s1", {
            followerCheckpoint: 1000,
            goals: [{
                id: "g1", description: "Gain Followers",
                current: 100, target: 500, bonusPayout: 25000, isCompleted: false,
            }],
        })
        const save = makeSave({
            teams: [makeTeam("player", { followers: 1500, sponsors: [sponsor], budget: 50_000 })],
        })
        processWeeklySponsorGoals(save)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const goal = ((save.teams[0] as any).sponsors[0] as any).goals[0]
        expect(goal.current).toBe(500) // capped at target
        expect(goal.isCompleted).toBe(true)
        expect(save.teams[0].budget).toBe(75_000) // 50k + 25k
        const ledgerRow = save.financeLedger.find(e => e.category === "SPONSOR")
        expect(ledgerRow).toBeDefined()
        expect(ledgerRow!.amount).toBe(25000)
        const evt = save.eventsLog.find(e => e.type === "SPONSOR_OFFER")
        expect(evt).toBeDefined()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((evt as any).data.title).toBe("Sponsor Goal Met")
    })

    test("non-player team gets the payout but NOT an event", () => {
        const sponsor = makeSponsor("s1", {
            followerCheckpoint: 1000,
            goals: [{
                id: "g1", description: "Gain Followers",
                current: 100, target: 500, bonusPayout: 25000, isCompleted: false,
            }],
        })
        const save = makeSave({
            teams: [makeTeam("rival", { followers: 1500, sponsors: [sponsor], budget: 50_000 })],
            playerTeamId: "player", // rival is NOT the player team
        })
        processWeeklySponsorGoals(save)
        expect(save.teams[0].budget).toBe(75_000) // payout fired
        expect(save.financeLedger.length).toBe(1)
        expect(save.eventsLog.length).toBe(0)    // but no event surfaced
    })

    test("goals do NOT progress if current < target before delta is added (gain=0 case)", () => {
        const sponsor = makeSponsor("s1", {
            followerCheckpoint: 1500,
            goals: [{
                id: "g1", description: "Gain Followers",
                current: 100, target: 500, bonusPayout: 25000, isCompleted: false,
            }],
        })
        const save = makeSave({
            // followers = 1000, checkpoint = 1500 → gain clamped to 0
            teams: [makeTeam("player", { followers: 1000, sponsors: [sponsor] })],
        })
        processWeeklySponsorGoals(save)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const goal = ((save.teams[0] as any).sponsors[0] as any).goals[0]
        expect(goal.current).toBe(100) // unchanged
    })
})

describe("processWeeklySponsorGoals — Maintain Morale > 80 goal", () => {
    test("bumps +1 when roster avg morale > 80", () => {
        const sponsor = makeSponsor("s1", {
            goals: [{
                id: "g1", description: "Maintain Morale > 80 (10 weeks)",
                current: 0, target: 10, bonusPayout: 10000, isCompleted: false,
            }],
        })
        const save = makeSave({
            teams: [makeTeam("player", { sponsors: [sponsor] })],
            players: [
                { id: "p1", morale: 90 },
                { id: "p2", morale: 85 },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ] as any,
        })
        processWeeklySponsorGoals(save)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(((save.teams[0] as any).sponsors[0] as any).goals[0].current).toBe(1)
    })

    test("does NOT bump when roster avg morale is exactly 80 (strict >)", () => {
        const sponsor = makeSponsor("s1", {
            goals: [{
                id: "g1", description: "Maintain Morale > 80",
                current: 0, target: 10, bonusPayout: 10000, isCompleted: false,
            }],
        })
        const save = makeSave({
            teams: [makeTeam("player", { sponsors: [sponsor] })],
            players: [
                { id: "p1", morale: 80 },
                { id: "p2", morale: 80 },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ] as any,
        })
        processWeeklySponsorGoals(save)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(((save.teams[0] as any).sponsors[0] as any).goals[0].current).toBe(0)
    })
})

describe("processWeeklySponsorGoals — idempotency + expiry", () => {
    test("re-running the same week is a no-op (lastProcessedWeek short-circuit)", () => {
        const sponsor = makeSponsor("s1", {
            lastProcessedWeek: 10, // already processed this week
            followerCheckpoint: 1000,
            goals: [{
                id: "g1", description: "Gain Followers",
                current: 0, target: 500, bonusPayout: 10000, isCompleted: false,
            }],
        })
        const save = makeSave({
            currentWeek: 10,
            teams: [makeTeam("player", { followers: 9999, sponsors: [sponsor] })],
        })
        processWeeklySponsorGoals(save)
        // Goal current is NOT bumped (re-entry short-circuited).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const goal = ((save.teams[0] as any).sponsors[0] as any).goals[0]
        expect(goal.current).toBe(0)
    })

    test("ledger dedup: same payout id is not double-added on re-entry", () => {
        const payoutId = `fin_sponsor_goal_10_player_s1_g1`
        const sponsor = makeSponsor("s1", {
            followerCheckpoint: 1000,
            goals: [{
                id: "g1", description: "Gain Followers",
                current: 600, target: 500, bonusPayout: 10000, isCompleted: false, // already exceeds target
            }],
        })
        const save = makeSave({
            currentWeek: 10,
            teams: [makeTeam("player", { followers: 1500, sponsors: [sponsor], budget: 50_000 })],
            financeLedger: [{
                id: payoutId, week: 10, teamId: "player",
                type: "INCOME", category: "SPONSOR", amount: 10000,
                description: "Goal Reached: Gain Followers", balance: 60_000,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            }] as any,
        })
        processWeeklySponsorGoals(save)
        // Ledger still has exactly 1 entry, budget NOT double-credited.
        expect(save.financeLedger.length).toBe(1)
        expect(save.teams[0].budget).toBe(50_000)
    })

    test("sponsor with remainingWeeks=1 expires after this tick (dropped from team.sponsors)", () => {
        const sponsor = makeSponsor("s1", {
            name: "Ending Sponsor",
            remainingWeeks: 1,
            goals: [],
        })
        const save = makeSave({
            teams: [makeTeam("player", { sponsors: [sponsor] })],
        })
        processWeeklySponsorGoals(save)
        expect(save.teams[0].sponsors!.length).toBe(0)
        // Player gets a "contract ended" event.
        const evt = save.eventsLog.find(e =>
            e.type === "SPONSOR_OFFER" &&
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (e as any).data?.title === "Sponsor Contract Ended"
        )
        expect(evt).toBeDefined()
    })

    test("expiry of a non-player team's sponsor does NOT surface an event", () => {
        const sponsor = makeSponsor("s1", { remainingWeeks: 1, goals: [] })
        const save = makeSave({
            teams: [makeTeam("rival", { sponsors: [sponsor] })],
            playerTeamId: "player",
        })
        processWeeklySponsorGoals(save)
        expect(save.teams[0].sponsors!.length).toBe(0)
        expect(save.eventsLog.length).toBe(0)
    })

    test("sponsor with remainingWeeks > 1 survives the tick, decremented by 1", () => {
        const sponsor = makeSponsor("s1", { remainingWeeks: 5, goals: [] })
        const save = makeSave({
            teams: [makeTeam("player", { sponsors: [sponsor] })],
        })
        processWeeklySponsorGoals(save)
        expect(save.teams[0].sponsors!.length).toBe(1)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((save.teams[0].sponsors![0] as any).remainingWeeks).toBe(4)
    })
})
