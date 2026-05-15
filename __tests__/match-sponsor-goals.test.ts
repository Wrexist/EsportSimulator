/**
 * Coverage for engine/processors/match-sponsor-goals.ts.
 *
 * Pins the per-match sponsor-goal progress logic extracted in
 * Phase M2 from atomic-week-processor.ts. This runs twice per
 * completed match (once per team) and:
 *   - Bumps "Win Matches" goal counters by 1 if the team won
 *   - Bumps "Win Tournament maps" counters by mapsWon
 *   - Caps progress at goal.target + flips isCompleted
 *   - Pays bonusPayout into team.budget + logs to financeLedger
 *   - Pushes a SPONSOR_OFFER event for the player team only
 *   - Idempotent: ledger + event IDs scope to (week, team, sponsor,
 *     goal, match) so re-runs don't double-pay
 */

import { applyMatchSponsorGoalProgress } from "@/engine/processors/match-sponsor-goals"
import type { GameSave, TeamSaveData, SponsorSaveData } from "@/engine/save-types"

function makeSponsor(overrides: Partial<SponsorSaveData> = {}): SponsorSaveData {
    return {
        id: "s1", name: "Acme",
        tier: "STANDARD",
        weeklyPayout: 1000,
        remainingWeeks: 12,
        requirements: "",
        goals: [],
        ...overrides,
    } as SponsorSaveData
}

function makeTeam(overrides: Partial<TeamSaveData> = {}): TeamSaveData {
    return {
        id: "team_a", name: "Team A", shortName: "TA",
        budget: 100_000, rosterIds: [], staffIds: [],
        trophies: [], facilities: [], sponsors: [],
        fanbase: 0, playstyle: "default", reputation: 50,
        region: "EU", facilitiesLevel: 1,
        ...overrides,
    } as unknown as TeamSaveData
}

function makeSave(team: TeamSaveData, playerTeamId: string = team.id): GameSave {
    return {
        saveVersion: 6, saveId: "test", saveName: "test",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        currentWeek: 10, currentDay: 6, timeMode: "WEEKLY",
        gameStartDate: new Date().toISOString(),
        managerDetails: {} as any,
        lastRngSeed: 1, playerTeamId,
        teams: [team], players: [], contracts: [], staff: [],
        tournaments: [], scheduledMatches: [], completedMatches: [],
        scheduledActivities: [], financeLedger: [], eventsLog: [], newsFeed: [],
        acknowledgedEventIds: [], hallOfFame: [], legendaryPlayers: [],
        weekTickState: null,
    } as unknown as GameSave
}

