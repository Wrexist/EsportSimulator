/**
 * Phase 5.3: storylines and press conferences.
 *
 * Each arc kind triggers from real state, runs its beats, applies the effects
 * its decision states (through engine/event-choice.ts) and resolves; the caps
 * and cooldowns hold; the step is deterministic. Press conferences pick big
 * matches, apply exactly what each answer shows, close with the match, and
 * stop Continue once before it.
 */

import type { CompletedMatchSaveData, GameEventSaveData, GameSave, PersonalityArchetype, PlayerSaveData, TeamSaveData } from "@/engine/save-types"
import { CURRENT_SAVE_VERSION } from "@/engine/save-types"
import type { StoryArc } from "@/engine/storylines/types"
import { PERSONALITY_TUNING as P, STORY_TUNING as S } from "@/lib/balance-tuning"
import { ARC_DEFINITIONS, eligible, processStorylines } from "@/engine/storylines"
import { buildContext } from "@/engine/storylines/common"
import { answerPressConference, bigMatchReason, closePressConference, createPressConference, pressDataOf, type PressTarget } from "@/engine/storylines/press"
import { finalPreview } from "@/engine/storylines/narrative"
import { arcsForPlayer, leadingBeat } from "@/engine/storylines/view"
import { applyChoiceEffects, type ChoiceEffects } from "@/engine/event-choice"
import { decisionRuleFor, expireDecisions, normalizeDecisions } from "@/engine/decision-deadlines"
import { retirementChance } from "@/engine/retirement-chance"
import { renewalSalary } from "@/engine/personality"
import { recordOfficialMatch } from "@/engine/official-stats"
import { describeChoice } from "@/components/inbox/inbox-model"
import { nextStop, type StopSource } from "@/lib/advance-stops"
import { weekHeadline, type WeekReport } from "@/lib/week-report"

// ---------------------------------------------------------------- fixtures

function player(id: string, archetype: PersonalityArchetype, overrides: Partial<PlayerSaveData> = {}): PlayerSaveData {
    return {
        id, name: id, nickname: id, age: 24, nationality: "Sweden", portraitPath: "", role: "RIFLER", tier: "PRO",
        energy: 100, maxEnergy: 100, skill: 60, awp: 50, rifle: 60, pistol: 60, grenades: 55, creativity: 50,
        clutch: 50, tactic: 55, leader: 50, teamwork: 60, morale: 60, amicability: 70, productivity: 60,
        stressResistance: 60, loyalty: 60, reaction: 60, eyesight: 60, health: 90, strength: 60, endurance: 60,
        form: 60, fatigue: 20, potential: 75, matchesPlayed: 0, roundsPlayed: 0, avgRating: 1.02, clutchSuccessRate: 0,
        level: 1, xp: 0, xpToNextLevel: 1000, talentPoints: 0, unlockedTalentIds: [], traits: [], mapsPlayed: 40,
        personality: { archetype },
        ...overrides,
    } as PlayerSaveData
}

function club(id: string, rosterIds: string[], overrides: Partial<TeamSaveData> = {}): TeamSaveData {
    return {
        id, name: id.toUpperCase(), shortName: id, tier: "PRO", rosterIds, staffIds: [], reputation: 50, fanbase: 1000, followers: 10_000, chemistry: 60,
        facilitiesLevel: 1, trainingSlotsUsed: 0, maxTrainingSlots: 10, budget: 1_000_000, elo: 1500, leagueTier: "B_TIER",
        worldRanking: 30, trophies: [], facilities: [], sponsors: [], rivalries: [],
        ...overrides,
    } as unknown as TeamSaveData
}

const IDS = ["p0", "p1", "p2", "p3", "p4", "p5"]

