/**
 * Regression tests for the 2026-11-03 squad audit fixes (SQUAD-02 … SQUAD-23,
 * ENGINE-07). Each block names the finding it pins.
 */

import { produce, enableMapSet } from "immer"
import { createTransferContractSlice } from "@/store/slices/transfer-contract-slice"
import type { GameSave, PlayerSaveData, TeamSaveData, ContractSaveData } from "@/engine/save-types"
import type { StoreState } from "@/store/types"
import { reconcileTeamRoles } from "@/engine/role-reconciler"
import { TrainingManager } from "@/engine/training-manager"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { potentialOvr } from "@/lib/potential-ovr"
import { startingFiveOvr } from "@/lib/team-ovr"
import { forfeitStops, collectStopSignals, type StopSource } from "@/lib/advance-stops"
import { processForfeitMatch } from "@/engine/processors/match-forfeit"
import { WeaponMasteryManager } from "@/engine/weapon-mastery-system"
import { spreadPlaceholderAttributes, SNAPSHOT_PLACEHOLDERS } from "@/engine/placeholder-attributes"
import { StaffGenerator } from "@/engine/staff-generator"
import { SeededRNG } from "@/engine/rng"
import { recruitmentSalary } from "@/engine/recruitment"
import { promotionTerms } from "@/app/academy/_components/academy-facts"
import { createLaunchFixture } from "@/scripts/launch/fixtures"
import { PlayerRole } from "@/types/enums"
import snapshotPlayers from "@/public/data/snapshot/players.json"

enableMapSet()

function makeHarness(initial: Partial<StoreState>) {
    let state = initial as StoreState
    const set = (patch: Partial<StoreState> | ((draft: StoreState) => void)) => {
        state = typeof patch === "function" ? produce(state, patch as (s: StoreState) => void) : { ...state, ...patch }
    }
    return { state: () => state, set, get: () => state }
}

function makePlayer(id: string, over: Partial<PlayerSaveData> = {}): PlayerSaveData {
    return {
        id, nickname: id, name: id, age: 22, nationality: "Sweden", role: "RIFLER",
        rifle: 70, awp: 60, pistol: 65, grenades: 60, creativity: 60, clutch: 60, tactic: 60, leader: 55,
        teamwork: 65, reaction: 70, eyesight: 70, morale: 75, form: 70, fatigue: 0, energy: 100, maxEnergy: 100,
        level: 1, xp: 0, xpToNextLevel: 1000, talentPoints: 0, unlockedTalentIds: [], majorWins: 0,
        matchesPlayed: 0, totalMVPs: 0, skill: 70, potential: 85, productivity: 60, endurance: 70,
        ...over,
    } as unknown as PlayerSaveData
}

function makeTeam(id: string, over: Partial<TeamSaveData> = {}): TeamSaveData {
    return {
        id, name: id, shortName: id.slice(0, 4).toUpperCase(), budget: 1_000_000, rosterIds: [], staffIds: [],
        trophies: [], facilities: [], sponsors: [], fanbase: 1000, reputation: 50, region: "EU", facilitiesLevel: 1,
        leagueTier: "B_TIER", recentForm: [], ...over,
    } as unknown as TeamSaveData
}

function baseState(over: Partial<StoreState>): Partial<StoreState> {
    return {
        teams: [], players: [], contracts: [], scheduledMatches: [], completedMatches: [], financeLedger: [],
        transferHistory: [], newsFeed: [], eventsLog: [], scoutedPlayers: [], currentWeek: 10, playerTeamId: "player",
        ...(over as object),
    } as Partial<StoreState>
}

const contract = (playerId: string, teamId: string): ContractSaveData =>
    ({ playerId, teamId, salaryPerWeek: 500, startWeek: 1, endWeek: 80, buyout: 10_000 }) as ContractSaveData
const newContract = (week: number) => ({ salaryPerWeek: 800, startWeek: week, endWeek: week + 52, buyout: 20_000 })

