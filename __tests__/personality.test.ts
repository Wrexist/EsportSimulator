/**
 * Phase 5.2: personalities and the dressing room.
 *
 * Distribution and determinism over the real snapshot, save v9, every
 * creation path's archetype, and each effect the UI states: result swings,
 * playing time, wage fairness, promises, transfer requests (a 4.9 decision
 * with a deadline and default), contracts, training, mentor and captain.
 */

import fs from "node:fs"
import path from "node:path"
import type { GameEventSaveData, GameSave, PersonalityArchetype, PlayerSaveData, TeamSaveData } from "@/engine/save-types"
import { CURRENT_SAVE_VERSION } from "@/engine/save-types"
import { AI_SQUAD_TUNING, PERSONALITY_TUNING as T } from "@/lib/balance-tuning"
import {
    ARCHETYPES, ARCHETYPE_INFO, PROSPECT_TYPE_ARCHETYPE, TRAIT_INFO,
    activePromise, archetypeWageFactor, assignPersonalities, canBeMentored, canMentor, captainDefeatShield, captainId,
    contractDemandLines, contractLengthFactor, defaultCaptainId, deriveArchetype, deriveTraits, ensurePersonality,
    getArchetype, lineupDefeatShield, mentorTrainingFactor, playerResultMorale, recordAppearances, recordPromise,
    renewalSalary, trainingFactor,
} from "@/engine/personality"
import { migrateToV9, runMigrationLadder } from "@/engine/save-migrations"
import { processDressingRoom } from "@/engine/processors/dressing-room"
import { applyChoiceEffects, type ChoiceEffects } from "@/engine/event-choice"
import { decisionRuleFor, expireDecisions, normalizeDecisions } from "@/engine/decision-deadlines"
import { WeekChangeRecorder, type ChangeEntry } from "@/lib/week-changes"
import { recruitmentSalary } from "@/engine/recruitment"
import { renewExpiringContracts } from "@/engine/ai/squad-maintenance"
import { TrainingProcessor } from "@/engine/processors/training-processor"
import { generateProspect, prospectToPlayerData } from "@/engine/prospect-generator"
import { SeededRNG } from "@/engine/rng"
import { generateCareerDecision } from "@/engine/career-decisions"
import { applyMoraleResult } from "@/engine/player-lifecycle"
import { describeChoice } from "@/components/inbox/inbox-model"
import { createEventsSlice } from "@/store/slices/events-slice"
import { createDressingRoomSlice } from "@/store/slices/dressing-room-slice"
import { TrainingFocus } from "@/types"

// ---------------------------------------------------------------- fixtures

function player(id: string, archetype: PersonalityArchetype | null, overrides: Partial<PlayerSaveData> = {}): PlayerSaveData {
    return {
        id, name: id, nickname: id, age: 24, nationality: "Sweden", portraitPath: "", role: "RIFLER", tier: "PRO",
        energy: 100, maxEnergy: 100, skill: 60, awp: 50, rifle: 60, pistol: 60, grenades: 55, creativity: 50,
        clutch: 50, tactic: 55, leader: 50, teamwork: 60, morale: 70, amicability: 60, productivity: 60,
        stressResistance: 60, loyalty: 60, reaction: 60, eyesight: 60, health: 90, strength: 60, endurance: 60,
        form: 60, fatigue: 0, potential: 75, matchesPlayed: 0, roundsPlayed: 0, avgRating: 1, clutchSuccessRate: 0,
        level: 1, xp: 0, xpToNextLevel: 1000, talentPoints: 0, unlockedTalentIds: [], traits: [],
        ...(archetype ? { personality: { archetype } } : {}),
        ...overrides,
    } as PlayerSaveData
}

function club(id: string, rosterIds: string[], overrides: Partial<TeamSaveData> = {}): TeamSaveData {
    return {
        id, name: id, shortName: id, tier: "PRO", rosterIds, staffIds: [], reputation: 50, fanbase: 1000, chemistry: 60,
        facilitiesLevel: 1, trainingSlotsUsed: 0, maxTrainingSlots: 10, budget: 100_000, elo: 1500, leagueTier: "B_TIER",
        worldRanking: 50, trophies: [], facilities: [], sponsors: [],
        ...overrides,
    } as unknown as TeamSaveData
}

function world(players: PlayerSaveData[], teams: TeamSaveData[], week = 10): GameSave {
    return {
        saveVersion: CURRENT_SAVE_VERSION, saveId: "p52", saveName: "t", createdAt: "", updatedAt: "", currentWeek: week, currentDay: 0,
        timeMode: "WEEKLY", gameStartDate: "2025-01-01T00:00:00.000Z", playerTeamId: teams[0].id,
        managerDetails: { name: "m", level: 1, xp: 0, reputation: 0, careerWins: 0, careerLosses: 0, championships: 0 },
        teams, players, contracts: teams.flatMap(t => t.rosterIds.map(pid => ({ playerId: pid, teamId: t.id, salaryPerWeek: 1000, startWeek: 1, endWeek: 200, buyout: 0 }))),
        tournaments: [], staff: [], scheduledMatches: [], completedMatches: [], scheduledActivities: [], marketStaff: [],
        financeLedger: [], hallOfFame: [], eventsLog: [], newsFeed: [], acknowledgedEventIds: [], lastRngSeed: 1,
        legendaryPlayers: [], weekTickState: null, scoutedPlayers: [], circuitPoints: [], tournamentQualifications: [],
        transferHistory: [], academyPlayers: [], academyMatchHistory: [], academyRoster: {}, academyTrainingSchedule: {},
        academyWeeklyReports: [], academyScoutingMissions: [], academyPendingProspects: [],
    } as unknown as GameSave
}