/** Managed club "us" (six players, p5 on the bench) and two rivals. */
function world(week = 10, archetypes: Partial<Record<string, PersonalityArchetype>> = {}): GameSave {
    const players = IDS.map((id, i) => player(id, archetypes[id] ?? "QUIET", { skill: 70 - i * 2 }))
    const others = ["o0", "o1", "o2", "o3", "o4"].map(id => player(id, "QUIET"))
    const teams = [club("us", [...IDS]), club("them", others.map(p => p.id), { worldRanking: 5 }), club("far", [], { worldRanking: 9 })]
    return {
        saveVersion: CURRENT_SAVE_VERSION, saveId: "p53", saveName: "t", createdAt: "", updatedAt: "", currentWeek: week, currentDay: 0,
        timeMode: "WEEKLY", gameStartDate: "2025-01-01T00:00:00.000Z", playerTeamId: "us",
        managerDetails: { name: "Alex", level: 1, xp: 0, reputation: 0, careerWins: 0, careerLosses: 0, championships: 0, tenureStartWeek: 1 },
        teams, players: [...players, ...others],
        contracts: [...IDS.map(pid => ({ playerId: pid, teamId: "us", salaryPerWeek: 2000, startWeek: 1, endWeek: 200, buyout: 0 })),
            ...others.map(p => ({ playerId: p.id, teamId: "them", salaryPerWeek: 2000, startWeek: 1, endWeek: 200, buyout: 0 }))],
        tournaments: [{ id: "cup", name: "Spring Cup", tier: "A_TIER" }], staff: [], scheduledMatches: [], completedMatches: [], scheduledActivities: [], marketStaff: [],
        financeLedger: [], hallOfFame: [], eventsLog: [], newsFeed: [], acknowledgedEventIds: [], lastRngSeed: 1,
        legendaryPlayers: [], weekTickState: null, scoutedPlayers: [], circuitPoints: [], tournamentQualifications: [],
        transferHistory: [], academyPlayers: [], academyMatchHistory: [], academyRoster: {}, academyTrainingSchedule: {},
        academyWeeklyReports: [], academyScoutingMissions: [], academyPendingProspects: [],
    } as unknown as GameSave
}

const P_ = (save: GameSave, id: string) => save.players.find(p => p.id === id)!
const T_ = (save: GameSave, id: string) => save.teams.find(t => t.id === id)!
const form = (save: GameSave, id: string, ratings: number[]) => { P_(save, id).formWindow = { clubId: "us", ratings } }
const arcOf = (save: GameSave, kind: StoryArc["kind"]) => save.storylines?.find(a => a.kind === kind)
const eventOf = (save: GameSave, arc: StoryArc | undefined) => save.eventsLog.find(e => e.id === arc?.eventId)
const nextWeek = (save: GameSave) => { save.currentWeek++; return processStorylines(save) }

/** Answer an event the way the store does (shared effect code, then mark it). */
function answer(save: GameSave, e: GameEventSaveData | undefined, choiceId: string): boolean {
    const choice = e?.choices?.find(c => c.id === choiceId)
    if (!e || !choice) return false
    const ok = applyChoiceEffects(save, e, choice.effects as ChoiceEffects, { id: () => `fin_${e.id}`, description: choice.text })
    if (ok) { e.selectedChoiceId = choiceId; e.data = { ...e.data, resolvedWeek: save.currentWeek } }
    return ok
}

function result(home: string, away: string, winner: string, week: number, id: string, extra: Partial<CompletedMatchSaveData> = {}): CompletedMatchSaveData {
    const homeWon = winner === home
    return {
        id, homeTeamId: home, awayTeamId: away, tournamentId: "cup", stage: "Group", week, format: "BO1", seed: 1,
        result: {
            winnerId: winner, homeScore: homeWon ? 1 : 0, awayScore: homeWon ? 0 : 1, mvpPlayerId: "p0",
            maps: [{ map: "de_mirage", homeScore: homeWon ? 13 : 9, awayScore: homeWon ? 9 : 13, finalScore: { team1: homeWon ? 13 : 9, team2: homeWon ? 9 : 13 }, rounds: [] }],
            playerStats: { p0: { kills: 22, deaths: 14, assists: 3, rating: 1.34, adr: 90 } },
        },
        ...extra,
    } as unknown as CompletedMatchSaveData
}

// ---------------------------------------------------------------- arcs

