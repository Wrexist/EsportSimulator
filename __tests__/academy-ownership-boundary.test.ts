/**
 * Academy ownership boundary tests.
 *
 * Two HIGH audit bugs + one immersion fix are pinned here:
 *
 *  1. ai-youth-pollutes-player-academy — season-end youth intake for an AI
 *     club must NOT push prospects into the single global save.academyPlayers
 *     array (which the player's Academy UI/upkeep/capacity/promotion all read
 *     unfiltered). AI youth belong to the owning club's youthAcademyIds.
 *
 *  2. ai-poaches-academy-prospects — signFreeAgent must never treat the
 *     player's enrolled prospects (academyPlayers), pending-review prospects
 *     (academyPendingProspects), or any club's youth intake (youthAcademyIds)
 *     as signable free agents.
 *
 *  3. youth-intake-cardboard-players — regens must have real region names, not
 *     "Youth Prospect", and varied nicknames.
 */

import { processAIWorldLogic } from "@/engine/processors/ai-world-processor"
import { signFreeAgent } from "@/engine/ai/roster-management"
import { SeededRNG } from "@/engine/rng"
import type { GameSave, TeamSaveData, PlayerSaveData } from "@/engine/save-types"

function makeTeam(id: string, overrides: Partial<TeamSaveData> = {}): TeamSaveData {
    return {
        id, name: id, shortName: id.slice(0, 4).toUpperCase(),
        budget: 1_000_000, rosterIds: [], staffIds: [],
        trophies: [], facilities: [], sponsors: [],
        fanbase: 1000, playstyle: "default", reputation: 50,
        region: "EU", facilitiesLevel: 1, leagueTier: "B_TIER",
        elo: 1500, recentForm: [], worldRanking: 50,
        financialState: "STABLE",
        ...overrides,
    } as unknown as TeamSaveData
}

function makeWorldSave(currentWeek: number, teams: TeamSaveData[]): GameSave {
    return {
        currentWeek,
        playerTeamId: "player",
        teams,
        players: [],
        contracts: [],
        staff: [],
        marketStaff: [],
        academyPlayers: [],
        academyPendingProspects: [],
        scheduledMatches: [],
        completedMatches: [],
        scheduledActivities: [],
        financeLedger: [],
        eventsLog: [],
        newsFeed: [],
        tournaments: [],
        tournamentQualifications: [],
        lastRngSeed: 12345,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any as GameSave
}

const TRAINING_L5 = { id: "f1", type: "TRAINING", level: 5, description: "", monthlyCost: 0 }

describe("season-end youth intake — AI clubs do not pollute the player academy", () => {
    test("an AI club's youth intake stays out of save.academyPlayers and lands in its youthAcademyIds", () => {
        const save = makeWorldSave(52, [
            makeTeam("player", { facilities: [] }), // player has no academy → no player intake
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            makeTeam("ai_1", { facilities: [TRAINING_L5 as any] }),
        ])
        processAIWorldLogic(save, "player", new SeededRNG(1))

        // AI youth exist as world players...
        const aiYouth = save.players.filter(p => p.id.startsWith("youth_ai_1_52_"))
        expect(aiYouth.length).toBe(2)

        // ...but the player-owned academy array is untouched.
        expect(save.academyPlayers.length).toBe(0)

        // ...and they are tracked on the owning AI club instead.
        const aiTeam = save.teams.find(t => t.id === "ai_1")!
        expect(aiTeam.youthAcademyIds).toBeDefined()
        expect([...aiTeam.youthAcademyIds!].sort()).toEqual(aiYouth.map(p => p.id).sort())
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(aiYouth.every(p => (p as any).academyTeamId === "ai_1")).toBe(true)
    })

    test("the PLAYER's own youth intake still enters save.academyPlayers", () => {
        const save = makeWorldSave(52, [
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            makeTeam("player", { facilities: [TRAINING_L5 as any] }),
        ])
        processAIWorldLogic(save, "player", new SeededRNG(1))
        expect(save.players.length).toBe(2)
        expect(save.academyPlayers.length).toBe(2)
        // Player intake is NOT double-tracked on the club's youthAcademyIds.
        const player = save.teams[0]
        expect(player.youthAcademyIds ?? []).toHaveLength(0)
    })
})

describe("youth intake immersion — real names, varied nicknames", () => {
    test("regens are not named 'Youth Prospect' and nicknames vary", () => {
        // Ten level-5 clubs → 20 prospects, enough to assert variety.
        const teams = Array.from({ length: 10 }, (_, i) =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            makeTeam(`ai_${i}`, { facilities: [TRAINING_L5 as any] }))
        const save = makeWorldSave(52, teams)
        processAIWorldLogic(save, "player", new SeededRNG(2024))

        const youth = save.players.filter(p => p.id.startsWith("youth_"))
        expect(youth.length).toBe(20)

        for (const p of youth) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const y = p as any
            expect(y.firstName).not.toBe("Youth")
            expect(y.lastName).not.toBe("Prospect")
            expect(typeof y.firstName).toBe("string")
            expect(y.firstName.length).toBeGreaterThan(0)
            expect(y.lastName.length).toBeGreaterThan(0)
        }

        // Nickname variety: the old 80-combo pool produced heavy collisions;
        // the shared generator should yield mostly-distinct nicknames.
        const uniqueNicks = new Set(youth.map(p => p.nickname.toLowerCase()))
        expect(uniqueNicks.size).toBeGreaterThanOrEqual(youth.length - 3)
    })

    test("intake is deterministic under a fixed seed", () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mk = () => makeWorldSave(52, [makeTeam("ai_1", { facilities: [TRAINING_L5 as any] })])
        const a = mk(); const b = mk()
        processAIWorldLogic(a, "player", new SeededRNG(77))
        processAIWorldLogic(b, "player", new SeededRNG(77))
        expect(a.players.map(p => (p as unknown as { nickname: string }).nickname))
            .toEqual(b.players.map(p => (p as unknown as { nickname: string }).nickname))
    })
})