/** Six players: five starters and one bench (p5). */
function squad(archetypes: Partial<Record<string, PersonalityArchetype>> = {}) {
    const ids = ["p0", "p1", "p2", "p3", "p4", "p5"]
    const players = ids.map(id => player(id, archetypes[id] ?? "QUIET"))
    const t = club("me", ids)
    const ai = club("ai", [])
    const save = world(players, [t, ai])
    const lookup = (id: string) => save.players.find(p => p.id === id)
    return { save, team: t, players, lookup, byId: (id: string) => lookup(id)! }
}

const snapshotPlayers = (): PlayerSaveData[] =>
    JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/snapshot/players.json"), "utf8")) as PlayerSaveData[]

// ---------------------------------------------------------------- distribution

describe("archetype and trait distribution over the snapshot", () => {
    const players = snapshotPlayers()
    const counts = new Map<PersonalityArchetype, number>()
    for (const p of players) counts.set(deriveArchetype(p), (counts.get(deriveArchetype(p)) ?? 0) + 1)

    test("every archetype appears, none dominates (4%-25% each)", () => {
        expect(players.length).toBeGreaterThan(1000)
        for (const a of ARCHETYPES) {
            const share = (counts.get(a) ?? 0) / players.length
            expect(share).toBeGreaterThanOrEqual(0.04)
            expect(share).toBeLessThanOrEqual(0.25)
        }
    })

    test("a Leader has a high leader stat; a Hothead low stress resistance", () => {
        for (const p of players) {
            const a = deriveArchetype(p)
            if (a === "LEADER") expect(p.leader).toBeGreaterThanOrEqual(70)
            if (a === "HOTHEAD") expect(p.stressResistance).toBeLessThan(45)
        }
    })

    test("30-40% of players carry a trait; at most two; aggressive entries, never aggressive and passive", () => {
        const traits = players.map(p => deriveTraits(p))
        const share = traits.filter(t => t.length > 0).length / players.length
        expect(share).toBeGreaterThanOrEqual(0.3)
        expect(share).toBeLessThanOrEqual(0.4)
        traits.forEach((t, i) => {
            expect(t.length).toBeLessThanOrEqual(2)
            expect(t.includes("AGGRESSIVE") && t.includes("PASSIVE")).toBe(false)
            if (t.includes("AGGRESSIVE")) expect(players[i].role).toBe("ENTRY_FRAGGER")
            for (const x of t) expect(TRAIT_INFO[x]).toBeDefined()
        })
    })

    test("deterministic: same id and stats, same archetype and traits, in any order", () => {
        const a = players.slice(0, 300).map(p => [p.id, deriveArchetype(p), deriveTraits(p).join()])
        const b = [...players.slice(0, 300)].reverse().map(p => [p.id, deriveArchetype({ ...p }), deriveTraits({ ...p }).join()]).reverse()
        expect(b).toEqual(a)
    })
})

// ---------------------------------------------------------------- save v9 and creation paths

describe("save v9 migration", () => {
    const legacy = () => ({
        saveVersion: 8, saveId: "old", saveName: "Old", currentWeek: 40, currentDay: 6, timeMode: "WEEKLY", playerTeamId: "t1",
        teams: [{ id: "t1", name: "T1", rosterIds: ["a", "b", "c"], facilities: [], sponsors: [], fanbase: 0, branding: {} }],
        players: [
            player("a", null, { traits: undefined }),
            player("b", "LOYAL", { traits: undefined }),
            player("c", null, { traits: ["CLUTCHER"] }),
        ],
        legendaryPlayers: [player("legend", null, { traits: undefined })],
        contracts: [], financeLedger: [], tournaments: [], scheduledMatches: [], completedMatches: [],
    })

    test("assigns an archetype and traits to every player; keeps existing ones", () => {
        const migrated = runMigrationLadder(legacy()) as GameSave
        expect(CURRENT_SAVE_VERSION).toBe(9)
        expect(migrated.saveVersion).toBe(9)
        const byId = new Map(migrated.players.map(p => [p.id, p]))
        for (const p of migrated.players) {
            expect(ARCHETYPES).toContain(p.personality?.archetype)
            expect(Array.isArray(p.traits)).toBe(true)
        }
        expect(byId.get("a")!.personality!.archetype).toBe(deriveArchetype(byId.get("a")!))
        expect(byId.get("b")!.personality!.archetype).toBe("LOYAL")
        expect(byId.get("c")!.traits).toEqual(["CLUTCHER"])
        expect(migrated.legendaryPlayers[0].personality?.archetype).toBeDefined()
    })

    test("is deterministic and idempotent", () => {
        const once = migrateToV9(legacy())
        const twice = migrateToV9(structuredClone(once))
        expect(JSON.stringify(twice)).toBe(JSON.stringify(once))
        expect(JSON.stringify(migrateToV9(legacy()))).toBe(JSON.stringify(once))
    })
})