describe("slump", () => {
    test("a starter under 0.90 over five maps: press questions, a decision, benching swaps him out, recovery resolves it", () => {
        const save = world()
        form(save, "p1", [0.8, 0.85, 0.7, 0.9, 0.8])
        processStorylines(save)
        const arc = arcOf(save, "SLUMP")!
        expect(arc).toMatchObject({ managed: true, playerIds: ["p1"], state: "ACTIVE" })
        expect(arc.log[0].text).toBe("p1 rated 0.81 over his last 5 maps.")
        expect(save.newsFeed[0]).toMatchObject({ title: "Questions over p1's form", playerId: "p1" })
        expect(save.newsFeed[0].content).toContain("rated 0.81 over his last 5 official maps")

        nextWeek(save)
        const e = eventOf(save, arc)!
        expect(e.choices!.map(c => c.id)).toEqual(["back", "bench", "rest"])
        expect(decisionRuleFor(e)).toMatchObject({ defaultChoiceId: "rest", family: `story:${arc.id}` })
        expect(String(e.data.message)).toContain("Bench him: p5 takes his place in the starting five")

        const morale = P_(save, "p1").morale
        expect(answer(save, e, "bench")).toBe(true)
        expect(T_(save, "us").rosterIds.slice(0, 5)).toContain("p5")
        expect(T_(save, "us").rosterIds.slice(0, 5)).not.toContain("p1")
        expect(P_(save, "p1").morale).toBe(morale + S.SLUMP_BENCH_MORALE)

        nextWeek(save)
        expect(arc.choice).toBe("bench")
        P_(save, "p1").mapsPlayed = (P_(save, "p1").mapsPlayed ?? 0) + 3
        form(save, "p1", [0.8, 0.85, 1.1, 1.2, 1.05])
        nextWeek(save)
        expect(arc).toMatchObject({ state: "RESOLVED", outcome: "RECOVERED" })
        expect(arc.log.at(-1)!.text).toBe("p1 is back in form, rated 1.12 over his last 3 official maps.")
    })

    test("unanswered, the rest week default applies through the deadline code", () => {
        const save = world()
        form(save, "p1", [0.8, 0.8, 0.8, 0.8, 0.8])
        processStorylines(save)
        nextWeek(save)
        normalizeDecisions(save)
        const arc = arcOf(save, "SLUMP")!
        const e = eventOf(save, arc)!
        expect(String(e.data.ifUnanswered)).toBe(`If you don't answer by Week ${save.currentWeek + S.DECISION_WINDOW}, the club gives p1 a rest week.`)
        const { morale, fatigue } = P_(save, "p1")
        save.currentWeek += S.DECISION_WINDOW + 1
        expireDecisions(save)
        expect(e.selectedChoiceId).toBe("rest")
        expect(P_(save, "p1").morale).toBe(morale + S.SLUMP_REST_MORALE)
        expect(P_(save, "p1").fatigue).toBe(fatigue + S.SLUMP_REST_FATIGUE)
        processStorylines(save)
        expect(arc.choice).toBe("rest")
        expect(arc.log.some(l => l.text === "No answer by the deadline, so p1 gets a rest week.")).toBe(true)
    })
})

describe("contract standoff", () => {
    function standoff(endIn = 10) {
        const save = world(10, { p0: "MERCENARY" })
        save.contracts.find(c => c.playerId === "p0")!.endWeek = save.currentWeek + endIn
        return save
    }

    test("a top-3 Mercenary with 6-12 weeks left: agent, talks at the stated wage, the offer renews him", () => {
        const save = standoff()
        processStorylines(save)
        const arc = arcOf(save, "CONTRACT_STANDOFF")!
        expect(arc.playerIds).toEqual(["p0"])
        expect(save.newsFeed[0].title).toBe("p0's agent goes public")
        nextWeek(save)
        const e = eventOf(save, arc)!
        const ask = Math.round(renewalSalary(P_(save, "p0"), 2000) * S.STANDOFF_PREMIUM)
        expect(e.choices!.find(c => c.id === "offer")!.effects).toMatchObject({ renew: { salary: ask, weeks: S.STANDOFF_EXTENSION_WEEKS, current: 2000 } })
        expect(String(e.data.message)).toContain(`his agent asks $${ask.toLocaleString("en-US")}`)
        const chips = describeChoice(e, e.choices!.find(c => c.id === "offer")!, 1_000_000).chips.map(c => c.label)
        expect(chips).toContain(`New deal: $${ask.toLocaleString("en-US")}/wk, +52 wks`)

        expect(answer(save, e, "offer")).toBe(true)
        const c = save.contracts.find(x => x.playerId === "p0")!
        expect(c).toMatchObject({ salaryPerWeek: ask, endWeek: 20 + 52 })
        nextWeek(save)
        expect(arc).toMatchObject({ state: "RESOLVED", outcome: "RENEWED" })
        expect(save.newsFeed[0].content).toContain(`$${ask.toLocaleString("en-US")} a week, running to Week 72`)
    })

    test("the offer is refused when the club cannot hold the raise; waiting ends in a transfer request in the stated week", () => {
        const save = standoff()
        processStorylines(save)
        nextWeek(save)
        const arc = arcOf(save, "CONTRACT_STANDOFF")!
        const e = eventOf(save, arc)!
        T_(save, "us").budget = 10
        expect(answer(save, e, "offer")).toBe(false)
        expect(save.contracts.find(x => x.playerId === "p0")!.endWeek).toBe(20)
        expect(describeChoice(e, e.choices!.find(c => c.id === "offer")!, 10).blockedReason).toMatch(/^Needs \$/)
        expect(answer(save, e, "wait")).toBe(true)
        const requestWeek = Number(arc.facts.requestWeek ?? 0)
        nextWeek(save)
        expect(requestWeek).toBe(20 - S.STANDOFF_REQUEST_BEFORE_END)
        while (save.currentWeek < requestWeek) nextWeek(save)
        expect(arc).toMatchObject({ state: "RESOLVED", outcome: "REQUEST" })
        const request = save.eventsLog.find(x => x.id.startsWith("transfer_request_p0_"))!
        expect(request.data).toMatchObject({ reason: "CONTRACT" })
        expect(String(request.data.message)).toContain("His contract ends in Week 20 and no new deal was offered.")
    })

    test("a Quiet player or a deal with 20 weeks left is not a standoff", () => {
        const save = world()
        save.contracts.find(c => c.playerId === "p0")!.endWeek = 18
        expect(ARC_DEFINITIONS.CONTRACT_STANDOFF.detect(buildContext(save))).toEqual([])
        const later = world(10, { p0: "AMBITIOUS" })
        later.contracts.find(c => c.playerId === "p0")!.endWeek = 30
        expect(ARC_DEFINITIONS.CONTRACT_STANDOFF.detect(buildContext(later))).toEqual([])
    })
})

