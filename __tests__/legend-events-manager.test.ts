/**
 * Tests for LegendEventsManager — the rare visiting-legend events
 * the week tick rolls each week for the player team.
 *
 * Two event types:
 *   - Mentorship (2%/week): a founding legend visits, picks a random
 *     player, grants +1 skill point + 15 morale
 *   - Coach Opportunity (0.5%/week): a legend offers to come out of
 *     retirement as a coach; surfaces a CONTRACT_OFFER event with
 *     hire/decline choices
 *
 * Both gated by playerTeamId — AI teams never trigger these.
 *
 * The probability rolls go through SeededRNG so we can drive them
 * deterministically by choosing seeds that produce known low/high
 * first values.
 */

import { LegendEventsManager } from "@/engine/legend-events-manager"
import { SeededRNG } from "@/engine/rng"
import type { GameSave, TeamSaveData, PlayerSaveData } from "@/engine/save-types"

function makeTeam(id: string, overrides: Partial<TeamSaveData> = {}): TeamSaveData {
    return {
        id, name: id, shortName: id.slice(0, 4).toUpperCase(),
        budget: 100_000, rosterIds: ["p1", "p2"], staffIds: [],
        trophies: [], facilities: [], sponsors: [],
        fanbase: 1000, playstyle: "default", reputation: 50,
        region: "EU", facilitiesLevel: 1, leagueTier: "B_TIER",
        elo: 1500, recentForm: [],
        ...overrides,
    } as unknown as TeamSaveData
}

function makePlayer(id: string, overrides: Partial<PlayerSaveData> = {}): PlayerSaveData {
    return {
        id, nickname: id, firstName: id, lastName: "P",
        age: 22, nationality: "US", role: "RIFLER",
        rifle: 70, awp: 60, pistol: 65, grenades: 60, creativity: 60,
        clutch: 60, tactic: 60, leader: 55, teamwork: 65,
        reaction: 70, eyesight: 70,
        morale: 50, form: 70, fatigue: 0, energy: 100, maxEnergy: 100,
        level: 1, xp: 0, xpToNextLevel: 1000, availableSkillPoints: 0, talentPoints: 0,
        unlockedTalentIds: [], majorWins: 0, matchesPlayed: 0,
        totalKills: 0, totalDeaths: 0, totalMVPs: 0,
        skill: 70, potential: 85, productivity: 60, endurance: 70,
        ...overrides,
    } as unknown as PlayerSaveData
}

function makeSave(overrides: Partial<GameSave> = {}): GameSave {
    return {
        currentWeek: 10,
        playerTeamId: "player",
        teams: [makeTeam("player", { rosterIds: ["p1", "p2"] })],
        players: [makePlayer("p1"), makePlayer("p2")],
        contracts: [], staff: [], marketStaff: [],
        scheduledMatches: [], completedMatches: [], scheduledActivities: [],
        financeLedger: [], eventsLog: [], newsFeed: [],
        tournaments: [], tournamentQualifications: [],
        academyPlayers: [],
        gameStartDate: new Date("2024-01-01").toISOString(),
        lastRngSeed: 1,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(overrides as any),
    } as unknown as GameSave
}

/**
 * Find a seed whose first SeededRNG.next() call returns a value
 * matching the predicate. We hand-search a small window to keep the
 * test pure (no probability mocking).
 */
function findSeedForFirstRoll(predicate: (v: number) => boolean, max = 1000): number {
    for (let seed = 1; seed < max; seed++) {
        const rng = new SeededRNG(seed)
        if (predicate(rng.next())) return seed
    }
    throw new Error("No suitable seed in range")
}

describe("processWeeklyLegendEvents — playerTeamId gate", () => {
    test("missing player team is a no-op", () => {
        // Search aggressively to ensure first roll would have triggered
        // mentorship; the gate must still suppress.
        const seedHit = findSeedForFirstRoll(v => v < 0.02)
        const save = makeSave({ teams: [makeTeam("rival")] })
        LegendEventsManager.processWeeklyLegendEvents(save, "ghost_team", new SeededRNG(seedHit))
        expect(save.eventsLog.length).toBe(0)
    })

    test("empty roster: no mentorship event even if roll fires", () => {
        const seedHit = findSeedForFirstRoll(v => v < 0.02)
        const save = makeSave({
            teams: [makeTeam("player", { rosterIds: [] })],
        })
        LegendEventsManager.processWeeklyLegendEvents(save, "player", new SeededRNG(seedHit))
        // The function returns early on the empty-roster guard; mentorship
        // doesn't surface but the COACH roll might still fire on its second
        // rng.next(). Tolerate either 0 or 1 events.
        const mentorshipEvts = save.eventsLog.filter(e => e.id.startsWith("legend_mentorship_"))
        expect(mentorshipEvts.length).toBe(0)
    })
})