describe("SQUAD-02 — the role reconciler keeps paid and signed roles", () => {
    test("a role-locked IGL below the thresholds keeps his role and his secondary role", () => {
        const incumbent = makePlayer("igl1", { role: PlayerRole.IGL, leader: 90, tactic: 90 })
        const retrained = makePlayer("p2", { role: PlayerRole.IGL, secondaryRole: PlayerRole.RIFLER, leader: 53, tactic: 46, roleLocked: true })
        const others = [makePlayer("p3"), makePlayer("p4"), makePlayer("p5")]
        reconcileTeamRoles([incumbent, retrained, ...others])
        expect(retrained.role).toBe(PlayerRole.IGL)
        expect(retrained.secondaryRole).toBe(PlayerRole.RIFLER)
    })

    test("secondary roles from training survive a reconcile for unlocked players too", () => {
        const p = makePlayer("p1", { secondaryRole: PlayerRole.AWPER })
        reconcileTeamRoles([p, makePlayer("p2")])
        expect(p.secondaryRole).toBe(PlayerRole.AWPER)
    })

    test("an unlocked specialist under the thresholds still falls back to RIFLER", () => {
        const p = makePlayer("p1", { role: PlayerRole.IGL, leader: 50, tactic: 50 })
        reconcileTeamRoles([p, makePlayer("p2")])
        expect(p.role).toBe(PlayerRole.RIFLER)
    })

    test("completed retraining locks the new role, so the next reconcile keeps it", () => {
        const save = createLaunchFixture("first-week")
        const team = save.teams[0]
        const player = save.players.find(p => p.id === team.rosterIds[0])!
        player.role = PlayerRole.RIFLER
        player.leader = 40
        player.tactic = 40
        const complete = (TrainingManager as unknown as { completeTraining: (g: GameSave, t: TeamSaveData, s: unknown) => void }).completeTraining
        complete.call(TrainingManager, save, team, { playerId: player.id, targetRole: "IGL", weeksCompleted: 8, totalWeeks: 8, weeklyCost: 5000, startWeek: 1 })
        expect(player.role).toBe(PlayerRole.IGL)
        expect(player.roleLocked).toBe(true)
        reconcileTeamRoles(team.rosterIds.map(id => save.players.find(p => p.id === id)!))
        expect(player.role).toBe(PlayerRole.IGL)
        expect(player.secondaryRole).toBe(PlayerRole.RIFLER)
    })

    test("a player the manager signs keeps the role he was signed for", () => {
        const h = makeHarness(baseState({
            teams: [makeTeam("player", { rosterIds: ["a", "b", "c", "d", "e"] })],
            players: ["a", "b", "c", "d", "e"].map(id => makePlayer(id)).concat(makePlayer("fa", { role: PlayerRole.IGL, leader: 50, tactic: 50 })),
        }))
        const slice = createTransferContractSlice(h.set as never, h.get as never)
        expect(slice.transferPlayer("fa", "FA", "player", 0, newContract(10)).success).toBe(true)
        const signed = h.state().players.find(p => p.id === "fa")!
        expect(signed.roleLocked).toBe(true)
        const roster = h.state().teams[0].rosterIds.map(id => structuredClone(h.state().players.find(p => p.id === id)!))
        reconcileTeamRoles(roster)
        expect(roster.find(p => p.id === "fa")!.role).toBe(PlayerRole.IGL)
    })
})

describe("SQUAD-03 — potential on the OVR scale", () => {
    test("never below the current OVR, even when the attribute ceiling is lower", () => {
        const p = makePlayer("p", { skill: 80, rifle: 85, potential: 60 })
        expect(potentialOvr(p)).toBe(evaluatePlayer(p).overallRating)
    })

    test("above the current OVR when attributes have room to grow", () => {
        const p = makePlayer("p", { skill: 40, rifle: 45, awp: 40, pistol: 40, reaction: 45, clutch: 40, potential: 80 })
        expect(potentialOvr(p)).toBeGreaterThan(evaluatePlayer(p).overallRating + 5)
    })

    test("every snapshot pro reads a potential at or above his OVR", () => {
        const sample = (snapshotPlayers as unknown as PlayerSaveData[]).slice(0, 200)
        for (const p of sample) expect(potentialOvr(p)).toBeGreaterThanOrEqual(evaluatePlayer(p).overallRating)
    })
})