describe("rising star", () => {
    test("21 or under at 1.15+: hype, the market's real numbers, and a promise through the Phase 5.2 path", () => {
        const save = world()
        P_(save, "p2").age = 20
        form(save, "p2", [1.3, 1.2, 1.25, 1.4, 1.1, 1.3])
        processStorylines(save)
        const arc = arcOf(save, "RISING_STAR")!
        expect(save.newsFeed[0].content).toContain("p2 is rated 1.26 over his last 6 official maps for US, at 20.")
        nextWeek(save)
        const e = eventOf(save, arc)!
        expect(save.newsFeed[0].title).toBe("The market notices p2")
        expect(answer(save, e, "promise")).toBe(true)
        expect(P_(save, "p2").personality?.promise).toMatchObject({ kind: "START", madeWeek: save.currentWeek })
        // The promise settles (Phase 5.2 dressing room); the arc reads the verdict.
        P_(save, "p2").personality!.lastPromise = { kind: "START", outcome: "KEPT", week: save.currentWeek + 8 }
        delete P_(save, "p2").personality!.promise
        for (let i = 0; i < 9; i++) nextWeek(save)
        expect(arc).toMatchObject({ state: "RESOLVED", outcome: "KEPT" })
    })
})

describe("veteran's last dance", () => {
    test("a real retirement chance; persuading halves it for the week-52 check and the copy states both numbers", () => {
        const save = world(30)
        Object.assign(P_(save, "p3"), { age: 34, skill: 65 })
        const chance = retirementChance(P_(save, "p3"), save.currentWeek)
        expect(chance).toBeCloseTo(0.15)
        processStorylines(save)
        const arc = arcOf(save, "LAST_DANCE")!
        expect(save.newsFeed[0].content).toContain("the season-end check gives him a 15% chance of retiring")
        nextWeek(save)
        const e = eventOf(save, arc)!
        expect(e.choices!.find(c => c.id === "persuade")!.effects).toMatchObject({ persuade: { from: 15, to: 8 } })
        expect(answer(save, e, "persuade")).toBe(true)
        expect(retirementChance(P_(save, "p3"), save.currentWeek)).toBeCloseTo(0.075)
        expect(retirementChance(P_(save, "p3"), 53)).toBeCloseTo(0.15)
        P_(save, "p3").isRetired = true
        nextWeek(save)
        nextWeek(save)
        expect(arc).toMatchObject({ state: "RESOLVED", outcome: "RETIRED" })
        expect(save.newsFeed[0].title).toBe("Farewell, p3")
    })

    test("a Leader veteran can mentor the youngest player instead (Phase 5.2 mentorship)", () => {
        const save = world(30, { p3: "LEADER" })
        Object.assign(P_(save, "p3"), { age: 34, skill: 65 })
        P_(save, "p4").age = 19
        processStorylines(save)
        nextWeek(save)
        const e = eventOf(save, arcOf(save, "LAST_DANCE"))!
        expect(answer(save, e, "mentor")).toBe(true)
        expect(T_(save, "us").dressingRoom?.mentorships).toEqual([{ mentorId: "p3", menteeId: "p4", sinceWeek: save.currentWeek }])
    })
})