describe("creation paths", () => {
    test("a youth prospect keeps the type he rolled as his archetype", () => {
        const rng = new SeededRNG(7)
        for (let i = 0; i < 30; i++) {
            const prospect = generateProspect("LOCAL", undefined, rng)
            expect(prospect.archetype).toBe(PROSPECT_TYPE_ARCHETYPE[prospect.prospectType])
            const data = prospectToPlayerData(prospect, 5, rng) as unknown as PlayerSaveData
            expect(data.personality?.archetype).toBe(prospect.archetype)
            expect(Array.isArray(data.traits)).toBe(true)
        }
    })

    test("ensurePersonality and assignPersonalities fill only what is missing", () => {
        const players = [player("x", null, { traits: undefined }), player("y", "HOTHEAD")]
        expect(assignPersonalities(players)).toBe(1)
        expect(players[1].personality!.archetype).toBe("HOTHEAD")
        expect(assignPersonalities(players)).toBe(0)
        expect(getArchetype(player("z", null))).toBe(deriveArchetype(player("z", null)))
        expect(ensurePersonality(player("w", null), "LEADER").personality!.archetype).toBe("LEADER")
    })
})

// ---------------------------------------------------------------- results and captain

describe("results and the captain", () => {
    test("archetype scales the result swing", () => {
        expect(playerResultMorale(player("h", "HOTHEAD"), -4)).toBeCloseTo(-4 * T.RESULT_HOTHEAD)
        expect(playerResultMorale(player("h", "HOTHEAD"), 10)).toBeCloseTo(10 * T.RESULT_HOTHEAD)
        expect(playerResultMorale(player("q", "QUIET"), -4)).toBeCloseTo(-4 * T.RESULT_QUIET)
        expect(playerResultMorale(player("s", "SHOWMAN"), 10)).toBeCloseTo(10 * T.RESULT_SHOWMAN_WIN)
        expect(playerResultMorale(player("s", "SHOWMAN"), -4)).toBe(-4)
        expect(playerResultMorale(player("pro", "PROFESSIONAL"), -4)).toBeCloseTo(-4 * T.RESULT_PROFESSIONAL_LOSS)
        expect(playerResultMorale(player("l", "LOYAL"), -4)).toBe(-4)
        // A Hothead loses more morale from the same defeat.
        expect(applyMoraleResult(60, playerResultMorale(player("h", "HOTHEAD"), -5))).toBeLessThan(applyMoraleResult(60, -5))
    })

    test("captain: default highest leader, the manager's pick wins, the shield follows him into the lineup", () => {
        const { team, byId, lookup } = squad({ p3: "LEADER" })
        byId("p2").leader = 80
        byId("p3").leader = 72
        expect(defaultCaptainId(team, lookup)).toBe("p2")
        expect(captainId(team, lookup)).toBe("p2")
        team.dressingRoom = { captainId: "p3" }
        expect(captainId(team, lookup)).toBe("p3")
        expect(captainDefeatShield(byId("p2"))).toBeCloseTo(80 / T.CAPTAIN_LEADER_DIVISOR / 100)
        expect(captainDefeatShield(byId("p3"))).toBeCloseTo(72 / T.CAPTAIN_LEADER_DIVISOR / 100 + T.CAPTAIN_LEADER_BONUS)
        expect(captainDefeatShield(player("max", "LEADER", { leader: 100 }))).toBeCloseTo(T.CAPTAIN_MAX_SHIELD)
        expect(lineupDefeatShield(team, ["p0", "p1", "p3", "p4", "p5"], lookup)).toBeGreaterThan(0)
        expect(lineupDefeatShield(team, ["p0", "p1", "p2", "p4", "p5"], lookup)).toBe(0)
        // The shield softens defeats only.
        expect(playerResultMorale(byId("p0"), -10, 0.2)).toBeCloseTo(-10 * T.RESULT_QUIET * 0.8)
        expect(playerResultMorale(byId("p0"), 10, 0.2)).toBeCloseTo(10 * T.RESULT_QUIET)
        // A captain who left falls back to the default.
        team.rosterIds = team.rosterIds.filter(id => id !== "p3")
        expect(captainId(team, lookup)).toBe("p2")
    })

    test("Praise the captain praises the captain, not roster[0]", () => {
        const { save, team, byId } = squad()
        byId("p4").leader = 90
        save.completedMatches = [1, 2, 3].map(w => ({ id: `m${w}`, week: w + 6, homeTeamId: "me", awayTeamId: "ai", tournamentId: "x", stage: null, format: "BO1", seed: 1, result: { winnerId: "me", homeScore: 1, awayScore: 0, maps: [] } })) as never
        generateCareerDecision(save)
        const e = save.eventsLog.find(x => x.id.endsWith("_momentum"))!
        expect(e.data.playerId).toBe("p4")
        team.dressingRoom = { captainId: "p1" }
        save.eventsLog = []
        generateCareerDecision(save)
        expect(save.eventsLog.find(x => x.id.endsWith("_momentum"))!.data.playerId).toBe("p1")
    })
})