describe("SQUAD-04 / ENGINE-07 — the five-player minimum", () => {
    const fiveAndBuyer = () => makeHarness(baseState({
        teams: [makeTeam("player", { rosterIds: ["a", "b", "c", "d", "e"] }), makeTeam("buyer", { rosterIds: [] })],
        players: ["a", "b", "c", "d", "e"].map(id => makePlayer(id)),
        contracts: ["a", "b", "c", "d", "e"].map(id => contract(id, "player")),
    }))

    test("the manager can't sell below five players", () => {
        const h = fiveAndBuyer()
        const slice = createTransferContractSlice(h.set as never, h.get as never)
        const r = slice.transferPlayer("e", "player", "buyer", 20_000, newContract(10))
        expect(r.success).toBe(false)
        expect(r.message).toMatch(/at least 5 senior players/)
        expect(h.state().teams[0].rosterIds).toHaveLength(5)
    })

    test("with a sixth player the sale goes through", () => {
        const h = makeHarness(baseState({
            teams: [makeTeam("player", { rosterIds: ["a", "b", "c", "d", "e", "f"] }), makeTeam("buyer", { rosterIds: [] })],
            players: ["a", "b", "c", "d", "e", "f"].map(id => makePlayer(id)),
            contracts: ["a", "b", "c", "d", "e", "f"].map(id => contract(id, "player")),
        }))
        const slice = createTransferContractSlice(h.set as never, h.get as never)
        expect(slice.transferPlayer("f", "player", "buyer", 20_000, newContract(10)).success).toBe(true)
    })

    test("ENGINE-07: buying an AI club's fifth player leaves it with five at once", () => {
        const save = createLaunchFixture("first-week")
        const ai = save.teams.find(t => t.id === "team_ai_1")!
        ai.rosterIds = ai.rosterIds.slice(0, 5)
        save.scheduledMatches = []
        const target = ai.rosterIds[0]
        const h = makeHarness({ ...(save as unknown as StoreState), financeLedger: [], transferHistory: [], newsFeed: [] })
        const slice = createTransferContractSlice(h.set as never, h.get as never)
        const r = slice.transferPlayer(target, ai.id, save.playerTeamId!, 1000, newContract(save.currentWeek))
        if (!r.success) throw new Error(r.message)
        const after = h.state().teams.find(t => t.id === ai.id)!
        expect(after.rosterIds).not.toContain(target)
        expect(after.rosterIds.length).toBeGreaterThanOrEqual(5)
    })

    test("Skip week warns about a fixture later in the week that will be forfeited", () => {
        const save = createLaunchFixture("first-week")
        save.timeMode = "HYBRID_DAILY"
        save.currentWeek = 5
        save.currentDay = 0
        save.teams[0].rosterIds = save.teams[0].rosterIds.slice(0, 4)
        save.scheduledMatches = [{ id: "m1", homeTeamId: save.playerTeamId, awayTeamId: "team_ai_1", week: 5, day: 4, format: "BO1", tournamentId: null, seed: 1 } as never]
        const src = save as unknown as StopSource
        // Continue (day by day) stops on match day; Skip week must say so now.
        expect(collectStopSignals(src).map(s => s.kind)).not.toContain("forfeit")
        const stops = forfeitStops(src, undefined, { wholeWeek: true })
        expect(stops).toHaveLength(1)
        expect(stops[0].reason).toMatch(/will be forfeited: your roster has 4 active players/)
    })

    test("the forfeit message gives the real count, not 'injured players'", () => {
        const save = { completedMatches: [], eventsLog: [], currentWeek: 4 } as unknown as GameSave
        const home = makeTeam("player")
        const away = makeTeam("away")
        processForfeitMatch({
            save, match: { id: "m1", homeTeamId: "player", awayTeamId: "away", week: 4, seed: 1 } as never,
            homeTeam: home, awayTeam: away,
            homePlayers: ["a", "b", "c", "d"].map(id => makePlayer(id)), awayPlayers: ["e", "f", "g", "h", "i"].map(id => makePlayer(id)),
            playerTeamId: "player", removedMatchIds: new Set(),
        })
        const text = String((save.eventsLog[0].data as { description: string }).description)
        expect(text).toBe("Your team forfeited against away: only 4/5 players were available.")
    })
})

describe("SQUAD-06 — Team OVR counts an empty slot", () => {
    test("four 70s read lower than five 70s, not the same", () => {
        expect(startingFiveOvr([70, 70, 70, 70, 70])).toBe(70)
        expect(startingFiveOvr([70, 70, 70, 70])).toBe(56)
        expect(startingFiveOvr([])).toBeNull()
    })
})

describe("SQUAD-08 — a mastered weapon class can't be drilled", () => {
    test("the drill is refused and costs nothing", () => {
        const p = makePlayer("p", { weaponMastery: { RIFLE: 1000 } as never })
        const r = WeaponMasteryManager.processTrainingDrill(p as never, "RIFLE_AIM", 100_000)
        expect(r.success).toBe(false)
        expect(r.cost).toBe(0)
        // One level below Master still trains.
        const q = makePlayer("q", { weaponMastery: { RIFLE: 600 } as never })
        expect(WeaponMasteryManager.processTrainingDrill(q as never, "RIFLE_AIM", 100_000).success).toBe(true)
    })
})