describe("rift", () => {
    test("a benched Hothead regular against the starter keeping him out; siding moves both players' morale as stated", () => {
        const save = world(10, { p5: "HOTHEAD" })
        P_(save, "p5").personality!.apps = { teamId: "us", starts: 0, benched: P.BENCH_MATCHES, regular: true }
        processStorylines(save)
        const arc = arcOf(save, "RIFT")!
        expect(arc.playerIds[0]).toBe("p5")
        expect(arc.log[0].text).toContain(`p5 has sat out ${P.BENCH_MATCHES} official matches in a row while ${arc.playerIds[1]} starts`)
        nextWeek(save)
        const e = eventOf(save, arc)!
        const b = arc.playerIds[1]
        const before = [P_(save, "p5").morale, P_(save, b).morale]
        const chips = describeChoice(e, e.choices!.find(c => c.id === "side_a")!, 0).chips.map(c => c.label)
        expect(chips).toEqual([`+${S.RIFT_SIDE_WITH} morale (p5)`, `${S.RIFT_SIDE_AGAINST} morale (${b})`])
        expect(answer(save, e, "side_a")).toBe(true)
        expect([P_(save, "p5").morale, P_(save, b).morale]).toEqual([before[0] + S.RIFT_SIDE_WITH, before[1] + S.RIFT_SIDE_AGAINST])
        for (let i = 0; i < S.RIFT_RESOLVE_WEEKS + 1; i++) nextWeek(save)
        expect(arc.state).toBe("RESOLVED")
        expect(arc.log.at(-1)!.text).toMatch(/^The rift (has settled|lingers) \(p5 morale \d+, p\d morale \d+, team chemistry \d+\)\.$/)
    })
})

describe("rivalry", () => {
    test("build-up before the fixture against the biggest rival, then the real score and MVP", () => {
        const save = world()
        T_(save, "us").rivalries = [{ opponentTeamId: "them", matchesPlayed: 4, wins: 3, losses: 1, lastPlayed: 8, intensity: "NEUTRAL" }]
        save.scheduledMatches = [{ id: "m_derby", homeTeamId: "us", awayTeamId: "them", tournamentId: "cup", stage: "Group", week: 11, format: "BO1", seed: 1 }]
        processStorylines(save)
        const arc = arcOf(save, "RIVALRY")!
        expect(save.newsFeed[0].content).toBe("US and THEM meet for the 5th time in Week 11 (Spring Cup). US leads 3–1 in the head-to-head. Rivalry: neutral.")
        save.scheduledMatches = []
        save.completedMatches.push(result("us", "them", "us", 11, "m_derby"))
        nextWeek(save)
        expect(arc).toMatchObject({ state: "RESOLVED", outcome: "WON" })
        expect(save.newsFeed[0]).toMatchObject({ title: "US take the derby 13–9" })
        expect(save.newsFeed[0].content).toContain("MVP: p0 (1.34 rating).")
    })
})

describe("giant-killer run", () => {
    test("another club's run is news only; the managed club's run adds the stated fans and board confidence", () => {
        const save = world(12)
        save.teams.push(club("minnow", [], { worldRanking: 40 }), club("top", [], { worldRanking: 3 }))
        save.completedMatches.push(result("minnow", "them", "minnow", 11, "g1"), result("top", "minnow", "minnow", 12, "g2"))
        processStorylines(save)
        const ai = arcOf(save, "GIANT_KILLER")!
        expect(ai).toMatchObject({ managed: false, teamId: "minnow" })
        expect(save.newsFeed[0].content).toContain("MINNOW (#40) have beaten TOP (#3) 13–9 and THEM (#5) 13–9")
        expect(save.eventsLog).toEqual([])

        const mine = world(12)
        T_(mine, "us").worldRanking = 40
        mine.teams.push(club("top", [], { worldRanking: 3 }))
        mine.boardState = { teamId: "us", confidence: 50, seasonExpectation: "COMPETE", expectationSetSeason: 1, lastReviewedSeason: 0, onNotice: false, history: [] }
        mine.completedMatches.push(result("us", "them", "us", 11, "g1"), result("top", "us", "us", 12, "g2"))
        processStorylines(mine)
        expect(arcOf(mine, "GIANT_KILLER")).toMatchObject({ managed: true })
        expect(T_(mine, "us").followers).toBe(10_000 + S.GIANT_FANS)
        expect(mine.boardState.confidence).toBe(50 + S.GIANT_BOARD)
        expect(mine.boardState.history![0].cause).toBe("Giant-killer run: beat TOP and THEM")
        expect(mine.newsFeed[0].content).toContain(`brings ${S.GIANT_FANS.toLocaleString("en-US")} new followers, and the board's confidence rises by ${S.GIANT_BOARD}`)
    })
})