describe("processWeeklyLegendEvents — Mentorship", () => {
    test("when the mentorship roll fires, surfaces a NEWS event + boosts a player", () => {
        // Find a seed whose first roll is < 0.02 (triggers mentorship).
        const seed = findSeedForFirstRoll(v => v < 0.02)
        const save = makeSave({
            players: [
                makePlayer("p1", { availableSkillPoints: 0, morale: 50 }),
                makePlayer("p2", { availableSkillPoints: 0, morale: 50 }),
            ],
        })
        LegendEventsManager.processWeeklyLegendEvents(save, "player", new SeededRNG(seed))
        const evt = save.eventsLog.find(e => e.id.startsWith("legend_mentorship_"))
        expect(evt).toBeDefined()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((evt as any).type).toBe("NEWS")
        // One player has +1 skill point AND +15 morale.
        const boosted = save.players.find(p =>
            (p.availableSkillPoints ?? 0) === 1 && p.morale === 65
        )
        expect(boosted).toBeDefined()
    })

    test("morale clamps at 100 (already-high morale doesn't overflow)", () => {
        const seed = findSeedForFirstRoll(v => v < 0.02)
        const save = makeSave({
            players: [
                makePlayer("p1", { morale: 95 }),
                makePlayer("p2", { morale: 95 }),
            ],
        })
        LegendEventsManager.processWeeklyLegendEvents(save, "player", new SeededRNG(seed))
        // Whichever player got mentored, morale is capped at 100.
        for (const p of save.players) {
            expect(p.morale).toBeLessThanOrEqual(100)
        }
        // At least one player has 100 (got the boost from 95→110→100).
        expect(save.players.some(p => p.morale === 100)).toBe(true)
    })

    test("no roll fires when first next() is above the 2% threshold", () => {
        // Most seeds produce a first roll >= 0.02; pick one explicitly.
        const seed = findSeedForFirstRoll(v => v > 0.5)
        const save = makeSave()
        LegendEventsManager.processWeeklyLegendEvents(save, "player", new SeededRNG(seed))
        const mentorshipEvts = save.eventsLog.filter(e => e.id.startsWith("legend_mentorship_"))
        expect(mentorshipEvts.length).toBe(0)
    })
})

describe("processWeeklyLegendEvents — news body reaches the UI", () => {
    // Regression: legend events used to set only data.text, so NewsApp's
    // getNewsHeadline/getNewsContent fell through to "News Update" /
    // "No additional details available." They must now carry {title, message}
    // (the shape NewsApp's default branches read) while keeping `text` for
    // save-compatibility.
    test("mentorship event carries a title + message (not just text)", () => {
        const seed = findSeedForFirstRoll(v => v < 0.02)
        const save = makeSave()
        LegendEventsManager.processWeeklyLegendEvents(save, "player", new SeededRNG(seed))
        const evt = save.eventsLog.find(e => e.id.startsWith("legend_mentorship_"))
        expect(evt).toBeDefined()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = (evt as any).data
        expect(typeof data.title).toBe("string")
        expect(data.title.length).toBeGreaterThan(0)
        expect(typeof data.message).toBe("string")
        expect(data.message).toContain("mentorship session")
        // NewsApp default branches would otherwise show the generic fallbacks.
        expect(data.title).not.toBe("News Update")
        expect(data.message).not.toBe("No additional details available.")
        // Legacy field preserved for old-save compatibility.
        expect(data.text).toBe(data.message)
    })

    test("coach opportunity event carries a title + message", () => {
        let found = false
        for (let seed = 1; seed < 50_000 && !found; seed++) {
            const rng = new SeededRNG(seed)
            const v1 = rng.next()
            const v2 = rng.next()
            if (v1 >= 0.02 && v2 < 0.005) {
                const save = makeSave()
                LegendEventsManager.processWeeklyLegendEvents(save, "player", new SeededRNG(seed))
                const evt = save.eventsLog.find(e => e.id.startsWith("legend_coach_opportunity_"))
                if (!evt) continue
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const data = (evt as any).data
                expect(typeof data.title).toBe("string")
                expect(data.title.length).toBeGreaterThan(0)
                expect(typeof data.message).toBe("string")
                expect(data.message).toContain("coach")
                expect(data.text).toBe(data.message)
                found = true
            }
        }
        expect(found).toBe(true)
    })
})

describe("processWeeklyLegendEvents — Coach Opportunity", () => {
    test("when the coach-opportunity roll fires, surfaces a CONTRACT_OFFER event with two choices", () => {
        // Need a seed where rng.next()[0] >= 0.02 (skip mentorship) AND
        // rng.next()[1] < 0.005 (trigger coach offer). Hunt in a wider window.
        let found = false
        for (let seed = 1; seed < 50_000 && !found; seed++) {
            const rng = new SeededRNG(seed)
            const v1 = rng.next()
            const v2 = rng.next()
            if (v1 >= 0.02 && v2 < 0.005) {
                const save = makeSave()
                LegendEventsManager.processWeeklyLegendEvents(save, "player", new SeededRNG(seed))
                const evt = save.eventsLog.find(e => e.id.startsWith("legend_coach_opportunity_"))
                if (!evt) continue
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                expect((evt as any).type).toBe("CONTRACT_OFFER")
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                expect((evt as any).choices).toBeDefined()
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                expect((evt as any).choices.length).toBe(2)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const choiceIds = (evt as any).choices.map((c: { id: string }) => c.id)
                expect(choiceIds).toContain("hire")
                expect(choiceIds).toContain("decline")
                found = true
            }
        }
        expect(found).toBe(true)
    })
})