// ---------------------------------------------------------------- playing time

function benchRun(save: GameSave, team: TeamSaveData, lookup: (id: string) => PlayerSaveData | undefined, lineup: string[], times: number) {
    for (let i = 0; i < times; i++) recordAppearances(team, lineup, lookup)
}

describe("playing time", () => {
    const starters = ["p0", "p1", "p2", "p3", "p4"]
    const withoutP0 = ["p5", "p1", "p2", "p3", "p4"]

    test("a regular starter left out of 3 official matches loses morale weekly, with the cause", () => {
        const { save, team, lookup, byId } = squad({ p0: "AMBITIOUS" })
        benchRun(save, team, lookup, starters, T.REGULAR_STARTS)
        expect(byId("p0").personality!.apps!.regular).toBe(true)
        benchRun(save, team, lookup, withoutP0, T.BENCH_MATCHES - 1)
        const before = byId("p0").morale
        processDressingRoom(save, "me")
        expect(byId("p0").morale).toBe(before)
        recordAppearances(team, withoutP0, lookup)
        const recorder = new WeekChangeRecorder("me")
        recorder.begin(save)
        processDressingRoom(save, "me", cause => recorder.mark(save, cause))
        expect(byId("p0").morale).toBeCloseTo(before - T.BENCH_MORALE_PER_WEEK * T.BENCH_FACTOR_HIGH)
        const entry = recorder.result().find((e: ChangeEntry) => e.subjectId === "p0" && e.kind === "morale")!
        expect(entry.cause.label).toBe(`Benched ${T.BENCH_MATCHES} matches`)
        // The bench player who never started does not complain.
        expect(byId("p5").morale).toBe(70)
    })

    test("archetype scales it (Ambitious 1.5x, Loyal 0.5x); it stops at the floor; injury and a start reset it", () => {
        const loss = (a: PersonalityArchetype) => {
            const { save, team, lookup, byId } = squad({ p0: a })
            benchRun(save, team, lookup, starters, T.REGULAR_STARTS)
            benchRun(save, team, lookup, withoutP0, T.BENCH_MATCHES)
            processDressingRoom(save, "me")
            return 70 - byId("p0").morale
        }
        expect(loss("AMBITIOUS")).toBeCloseTo(T.BENCH_MORALE_PER_WEEK * T.BENCH_FACTOR_HIGH)
        expect(loss("LOYAL")).toBeCloseTo(T.BENCH_MORALE_PER_WEEK * T.BENCH_FACTOR_LOW)
        expect(loss("PROFESSIONAL")).toBeCloseTo(T.BENCH_MORALE_PER_WEEK)

        const { save, team, lookup, byId } = squad({ p0: "AMBITIOUS" })
        benchRun(save, team, lookup, starters, T.REGULAR_STARTS)
        benchRun(save, team, lookup, withoutP0, T.BENCH_MATCHES)
        byId("p0").morale = T.BENCH_MORALE_FLOOR + 1
        processDressingRoom(save, "me")
        expect(byId("p0").morale).toBe(T.BENCH_MORALE_FLOOR)
        byId("p0").injury = { type: "x", weeksRemaining: 2 } as never
        byId("p0").morale = 60
        processDressingRoom(save, "me")
        expect(byId("p0").morale).toBe(60)
        byId("p0").injury = undefined
        recordAppearances(team, starters, lookup)
        processDressingRoom(save, "me")
        expect(byId("p0").morale).toBe(60)
    })
})

// ---------------------------------------------------------------- wage fairness