describe("board under pressure", () => {
    test("speculation with the real causes, the ultimatum names the objective, recovery resolves it; no extra inbox message", () => {
        const save = world(20)
        save.boardState = {
            teamId: "us", confidence: 38, seasonExpectation: "COMPETE", expectationSetSeason: 1, lastReviewedSeason: 0, onNotice: false, warnings: 1,
            history: [{ week: 19, delta: -1.5, cause: "Lost to THEM" }],
            objectives: [{ id: "ranking", label: "Finish the season ranked #14 or better", target: 14, current: 30, status: "AT_RISK" }],
        }
        processStorylines(save)
        const arc = arcOf(save, "BOARD_PRESSURE")!
        expect(save.newsFeed[0].content).toContain("Board confidence at US has fallen to 38/100. Recent setbacks: lost to them.")
        nextWeek(save); nextWeek(save)
        expect(save.newsFeed[0].content).toContain("The board's message to Alex: finish the season ranked #14 or better. US are ranked #30 against a target of #14")
        save.boardState.confidence = 55
        nextWeek(save)
        expect(arc).toMatchObject({ state: "RESOLVED", outcome: "SURVIVES" })
        expect(save.eventsLog).toEqual([])
    })

    test("taking another job is not a dismissal; a sacking is", () => {
        const make = () => {
            const save = world(20)
            save.boardState = { teamId: "us", confidence: 30, seasonExpectation: "COMPETE", expectationSetSeason: 1, lastReviewedSeason: 0, onNotice: false, history: [] }
            processStorylines(save)
            return save
        }
        const moved = make()
        moved.playerTeamId = "them"
        nextWeek(moved)
        expect(arcOf(moved, "BOARD_PRESSURE")).toMatchObject({ outcome: "LEFT" })
        expect(moved.newsFeed[0].content).toBe("Alex leaves US for THEM before the board decides.")
        const sacked = make()
        sacked.gameOverReason = "SACKED"
        nextWeek(sacked)
        expect(arcOf(sacked, "BOARD_PRESSURE")).toMatchObject({ outcome: "SACKED" })
    })
})

test("a slump must sit well under the player's own career rating", () => {
    const save = world()
    form(save, "p1", [0.85, 0.85, 0.85, 0.85, 0.85])
    P_(save, "p1").avgRating = 0.9
    expect(ARC_DEFINITIONS.SLUMP.detect(buildContext(save))).toEqual([])
    P_(save, "p1").avgRating = 0.96
    expect(ARC_DEFINITIONS.SLUMP.detect(buildContext(save)).map(c => c.subject)).toEqual(["p1"])
})

// ---------------------------------------------------------------- caps, cooldowns, determinism

describe("caps and determinism", () => {
    function busy(): GameSave {
        const save = world()
        form(save, "p1", [0.8, 0.8, 0.8, 0.8, 0.8])
        form(save, "p2", [0.7, 0.7, 0.7, 0.7, 0.7])
        P_(save, "p3").age = 20
        form(save, "p3", [1.3, 1.3, 1.3, 1.3, 1.3, 1.3])
        return save
    }

    test("one new arc a week, at most two managed arcs active, one story per player", () => {
        const save = busy()
        processStorylines(save)
        expect(save.storylines!.length).toBe(1)
        processStorylines(save) // a re-run of the same week starts nothing new
        expect(save.storylines!.length).toBe(1)
        nextWeek(save)
        expect(save.storylines!.filter(a => a.state === "ACTIVE" && a.managed).length).toBe(2)
        nextWeek(save)
        expect(save.storylines!.filter(a => a.state === "ACTIVE" && a.managed).length).toBe(2)
        const players = save.storylines!.flatMap(a => a.playerIds)
        expect(new Set(players).size).toBe(players.length)
    })

    test("per-kind and per-subject cooldowns", () => {
        const resolved = { id: "x", kind: "SLUMP", teamId: "us", managed: true, playerIds: ["p1"], clubIds: [], beat: 2, startedWeek: 5, updatedWeek: 9, nextWeek: 10, state: "RESOLVED", facts: { subject: "p1" }, log: [] } as StoryArc
        const cand = { kind: "SLUMP" as const, teamId: "us", managed: true, playerIds: ["p1"], clubIds: [], subject: "p1", score: 1, facts: {} }
        expect(eligible([resolved], cand, 9 + S.COOLDOWN_SUBJECT.SLUMP - 1)).toBe(false)
        expect(eligible([resolved], cand, 9 + S.COOLDOWN_SUBJECT.SLUMP)).toBe(true)
        expect(eligible([resolved], { ...cand, subject: "p2", playerIds: ["p2"] }, 5 + S.COOLDOWN_KIND.SLUMP - 1)).toBe(false)
        expect(eligible([resolved], { ...cand, subject: "p2", playerIds: ["p2"] }, 5 + S.COOLDOWN_KIND.SLUMP)).toBe(true)
    })

    test("the same save produces the same stories, beats and decisions", () => {
        const a = busy(), b = structuredClone(a)
        for (const save of [a, b]) { processStorylines(save); for (let i = 0; i < 6; i++) nextWeek(save) }
        expect(JSON.stringify(a.storylines)).toBe(JSON.stringify(b.storylines))
        expect(JSON.stringify(a.eventsLog)).toBe(JSON.stringify(b.eventsLog))
        expect(JSON.stringify(a.newsFeed)).toBe(JSON.stringify(b.newsFeed))
    })

    test("a managed story ends when the manager leaves the club", () => {
        const save = busy()
        processStorylines(save)
        save.playerTeamId = "them"
        nextWeek(save)
        expect(save.storylines![save.storylines!.length - 1]).toMatchObject({ state: "RESOLVED", outcome: "MANAGER_LEFT" })
    })

    test("arcsForPlayer and leadingBeat read the save", () => {
        const save = busy()
        processStorylines(save)
        expect(arcsForPlayer(save.storylines, save.storylines![0].playerIds[0])).toHaveLength(1)
        expect(leadingBeat(save.storylines, "us", save.currentWeek, save.currentWeek)?.text).toBe(save.storylines![0].log[0].text)
    })
})