/* ---- signFreeAgent academy exclusion ---- */

function makeFA(id: string, overrides: Partial<PlayerSaveData> = {}): PlayerSaveData {
    return {
        id, nickname: id, firstName: id, lastName: "P", age: 20, nationality: "US",
        role: "RIFLER", skill: 60, potential: 75, tier: "PRO",
        rifle: 60, awp: 55, pistol: 60, grenades: 55, creativity: 60, clutch: 55,
        tactic: 60, leader: 50, teamwork: 60, reaction: 60, eyesight: 60,
        morale: 70, form: 70, fatigue: 0,
        ...overrides,
    } as unknown as PlayerSaveData
}

function makeSignSave(over: Partial<GameSave> = {}): GameSave {
    return {
        currentWeek: 10,
        playerTeamId: "player",
        teams: [],
        players: [],
        contracts: [],
        staff: [],
        academyPlayers: [],
        academyPendingProspects: [],
        transferHistory: [],
        newsFeed: [],
        ...over,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any as GameSave
}

describe("signFreeAgent — academy-held players are not free agents", () => {
    test("an AI team below cap will not sign the player's enrolled / pending / youth prospects", () => {
        const ai = makeTeam("ai_1", { rosterIds: ["r1", "r2", "r3", "r4"], budget: 5_000_000 })
        const playerTeam = makeTeam("player", { rosterIds: [], youthAcademyIds: ["youth_x"] })

        const save = makeSignSave({
            teams: [ai, playerTeam],
            players: [
                makeFA("r1"), makeFA("r2"), makeFA("r3"), makeFA("r4"),
                makeFA("enrolled_1", { skill: 95, potential: 99 }),   // player's academy
                makeFA("pending_1", { skill: 95, potential: 99 }),    // player's review desk
                makeFA("youth_x", { skill: 95, potential: 99 }),      // player-club youth intake
            ],
            academyPlayers: [{ playerId: "enrolled_1" } as never],
            academyPendingProspects: ["pending_1"],
        })

        signFreeAgent(ai, save, true) // emergency: affordability waived
        // No signable free agent exists → the AI roster is unchanged, and none
        // of the academy prospects were poached despite their sky-high scores.
        expect(ai.rosterIds).toEqual(["r1", "r2", "r3", "r4"])
        expect(save.contracts.length).toBe(0)
    })

    test("a genuine free agent is still signed when one exists", () => {
        const ai = makeTeam("ai_1", { rosterIds: ["r1", "r2", "r3", "r4"], budget: 5_000_000 })
        const playerTeam = makeTeam("player", { rosterIds: [] })
        const save = makeSignSave({
            teams: [ai, playerTeam],
            players: [
                makeFA("r1"), makeFA("r2"), makeFA("r3"), makeFA("r4"),
                makeFA("enrolled_1", { skill: 99, potential: 99 }),
                makeFA("real_fa", { skill: 50, potential: 55 }),
            ],
            academyPlayers: [{ playerId: "enrolled_1" } as never],
        })

        signFreeAgent(ai, save, true)
        // Signed the real FA, never the higher-scored academy prospect.
        expect(ai.rosterIds).toContain("real_fa")
        expect(ai.rosterIds).not.toContain("enrolled_1")
    })
})