describe("wage fairness", () => {
    function underpaid(archetype: PersonalityArchetype) {
        const { save, byId } = squad({ p0: archetype })
        Object.assign(byId("p0"), { skill: 80, rifle: 80, awp: 80, reaction: 80, clutch: 80, grenades: 80, pistol: 80 })
        Object.assign(byId("p1"), { skill: 50, rifle: 50, awp: 50, reaction: 50, clutch: 50, grenades: 50, pistol: 50, nickname: "earner" })
        // 700 is fair next to the 1,000 teammates (over 60%), not next to p1's 2,000.
        save.contracts.find(c => c.playerId === "p0")!.salaryPerWeek = 700
        save.contracts.find(c => c.playerId === "p1")!.salaryPerWeek = 2000
        return { save, byId }
    }

    test("a Mercenary or Ambitious player paid well below a lower-rated teammate loses morale, with the cause", () => {
        for (const a of ["MERCENARY", "AMBITIOUS"] as const) {
            const { save, byId } = underpaid(a)
            const recorder = new WeekChangeRecorder("me")
            recorder.begin(save)
            processDressingRoom(save, "me", cause => recorder.mark(save, cause))
            expect(byId("p0").morale).toBe(70 - T.WAGE_MORALE_PER_WEEK)
            expect(recorder.result().find(e => e.subjectId === "p0")!.cause.label).toBe("Paid less than earner")
        }
    })

    test("other archetypes don't mind; a fair wage or a better-rated earner is fine; floor holds", () => {
        expect((() => { const { save, byId } = underpaid("PROFESSIONAL"); processDressingRoom(save, "me"); return byId("p0").morale })()).toBe(70)
        const fair = underpaid("MERCENARY")
        fair.save.contracts.find(c => c.playerId === "p0")!.salaryPerWeek = 1500
        processDressingRoom(fair.save, "me")
        expect(fair.byId("p0").morale).toBe(70)
        const better = underpaid("MERCENARY")
        Object.assign(better.byId("p1"), { skill: 90, rifle: 90, awp: 90, reaction: 90, clutch: 90, grenades: 90, pistol: 90 })
        processDressingRoom(better.save, "me")
        expect(better.byId("p0").morale).toBe(70)
        const low = underpaid("MERCENARY")
        low.byId("p0").morale = T.WAGE_MORALE_FLOOR
        processDressingRoom(low.save, "me")
        expect(low.byId("p0").morale).toBe(T.WAGE_MORALE_FLOOR)
    })
})

// ---------------------------------------------------------------- promises

describe("promises", () => {
    test("“You'll start” breaks after two official matches sat out: morale and loyalty drop, a message and a cause", () => {
        const { save, team, lookup, byId } = squad()
        const promise = recordPromise(save, byId("p5"), "START")
        expect(activePromise(byId("p5"))).toEqual(promise)
        expect(promise.deadlineWeek).toBe(save.currentWeek + T.PROMISE_START_WEEKS)
        benchRun(save, team, lookup, ["p0", "p1", "p2", "p3", "p4"], T.PROMISE_START_BENCH_LIMIT)
        const recorder = new WeekChangeRecorder("me")
        recorder.begin(save)
        const out = processDressingRoom(save, "me", cause => recorder.mark(save, cause))
        expect(out.promisesBroken).toBe(1)
        expect(byId("p5").morale).toBe(70 + T.PROMISE_BROKEN_MORALE)
        expect(byId("p5").loyalty).toBe(60 + T.PROMISE_BROKEN_LOYALTY)
        expect(activePromise(byId("p5"))).toBeNull()
        expect(byId("p5").personality!.lastPromise).toEqual({ kind: "START", outcome: "BROKEN", week: save.currentWeek })
        expect(save.eventsLog.some(e => e.id.startsWith("promise_broken_p5_"))).toBe(true)
        expect(recorder.result().find(e => e.subjectId === "p5" && e.kind === "morale")!.cause.label).toBe("Promise broken: benched")
    })

    test("“You'll start” is kept at the deadline when he plays; “We'll compete” is kept by a trophy or broken at the deadline", () => {
        const { save, team, lookup, byId } = squad()
        recordPromise(save, byId("p5"), "START")
        recordAppearances(team, ["p5", "p1", "p2", "p3", "p4"], lookup)
        save.currentWeek += T.PROMISE_START_WEEKS
        processDressingRoom(save, "me")
        expect(byId("p5").morale).toBe(70 + T.PROMISE_KEPT_MORALE)
        expect(byId("p5").personality!.lastPromise!.outcome).toBe("KEPT")

        recordPromise(save, byId("p1"), "COMPETE")
        processDressingRoom(save, "me")
        expect(activePromise(byId("p1"))).not.toBeNull()
        team.trophies = [{ tournamentId: "cup", tournamentName: "Cup", week: save.currentWeek, tier: "B_TIER" }] as never
        processDressingRoom(save, "me")
        expect(byId("p1").personality!.lastPromise!.outcome).toBe("KEPT")

        recordPromise(save, byId("p2"), "COMPETE")
        save.currentWeek += T.PROMISE_COMPETE_WEEKS
        team.trophies = []
        processDressingRoom(save, "me")
        expect(byId("p2").personality!.lastPromise!.outcome).toBe("BROKEN")
    })

    test("a promise to a player who left lapses without effect", () => {
        const { save, team, byId } = squad()
        recordPromise(save, byId("p5"), "START")
        team.rosterIds = team.rosterIds.filter(id => id !== "p5")
        processDressingRoom(save, "me")
        expect(activePromise(byId("p5"))).toBeNull()
        expect(byId("p5").morale).toBe(70)
    })
})

// ---------------------------------------------------------------- transfer requests