describe("form window", () => {
    test("official maps of the managed club only, newest last, capped", () => {
        const save = world()
        for (let i = 0; i < S.FORM_WINDOW + 2; i++) {
            const m = result("us", "them", "us", 10, `f${i}`)
            const round = (winner: string) => ({ winner, kills: [], endReason: "elimination" })
            ;(m.result.maps[0] as unknown as { rounds: unknown[] }).rounds = Array.from({ length: 22 }, (_, r) => round(r % 2 ? "us" : "them"))
            ;(m.result as unknown as { engineVersion: string; lineups: Record<string, string[]> }).engineVersion = "legacy-v2"
            ;(m.result as unknown as { lineups: Record<string, string[]> }).lineups = { us: IDS.slice(0, 5), them: ["o0", "o1", "o2", "o3", "o4"] }
            m.result.playerStats = Object.fromEntries([...IDS.slice(0, 5), "o0", "o1", "o2", "o3", "o4"].map(id => [id, { kills: 15, deaths: 15, assists: 2, rating: 1.07, adr: 75 }])) as never
            recordOfficialMatch(save, m, m.result)
        }
        expect(P_(save, "p0").formWindow).toEqual({ clubId: "us", ratings: Array(S.FORM_WINDOW).fill(1.07) })
        expect(P_(save, "o0").formWindow).toBeUndefined()
    })
})

// ---------------------------------------------------------------- press conferences