describe("applyMatchSponsorGoalProgress", () => {
    test("no sponsors → no-op", () => {
        const team = makeTeam({ sponsors: [] })
        const save = makeSave(team)
        applyMatchSponsorGoalProgress(save, team, true, 2, "m1")
        expect(save.financeLedger.length).toBe(0)
    })

    test("'Win Matches' goal increments by 1 on a win", () => {
        const sponsor = makeSponsor({
            goals: [{ id: "g1", description: "Win Matches", current: 0, target: 3, bonusPayout: 5000, isCompleted: false }],
        })
        const team = makeTeam({ sponsors: [sponsor] })
        const save = makeSave(team)

        applyMatchSponsorGoalProgress(save, team, true, 2, "m1")

        expect(sponsor.goals![0].current).toBe(1)
        expect(sponsor.goals![0].isCompleted).toBe(false)
        expect(save.financeLedger.length).toBe(0)
    })

    test("'Win Matches' does NOT increment on a loss", () => {
        const sponsor = makeSponsor({
            goals: [{ id: "g1", description: "Win Matches", current: 2, target: 3, bonusPayout: 5000, isCompleted: false }],
        })
        const team = makeTeam({ sponsors: [sponsor] })
        const save = makeSave(team)

        applyMatchSponsorGoalProgress(save, team, false, 1, "m1")

        expect(sponsor.goals![0].current).toBe(2) // unchanged
    })

    test("'Win Tournament maps' increments by mapsWon (counts every map)", () => {
        const sponsor = makeSponsor({
            goals: [{ id: "g1", description: "Win Tournament maps", current: 5, target: 20, bonusPayout: 8000, isCompleted: false }],
        })
        const team = makeTeam({ sponsors: [sponsor] })
        const save = makeSave(team)

        applyMatchSponsorGoalProgress(save, team, true, 3, "m1")

        expect(sponsor.goals![0].current).toBe(8) // 5 + 3
    })

    test("hitting target pays the bonus and flips isCompleted", () => {
        const sponsor = makeSponsor({
            goals: [{ id: "g1", description: "Win Matches", current: 2, target: 3, bonusPayout: 5000, isCompleted: false }],
        })
        const team = makeTeam({ sponsors: [sponsor], budget: 100_000 })
        const save = makeSave(team)

        applyMatchSponsorGoalProgress(save, team, true, 1, "m1")

        expect(sponsor.goals![0].current).toBe(3)
        expect(sponsor.goals![0].isCompleted).toBe(true)
        expect(team.budget).toBe(105_000)
        expect(save.financeLedger.length).toBe(1)
        expect(save.financeLedger[0].amount).toBe(5000)
        expect(save.financeLedger[0].category).toBe("SPONSOR")
    })

    test("overshooting target caps current at target", () => {
        const sponsor = makeSponsor({
            goals: [{ id: "g1", description: "Win Tournament maps", current: 18, target: 20, bonusPayout: 8000, isCompleted: false }],
        })
        const team = makeTeam({ sponsors: [sponsor] })
        const save = makeSave(team)

        applyMatchSponsorGoalProgress(save, team, true, 5, "m1")

        // current would be 23, but should cap at 20.
        expect(sponsor.goals![0].current).toBe(20)
    })

    test("player team gets a SPONSOR_OFFER event; AI team does not", () => {
        const sponsor = makeSponsor({
            goals: [{ id: "g1", description: "Win Matches", current: 2, target: 3, bonusPayout: 5000, isCompleted: false }],
        })
        const playerTeam = makeTeam({ id: "player", sponsors: [sponsor] })
        const save = makeSave(playerTeam, "player")

        applyMatchSponsorGoalProgress(save, playerTeam, true, 1, "m1")

        const events = save.eventsLog.filter(e => e.type === "SPONSOR_OFFER")
        expect(events.length).toBe(1)
        expect((events[0].data as any).title).toBe("Sponsor Goal Met")

        // Now reset and try with AI team — no event.
        const ai = makeTeam({ id: "ai_1", sponsors: [makeSponsor({
            goals: [{ id: "g2", description: "Win Matches", current: 2, target: 3, bonusPayout: 5000, isCompleted: false }],
        })] })
        const aiSave = makeSave(ai, "player") // player is someone else
        applyMatchSponsorGoalProgress(aiSave, ai, true, 1, "m1")

        const aiEvents = aiSave.eventsLog.filter(e => e.type === "SPONSOR_OFFER")
        expect(aiEvents.length).toBe(0)
    })

    test("already-completed goal is skipped (no double payment)", () => {
        const sponsor = makeSponsor({
            goals: [{ id: "g1", description: "Win Matches", current: 3, target: 3, bonusPayout: 5000, isCompleted: true }],
        })
        const team = makeTeam({ sponsors: [sponsor], budget: 100_000 })
        const save = makeSave(team)

        applyMatchSponsorGoalProgress(save, team, true, 1, "m1")

        expect(team.budget).toBe(100_000)
        expect(save.financeLedger.length).toBe(0)
    })

    test("idempotent: re-running same matchId does NOT double-pay", () => {
        const sponsor = makeSponsor({
            goals: [{ id: "g1", description: "Win Matches", current: 2, target: 3, bonusPayout: 5000, isCompleted: false }],
        })
        const team = makeTeam({ sponsors: [sponsor], budget: 100_000 })
        const save = makeSave(team)

        // First call: pays.
        applyMatchSponsorGoalProgress(save, team, true, 1, "m1")
        expect(team.budget).toBe(105_000)
        expect(save.financeLedger.length).toBe(1)

        // Reset isCompleted flag (simulating bad state) and re-run with same matchId.
        sponsor.goals![0].isCompleted = false
        sponsor.goals![0].current = 2
        applyMatchSponsorGoalProgress(save, team, true, 1, "m1")

        // Still only one ledger entry — keyed on matchId.
        expect(save.financeLedger.length).toBe(1)
        // But goal was bumped to 3 again (then completed flag re-set).
        expect(sponsor.goals![0].isCompleted).toBe(true)
        // Budget unchanged from first payment (no double-pay).
        expect(team.budget).toBe(105_000)
    })
})