describe("transfer requests", () => {
    function unhappy(archetype: PersonalityArchetype) {
        const s = squad({ p0: archetype })
        s.byId("p0").morale = T.UNHAPPY_MORALE - 10
        return s
    }
    const weeks = (save: GameSave, n: number) => { for (let i = 0; i < n; i++) { save.currentWeek++; processDressingRoom(save, "me") } }
    const requests = (save: GameSave) => save.eventsLog.filter(e => e.id.startsWith("transfer_request_"))

    test("weeks of low morale make an Ambitious or Mercenary player ask to leave; Loyal never does", () => {
        for (const a of ["AMBITIOUS", "MERCENARY"] as const) {
            const { save } = unhappy(a)
            weeks(save, T.REQUEST_AFTER_WEEKS - 1)
            expect(requests(save)).toHaveLength(0)
            weeks(save, 1)
            expect(requests(save)).toHaveLength(1)
            expect(requests(save)[0].data.playerId).toBe("p0")
        }
        for (const a of ["LOYAL", "PROFESSIONAL", "QUIET"] as const) {
            const { save } = unhappy(a)
            weeks(save, 10)
            expect(requests(save)).toHaveLength(0)
        }
    })

    test("it is a 4.9 decision: two-week deadline, stated default (refuse) applied when unanswered", () => {
        const { save, byId } = unhappy("AMBITIOUS")
        weeks(save, T.REQUEST_AFTER_WEEKS)
        const e = requests(save)[0]
        const rule = decisionRuleFor(e)!
        expect(rule.family).toBe("transfer_request")
        expect(rule.defaultChoiceId).toBe("refuse")
        normalizeDecisions(save)
        expect(e.data.deadlineWeek).toBe(e.week + 2)
        expect(String(e.data.ifUnanswered)).toContain("refuses p0's transfer request")
        const morale = byId("p0").morale
        save.currentWeek = e.data.deadlineWeek + 1
        expireDecisions(save)
        expect(e.selectedChoiceId).toBe("refuse")
        expect(byId("p0").morale).toBe(Math.max(0, morale + T.REQUEST_REFUSE_MORALE))
    })

    test("choices: accept lists him, promise records it, refuse costs morale and loyalty; chips state each", () => {
        const answer = (choiceId: string) => {
            const s = unhappy("MERCENARY")
            weeks(s.save, T.REQUEST_AFTER_WEEKS)
            const e = requests(s.save)[0]
            const choice = e.choices!.find(c => c.id === choiceId)!
            expect(applyChoiceEffects(s.save, e, choice.effects as ChoiceEffects, { id: () => "x", description: "x" })).toBe(true)
            return { ...s, e, choice }
        }
        const accept = answer("accept")
        expect(accept.byId("p0").forSale).toBe(true)
        expect(accept.byId("p0").transferListingPrice).toBeGreaterThan(0)
        expect(describeChoice(accept.e, accept.choice, 0).chips.map(c => c.label)).toEqual([`+${T.REQUEST_ACCEPT_MORALE} morale`, "Transfer-listed at market value"])
        const promise = answer("promise")
        expect(activePromise(promise.byId("p0"))?.kind).toBe("COMPETE")
        expect(describeChoice(promise.e, promise.choice, 0).chips.map(c => c.label).join()).toContain("We'll compete for titles")
        const refuse = answer("refuse")
        expect(refuse.byId("p0").loyalty).toBe(60 + T.REQUEST_REFUSE_LOYALTY)
    })

    test("a benched regular is offered a promise to start", () => {
        const { save, team, lookup } = unhappy("AMBITIOUS")
        benchRun(save, team, lookup, ["p0", "p1", "p2", "p3", "p4"], T.REGULAR_STARTS)
        benchRun(save, team, lookup, ["p5", "p1", "p2", "p3", "p4"], T.BENCH_MATCHES)
        weeks(save, T.REQUEST_AFTER_WEEKS)
        const e = requests(save)[0]
        expect(e.data.reason).toBe("BENCH")
        expect((e.choices!.find(c => c.id === "promise")!.effects as ChoiceEffects).promise).toBe("START")
    })

    test("not spammy: one open at a time, a cooldown per player, at most two per club and season", () => {
        const { save, byId } = unhappy("AMBITIOUS")
        byId("p1").personality = { archetype: "MERCENARY" }
        byId("p2").personality = { archetype: "AMBITIOUS" }
        byId("p1").morale = byId("p2").morale = 10
        weeks(save, T.REQUEST_AFTER_WEEKS + 3)
        expect(requests(save)).toHaveLength(1)
        // Answer it; the next unhappy one may ask, the first may not ask again for a while.
        const settle = () => { for (const e of requests(save)) if (!e.selectedChoiceId) e.selectedChoiceId = "refuse" }
        settle()
        weeks(save, 1)
        expect(requests(save)).toHaveLength(2)
        settle()
        weeks(save, 20)
        // Season cap: still two (weeks 14-35 are all in season 1).
        expect(requests(save)).toHaveLength(T.REQUESTS_PER_SEASON)
        expect(new Set(requests(save).map(e => e.data.playerId)).size).toBe(2)
    })

    test("AI clubs' players never hand in requests", () => {
        const { save } = unhappy("AMBITIOUS")
        save.playerTeamId = "ai"
        for (let i = 0; i < 8; i++) { save.currentWeek++; processDressingRoom(save, "ai") }
        expect(requests(save)).toHaveLength(0)
    })
})