describe("press conferences", () => {
    function finalWeek(): GameSave {
        const save = world()
        save.scheduledMatches = [{ id: "m_final", homeTeamId: "us", awayTeamId: "them", tournamentId: "cup", stage: "Grand Final", week: 10, format: "BO3", seed: 1 }]
        save.completedMatches.push(result("us", "far", "us", 9, "r1"), result("far", "us", "far", 8, "r2"), result("us", "far", "us", 7, "r3"))
        save.boardState = { teamId: "us", confidence: 60, seasonExpectation: "COMPETE", expectationSetSeason: 1, lastReviewedSeason: 0, onNotice: false, history: [] }
        return save
    }

    test("big matches: final, derby, top-10 clash; an ordinary fixture is not", () => {
        const save = finalWeek()
        expect(bigMatchReason(save, save.scheduledMatches[0], "us")?.reason).toBe("FINAL")
        const group = { ...save.scheduledMatches[0], stage: "Semi-final" }
        expect(bigMatchReason(save, group, "us")).toBeNull()
        T_(save, "us").rivalries = [{ opponentTeamId: "them", matchesPlayed: 3, wins: 2, losses: 1, lastPlayed: 8, intensity: "NEUTRAL" }]
        expect(bigMatchReason(save, group, "us")?.reason).toBe("DERBY")
        T_(save, "us").rivalries = []
        T_(save, "us").worldRanking = 8
        expect(bigMatchReason(save, group, "us")?.reason).toBe("TOP10")
    })

    test("one press conference per match week, 2-3 questions, default 'send no one' with no effect", () => {
        const save = finalWeek()
        const e = createPressConference(save)!
        expect(createPressConference(save)).toBeNull()
        const press = pressDataOf(e)!
        expect(press.reason).toBe("FINAL")
        expect(press.questions.map(q => q.topic)).toEqual(["MATCH", "FORM"])
        expect(press.questions[1].text).toBe("2 wins from your last 3 official matches. Is the momentum with you?")
        normalizeDecisions(save)
        expect(e.data.ifUnanswered).toBe("If you don't answer by Week 10, the club sends no one to the press conference: no effect.")
        const before = JSON.stringify([save.players, save.teams, save.boardState])
        save.currentWeek = 11
        expireDecisions(save)
        expect(e.selectedChoiceId).toBe("no_one")
        expect(JSON.stringify([save.players, save.teams, save.boardState])).toBe(before)
    })

    test("answers apply exactly what they show: squad morale, fans, board confidence (with its cause), a named player", () => {
        const save = finalWeek()
        form(save, "p1", [1.3, 1.2, 1.4, 1.1, 1.3])
        const e = createPressConference(save)!
        const press = pressDataOf(e)!
        expect(press.questions.map(q => q.topic)).toEqual(["MATCH", "PLAYER", "FORM"])
        const bold = press.questions[0].answers.find(a => a.id === "bold")!
        const squad = { ...e, data: { ...e.data, playerId: undefined } } as GameEventSaveData
        expect(describeChoice(squad, bold, 0).chips.map(c => c.label)).toEqual([`+${S.PRESS_BOLD_MORALE} morale (squad)`, `${S.PRESS_BOLD_BOARD} board confidence`, `+${S.PRESS_BOLD_FANS.toLocaleString("en-US")} fans`])
        const morale = IDS.map(id => P_(save, id).morale)
        const r = answerPressConference(save as unknown as PressTarget, e.id, { match: "bold", player: "key" })
        expect(r).toMatchObject({ ok: true, applied: 2 })
        expect(IDS.map(id => P_(save, id).morale)).toEqual(morale.map((m, i) => m + S.PRESS_BOLD_MORALE + (IDS[i] === "p1" ? S.PRESS_PLAYER_BACK_MORALE : 0)))
        expect(T_(save, "us").followers).toBe(10_000 + S.PRESS_BOLD_FANS)
        expect(save.boardState!.confidence).toBe(60 + S.PRESS_BOLD_BOARD)
        expect(save.boardState!.history![0].cause).toBe('Press conference: "We are here to lift the trophy."')
        expect(e).toMatchObject({ selectedChoiceId: "answered", acknowledged: true })
        expect(answerPressConference(save as unknown as PressTarget, e.id, { match: "bold" }).ok).toBe(false)
    })

    test("a storyline question logs the answer on the arc; the press room closes once the match is played", () => {
        const save = finalWeek()
        form(save, "p1", [0.8, 0.8, 0.8, 0.8, 0.8])
        processStorylines(save)
        const e = createPressConference(save)!
        const q = pressDataOf(e)!.questions[1]
        expect(q).toMatchObject({ topic: "STORY", text: "p1 is rated 0.80 over his last 5 official maps. Does he keep his place?" })
        answerPressConference(save as unknown as PressTarget, e.id, { story: "trust" })
        expect(arcOf(save, "SLUMP")!.log.at(-1)!.text).toBe('You told the press, "I trust him to come good."')

        const other = finalWeek()
        const e2 = createPressConference(other)!
        other.completedMatches.push(result("us", "them", "us", 10, "m_final"))
        closePressConference(other, "m_final")
        expect(e2.data.isWithdrawn).toBe(true)
        expect(answerPressConference(other as unknown as PressTarget, e2.id, { match: "bold" }).ok).toBe(false)
    })

    test("Continue stops once for the press conference, before the match", () => {
        const save = finalWeek()
        save.players.forEach(p => { p.injury = undefined })
        createPressConference(save)
        const src = save as unknown as StopSource
        const first = nextStop(src, new Set())!
        expect(first).toMatchObject({ key: "event:press_m_final", kind: "event", href: "/match/m_final/tactics", actionLabel: "Face the press" })
        expect(nextStop(src, new Set([first.key]))).toMatchObject({ kind: "match" })
    })
})

// ---------------------------------------------------------------- news and the report

describe("news and the weekly report", () => {
    test("the final preview reads the club's story, not a canned quote", () => {
        const save = world()
        form(save, "p1", [0.8, 0.8, 0.8, 0.8, 0.8])
        processStorylines(save)
        const preview = finalPreview(save, T_(save, "us"), { homeTeamId: "us", awayTeamId: "them" }, "Spring Cup")
        expect(preview.title).toBe("US in the Spring Cup final")
        expect(preview.content).toBe("US face THEM in the Spring Cup final this week. p1 arrives rated 0.80 over his last 5 official maps; a final is a chance to answer.")
        const quiet = world()
        expect(finalPreview(quiet, T_(quiet, "us"), { homeTeamId: "us", awayTeamId: "them" }, "Spring Cup").content).toBe("US face THEM in the Spring Cup final this week. US come in fresh; THEM are ranked #5.")
    })

    test("the headline leads with the week's storyline beat", () => {
        const report = { v: 1, week: 10, teamId: "us", changes: [], warnings: [], names: {}, kpis: { rank: [30, 30] }, matches: [{ id: "m", opponentId: "them", opponentName: "THEM", won: false, score: "0–2", competition: "Cup" }], story: { kind: "SLUMP", label: "Slump", text: "p1 rated 0.81 over his last 5 maps." } } as unknown as Omit<WeekReport, "headline">
        expect(weekHeadline(report)).toBe("Slump: p1 rated 0.81 over his last 5 maps; lost to THEM 0–2.")
    })
})