describe("SQUAD-10 — snapshot placeholder attributes get a spread", () => {
    const fresh = () => structuredClone(snapshotPlayers as unknown as PlayerSaveData[])

    test("leader, endurance, health and loyalty vary, centred on the old values", () => {
        const players = fresh()
        spreadPlaceholderAttributes(players)
        const nonIgl = players.filter(p => p.role !== "IGL")
        const igl = players.filter(p => p.role === "IGL")
        const distinct = (xs: number[]) => new Set(xs).size
        expect(distinct(nonIgl.map(p => p.leader as number))).toBeGreaterThan(20)
        expect(distinct(players.map(p => p.endurance as number))).toBeGreaterThan(15)
        expect(distinct(players.map(p => p.health as number))).toBeGreaterThan(10)
        expect(distinct(players.map(p => p.loyalty as number))).toBeGreaterThan(15)
        const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
        expect(Math.abs(mean(players.map(p => p.endurance as number)) - 80)).toBeLessThan(3)
        expect(Math.abs(mean(players.map(p => p.health as number)) - 90)).toBeLessThan(3)
        expect(Math.abs(mean(players.map(p => p.loyalty as number)) - 80)).toBeLessThan(3)
        expect(Math.abs(mean(nonIgl.map(p => p.leader as number)) - 50)).toBeLessThan(5)
        // Role thresholds hold: no new IGL candidates, no IGL loses the bar.
        expect(nonIgl.every(p => (p.leader as number) <= 75)).toBe(true)
        expect(igl.every(p => (p.leader as number) > 75)).toBe(true)
    })

    test("deterministic and idempotent", () => {
        const a = fresh(), b = fresh()
        spreadPlaceholderAttributes(a)
        spreadPlaceholderAttributes(b)
        expect(a.map(p => [p.leader, p.endurance, p.health, p.loyalty])).toEqual(b.map(p => [p.leader, p.endurance, p.health, p.loyalty]))
        expect(spreadPlaceholderAttributes(a)).toBe(0)
    })

    test("a player whose values moved in the career is left alone", () => {
        const p = makePlayer("x", { leader: 50, endurance: 80, health: 84, loyalty: 80 })
        spreadPlaceholderAttributes([p])
        expect([p.leader, p.endurance, p.health, p.loyalty]).toEqual([50, 80, 84, 80])
        expect(SNAPSHOT_PLACEHOLDERS.health).toBe(90)
    })
})

describe("SQUAD-11 — staff market names", () => {
    test("no duplicate names, real first and last names, Dr. only for psychologists", () => {
        for (const week of [1, 7, 33, 90]) {
            const market = StaffGenerator.generateWeeklyMarket(week, 20, new SeededRNG(week * 13 + 1))
            const names = market.map(s => s.name)
            expect(new Set(names).size).toBe(names.length)
            for (const s of market.filter(m => m.id.startsWith("gen_"))) {
                if (s.role === "psychologist") expect(s.name).toMatch(/^Dr\. \S+ \S+/)
                else expect(s.name).not.toMatch(/^Dr\./)
            }
        }
    })

    test("a rotation does not repeat a name it kept", () => {
        const first = StaffGenerator.generateWeeklyMarket(3, 20, new SeededRNG(5))
        const rotated = StaffGenerator.rotateMarket(first, 4, new SeededRNG(6))
        const names = rotated.map(s => s.name)
        expect(new Set(names).size).toBe(names.length)
    })
})

describe("SQUAD-15 — promotion wage follows the market", () => {
    test("the promotion terms use the recruitment wage for this club", () => {
        const prospect = makePlayer("kid", { age: 16, skill: 45, rifle: 45, potential: 75 })
        const club = makeTeam("player", { reputation: 10 })
        const terms = promotionTerms(prospect, 10, club)
        expect(terms.salaryPerWeek).toBe(recruitmentSalary(prospect, 10, club))
        expect(terms.salaryPerWeek).toBeLessThan(2000)
        expect(terms.lengthWeeks).toBe(104)
    })
})

describe("SQUAD-23 — a player who leaves stays known", () => {
    test("release leaves an Expert report, so his profile doesn't fall back to an unscouted range", () => {
        const ids = ["a", "b", "c", "d", "e", "f"]
        const h = makeHarness(baseState({
            teams: [makeTeam("player", { rosterIds: ids })],
            players: ids.map(id => makePlayer(id)),
            contracts: ids.map(id => contract(id, "player")),
        }))
        const slice = createTransferContractSlice(h.set as never, h.get as never)
        expect(slice.releasePlayer("f").success).toBe(true)
        expect(h.state().scoutedPlayers.find(s => s.playerId === "f")?.scoutLevel).toBe("EXPERT")
    })
})