// ---------------------------------------------------------------- contracts

describe("contracts", () => {
    const ask = (a: PersonalityArchetype, buyer?: Partial<TeamSaveData>) =>
        recruitmentSalary(player("x", a, { skill: 70, rifle: 70, awp: 70, reaction: 70, clutch: 70, matchesPlayed: 100 }), 10, { reputation: 50, ...buyer } as TeamSaveData)

    test("Loyal asks less, Mercenary more, the rest neutral (every buyer)", () => {
        const neutral = ask("QUIET")
        expect(neutral).toBeGreaterThan(1000)
        expect(Math.abs(ask("LOYAL") - neutral * T.WAGE_LOYAL)).toBeLessThanOrEqual(1)
        expect(Math.abs(ask("MERCENARY") - neutral * T.WAGE_MERCENARY)).toBeLessThanOrEqual(1)
        expect(ask("PROFESSIONAL")).toBe(neutral)
        expect(ask("HOTHEAD")).toBe(neutral)
    })

    test("Ambitious asks a premium only from a club two or more tiers below his level", () => {
        expect(archetypeWageFactor("AMBITIOUS", 65, { leagueTier: "C_TIER" })).toBe(T.WAGE_AMBITIOUS_BELOW)
        expect(archetypeWageFactor("AMBITIOUS", 65, { leagueTier: "B_TIER" })).toBe(T.WAGE_AMBITIOUS_BELOW)
        expect(archetypeWageFactor("AMBITIOUS", 65, { leagueTier: "A_TIER" })).toBe(1)
        expect(archetypeWageFactor("AMBITIOUS", 45, { leagueTier: "C_TIER" })).toBe(1)
        expect(contractDemandLines("AMBITIOUS", 65, { leagueTier: "C_TIER" })[0]).toContain("+15%")
        expect(contractDemandLines("LOYAL", 50)[0]).toContain("−10%")
    })

    test("preferred length and renewals by archetype; AI renewals use the same rule", () => {
        expect(contractLengthFactor("LOYAL")).toBe(T.LENGTH_LOYAL)
        expect(contractLengthFactor("MERCENARY")).toBe(T.LENGTH_MERCENARY)
        expect(renewalSalary(player("l", "LOYAL"), 1000)).toBe(1050)
        expect(renewalSalary(player("q", "QUIET"), 1000)).toBe(Math.round(1000 * AI_SQUAD_TUNING.RENEWAL_SALARY_MULTIPLIER))
        expect(renewalSalary(player("m", "MERCENARY"), 1000)).toBe(1200)

        const players = [player("m", "MERCENARY"), player("l", "LOYAL")]
        const team = club("ai", ["m", "l"], { budget: 10_000_000 })
        const save = world(players, [club("me", []), team], 100)
        save.contracts = players.map(p => ({ playerId: p.id, teamId: "ai", salaryPerWeek: 1000, startWeek: 1, endWeek: 104, buyout: 0 }))
        renewExpiringContracts(team, save, new Map(players.map(p => [p.id, p])))
        expect(save.contracts.map(c => c.salaryPerWeek).sort()).toEqual([1050, 1200])
    })
})

// ---------------------------------------------------------------- training and mentors

describe("training and mentors", () => {
    function trained(archetype: PersonalityArchetype, opts: { mentor?: boolean; mentorAge?: number } = {}) {
        const mentee = player("young", archetype, { age: 19, rifle: 50, skill: 50, potential: 95, productivity: 70 })
        const mentor = player("vet", "LEADER", { age: opts.mentorAge ?? 29 })
        const team = club("me", ["young", "vet"], opts.mentor ? { dressingRoom: { mentorships: [{ mentorId: "vet", menteeId: "young", sinceWeek: 1 }] } } : {})
        const save = world([mentee, mentor], [team])
        TrainingProcessor.processTraining(save, new Map([["me", { focus: TrainingFocus.AIM, intensity: 5 }]]))
        return { gain: mentee.rifle - 50, save, team }
    }

    test("Professional trains more, Hothead/Showman less", () => {
        const base = trained("QUIET").gain
        expect(base).toBeGreaterThan(0)
        expect(trained("PROFESSIONAL").gain).toBeCloseTo(base * T.TRAINING_PROFESSIONAL)
        expect(trained("HOTHEAD").gain).toBeCloseTo(base * T.TRAINING_DISTRACTED)
        expect(trained("SHOWMAN").gain).toBeCloseTo(base * T.TRAINING_DISTRACTED)
        expect(trainingFactor("LOYAL")).toBe(1)
    })

    test("a valid mentor adds MENTOR_TRAINING; an ineligible one adds nothing; the report names it", () => {
        const base = trained("QUIET").gain
        const { gain, save, team } = trained("QUIET", { mentor: true })
        expect(gain).toBeCloseTo(base * T.MENTOR_TRAINING)
        expect(trained("QUIET", { mentor: true, mentorAge: 25 }).gain).toBeCloseTo(base)
        const lookup = (id: string) => save.players.find(p => p.id === id)
        expect(mentorTrainingFactor(team, "young", lookup)).toBe(T.MENTOR_TRAINING)
        const causes = TrainingProcessor.describeCauses(save, "me", { focus: TrainingFocus.AIM, intensity: 5 })
        expect(causes.get("young")!.label).toContain(`mentored +${Math.round((T.MENTOR_TRAINING - 1) * 100)}%`)
        expect(canMentor(player("v", "PROFESSIONAL", { age: 27 }))).toBe(true)
        expect(canMentor(player("v", "HOTHEAD", { age: 30 }))).toBe(false)
        expect(canBeMentored(player("y", "QUIET", { age: 22 }))).toBe(false)
        // Aged out: the weekly step ends the pairing.
        save.players.find(p => p.id === "young")!.age = 22
        processDressingRoom(save, "me")
        expect(team.dressingRoom!.mentorships).toEqual([])
    })
})

// ---------------------------------------------------------------- UI copy and store

describe("UI copy states the engine's numbers", () => {
    test("every archetype has a label, a line and effect lines quoting PERSONALITY_TUNING", () => {
        for (const a of ARCHETYPES) {
            expect(ARCHETYPE_INFO[a].label).toBeTruthy()
            expect(ARCHETYPE_INFO[a].effects.length).toBeGreaterThan(0)
        }
        expect(ARCHETYPE_INFO.PROFESSIONAL.effects.join()).toContain(`+${Math.round((T.TRAINING_PROFESSIONAL - 1) * 100)}%`)
        expect(ARCHETYPE_INFO.HOTHEAD.effects.join()).toContain(`${T.RESULT_HOTHEAD}×`)
        expect(ARCHETYPE_INFO.MERCENARY.effects.join()).toContain(`${Math.abs(T.MERCENARY_BID_REJECT_MORALE)} morale`)
        expect(ARCHETYPE_INFO.LOYAL.effects.join()).toContain("Never asks to leave")
    })
})

/** Run a slice action against a plain state object (the store's immer `set` recipe style). */
function sliceOn<T>(create: (set: never, get: never) => T, state: Record<string, unknown>): T {
    const set = (fn: (s: Record<string, unknown>) => void) => fn(state)
    const get = () => state
    return create(set as never, get as never)
}

describe("store actions", () => {
    test("setCaptain and mentors: only the managed squad, only eligible players", () => {
        const { save, byId } = squad({ p0: "LEADER" })
        byId("p0").age = 30
        byId("p5").age = 19
        const toasts: unknown[] = []
        const state = { ...save, addToast: (t: unknown) => toasts.push(t) } as unknown as Record<string, unknown>
        const room = sliceOn(createDressingRoomSlice, state)
        expect(room.setCaptain("p3").success).toBe(true)
        expect((state.teams as TeamSaveData[])[0].dressingRoom!.captainId).toBe("p3")
        expect(room.setCaptain("nobody").success).toBe(false)
        expect(room.setCaptain(null).success).toBe(true)
        expect((state.teams as TeamSaveData[])[0].dressingRoom!.captainId).toBeUndefined()
        expect(room.assignMentor("p1", "p5").success).toBe(false) // Quiet can't mentor
        expect(room.assignMentor("p0", "p5").success).toBe(true)
        expect((state.teams as TeamSaveData[])[0].dressingRoom!.mentorships).toEqual([{ mentorId: "p0", menteeId: "p5", sinceWeek: save.currentWeek }])
        room.endMentorship("p5")
        expect((state.teams as TeamSaveData[])[0].dressingRoom!.mentorships).toEqual([])
    })

    test("rejecting a bid costs a Mercenary morale (and nobody else)", () => {
        const run = (a: PersonalityArchetype) => {
            const { save, byId } = squad({ p0: a })
            const bid = { id: "offer_1", type: "TRANSFER_OFFER", week: save.currentWeek, acknowledged: false, data: { teamId: "ai", playerId: "p0", offerAmount: 1000, expiresWeek: save.currentWeek + 2 }, choices: [{ id: "accept", text: "Accept", effects: {} }, { id: "reject", text: "Reject", effects: {} }] } as unknown as GameEventSaveData
            save.eventsLog.push(bid)
            sliceOn(createEventsSlice, save as unknown as Record<string, unknown>).resolveEventChoice("offer_1", "reject")
            expect(bid.selectedChoiceId).toBe("reject")
            return byId("p0").morale
        }
        expect(run("MERCENARY")).toBe(70 + T.MERCENARY_BID_REJECT_MORALE)
        expect(run("LOYAL")).toBe(70)
    })
})
